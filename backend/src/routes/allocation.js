/**
 * Lead Allocation Routes
 *
 * Provides endpoints for managing lead allocation, workload statistics,
 * auto-allocation, and allocation rule configuration.
 *
 * Supports both global (group-level) and per-division allocation rules.
 * Divisions can inherit global rules or define their own overrides.
 *
 * Mounted at: /api/leads/allocation
 *
 * @module routes/allocation
 */

const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope, authorize } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { createAuditLog } = require('../middleware/auditLog');
const { notifyUser } = require('../websocket/server');
const { createNotification, notifyOrgAdmins, NOTIFICATION_TYPES } = require('../services/notificationService');
const { autoAssign, getWorkloadStats, bulkAutoAssign } = require('../services/leadAssignment');

// ─── Display name helper (deduplication) ─────────────────────────
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown';
  if (!ln) return fn;
  if (!fn) return ln;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

const router = Router();

// All routes require authentication and org scope
router.use(authenticate, orgScope);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Schema for GET /stats query params */
const statsQuerySchema = z.object({
  capacity: z.coerce.number().int().min(1).max(1000).optional().default(25),
  divisionId: z.string().optional(),
});

/** Schema for POST /auto-allocate body */
const autoAllocateBodySchema = z.object({
  maxCount: z.number().int().min(1).max(50).optional().default(50),
  divisionId: z.string().optional(),
});

/** Source rule entry */
const sourceRuleSchema = z.object({
  source: z.string().min(1).max(100),
  assignToId: z.string().uuid(),
});

/** Schema for PUT /rules body - full update */
const allocationRulesSchema = z.object({
  method: z.enum(['round_robin', 'workload_based', 'manual']),
  autoAssignOnCreate: z.boolean(),
  maxLeadsPerUser: z.number().int().min(1).max(1000),
  sourceRules: z.array(sourceRuleSchema).max(50).optional().default([]),
  eligibleUserIds: z.array(z.string().uuid()).optional().default([]),
  divisionId: z.string().optional(),
});

/** Schema for PUT /rules body - reset to global */
const resetRulesSchema = z.object({
  divisionId: z.string(),
  resetToGlobal: z.literal(true),
});

/** Schema for GET /rules query params */
const rulesQuerySchema = z.object({
  divisionId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Validate that the requesting user has access to the given division.
 * @param {object} req - Express request (must have req.orgIds)
 * @param {string} divisionId - Division org ID to validate
 * @returns {Promise<object>} The division organization record
 */
async function validateDivisionAccess(req, divisionId) {
  if (!req.orgIds || !req.orgIds.includes(divisionId)) {
    const err = new Error('You do not have access to this division');
    err.status = 403;
    throw err;
  }

  const divisionOrg = await prisma.organization.findUnique({
    where: { id: divisionId },
    select: { id: true, name: true, settings: true, parentId: true, type: true },
  });

  if (!divisionOrg) {
    const err = new Error('Division not found');
    err.status = 404;
    throw err;
  }

  return divisionOrg;
}

/**
 * Resolve allocation rules for a division, falling back to global rules.
 * @param {object} divisionOrg - Division organization with settings
 * @param {string} primaryOrgId - Group/parent organization ID
 * @returns {Promise<object>} Rules with inherited flag and scope
 */
async function resolveRulesForDivision(divisionOrg, primaryOrgId) {
  const defaults = {
    method: 'round_robin',
    autoAssignOnCreate: true,
    maxLeadsPerUser: 25,
    sourceRules: [],
    eligibleUserIds: [],
  };

  const divisionSettings = divisionOrg.settings || {};
  const divisionRules = divisionSettings.allocationRules;

  // Division has its own rules
  if (divisionRules) {
    return {
      ...defaults,
      ...divisionRules,
      inherited: false,
      divisionId: divisionOrg.id,
      scope: 'division',
    };
  }

  // Fallback to group-level rules
  const parentId = divisionOrg.parentId || primaryOrgId;
  const groupOrg = await prisma.organization.findUnique({
    where: { id: parentId },
    select: { settings: true },
  });

  const groupSettings = groupOrg?.settings || {};
  const groupRules = groupSettings.allocationRules;

  return {
    ...defaults,
    ...(groupRules || {}),
    inherited: true,
    divisionId: divisionOrg.id,
    scope: 'division',
  };
}

// ---------------------------------------------------------------------------
// GET /stats — Workload statistics per team member
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/leads/allocation/stats
 * @desc    Returns workload statistics per active team member.
 *          Optionally scoped to a specific division via ?divisionId=xxx
 * @access  Authenticated (any role)
 * @query   {number} [capacity=25] — Maximum lead capacity per user
 * @query   {string} [divisionId] — Filter to a specific division
 */
router.get('/stats', validateQuery(statsQuerySchema), async (req, res, next) => {
  try {
    const { capacity, divisionId } = req.validatedQuery;

    // Determine which org IDs to use for filtering
    let filterOrgIds = req.orgIds;
    if (divisionId) {
      await validateDivisionAccess(req, divisionId);
      filterOrgIds = [divisionId];
    }

    // Fetch active users in scope with eligible roles
    const users = await prisma.user.findMany({
      where: {
        organizationId: { in: filterOrgIds },
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
      return res.json({
        users: [],
        summary: { totalUnassigned: 0, avgLeadsPerUser: 0, maxCapacity: capacity },
      });
    }

    const userIds = users.map((u) => u.id);

    // Fetch lead counts grouped by assignee and status category in a single query
    const leadCounts = await prisma.lead.groupBy({
      by: ['assignedToId', 'status', 'isArchived'],
      where: {
        organizationId: { in: filterOrgIds },
        assignedToId: { in: userIds },
      },
      _count: { id: true },
    });

    // Build a lookup: userId -> { active, total, won, lost }
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

    // Count total unassigned leads in scope
    const totalUnassigned = await prisma.lead.count({
      where: {
        organizationId: { in: filterOrgIds },
        assignedToId: null,
        isArchived: false,
      },
    });

    // Assemble per-user stats
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

    // Summary
    const totalActive = userStats.reduce((sum, u) => sum + u.activeLeads, 0);
    const avgLeadsPerUser = users.length > 0
      ? Math.round((totalActive / users.length) * 10) / 10
      : 0;

    res.json({
      users: userStats,
      summary: {
        totalUnassigned,
        avgLeadsPerUser,
        maxCapacity: capacity,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /auto-allocate — Bulk auto-assign unassigned leads
// ---------------------------------------------------------------------------

/**
 * @route   POST /api/leads/allocation/auto-allocate
 * @desc    Auto-assigns unassigned leads (up to maxCount).
 *          Optionally scoped to a specific division via body.divisionId
 * @access  ADMIN, MANAGER
 */
router.post(
  '/auto-allocate',
  authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  validate(autoAllocateBodySchema),
  async (req, res, next) => {
    try {
      const { maxCount, divisionId } = req.validated;

      // Determine scope
      let orgIds = req.orgIds;
      if (divisionId) {
        await validateDivisionAccess(req, divisionId);
        orgIds = [divisionId];
      }
      const orgId = divisionId || req.orgId || (orgIds && orgIds.length > 0 ? orgIds[0] : null);

      // Fetch unassigned, non-archived leads
      const unassignedLeads = await prisma.lead.findMany({
        where: {
          organizationId: { in: orgIds },
          assignedToId: null,
          isArchived: false,
          status: { notIn: ['WON', 'LOST'] },
        },
        orderBy: { createdAt: 'asc' },
        take: maxCount,
        select: {
          id: true,
          organizationId: true,
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

      if (unassignedLeads.length === 0) {
        return res.json({ allocated: 0, details: [] });
      }

      const details = [];

      for (const lead of unassignedLeads) {
        try {
          // Try assigning within the lead's own org first
          let assigneeId = await autoAssign(lead.organizationId, lead);

          // If no eligible users in lead's org, try other orgs in scope
          if (!assigneeId && orgIds.length > 1) {
            for (const altOrgId of orgIds) {
              if (altOrgId === lead.organizationId) continue;
              assigneeId = await autoAssign(altOrgId, lead);
              if (assigneeId) break;
            }
          }
          if (!assigneeId) continue;

          const updated = await prisma.$transaction(async (tx) => {
            const result = await tx.lead.update({
              where: { id: lead.id },
              data: { assignedToId: assigneeId },
              include: {
                assignedTo: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            });

            await tx.leadActivity.create({
              data: {
                leadId: lead.id,
                userId: req.user.id,
                type: 'ASSIGNMENT_CHANGED',
                description: `Auto-allocated to ${getDisplayName(result.assignedTo)}`,
                metadata: {
                  previousAssigneeId: null,
                  newAssigneeId: assigneeId,
                  reason: 'bulk_auto_allocate',
                },
              },
            });

            return result;
          });

          details.push({
            leadId: updated.id,
            assignedToId: updated.assignedTo.id,
            assignedToName: getDisplayName(updated.assignedTo),
          });

          // Notify assigned user (fire-and-forget)
          if (assigneeId !== req.user.id) {
            notifyUser(assigneeId, {
              type: 'lead_assigned',
              lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
            });
            createNotification({
              type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
              title: 'New Lead Assigned',
              message: `${getDisplayName(lead)} has been auto-assigned to you`,
              userId: assigneeId,
              actorId: req.user.id,
              entityType: 'lead',
              entityId: lead.id,
              organizationId: orgId,
            }).catch(() => {});
          }
        } catch (leadErr) {
          console.error(`Auto-allocate failed for lead ${lead.id}:`, leadErr.message);
        }
      }

      // Audit log for the bulk operation
      await createAuditLog({
        userId: req.user.id,
        organizationId: orgId,
        action: 'BULK_AUTO_ALLOCATE',
        entity: 'Lead',
        entityId: null,
        oldData: null,
        newData: { allocated: details.length, maxCount, divisionId: divisionId || null },
        req,
      });

      res.json({ allocated: details.length, details });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /rules — Get allocation rules (global or division-scoped)
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/leads/allocation/rules
 * @desc    Returns allocation rules. If ?divisionId=xxx is provided, returns
 *          that division's rules (or inherited global rules if none set).
 * @access  Authenticated (any role)
 * @query   {string} [divisionId] — Get rules for a specific division
 */
router.get('/rules', validateQuery(rulesQuerySchema), async (req, res, next) => {
  try {
    const { divisionId } = req.validatedQuery;

    const defaults = {
      method: 'round_robin',
      autoAssignOnCreate: true,
      maxLeadsPerUser: 25,
      sourceRules: [],
      eligibleUserIds: [],
    };

    // Division-scoped rules
    if (divisionId) {
      const divisionOrg = await validateDivisionAccess(req, divisionId);
      const result = await resolveRulesForDivision(divisionOrg, req.orgId || req.orgIds[0]);
      return res.json(result);
    }

    // Global rules (group-level)
    const primaryOrgId = req.orgId || (req.orgIds && req.orgIds.length > 0 ? req.orgIds[0] : null);
    const org = await prisma.organization.findUnique({
      where: { id: primaryOrgId },
      select: { settings: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const settings = org.settings || {};
    const rules = { ...defaults, ...(settings.allocationRules || {}) };

    res.json({
      ...rules,
      scope: 'global',
      inherited: false,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /rules — Update allocation rules (global or division-scoped)
// ---------------------------------------------------------------------------

/**
 * @route   PUT /api/leads/allocation/rules
 * @desc    Updates allocation rules. Include divisionId to save per-division.
 *          Set resetToGlobal:true + divisionId to clear division overrides.
 * @access  ADMIN
 */
router.put(
  '/rules',
  authorize('SUPER_ADMIN', 'ADMIN'),
  // Manual validation to support both full update and reset-to-global
  async (req, res, next) => {
    try {
      const body = req.body;

      // Handle reset-to-global (minimal payload)
      if (body.resetToGlobal === true && body.divisionId) {
        const resetResult = resetRulesSchema.safeParse(body);
        if (!resetResult.success) {
          return res.status(400).json({ error: 'Invalid reset request', details: resetResult.error.issues });
        }

        const { divisionId } = resetResult.data;
        const divisionOrg = await validateDivisionAccess(req, divisionId);

        // Clear division-specific allocation rules
        const currentSettings = divisionOrg.settings || {};
        const { allocationRules: _removed, ...restSettings } = currentSettings;

        await prisma.organization.update({
          where: { id: divisionId },
          data: { settings: restSettings },
        });

        // Audit log
        await createAuditLog({
          userId: req.user.id,
          organizationId: divisionId,
          action: 'UPDATE',
          entity: 'AllocationRules',
          entityId: divisionId,
          oldData: _removed || null,
          newData: { resetToGlobal: true },
          req,
        });

        // Return the inherited global rules
        const primaryOrgId = req.orgId || req.orgIds[0];
        const groupOrg = await prisma.organization.findUnique({
          where: { id: primaryOrgId },
          select: { settings: true },
        });
        const groupSettings = groupOrg?.settings || {};
        const defaults = {
          method: 'round_robin',
          autoAssignOnCreate: true,
          maxLeadsPerUser: 25,
          sourceRules: [],
          eligibleUserIds: [],
        };
        const globalRules = { ...defaults, ...(groupSettings.allocationRules || {}) };

        return res.json({
          ...globalRules,
          inherited: true,
          divisionId,
          scope: 'division',
        });
      }

      // Standard rules update
      const parseResult = allocationRulesSchema.safeParse(body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
      }

      const { divisionId, ...rules } = parseResult.data;
      const targetOrgId = divisionId || req.orgId || (req.orgIds && req.orgIds.length > 0 ? req.orgIds[0] : null);

      // If division-scoped, validate access
      if (divisionId) {
        await validateDivisionAccess(req, divisionId);
      }

      // Validate that assignToId references exist and belong to accessible orgs
      if (rules.sourceRules.length > 0) {
        const assigneeIds = [...new Set(rules.sourceRules.map((r) => r.assignToId))];
        const allOrgIds = req.orgIds || [targetOrgId];
        const validUsers = await prisma.user.findMany({
          where: {
            id: { in: assigneeIds },
            organizationId: { in: allOrgIds },
            isActive: true,
          },
          select: { id: true },
        });
        const validIds = new Set(validUsers.map((u) => u.id));
        const invalidIds = assigneeIds.filter((id) => !validIds.has(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({
            error: 'Invalid assignee IDs in source rules',
            invalidIds,
          });
        }
      }

      // Read current settings to preserve other keys
      const org = await prisma.organization.findUnique({
        where: { id: targetOrgId },
        select: { settings: true },
      });

      const currentSettings = org?.settings || {};
      const previousRules = currentSettings.allocationRules || null;

      const updatedSettings = {
        ...currentSettings,
        allocationRules: rules,
      };

      await prisma.organization.update({
        where: { id: targetOrgId },
        data: { settings: updatedSettings },
      });

      // Audit log
      await createAuditLog({
        userId: req.user.id,
        organizationId: targetOrgId,
        action: 'UPDATE',
        entity: 'AllocationRules',
        entityId: targetOrgId,
        oldData: previousRules,
        newData: { ...rules, divisionId: divisionId || null },
        req,
      });

      res.json({
        ...rules,
        scope: divisionId ? 'division' : 'global',
        inherited: false,
        ...(divisionId ? { divisionId } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
