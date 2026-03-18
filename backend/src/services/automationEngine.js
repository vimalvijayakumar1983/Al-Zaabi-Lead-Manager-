const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser } = require('../websocket/server');
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
        // Direct email with subject/body from config
        const result = await sendEmail({
          to: recipientEmail,
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
            metadata: { source: 'automation', recipientType, recipientEmail },
          },
        });
      } catch (logErr) {
        logger.warn('Failed to log automation email communication:', logErr.message);
      }

      logger.info(`[Automation] Email sent to ${recipientEmail} (${recipientType})`);
      break;
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
