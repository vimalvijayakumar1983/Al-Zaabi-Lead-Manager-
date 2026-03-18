/**
 * SLA Monitor Service
 *
 * Enterprise-grade lead response time monitoring with multi-tier escalation.
 * Runs on a configurable interval (default: every 2 minutes) and enforces
 * SLA policies per organization.
 *
 * ── Escalation Tiers ──────────────────────────────────────────────
 *
 *  Level 0 → ON_TIME      Lead is within SLA
 *  Level 0 → AT_RISK      Lead approaching SLA breach (75% of threshold)
 *  Level 1 → BREACHED     SLA breached — send reminder to assigned user
 *  Level 2 → ESCALATED    Still no response — notify manager / escalation contact
 *  Level 3 → REASSIGNED   Final escalation — auto-reassign to next available rep
 *
 * ── Configuration (org.settings.sla) ──────────────────────────────
 *
 *  {
 *    enabled: true,
 *    thresholds: {
 *      warningMinutes:    22,   // AT_RISK after N minutes (default: 75% of breach)
 *      breachMinutes:     30,   // BREACHED — Level 1 reminder
 *      escalationMinutes: 60,   // ESCALATED — Level 2 manager notification
 *      reassignMinutes:   120,  // REASSIGNED — Level 3 auto-reassign
 *    },
 *    actions: {
 *      onWarning:    'notify',           // notify | none
 *      onBreach:     'remind',           // remind | notify | none
 *      onEscalation: 'notify_manager',   // notify_manager | reassign | notify | none
 *      onReassign:   'reassign',         // reassign | notify | none
 *    },
 *    escalationContactId: null,          // User ID to notify on escalation (optional)
 *    workingHoursOnly: false,            // Only count working hours (future)
 *    excludeStatuses: ['WON', 'LOST'],  // Skip leads in these statuses
 *  }
 *
 * @module services/slaMonitor
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyOrgAdmins, NOTIFICATION_TYPES } = require('./notificationService');
const { getNextAssignee } = require('./leadAssignment');
const { executeAutomations } = require('./automationEngine');

// Default SLA configuration
const DEFAULT_SLA_CONFIG = {
  enabled: false,
  thresholds: {
    warningMinutes: 22,
    breachMinutes: 30,
    escalationMinutes: 60,
    reassignMinutes: 120,
  },
  actions: {
    onWarning: 'notify',
    onBreach: 'remind',
    onEscalation: 'notify_manager',
    onReassign: 'reassign',
  },
  escalationContactId: null,
  workingHoursOnly: false,
  excludeStatuses: ['WON', 'LOST'],
};

// SLA check interval (ms) — every 2 minutes
const SLA_CHECK_INTERVAL = 2 * 60 * 1000;

let slaInterval = null;

/**
 * Get SLA configuration for an organization, merged with defaults.
 */
function getSLAConfig(orgSettings) {
  const sla = orgSettings?.sla || {};
  return {
    ...DEFAULT_SLA_CONFIG,
    ...sla,
    thresholds: { ...DEFAULT_SLA_CONFIG.thresholds, ...(sla.thresholds || {}) },
    actions: { ...DEFAULT_SLA_CONFIG.actions, ...(sla.actions || {}) },
    excludeStatuses: sla.excludeStatuses || DEFAULT_SLA_CONFIG.excludeStatuses,
  };
}

/**
 * Calculate the SLA status and elapsed time for a lead.
 */
function calculateSLAStatus(lead, config) {
  // If already responded, it's resolved
  if (lead.firstRespondedAt) {
    return { status: 'RESPONDED', elapsedMinutes: 0, percentUsed: 0 };
  }

  const now = new Date();
  const createdAt = new Date(lead.createdAt);
  const elapsedMs = now.getTime() - createdAt.getTime();
  const elapsedMinutes = elapsedMs / (60 * 1000);

  const { warningMinutes, breachMinutes, escalationMinutes, reassignMinutes } = config.thresholds;
  const percentUsed = Math.round((elapsedMinutes / breachMinutes) * 100);

  if (elapsedMinutes >= reassignMinutes) {
    return { status: 'ESCALATED', elapsedMinutes, percentUsed, tier: 3 };
  }
  if (elapsedMinutes >= escalationMinutes) {
    return { status: 'ESCALATED', elapsedMinutes, percentUsed, tier: 2 };
  }
  if (elapsedMinutes >= breachMinutes) {
    return { status: 'BREACHED', elapsedMinutes, percentUsed, tier: 1 };
  }
  if (elapsedMinutes >= warningMinutes) {
    return { status: 'AT_RISK', elapsedMinutes, percentUsed, tier: 0 };
  }

  return { status: 'ON_TIME', elapsedMinutes, percentUsed, tier: 0 };
}

/**
 * Process a single organization's leads for SLA compliance.
 */
async function processOrganization(org) {
  const config = getSLAConfig(org.settings);
  if (!config.enabled) return { orgId: org.id, processed: 0, actions: [] };

  const now = new Date();
  const actionsLog = [];

  // Find all active, unresponded leads that could breach SLA
  const leads = await prisma.lead.findMany({
    where: {
      organizationId: org.id,
      isArchived: false,
      firstRespondedAt: null,
      status: { notIn: config.excludeStatuses },
    },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const lead of leads) {
    try {
      const slaCalc = calculateSLAStatus(lead, config);

      // Determine what action to take based on current vs previous escalation level
      const currentLevel = lead.escalationLevel || 0;
      let newLevel = currentLevel;
      let newSlaStatus = slaCalc.status;
      let actionTaken = null;

      if (slaCalc.tier === 3 && currentLevel < 3) {
        // ── Tier 3: Auto-reassign ──
        newLevel = 3;
        if (config.actions.onReassign === 'reassign') {
          actionTaken = await executeReassign(lead, org, config, slaCalc);
        } else if (config.actions.onReassign === 'notify') {
          actionTaken = await sendSLANotification(lead, org, 'reassign_warning', slaCalc);
        }
      } else if (slaCalc.tier === 2 && currentLevel < 2) {
        // ── Tier 2: Manager escalation ──
        newLevel = 2;
        if (config.actions.onEscalation === 'notify_manager') {
          actionTaken = await notifyManager(lead, org, config, slaCalc);
        } else if (config.actions.onEscalation === 'reassign') {
          actionTaken = await executeReassign(lead, org, config, slaCalc);
          newLevel = 3;
        } else if (config.actions.onEscalation === 'notify') {
          actionTaken = await sendSLANotification(lead, org, 'escalation', slaCalc);
        }
      } else if (slaCalc.tier === 1 && currentLevel < 1) {
        // ── Tier 1: Breach reminder to assigned user ──
        newLevel = 1;
        newSlaStatus = 'BREACHED';
        if (config.actions.onBreach === 'remind') {
          actionTaken = await sendReminder(lead, org, slaCalc);
        } else if (config.actions.onBreach === 'notify') {
          actionTaken = await sendSLANotification(lead, org, 'breach', slaCalc);
        }
      } else if (slaCalc.status === 'AT_RISK' && lead.slaStatus !== 'AT_RISK' && lead.slaStatus !== 'BREACHED' && lead.slaStatus !== 'ESCALATED') {
        // ── Warning: approaching breach ──
        newSlaStatus = 'AT_RISK';
        if (config.actions.onWarning === 'notify') {
          actionTaken = await sendSLANotification(lead, org, 'warning', slaCalc);
        }
      }

      // Update lead SLA fields if changed
      if (newLevel !== currentLevel || newSlaStatus !== lead.slaStatus) {
        const updateData = {
          slaStatus: newSlaStatus,
          escalationLevel: newLevel,
        };

        if (newLevel > currentLevel) {
          updateData.lastEscalatedAt = now;
        }
        if (newSlaStatus === 'BREACHED' && !lead.slaBreachedAt) {
          updateData.slaBreachedAt = now;
        }

        await prisma.lead.update({
          where: { id: lead.id },
          data: updateData,
        });

        // Fire automation rules for SLA events
        if (newSlaStatus === 'AT_RISK') {
          executeAutomations('LEAD_SLA_WARNING', { organizationId: org.id, lead }).catch(() => {});
        } else if (newSlaStatus === 'BREACHED') {
          executeAutomations('LEAD_SLA_BREACHED', { organizationId: org.id, lead }).catch(() => {});
        } else if (newSlaStatus === 'ESCALATED') {
          executeAutomations('LEAD_SLA_ESCALATED', { organizationId: org.id, lead }).catch(() => {});
        }
      }

      if (actionTaken) {
        actionsLog.push({ leadId: lead.id, leadName: `${lead.firstName} ${lead.lastName}`, action: actionTaken });
      }
    } catch (err) {
      logger.error(`[SLA] Error processing lead ${lead.id}:`, err.message);
    }
  }

  return { orgId: org.id, processed: leads.length, actions: actionsLog };
}

/**
 * Send a reminder notification to the assigned user.
 */
async function sendReminder(lead, org, slaCalc) {
  const leadName = `${lead.firstName} ${lead.lastName}`.trim();
  const minutes = Math.round(slaCalc.elapsedMinutes);

  if (lead.assignedToId) {
    // Create activity log
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'SLA_REMINDER_SENT',
        description: `SLA reminder sent — lead unattended for ${minutes} minutes`,
        metadata: { elapsedMinutes: minutes, escalationLevel: 1 },
      },
    });

    // Send in-app notification
    await createNotification({
      type: 'SLA_BREACH_REMINDER',
      title: 'Lead Needs Attention',
      message: `${leadName} has been waiting for ${minutes} minutes without a response. Please attend to this lead immediately.`,
      userId: lead.assignedToId,
      entityType: 'lead',
      entityId: lead.id,
      organizationId: org.id,
      metadata: { slaElapsedMinutes: minutes, slaStatus: 'BREACHED' },
    });

    // WebSocket real-time push
    notifyUser(lead.assignedToId, {
      type: 'sla_reminder',
      severity: 'warning',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      message: `${leadName} needs your attention — waiting ${minutes} min`,
      elapsedMinutes: minutes,
    });

    logger.info(`[SLA] Reminder sent for lead ${lead.id} to user ${lead.assignedToId} (${minutes} min)`);
    return 'reminder_sent';
  }

  // No assignee — notify admins
  await notifyOrgAdmins(org.id, {
    type: 'SLA_BREACH_REMINDER',
    title: 'Unassigned Lead Breaching SLA',
    message: `${leadName} has been unassigned and unattended for ${minutes} minutes`,
    entityType: 'lead',
    entityId: lead.id,
  });

  return 'admin_notified_unassigned';
}

/**
 * Notify the manager or escalation contact about an SLA breach.
 */
async function notifyManager(lead, org, config, slaCalc) {
  const leadName = `${lead.firstName} ${lead.lastName}`.trim();
  const assigneeName = lead.assignedTo
    ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`.trim()
    : 'Unassigned';
  const minutes = Math.round(slaCalc.elapsedMinutes);

  // Create activity log
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'SLA_ESCALATED',
      description: `SLA escalated to manager — lead unattended for ${minutes} minutes (assigned to ${assigneeName})`,
      metadata: { elapsedMinutes: minutes, escalationLevel: 2, assigneeName },
    },
  });

  // Notify specific escalation contact if configured
  if (config.escalationContactId) {
    await createNotification({
      type: 'SLA_ESCALATION',
      title: 'SLA Escalation — Lead Unattended',
      message: `${leadName} (assigned to ${assigneeName}) has been unattended for ${minutes} minutes. Immediate action required.`,
      userId: config.escalationContactId,
      entityType: 'lead',
      entityId: lead.id,
      organizationId: org.id,
      metadata: { slaElapsedMinutes: minutes, slaStatus: 'ESCALATED', assigneeName },
    });

    notifyUser(config.escalationContactId, {
      type: 'sla_escalation',
      severity: 'critical',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      message: `ESCALATION: ${leadName} unattended ${minutes} min (${assigneeName})`,
      elapsedMinutes: minutes,
    });
  }

  // Also notify all org admins
  await notifyOrgAdmins(org.id, {
    type: 'SLA_ESCALATION',
    title: 'SLA Escalation — Lead Unattended',
    message: `${leadName} (assigned to ${assigneeName}) unattended for ${minutes} minutes`,
    entityType: 'lead',
    entityId: lead.id,
    metadata: { slaElapsedMinutes: minutes, assigneeName },
  });

  // Also remind the assigned user one more time
  if (lead.assignedToId) {
    notifyUser(lead.assignedToId, {
      type: 'sla_escalation',
      severity: 'critical',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      message: `URGENT: ${leadName} has been escalated to management — ${minutes} min without response`,
      elapsedMinutes: minutes,
    });
  }

  logger.info(`[SLA] Escalation for lead ${lead.id} — notified managers (${minutes} min)`);
  return 'manager_notified';
}

/**
 * Auto-reassign a lead to the next available team member.
 */
async function executeReassign(lead, org, config, slaCalc) {
  const leadName = `${lead.firstName} ${lead.lastName}`.trim();
  const minutes = Math.round(slaCalc.elapsedMinutes);
  const previousAssignee = lead.assignedTo;
  const previousAssigneeName = previousAssignee
    ? `${previousAssignee.firstName} ${previousAssignee.lastName}`.trim()
    : 'Unassigned';

  // Find next available rep (excluding current assignee)
  const newAssigneeId = await getNextAssignee(org.id, lead);

  if (!newAssigneeId || newAssigneeId === lead.assignedToId) {
    // Cannot reassign — notify admins instead
    await notifyOrgAdmins(org.id, {
      type: 'SLA_REASSIGN_FAILED',
      title: 'SLA Auto-Reassign Failed',
      message: `Could not find an available team member to reassign ${leadName} (unattended ${minutes} min)`,
      entityType: 'lead',
      entityId: lead.id,
    });
    logger.warn(`[SLA] No eligible user to reassign lead ${lead.id}`);
    return 'reassign_failed';
  }

  // Get new assignee info
  const newAssignee = await prisma.user.findUnique({
    where: { id: newAssigneeId },
    select: { id: true, firstName: true, lastName: true },
  });
  const newAssigneeName = newAssignee
    ? `${newAssignee.firstName} ${newAssignee.lastName}`.trim()
    : 'Unknown';

  // Perform the reassignment in a transaction
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        assignedToId: newAssigneeId,
        slaStatus: 'ESCALATED',
        escalationLevel: 3,
        lastEscalatedAt: new Date(),
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'SLA_REASSIGNED',
        description: `Auto-reassigned from ${previousAssigneeName} to ${newAssigneeName} due to SLA breach (${minutes} min unattended)`,
        metadata: {
          elapsedMinutes: minutes,
          escalationLevel: 3,
          previousAssigneeId: lead.assignedToId,
          newAssigneeId,
          reason: 'sla_breach_auto_reassign',
        },
      },
    });
  });

  // Notify new assignee
  await createNotification({
    type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
    title: 'Lead Auto-Assigned (SLA Breach)',
    message: `${leadName} has been automatically assigned to you because the previous owner did not respond within ${minutes} minutes`,
    userId: newAssigneeId,
    entityType: 'lead',
    entityId: lead.id,
    organizationId: org.id,
    metadata: { slaElapsedMinutes: minutes, autoReassigned: true },
  });

  notifyUser(newAssigneeId, {
    type: 'sla_reassignment',
    severity: 'info',
    lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
    message: `${leadName} auto-assigned to you (SLA: ${minutes} min unattended)`,
    elapsedMinutes: minutes,
  });

  // Notify previous assignee
  if (lead.assignedToId) {
    await createNotification({
      type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
      title: 'Lead Reassigned Due to SLA Breach',
      message: `${leadName} was reassigned to ${newAssigneeName} because it was not attended within ${minutes} minutes`,
      userId: lead.assignedToId,
      entityType: 'lead',
      entityId: lead.id,
      organizationId: org.id,
      metadata: { slaElapsedMinutes: minutes, autoReassigned: true },
    });

    notifyUser(lead.assignedToId, {
      type: 'sla_reassignment',
      severity: 'warning',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      message: `${leadName} was reassigned to ${newAssigneeName} — SLA breach (${minutes} min)`,
    });
  }

  // Notify admins
  await notifyOrgAdmins(org.id, {
    type: 'SLA_REASSIGN_SUCCESS',
    title: 'Lead Auto-Reassigned (SLA)',
    message: `${leadName} reassigned from ${previousAssigneeName} to ${newAssigneeName} after ${minutes} min SLA breach`,
    entityType: 'lead',
    entityId: lead.id,
    metadata: { previousAssigneeName, newAssigneeName, minutes },
  });

  // Broadcast data change for real-time UI updates
  broadcastDataChange(org.id, 'lead', 'updated', null, { entityId: lead.id }).catch(() => {});

  logger.info(`[SLA] Lead ${lead.id} reassigned: ${previousAssigneeName} → ${newAssigneeName} (${minutes} min)`);
  return 'reassigned';
}

/**
 * Send a generic SLA notification.
 */
async function sendSLANotification(lead, org, type, slaCalc) {
  const leadName = `${lead.firstName} ${lead.lastName}`.trim();
  const minutes = Math.round(slaCalc.elapsedMinutes);

  const messages = {
    warning: {
      title: 'Lead Response Time Warning',
      message: `${leadName} has been waiting for ${minutes} minutes. SLA breach approaching.`,
      activityType: 'SLA_REMINDER_SENT',
    },
    breach: {
      title: 'SLA Breached — Lead Unattended',
      message: `${leadName} has breached SLA — unattended for ${minutes} minutes`,
      activityType: 'SLA_BREACHED',
    },
    escalation: {
      title: 'SLA Escalation',
      message: `${leadName} has been unattended for ${minutes} minutes. Escalation in progress.`,
      activityType: 'SLA_ESCALATED',
    },
    reassign_warning: {
      title: 'Lead Will Be Reassigned',
      message: `${leadName} will be reassigned if not attended — ${minutes} minutes elapsed`,
      activityType: 'SLA_ESCALATED',
    },
  };

  const msg = messages[type] || messages.warning;

  // Log activity
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: msg.activityType,
      description: msg.message,
      metadata: { elapsedMinutes: minutes, slaType: type },
    },
  });

  // Notify assigned user
  if (lead.assignedToId) {
    await createNotification({
      type: `SLA_${type.toUpperCase()}`,
      title: msg.title,
      message: msg.message,
      userId: lead.assignedToId,
      entityType: 'lead',
      entityId: lead.id,
      organizationId: org.id,
      metadata: { slaElapsedMinutes: minutes, slaType: type },
    });

    notifyUser(lead.assignedToId, {
      type: `sla_${type}`,
      severity: type === 'warning' ? 'warning' : 'critical',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      message: msg.message,
      elapsedMinutes: minutes,
    });
  }

  return `${type}_notification_sent`;
}

/**
 * Main SLA check loop — processes all organizations with SLA enabled.
 */
async function runSLACheck() {
  const startTime = Date.now();

  try {
    // Fetch all organizations (we check config inside processOrganization)
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, settings: true },
    });

    let totalProcessed = 0;
    let totalActions = 0;

    for (const org of orgs) {
      try {
        const result = await processOrganization(org);
        totalProcessed += result.processed;
        totalActions += result.actions.length;
      } catch (err) {
        logger.error(`[SLA] Error processing org ${org.id}:`, err.message);
      }
    }

    const durationMs = Date.now() - startTime;
    if (totalActions > 0) {
      logger.info(`[SLA] Check completed in ${durationMs}ms — ${totalProcessed} leads checked, ${totalActions} actions taken`);
    }
  } catch (err) {
    logger.error('[SLA] Monitor check failed:', err.message);
  }
}

/**
 * Start the SLA monitoring interval.
 */
function startSLAMonitor(intervalMs = SLA_CHECK_INTERVAL) {
  if (slaInterval) {
    logger.warn('[SLA] Monitor already running');
    return;
  }

  logger.info(`[SLA] Starting SLA monitor (interval: ${intervalMs / 1000}s)`);

  // Run immediately on startup
  runSLACheck().catch((err) => logger.error('[SLA] Initial check failed:', err.message));

  // Then run on interval
  slaInterval = setInterval(() => {
    runSLACheck().catch((err) => logger.error('[SLA] Periodic check failed:', err.message));
  }, intervalMs);
}

/**
 * Stop the SLA monitoring interval.
 */
function stopSLAMonitor() {
  if (slaInterval) {
    clearInterval(slaInterval);
    slaInterval = null;
    logger.info('[SLA] Monitor stopped');
  }
}

/**
 * Get SLA status summary for a single lead (used by API endpoints).
 */
function getLeadSLAInfo(lead, orgSettings) {
  const config = getSLAConfig(orgSettings);

  if (!config.enabled) {
    return { enabled: false };
  }

  if (lead.firstRespondedAt) {
    const respondedInMs = new Date(lead.firstRespondedAt).getTime() - new Date(lead.createdAt).getTime();
    const respondedInMinutes = Math.round(respondedInMs / 60000);
    const withinSLA = respondedInMinutes <= config.thresholds.breachMinutes;
    return {
      enabled: true,
      status: 'RESPONDED',
      respondedInMinutes,
      withinSLA,
      thresholds: config.thresholds,
      escalationLevel: lead.escalationLevel || 0,
    };
  }

  const calc = calculateSLAStatus(lead, config);
  const timeRemainingMinutes = Math.max(0, config.thresholds.breachMinutes - calc.elapsedMinutes);

  return {
    enabled: true,
    status: calc.status,
    elapsedMinutes: Math.round(calc.elapsedMinutes),
    percentUsed: Math.min(calc.percentUsed, 100),
    timeRemainingMinutes: Math.round(timeRemainingMinutes),
    thresholds: config.thresholds,
    escalationLevel: lead.escalationLevel || 0,
    slaBreachedAt: lead.slaBreachedAt,
    lastEscalatedAt: lead.lastEscalatedAt,
  };
}

module.exports = {
  startSLAMonitor,
  stopSLAMonitor,
  runSLACheck,
  getSLAConfig,
  getLeadSLAInfo,
  calculateSLAStatus,
  DEFAULT_SLA_CONFIG,
};
