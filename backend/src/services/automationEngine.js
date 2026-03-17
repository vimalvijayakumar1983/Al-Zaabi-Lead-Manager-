const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser } = require('../websocket/server');
const { sendText } = require('./whatsappService');
const { sendEmail, sendTemplateEmail } = require('./emailService');

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
 * Evaluate conditions against lead data
 */
const evaluateConditions = (conditions, lead, previousData) => {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const value = lead[cond.field] ?? previousData?.[cond.field];
    switch (cond.operator) {
      case 'equals': return value === cond.value;
      case 'not_equals': return value !== cond.value;
      case 'contains': return String(value).toLowerCase().includes(String(cond.value).toLowerCase());
      case 'gt': return Number(value) > Number(cond.value);
      case 'lt': return Number(value) < Number(cond.value);
      case 'in': return Array.isArray(cond.value) && cond.value.includes(value);
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

    case 'create_task':
      await prisma.task.create({
        data: {
          title: action.config.title || `Follow up with ${context.lead.firstName}`,
          type: action.config.taskType || 'FOLLOW_UP_CALL',
          priority: action.config.priority || 'MEDIUM',
          dueAt: new Date(Date.now() + (action.config.dueInHours || 24) * 3600000),
          assigneeId: context.lead.assignedToId || action.config.userId,
          createdById: action.config.userId || context.lead.assignedToId,
          leadId: context.lead.id,
        },
      });
      break;

    case 'notify_user':
      const userId = action.config.userId || context.lead.assignedToId;
      if (userId) {
        notifyUser(userId, {
          type: 'automation_notification',
          message: action.config.message || 'Automation triggered',
          lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
        });
      }
      break;

    case 'send_email': {
      const leadEmail = context.lead.email;
      if (!leadEmail) {
        logger.warn(`[Automation] No email address for lead ${context.lead.id}`);
        break;
      }

      if (action.config.template) {
        // Use a named template
        const variables = {
          firstName: context.lead.firstName || '',
          lastName: context.lead.lastName || '',
          email: leadEmail,
          phone: context.lead.phone || '',
          company: context.lead.company || '',
          companyName: 'Al-Zaabi Group',
          senderName: 'Al-Zaabi Team',
        };
        const result = await sendTemplateEmail({
          to: leadEmail,
          templateName: action.config.template,
          variables,
          organizationId: context.organizationId,
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to send template email');
        }
      } else {
        // Direct email with subject/body from config
        const result = await sendEmail({
          to: leadEmail,
          subject: action.config.subject || 'Notification from Al-Zaabi CRM',
          html: action.config.body || action.config.message || '',
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
            metadata: { source: 'automation' },
          },
        });
      } catch (logErr) {
        logger.warn('Failed to log automation email communication:', logErr.message);
      }

      case 'notify_user':
        const userId = action.config.userId || context.lead.assignedToId;
        if (userId) {
          notifyUser(userId, {
            type: 'automation_notification',
            message: action.config.message || 'Automation triggered',
            lead: { id: context.lead.id, firstName: context.lead.firstName, lastName: context.lead.lastName },
          });
        }
        break;

      case 'send_email':
        // Integration point: use email service
        logger.info(`[Automation] Send email to ${context.lead.email}: ${action.config.subject}`);
        break;

      case 'send_whatsapp': {
        const message = action.config?.message;
        const phone = context.lead.phone?.replace(/\D/g, '');
        if (!phone) {
          logger.warn(`[Automation] Send WhatsApp skipped: lead ${context.lead.id} has no phone`);
          break;
        }
        if (!message) {
          logger.warn('[Automation] Send WhatsApp skipped: no message in action config');
          break;
        }
        try {
          await sendText(phone, message, context.organizationId);
          await prisma.communication.create({
            data: {
              leadId: context.lead.id,
              channel: 'WHATSAPP',
              direction: 'OUTBOUND',
              body: message,
              metadata: { automation: true },
              userId: null,
            },
          });
          await prisma.leadActivity.create({
            data: {
              leadId: context.lead.id,
              userId: null,
              type: 'WHATSAPP_SENT',
              description: `WhatsApp (automation): ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`,
            },
          });
        } catch (err) {
          logger.error(`[Automation] Send WhatsApp failed for lead ${context.lead.id}:`, err.message);
        }
        break;
      }

      case 'webhook':
        // Integration point: fire webhook
        logger.info(`[Automation] Fire webhook: ${action.config.url}`);
        break;

      default:
        logger.warn(`Unknown automation action type: ${action.type}`);
    }

    case 'send_whatsapp':
      logger.info(`[Automation] Send WhatsApp to ${context.lead.phone}: ${action.config.message}`);
      break;

    case 'webhook':
      logger.info(`[Automation] Fire webhook: ${action.config.url}`);
      break;

    default:
      logger.warn(`Unknown automation action type: ${action.type}`);
  }
};

module.exports = { executeAutomations };
