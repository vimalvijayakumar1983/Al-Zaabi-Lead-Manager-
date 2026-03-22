const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { sendText } = require('./whatsappService');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { sendEmail, sendTemplateEmail } = require('./emailService');
const { getNextAssignee } = require('./leadAssignment');
const { createNotification, notifyOrgAdmins, NOTIFICATION_TYPES } = require('./notificationService');

/**
 * Evaluate and execute automation rules for a given trigger event.
 */
const executeAutomations = async (trigger, context) => {
  const { organizationId, lead, previousData } = context;

  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        organizationId,
        trigger,
        isActive: true,
      },
    });

    for (const rule of rules) {
      const startTime = Date.now();
      const executedActions = [];
      let logStatus = 'success';
      let logError = null;

      try {
        const conditionsMet = evaluateConditions(rule.conditions, lead, previousData);

        if (!conditionsMet) {
          // Log skipped execution
          await prisma.automationLog.create({
            data: {
              ruleId: rule.id,
              trigger,
              status: 'skipped',
              conditionsMet: false,
              actionsExecuted: [],
              executionTimeMs: Date.now() - startTime,
              leadId: lead?.id,
              leadName: lead ? `${lead.firstName} ${lead.lastName}`.trim() : null,
            },
          });
          continue;
        }

        // Execute actions and track each one
        for (const action of rule.actions || []) {
          try {
            await executeSingleAction(action, { organizationId, lead });
            executedActions.push({ type: action.type, status: 'success' });
          } catch (actionErr) {
            executedActions.push({ type: action.type, status: 'failed', error: actionErr.message });
            logStatus = 'failed';
            logError = actionErr.message;
          }
        }

        await prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
          },
        });

        logger.info(`Automation "${rule.name}" executed for lead ${lead.id}`);
      } catch (err) {
        logStatus = 'failed';
        logError = err.message;
        logger.error(`Automation "${rule.name}" failed:`, err);
      }

      // Always record the execution log
      try {
        await prisma.automationLog.create({
          data: {
            ruleId: rule.id,
            trigger,
            status: logStatus,
            conditionsMet: true,
            actionsExecuted: executedActions,
            error: logError,
            executionTimeMs: Date.now() - startTime,
            leadId: lead?.id,
            leadName: lead ? `${lead.firstName} ${lead.lastName}`.trim() : null,
          },
        });
      } catch (logErr) {
        logger.error('Failed to create automation log:', logErr);
      }
    }
  } catch (err) {
    logger.error('Automation engine error:', err);
  }
};

/**
 * Resolve a field value from lead data.
 * Supports standard fields (e.g. "status"), relational fields (e.g. "assignedTo", "tags"),
 * and custom fields (e.g. "custom.propertyType" stored in lead.customData).
 */
const resolveFieldValue = (field, lead, previousData) => {
  // Custom fields from customData JSON
  if (field && field.startsWith('custom.')) {
    const customKey = field.slice(7); // strip "custom."
    const customData = typeof lead.customData === 'string'
      ? JSON.parse(lead.customData || '{}')
      : (lead.customData || {});
    const prevCustomData = previousData
      ? (typeof previousData.customData === 'string'
          ? JSON.parse(previousData.customData || '{}')
          : (previousData.customData || {}))
      : {};
    return customData[customKey] ?? prevCustomData[customKey];
  }

  // Relational / computed fields
  switch (field) {
    case 'assignedTo':
      return lead.assignedToId ?? previousData?.assignedToId;
    case 'tags': {
      // Return comma-separated tag names for contains/equals matching
      const tags = lead.tags || previousData?.tags || [];
      return tags.map((t) => (t.tag ? t.tag.name : t.name || t)).join(', ');
    }
    default:
      return lead[field] ?? previousData?.[field];
  }
};

/**
 * Evaluate conditions against lead data.
 * Supports both standard lead fields and custom fields (prefixed with "custom.").
 */
const evaluateConditions = (conditions, lead, previousData) => {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const value = resolveFieldValue(cond.field, lead, previousData);
    // Detect date fields for proper comparison
    const isDateField = ['createdAt', 'updatedAt', 'wonAt', 'lostAt'].includes(cond.field)
      || (cond.field?.startsWith('custom.') && cond.value && /^\d{4}-\d{2}-\d{2}/.test(String(cond.value)));

    if (isDateField && value) {
      const dateVal = new Date(value).getTime();
      const condDate = new Date(cond.value).getTime();
      if (isNaN(dateVal) || isNaN(condDate)) return false;
      switch (cond.operator) {
        case 'equals': return new Date(value).toDateString() === new Date(cond.value).toDateString();
        case 'gt': return dateVal > condDate;
        case 'lt': return dateVal < condDate;
        default: return false;
      }
    }

    switch (cond.operator) {
      case 'equals': return String(value) === String(cond.value);
      case 'not_equals': return String(value) !== String(cond.value);
      case 'contains': return String(value).toLowerCase().includes(String(cond.value).toLowerCase());
      case 'gt': return Number(value) > Number(cond.value);
      case 'lt': return Number(value) < Number(cond.value);
      case 'in': return Array.isArray(cond.value) && cond.value.includes(String(value));
      default: return false;
    }
  });
};

/**
 * Execute a single automation action
 */
const executeSingleAction = async (action, context) => {
  switch (action.type) {
    case 'change_status':
      await prisma.lead.update({
        where: { id: context.lead.id },
        data: { status: action.config.status },
      });
      break;

    case 'change_stage':
      await prisma.lead.update({
        where: { id: context.lead.id },
        data: { stageId: action.config.stageId },
      });
      break;

    case 'assign_lead':
      await prisma.lead.update({
        where: { id: context.lead.id },
        data: { assignedToId: action.config.userId },
      });
      if (action.config.userId) {
        notifyUser(action.config.userId, {
          type: 'lead_assigned',
          lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
          message: 'Lead auto-assigned by automation rule',
        });
      }
      break;

    case 'add_tag':
      const tag = await prisma.tag.upsert({
        where: {
          organizationId_name: {
            organizationId: context.organizationId,
            name: action.config.tagName,
          },
        },
        create: { name: action.config.tagName, organizationId: context.organizationId },
        update: {},
      });
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId: context.lead.id, tagId: tag.id } },
        create: { leadId: context.lead.id, tagId: tag.id },
        update: {},
      });
      break;

    case 'create_task': {
      const taskTitle = (action.config.title || `Follow up with ${context.lead.firstName}`)
        .replace(/\{\{firstName\}\}/g, context.lead.firstName || '')
        .replace(/\{\{lastName\}\}/g, context.lead.lastName || '')
        .replace(/\{\{company\}\}/g, context.lead.company || '');
      await prisma.task.create({
        data: {
          title: taskTitle,
          type: action.config.taskType || 'FOLLOW_UP_CALL',
          priority: action.config.priority || 'MEDIUM',
          dueAt: new Date(Date.now() + (action.config.dueInHours || 24) * 3600000),
          assigneeId: context.lead.assignedToId || action.config.userId,
          createdById: action.config.userId || context.lead.assignedToId,
          leadId: context.lead.id,
        },
      });
      break;
    }

    case 'notify_user': {
      const notifyUserId = action.config.userId || context.lead.assignedToId;
      const notifyMsg = (action.config.message || 'Automation triggered')
        .replace(/\{\{firstName\}\}/g, context.lead.firstName || '')
        .replace(/\{\{lastName\}\}/g, context.lead.lastName || '')
        .replace(/\{\{source\}\}/g, context.lead.source || '')
        .replace(/\{\{company\}\}/g, context.lead.company || '')
        .replace(/\{\{status\}\}/g, context.lead.status || '');
      if (notifyUserId) {
        notifyUser(notifyUserId, {
          type: 'automation_notification',
          message: notifyMsg,
          lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
        });
      }
      break;
    }

    case 'send_email': {
      // Determine recipient: custom email, assigned user, or lead email
      let recipientEmail = null;
      const recipientType = action.config.recipientType || 'lead';

      if (recipientType === 'custom' && action.config.recipientEmail) {
        recipientEmail = action.config.recipientEmail;
      } else if (recipientType === 'assigned_user' && context.lead.assignedToId) {
        try {
          const assignedUser = await prisma.user.findUnique({
            where: { id: context.lead.assignedToId },
            select: { email: true, firstName: true, lastName: true },
          });
          recipientEmail = assignedUser?.email;
        } catch (err) {
          logger.warn('[Automation] Failed to lookup assigned user email:', err.message);
        }
      } else {
        recipientEmail = context.lead.email;
      }

      if (!recipientEmail) {
        logger.warn(`[Automation] No email address for ${recipientType} on lead ${context.lead.id}`);
        break;
      }

      // Build comprehensive variables for template rendering
      const variables = {
        firstName: context.lead.firstName || '',
        lastName: context.lead.lastName || '',
        email: context.lead.email || '',
        phone: context.lead.phone || '',
        company: context.lead.company || '',
        jobTitle: context.lead.jobTitle || '',
        source: context.lead.source || '',
        status: context.lead.status || '',
        location: context.lead.location || '',
        score: String(context.lead.score || 0),
        companyName: 'Al-Zaabi Group',
        senderName: 'Al-Zaabi Team',
        assignedTo: '',
      };

      // Fetch org name and assigned user name for variables
      try {
        const [org, assignedUser] = await Promise.all([
          prisma.organization.findUnique({
            where: { id: context.organizationId },
            select: { name: true, tradeName: true },
          }),
          context.lead.assignedToId
            ? prisma.user.findUnique({
                where: { id: context.lead.assignedToId },
                select: { firstName: true, lastName: true },
              })
            : null,
        ]);
        if (org) {
          variables.companyName = org.tradeName || org.name;
          variables.senderName = org.tradeName || org.name;
        }
        if (assignedUser) {
          variables.assignedTo = `${assignedUser.firstName} ${assignedUser.lastName}`.trim();
        }
      } catch (err) {
        logger.warn('[Automation] Failed to enrich email variables:', err.message);
      }

      if (action.config.template) {
        // Use a named template
        const result = await sendTemplateEmail({
          to: recipientEmail,
          templateName: action.config.template,
          variables,
          organizationId: context.organizationId,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to send template email');
        }
      } else {
        // Direct email with subject/body from config — interpolate template variables
        const interpolate = (str) => (str || '').replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || '');
        const result = await sendEmail({
          to: recipientEmail,
          subject: interpolate(action.config.subject) || 'Notification from Al-Zaabi CRM',
          html: interpolate(action.config.body || action.config.message || ''),
          organizationId: context.organizationId,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to send email');
        }
      }

      // Log the communication
      try {
        await prisma.communication.create({
          data: {
            leadId: context.lead.id,
            channel: 'EMAIL',
            direction: 'OUTBOUND',
            subject: action.config.subject || action.config.template || 'Automation Email',
            body: action.config.body || `Template: ${action.config.template}`,
            metadata: { source: 'automation', recipientType, recipientEmail },
          },
        });
      } catch (logErr) {
        logger.warn('Failed to log automation email communication:', logErr.message);
      }

      logger.info(`[Automation] Email sent to ${recipientEmail} (${recipientType})`);
      break;
    }

    case 'send_whatsapp': {
      const phone = context.lead.phone;
      if (!phone) {
        logger.warn(`[Automation] No phone number for lead ${context.lead.id} — skipping WhatsApp`);
        break;
      }

      // Interpolate template variables in the message
      let whatsappMsg = action.config.message || '';
      whatsappMsg = whatsappMsg
        .replace(/\{\{firstName\}\}/g, context.lead.firstName || '')
        .replace(/\{\{lastName\}\}/g, context.lead.lastName || '')
        .replace(/\{\{email\}\}/g, context.lead.email || '')
        .replace(/\{\{company\}\}/g, context.lead.company || '')
        .replace(/\{\{source\}\}/g, context.lead.source || '');

      // Attempt to send via WhatsApp integration if configured
      try {
        const orgSettings = await prisma.organization.findUnique({
          where: { id: context.organizationId },
          select: { settings: true },
        });
        const whatsappConfig = orgSettings?.settings?.whatsapp;

        if (whatsappConfig?.apiUrl && whatsappConfig?.apiKey) {
          const response = await fetch(whatsappConfig.apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${whatsappConfig.apiKey}`,
            },
            body: JSON.stringify({
              phone: phone,
              message: whatsappMsg,
            }),
          });
          if (!response.ok) {
            throw new Error(`WhatsApp API returned ${response.status}`);
          }
          logger.info(`[Automation] WhatsApp sent to ${phone}`);
        } else {
          logger.info(`[Automation] WhatsApp not configured — logging message to ${phone}: ${whatsappMsg}`);
        }
      } catch (waErr) {
        logger.warn(`[Automation] WhatsApp send failed: ${waErr.message}`);
        throw waErr;
      }

      // Log the communication
      try {
        await prisma.communication.create({
          data: {
            leadId: context.lead.id,
            channel: 'WHATSAPP',
            direction: 'OUTBOUND',
            body: whatsappMsg,
            metadata: { source: 'automation' },
          },
        });
      } catch (logErr) {
        logger.warn('Failed to log WhatsApp communication:', logErr.message);
      }
      break;
    }

    case 'webhook': {
      const webhookUrl = action.config.url;
      if (!webhookUrl) {
        logger.warn('[Automation] Webhook URL not configured — skipping');
        break;
      }

      const webhookMethod = (action.config.method || 'POST').toUpperCase();
      const webhookPayload = {
        event: context.trigger || 'automation',
        timestamp: new Date().toISOString(),
        lead: {
          id: context.lead.id,
          firstName: context.lead.firstName,
          lastName: context.lead.lastName,
          email: context.lead.email,
          phone: context.lead.phone,
          company: context.lead.company,
          status: context.lead.status,
          source: context.lead.source,
          score: context.lead.score,
        },
        organizationId: context.organizationId,
      };

      // Merge any custom headers from config
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'AlZaabi-CRM-Automation/1.0',
        ...(action.config.headers || {}),
      };

      try {
        const fetchOpts = { method: webhookMethod, headers };
        if (webhookMethod !== 'GET') {
          fetchOpts.body = JSON.stringify(webhookPayload);
        }
        const response = await fetch(webhookUrl, fetchOpts);

        if (!response.ok) {
          throw new Error(`Webhook returned HTTP ${response.status}`);
        }
        logger.info(`[Automation] Webhook fired: ${webhookMethod} ${webhookUrl} — ${response.status}`);
      } catch (whErr) {
        logger.error(`[Automation] Webhook failed: ${whErr.message}`);
        throw whErr;
      }
      break;
    }

    case 'reassign_lead_round_robin': {
      // Auto-reassign lead to next available rep via round-robin
      const previousAssigneeId = context.lead.assignedToId;
      const newAssigneeId = await getNextAssignee(context.organizationId, context.lead);

      if (!newAssigneeId || newAssigneeId === previousAssigneeId) {
        // Cannot reassign — notify admins
        await notifyOrgAdmins(context.organizationId, {
          type: 'SLA_REASSIGN_FAILED',
          title: 'SLA Auto-Reassign Failed',
          message: `Could not find an available team member to reassign ${context.lead.firstName} ${context.lead.lastName}`,
          entityType: 'lead',
          entityId: context.lead.id,
        });
        logger.warn(`[Automation] No eligible user to reassign lead ${context.lead.id}`);
        break;
      }

      // Get names for logging
      const [newAssignee, previousAssignee] = await Promise.all([
        prisma.user.findUnique({ where: { id: newAssigneeId }, select: { firstName: true, lastName: true } }),
        previousAssigneeId
          ? prisma.user.findUnique({ where: { id: previousAssigneeId }, select: { firstName: true, lastName: true } })
          : null,
      ]);
      const newName = newAssignee ? `${newAssignee.firstName} ${newAssignee.lastName}`.trim() : 'Unknown';
      const prevName = previousAssignee ? `${previousAssignee.firstName} ${previousAssignee.lastName}`.trim() : 'Unassigned';
      const leadName = `${context.lead.firstName} ${context.lead.lastName}`.trim();
      const minutes = context.lead.slaElapsedMinutes || 0;

      // Perform reassignment
      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: context.lead.id },
          data: {
            assignedToId: newAssigneeId,
            slaStatus: 'ESCALATED',
            escalationLevel: 3,
            lastEscalatedAt: new Date(),
          },
        });
        await tx.leadActivity.create({
          data: {
            leadId: context.lead.id,
            type: 'SLA_REASSIGNED',
            description: `Auto-reassigned from ${prevName} to ${newName} via automation (${minutes} min unattended)`,
            metadata: {
              elapsedMinutes: minutes,
              escalationLevel: 3,
              previousAssigneeId,
              newAssigneeId,
              reason: 'automation_sla_reassign',
            },
          },
        });
      });

      // Notify new assignee
      await createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Auto-Assigned (SLA)',
        message: `${leadName} has been automatically assigned to you via SLA automation`,
        userId: newAssigneeId,
        entityType: 'lead',
        entityId: context.lead.id,
        organizationId: context.organizationId,
        metadata: { slaElapsedMinutes: minutes, autoReassigned: true },
      });
      notifyUser(newAssigneeId, {
        type: 'sla_reassignment',
        severity: 'info',
        lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
        message: `${leadName} auto-assigned to you (SLA automation)`,
      });

      // Notify previous assignee
      if (previousAssigneeId) {
        notifyUser(previousAssigneeId, {
          type: 'sla_reassignment',
          severity: 'warning',
          lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
          message: `${leadName} was reassigned to ${newName} — SLA automation`,
        });
      }

      // Broadcast for real-time UI
      broadcastDataChange(context.organizationId, 'lead', 'updated', null, { entityId: context.lead.id }).catch(() => {});

      logger.info(`[Automation] Lead ${context.lead.id} reassigned: ${prevName} → ${newName}`);
      break;
    }

    case 'update_sla_status': {
      // Manually update a lead's SLA status via automation
      const newSlaStatus = action.config.slaStatus;
      const newEscalationLevel = action.config.escalationLevel;
      const updateFields = {};

      if (newSlaStatus) updateFields.slaStatus = newSlaStatus;
      if (newEscalationLevel !== undefined) updateFields.escalationLevel = Number(newEscalationLevel);

      if (Object.keys(updateFields).length > 0) {
        await prisma.lead.update({
          where: { id: context.lead.id },
          data: updateFields,
        });
        logger.info(`[Automation] Updated SLA status for lead ${context.lead.id}: ${JSON.stringify(updateFields)}`);
      }
      break;
    }

      default:
        logger.warn(`Unknown automation action type: ${action.type}`);
  }
};

module.exports = { executeAutomations };
