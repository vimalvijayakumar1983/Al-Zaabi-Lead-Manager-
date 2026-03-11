const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser } = require('../websocket/server');

/**
 * Evaluate and execute automation rules for a given trigger event
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
      try {
        const conditionsMet = evaluateConditions(rule.conditions, lead, previousData);
        if (!conditionsMet) continue;

        await executeActions(rule.actions, { organizationId, lead });

        await prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            executionCount: { increment: 1 },
            lastExecutedAt: new Date(),
          },
        });

        logger.info(`Automation "${rule.name}" executed for lead ${lead.id}`);
      } catch (err) {
        logger.error(`Automation "${rule.name}" failed:`, err);
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
 * Execute automation actions
 */
const executeActions = async (actions, context) => {
  if (!Array.isArray(actions)) return;

  for (const action of actions) {
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

      case 'send_email':
        // Integration point: use email service
        logger.info(`[Automation] Send email to ${context.lead.email}: ${action.config.subject}`);
        break;

      case 'send_whatsapp':
        // Integration point: use WhatsApp service
        logger.info(`[Automation] Send WhatsApp to ${context.lead.phone}: ${action.config.message}`);
        break;

      case 'webhook':
        // Integration point: fire webhook
        logger.info(`[Automation] Fire webhook: ${action.config.url}`);
        break;

      default:
        logger.warn(`Unknown automation action type: ${action.type}`);
    }
  }
};

module.exports = { executeAutomations };
