const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Round-robin lead assignment
 */
const roundRobinAssign = async (organizationId) => {
  const salesReps = await prisma.user.findMany({
    where: {
      organizationId,
      role: { in: ['SALES_REP', 'MANAGER'] },
      isActive: true,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (salesReps.length === 0) return null;

  // Find who has the fewest assigned active leads
  const counts = await Promise.all(
    salesReps.map(async (rep) => {
      const count = await prisma.lead.count({
        where: {
          assignedToId: rep.id,
          isArchived: false,
          status: { notIn: ['WON', 'LOST'] },
        },
      });
      return { userId: rep.id, count };
    })
  );

  counts.sort((a, b) => a.count - b.count);
  return counts[0].userId;
};

/**
 * Rules-based lead assignment
 */
const rulesBasedAssign = async (organizationId, lead) => {
  const rules = await prisma.automationRule.findMany({
    where: {
      organizationId,
      trigger: 'LEAD_CREATED',
      isActive: true,
    },
  });

  for (const rule of rules) {
    const actions = rule.actions;
    if (!Array.isArray(actions)) continue;

    const assignAction = actions.find((a) => a.type === 'assign_lead');
    if (!assignAction) continue;

    const conditions = rule.conditions;
    if (!Array.isArray(conditions)) continue;

    const match = conditions.every((cond) => {
      const value = lead[cond.field];
      switch (cond.operator) {
        case 'equals': return value === cond.value;
        case 'contains': return String(value || '').toLowerCase().includes(String(cond.value).toLowerCase());
        default: return false;
      }
    });

    if (match && assignAction.config?.userId) {
      logger.info(`Rules-based assignment: lead matched rule "${rule.name}"`);
      return assignAction.config.userId;
    }
  }

  return null;
};

/**
 * Auto-assign lead: try rules first, then round-robin
 */
const autoAssign = async (organizationId, lead) => {
  // Try rules-based assignment first
  const rulesAssignee = await rulesBasedAssign(organizationId, lead);
  if (rulesAssignee) return rulesAssignee;

  // Fall back to round-robin
  return roundRobinAssign(organizationId);
};

module.exports = { roundRobinAssign, rulesBasedAssign, autoAssign };
