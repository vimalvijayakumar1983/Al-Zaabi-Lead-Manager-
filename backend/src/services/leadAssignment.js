/**
 * Enhanced Lead Assignment Service
 *
 * Extends the existing leadAssignment service with workload-aware allocation,
 * reassignment workflows, bulk operations, and organization-level rule support.
 *
 * Existing functions preserved:
 *   - roundRobinAssign(organizationId)
 *   - rulesBasedAssign(organizationId, lead)
 *   - autoAssign(organizationId, lead)
 *
 * New functions:
 *   - getWorkloadStats(orgIds)
 *   - reassignLead(leadId, newAssigneeId, actorId, reason)
 *   - bulkAutoAssign(orgId, maxCount)
 *   - getNextAssignee(orgId, lead)
 *
 * @module services/leadAssignment
 */

const { prisma } = require('../config/database');
const { notifyUser } = require('../websocket/server');
const { createNotification, NOTIFICATION_TYPES } = require('../services/notificationService');

// ---------------------------------------------------------------------------
// Existing functions (preserved as-is)
// ---------------------------------------------------------------------------

/**
 * Round-robin assignment — finds the active user with the fewest active leads.
 * @param {string[]} orgIds - Organization IDs to search across
 * @param {string[]} [eligibleUserIds] - If provided, only these users are considered
 * @returns {Promise<string|null>} User ID of the assignee, or null
 */
async function roundRobinAssign(orgIds, eligibleUserIds) {
  const ids = Array.isArray(orgIds) ? orgIds : [orgIds];
  const where = {
    isActive: true,
    role: { in: ['SALES_REP', 'MANAGER', 'ADMIN'] },
  };
  if (eligibleUserIds && eligibleUserIds.length > 0) {
    // When specific users are selected, use them regardless of org
    where.id = { in: eligibleUserIds };
  } else {
    // Default: search within the specified org(s)
    where.organizationId = { in: ids };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      _count: {
        select: {
          assignedLeads: {
            where: {
              isArchived: false,
              status: { notIn: ['WON', 'LOST'] },
            },
          },
        },
      },
    },
    orderBy: {
      assignedLeads: { _count: 'asc' },
    },
  });

  if (users.length === 0) return null;

  // Find the user with the fewest active leads
  let minUser = users[0];
  let minCount = minUser._count.assignedLeads;
  for (const u of users) {
    if (u._count.assignedLeads < minCount) {
      minCount = u._count.assignedLeads;
      minUser = u;
    }
  }

  return minUser.id;
}

/**
 * Rules-based assignment — matches lead attributes against automation rules.
 * @param {string} organizationId
 * @param {object} lead - Lead data (source, score, location, etc.)
 * @returns {Promise<string|null>} User ID of the assignee, or null
 */
async function rulesBasedAssign(organizationId, lead) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const rules = (org?.settings)?.allocationRules;
  if (!rules?.sourceRules?.length) return null;

  // Check source-specific rules
  if (lead.source) {
    const sourceRule = rules.sourceRules.find((r) => r.source === lead.source);
    if (sourceRule?.assignToId) {
      // Verify the target user is still active
      const user = await prisma.user.findFirst({
        where: {
          id: sourceRule.assignToId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (user) return user.id;
    }
  }

  return null;
}

/**
 * Auto-assign — tries rules-based first, falls back to round-robin.
 * @param {string} organizationId
 * @param {object} lead - Lead data
 * @returns {Promise<string|null>} User ID of the assignee, or null
 */
async function autoAssign(organizationId, lead) {
  // Try rules-based first
  const rulesAssignee = await rulesBasedAssign(organizationId, lead);
  if (rulesAssignee) return rulesAssignee;

  // Fall back to round-robin
  return roundRobinAssign(organizationId);
}

// ---------------------------------------------------------------------------
// New functions
// ---------------------------------------------------------------------------

/**
 * Get workload statistics for all eligible users across the given org IDs.
 *
 * Returns per-user active/total/won/lost lead counts and derived metrics.
 *
 * @param {string[]} orgIds - Array of organization IDs to include
 * @param {object}   [options]
 * @param {number}   [options.capacity=25] - Max lead capacity per user
 * @returns {Promise<{users: object[], summary: object}>}
 */
async function getWorkloadStats(orgIds, options = {}) {
  const capacity = options.capacity ?? 25;

  const users = await prisma.user.findMany({
    where: {
      organizationId: { in: orgIds },
      isActive: true,
      role: { in: ['SALES_REP', 'MANAGER', 'ADMIN'] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      role: true,
    },
  });

  if (users.length === 0) {
    return {
      users: [],
      summary: { totalUnassigned: 0, avgLeadsPerUser: 0, maxCapacity: capacity },
    };
  }

  const userIds = users.map((u) => u.id);

  // Aggregate lead counts grouped by assignee, status, and archived flag
  const leadCounts = await prisma.lead.groupBy({
    by: ['assignedToId', 'status', 'isArchived'],
    where: {
      organizationId: { in: orgIds },
      assignedToId: { in: userIds },
    },
    _count: { id: true },
  });

  const countMap = {};
  for (const uid of userIds) {
    countMap[uid] = { active: 0, total: 0, won: 0, lost: 0 };
  }

  for (const row of leadCounts) {
    const uid = row.assignedToId;
    if (!uid || !countMap[uid]) continue;

    const count = row._count.id;
    countMap[uid].total += count;

    if (row.status === 'WON') {
      countMap[uid].won += count;
    } else if (row.status === 'LOST') {
      countMap[uid].lost += count;
    } else if (!row.isArchived) {
      countMap[uid].active += count;
    }
  }

  const totalUnassigned = await prisma.lead.count({
    where: {
      organizationId: { in: orgIds },
      assignedToId: null,
      isArchived: false,
    },
  });

  const userStats = users.map((u) => {
    const c = countMap[u.id];
    const closedLeads = c.won + c.lost;
    const conversionRate = closedLeads > 0
      ? Math.round((c.won / closedLeads) * 1000) / 10
      : 0;
    const utilizationPct = capacity > 0
      ? Math.round((c.active / capacity) * 1000) / 10
      : 0;

    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar,
      role: u.role,
      activeLeads: c.active,
      totalLeads: c.total,
      wonLeads: c.won,
      lostLeads: c.lost,
      avgResponseTime: null,
      conversionRate,
      capacity,
      utilizationPct,
    };
  });

  const totalActive = userStats.reduce((sum, u) => sum + u.activeLeads, 0);
  const avgLeadsPerUser = users.length > 0
    ? Math.round((totalActive / users.length) * 10) / 10
    : 0;

  return {
    users: userStats,
    summary: {
      totalUnassigned,
      avgLeadsPerUser,
      maxCapacity: capacity,
    },
  };
}

/**
 * Reassign a lead to a new user with full activity logging and notifications.
 *
 * @param {string}  leadId        - ID of the lead to reassign
 * @param {string}  newAssigneeId - ID of the new assignee
 * @param {string}  actorId       - ID of the user performing the reassignment
 * @param {string}  [reason]      - Optional reason for the reassignment
 * @returns {Promise<object>} Updated lead with assignee and stage included
 * @throws {Error} If lead or new assignee is not found
 */
async function reassignLead(leadId, newAssigneeId, actorId, reason) {
  // Verify the lead exists
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!lead) {
    throw new Error('Lead not found');
  }

  // Verify the new assignee exists and is active in the same org
  const newAssignee = await prisma.user.findFirst({
    where: {
      id: newAssigneeId,
      organizationId: lead.organizationId,
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!newAssignee) {
    throw new Error('New assignee not found or inactive');
  }

  const previousAssignee = lead.assignedTo;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.lead.update({
      where: { id: leadId },
      data: { assignedToId: newAssigneeId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        stage: { select: { id: true, name: true, color: true } },
      },
    });

    const prevName = previousAssignee
      ? `${previousAssignee.firstName} ${previousAssignee.lastName}`
      : 'Unassigned';
    const newName = `${newAssignee.firstName} ${newAssignee.lastName}`;
    const description = reason
      ? `Reassigned from ${prevName} to ${newName}. Reason: ${reason}`
      : `Reassigned from ${prevName} to ${newName}`;

    await tx.leadActivity.create({
      data: {
        leadId,
        userId: actorId,
        type: 'ASSIGNMENT_CHANGED',
        description,
        metadata: {
          previousAssigneeId: previousAssignee?.id || null,
          newAssigneeId,
          reason: reason || null,
        },
      },
    });

    return result;
  });

  // Notify new assignee (fire-and-forget)
  if (newAssigneeId !== actorId) {
    notifyUser(newAssigneeId, {
      type: 'lead_assigned',
      lead: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName },
    });
    createNotification({
      type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
      title: 'Lead Reassigned to You',
      message: `${lead.firstName} ${lead.lastName} has been reassigned to you${reason ? '. Reason: ' + reason : ''}`,
      userId: newAssigneeId,
      actorId,
      entityType: 'lead',
      entityId: leadId,
      organizationId: lead.organizationId,
    }).catch(() => {});
  }

  // Notify previous assignee (fire-and-forget)
  if (previousAssignee && previousAssignee.id !== actorId && previousAssignee.id !== newAssigneeId) {
    createNotification({
      type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
      title: 'Lead Reassigned',
      message: `${lead.firstName} ${lead.lastName} has been reassigned to another team member${reason ? '. Reason: ' + reason : ''}`,
      userId: previousAssignee.id,
      actorId,
      entityType: 'lead',
      entityId: leadId,
      organizationId: lead.organizationId,
    }).catch(() => {});
  }

  return updated;
}

/**
 * Bulk auto-assign unassigned leads in an organization.
 *
 * Assigns up to `maxCount` unassigned, non-archived leads that are not
 * in WON/LOST status using the organization's configured allocation strategy.
 *
 * @param {string} orgId    - Organization ID
 * @param {number} maxCount - Maximum number of leads to assign (default: 50)
 * @returns {Promise<{allocated: number, details: object[]}>}
 */
async function bulkAutoAssign(orgId, maxCount = 50) {
  const leads = await prisma.lead.findMany({
    where: {
      organizationId: orgId,
      assignedToId: null,
      isArchived: false,
      status: { notIn: ['WON', 'LOST'] },
    },
    orderBy: { createdAt: 'asc' },
    take: maxCount,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      source: true,
      score: true,
      budget: true,
      productInterest: true,
      location: true,
      campaign: true,
    },
  });

  const details = [];

  for (const lead of leads) {
    try {
      const assigneeId = await getNextAssignee(orgId, lead);
      if (!assigneeId) continue;

      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.lead.update({
          where: { id: lead.id },
          data: { assignedToId: assigneeId },
          include: {
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
          },
        });

        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            userId: assigneeId,
            type: 'ASSIGNMENT_CHANGED',
            description: `Auto-assigned to ${result.assignedTo.firstName} ${result.assignedTo.lastName}`,
            metadata: {
              previousAssigneeId: null,
              newAssigneeId: assigneeId,
              reason: 'bulk_auto_assign',
            },
          },
        });

        return result;
      });

      details.push({
        leadId: updated.id,
        assignedToId: updated.assignedTo.id,
        assignedToName: `${updated.assignedTo.firstName} ${updated.assignedTo.lastName}`,
      });
    } catch (err) {
      console.error(`bulkAutoAssign: failed for lead ${lead.id}:`, err.message);
    }
  }

  return { allocated: details.length, details };
}

/**
 * Determine the next assignee for a lead using the organization's allocation rules.
 *
 * Resolution order:
 *   1. Source-specific rules (from org settings)
 *   2. Workload-based (assigns to user with fewest active leads under capacity)
 *   3. Round-robin fallback
 *
 * @param {string} orgId - Organization ID
 * @param {object} lead  - Lead data (source, score, etc.)
 * @returns {Promise<string|null>} User ID of the next assignee, or null
 */
async function getNextAssignee(orgId, lead) {
  // Load org to check type and settings
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { settings: true, type: true, parentId: true },
  });

  // For DIVISION orgs, use own rules; fall back to parent GROUP rules if none configured
  let rules = (org?.settings)?.allocationRules;
  if (!rules && org?.parentId) {
    const parent = await prisma.organization.findUnique({
      where: { id: org.parentId },
      select: { settings: true },
    });
    rules = (parent?.settings)?.allocationRules;
  }

  const method = rules?.method || 'round_robin';
  const maxLeadsPerUser = rules?.maxLeadsPerUser || 25;
  const eligibleUserIds = rules?.eligibleUserIds || [];

  // If method is manual, skip auto-assignment
  if (method === 'manual') return null;

  // Determine which org(s) to search for users
  // For a DIVISION: search only that division
  // For a GROUP: include child divisions so actual sales reps are found
  const searchOrgIds = [orgId];
  if (org?.type === 'GROUP') {
    const children = await prisma.organization.findMany({
      where: { parentId: orgId },
      select: { id: true },
    });
    searchOrgIds.push(...children.map(c => c.id));
  }

  // 1. Check source-specific rules first
  if (rules?.sourceRules?.length > 0 && lead.source) {
    const sourceRule = rules.sourceRules.find((r) => r.source === lead.source);
    if (sourceRule?.assignToId) {
      // Verify user is active and under capacity
      const user = await prisma.user.findFirst({
        where: {
          id: sourceRule.assignToId,
          isActive: true,
        },
        select: {
          id: true,
          _count: {
            select: {
              assignedLeads: {
                where: { isArchived: false, status: { notIn: ['WON', 'LOST'] } },
              },
            },
          },
        },
      });

      if (user && user._count.assignedLeads < maxLeadsPerUser) {
        return user.id;
      }
      // If over capacity, fall through to general assignment
    }
  }

  // 2. Workload-based or round-robin (filtered by eligible users)
  if (method === 'workload_based') {
    return workloadBasedAssign(searchOrgIds, maxLeadsPerUser, eligibleUserIds);
  }

  // 3. Default: round-robin
  return roundRobinAssign(searchOrgIds, eligibleUserIds);
}

/**
 * Workload-based assignment — assigns to the user with the fewest active
 * leads who is still under the configured capacity.
 *
 * @param {string} orgId           - Organization ID
 * @param {number} maxLeadsPerUser - Maximum active leads per user
 * @returns {Promise<string|null>} User ID of the assignee, or null
 * @private
 */
async function workloadBasedAssign(orgIds, maxLeadsPerUser, eligibleUserIds) {
  const ids = Array.isArray(orgIds) ? orgIds : [orgIds];
  const where = {
    isActive: true,
    role: { in: ['SALES_REP', 'MANAGER', 'ADMIN'] },
  };
  if (eligibleUserIds && eligibleUserIds.length > 0) {
    // When specific users are selected, use them regardless of org
    where.id = { in: eligibleUserIds };
  } else {
    // Default: search within the specified org(s)
    where.organizationId = { in: ids };
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      _count: {
        select: {
          assignedLeads: {
            where: { isArchived: false, status: { notIn: ['WON', 'LOST'] } },
          },
        },
      },
    },
  });

  if (users.length === 0) return null;

  // Filter to those under capacity, then pick the one with fewest active leads
  const eligible = users
    .filter((u) => u._count.assignedLeads < maxLeadsPerUser)
    .sort((a, b) => a._count.assignedLeads - b._count.assignedLeads);

  return eligible.length > 0 ? eligible[0].id : null;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Existing
  roundRobinAssign,
  rulesBasedAssign,
  autoAssign,
  // New
  getWorkloadStats,
  reassignLead,
  bulkAutoAssign,
  getNextAssignee,
};
