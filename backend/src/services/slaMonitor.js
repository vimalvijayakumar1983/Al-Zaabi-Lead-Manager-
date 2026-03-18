/**
 * SLA Automation Scheduler
 *
 * Lightweight service that monitors lead response times and fires automation
 * triggers when SLA thresholds are crossed. All actions (notifications,
 * escalations, reassignments) are handled by automation rules — not here.
 *
 * ── SLA Status Flow ────────────────────────────────────────────────
 *
 *  ON_TIME   →  Lead is within SLA
 *  AT_RISK   →  Approaching breach (fires LEAD_SLA_WARNING trigger)
 *  BREACHED  →  SLA breached (fires LEAD_SLA_BREACHED trigger)
 *  ESCALATED →  Extended breach (fires LEAD_SLA_ESCALATED trigger)
 *  RESPONDED →  Lead has been responded to
 *
 * ── How It Works ───────────────────────────────────────────────────
 *
 *  1. Runs every 2 minutes (configurable)
 *  2. Checks all unresponded leads against org SLA thresholds
 *  3. Updates slaStatus, escalationLevel fields on leads
 *  4. Fires automation triggers so users can configure their own
 *     workflows via the Automations page (notify, email, reassign, etc.)
 *
 * @module services/slaMonitor
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { broadcastDataChange } = require('../websocket/server');
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
 * Only updates SLA status fields and fires automation triggers.
 */
async function processOrganization(org) {
  const config = getSLAConfig(org.settings);
  if (!config.enabled) return { orgId: org.id, processed: 0, triggers: 0 };

  let triggersFired = 0;

  // Find all active, unresponded leads
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
      const currentLevel = lead.escalationLevel || 0;
      const currentSlaStatus = lead.slaStatus || 'ON_TIME';

      let newLevel = currentLevel;
      let newSlaStatus = slaCalc.status;
      let triggerToFire = null;

      // Determine if we need to escalate and which trigger to fire
      if (slaCalc.tier === 3 && currentLevel < 3) {
        newLevel = 3;
        newSlaStatus = 'ESCALATED';
        triggerToFire = 'LEAD_SLA_ESCALATED';
      } else if (slaCalc.tier === 2 && currentLevel < 2) {
        newLevel = 2;
        newSlaStatus = 'ESCALATED';
        triggerToFire = 'LEAD_SLA_ESCALATED';
      } else if (slaCalc.tier === 1 && currentLevel < 1) {
        newLevel = 1;
        newSlaStatus = 'BREACHED';
        triggerToFire = 'LEAD_SLA_BREACHED';
      } else if (slaCalc.status === 'AT_RISK' && currentSlaStatus !== 'AT_RISK' && currentSlaStatus !== 'BREACHED' && currentSlaStatus !== 'ESCALATED') {
        newSlaStatus = 'AT_RISK';
        triggerToFire = 'LEAD_SLA_WARNING';
      }

      // Update lead SLA fields if changed
      if (newLevel !== currentLevel || newSlaStatus !== currentSlaStatus) {
        const now = new Date();
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

        // Log the SLA status change as an activity
        const minutes = Math.round(slaCalc.elapsedMinutes);
        const activityTypes = {
          'LEAD_SLA_WARNING': 'SLA_REMINDER_SENT',
          'LEAD_SLA_BREACHED': 'SLA_BREACHED',
          'LEAD_SLA_ESCALATED': 'SLA_ESCALATED',
        };
        const activityMessages = {
          'LEAD_SLA_WARNING': `SLA warning — lead unattended for ${minutes} minutes (approaching breach)`,
          'LEAD_SLA_BREACHED': `SLA breached — lead unattended for ${minutes} minutes`,
          'LEAD_SLA_ESCALATED': `SLA escalated — lead unattended for ${minutes} minutes (level ${newLevel})`,
        };

        if (triggerToFire && activityTypes[triggerToFire]) {
          await prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              type: activityTypes[triggerToFire],
              description: activityMessages[triggerToFire],
              metadata: {
                elapsedMinutes: minutes,
                escalationLevel: newLevel,
                slaStatus: newSlaStatus,
                trigger: triggerToFire,
              },
            },
          });
        }

        // Fire automation trigger with enriched lead context
        if (triggerToFire) {
          const enrichedLead = {
            ...lead,
            slaStatus: newSlaStatus,
            escalationLevel: newLevel,
            slaElapsedMinutes: Math.round(slaCalc.elapsedMinutes),
            slaPercentUsed: slaCalc.percentUsed,
            slaThresholds: config.thresholds,
          };

          executeAutomations(triggerToFire, {
            organizationId: org.id,
            lead: enrichedLead,
          }).catch((err) => {
            logger.error(`[SLA] Automation trigger ${triggerToFire} failed for lead ${lead.id}:`, err.message);
          });

          triggersFired++;
        }

        // Broadcast data change for real-time UI updates
        broadcastDataChange(org.id, 'lead', 'updated', null, { entityId: lead.id }).catch(() => {});
      }
    } catch (err) {
      logger.error(`[SLA] Error processing lead ${lead.id}:`, err.message);
    }
  }

  return { orgId: org.id, processed: leads.length, triggers: triggersFired };
}

/**
 * Main SLA check loop — processes all organizations with SLA enabled.
 */
async function runSLACheck() {
  const startTime = Date.now();

  try {
    const orgs = await prisma.organization.findMany({
      select: { id: true, name: true, settings: true },
    });

    let totalProcessed = 0;
    let totalTriggers = 0;

    for (const org of orgs) {
      try {
        const result = await processOrganization(org);
        totalProcessed += result.processed;
        totalTriggers += result.triggers;
      } catch (err) {
        logger.error(`[SLA] Error processing org ${org.id}:`, err.message);
      }
    }

    const durationMs = Date.now() - startTime;
    if (totalTriggers > 0) {
      logger.info(`[SLA] Check completed in ${durationMs}ms — ${totalProcessed} leads checked, ${totalTriggers} automation triggers fired`);
    }
  } catch (err) {
    logger.error('[SLA] Scheduler check failed:', err.message);
  }
}

/**
 * Start the SLA automation scheduler.
 */
function startSLAMonitor(intervalMs = SLA_CHECK_INTERVAL) {
  if (slaInterval) {
    logger.warn('[SLA] Scheduler already running');
    return;
  }

  logger.info(`[SLA] Starting SLA automation scheduler (interval: ${intervalMs / 1000}s)`);

  // Run immediately on startup
  runSLACheck().catch((err) => logger.error('[SLA] Initial check failed:', err.message));

  // Then run on interval
  slaInterval = setInterval(() => {
    runSLACheck().catch((err) => logger.error('[SLA] Periodic check failed:', err.message));
  }, intervalMs);
}

/**
 * Stop the SLA automation scheduler.
 */
function stopSLAMonitor() {
  if (slaInterval) {
    clearInterval(slaInterval);
    slaInterval = null;
    logger.info('[SLA] Scheduler stopped');
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
