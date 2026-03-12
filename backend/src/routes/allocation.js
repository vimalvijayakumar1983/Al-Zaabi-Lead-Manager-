/**
 * Lead Allocation Routes
 *
 * Provides endpoints for managing lead allocation, workload statistics,
 * auto-allocation, and allocation rule configuration.
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

const router = Router();

// All routes require authentication and org scope
router.use(authenticate, orgScope);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Schema for GET /stats query params */
const statsQuerySchema = z.object({
  capacity: z.coerce.number().int().min(1).max(1000).optional().default(25),
});

/** Schema for POST /auto-allocate body */
const autoAllocateBodySchema = z.object({
  maxCount: z.number().int().min(1).max(50).optional().default(50),
});

/** Source rule entry */
const sourceRuleSchema = z.object({
  source: z.string().min(1).max(100),
  assignToId: z.string().uuid(),
});

/** Schema for PUT /rules body */
const allocationRulesSchema = z.object({
  method: z.enum(['round_robin', 'workload_based', 'manual']),
  autoAssignOnCreate: z.boolean(),
  maxLeadsPerUser: z.number().int().min(1).max(1000),
  sourceRules: z.array(sourceRuleSchema).max(50).optional().default([]),
});

// ---------------------------------------------------------------------------
// GET /stats — Workload statistics per team member
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/leads/allocation/stats
 * @desc    Returns workload statistics per active team member in the caller's
 *          organization scope, along with a summary.
 * @access  Authenticated (any role)
 * @query   {number} [capacity=25] — Maximum lead capacity per user
 */
router.get('/stats', validateQuery(statsQuerySchema), async (req, res, next) => {
  try {
    const { capacity } = req.validatedQuery;

    // Fetch active users in the org with eligible roles
    const users = await prisma.user.findMany({
      where: {
        organizationId: { in: req.orgIds },
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
        organizationId: { in: req.orgIds },
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

    // Count total unassigned leads in the org
    const totalUnassigned = await prisma.lead.count({
      where: {
        organizationId: { in: req.orgIds },
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
        avgResponseTime: null, // Placeholder — requires activity timestamp analysis
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
 * @desc    Auto-assigns all unassigned leads (up to maxCount) using the
 *          configured allocation strategy.
 * @access  ADMIN, MANAGER
 * @body    {number} [maxCount=50] — Maximum leads to auto-assign (1–50)
 */
router.post(
  '/auto-allocate',
  authorize('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  validate(autoAllocateBodySchema),
  async (req, res, next) => {
    try {
      const { maxCount } = req.validated;
      const orgIds = req.orgIds;
      const orgId = req.orgId || (orgIds && orgIds.length > 0 ? orgIds[0] : null);

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
          const assigneeId = await autoAssign(lead.organizationId, lead);
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
                description: `Auto-allocated to ${result.assignedTo.firstName} ${result.assignedTo.lastName}`,
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
            assignedToName: `${updated.assignedTo.firstName} ${updated.assignedTo.lastName}`,
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
              message: `${lead.firstName} ${lead.lastName} has been auto-assigned to you`,
              userId: assigneeId,
              actorId: req.user.id,
              entityType: 'lead',
              entityId: lead.id,
              organizationId: orgId,
            }).catch(() => {});
          }
        } catch (leadErr) {
          // Skip individual lead failures, continue with the rest
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
        newData: { allocated: details.length, maxCount },
        req,
      });

      res.json({ allocated: details.length, details });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /rules — Get allocation rules for the organization
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/leads/allocation/rules
 * @desc    Returns the allocation rules configured for the caller's organization.
 * @access  Authenticated (any role)
 */
router.get('/rules', async (req, res, next) => {
  try {
    const org = await prisma.organization.findFirst({
      where: { id: { in: req.orgIds } },
      select: { settings: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const settings = (org.settings || {});
    const defaults = {
      method: 'round_robin',
      autoAssignOnCreate: true,
      maxLeadsPerUser: 25,
      sourceRules: [],
    };

    const rules = { ...defaults, ...(settings.allocationRules || {}) };

    res.json(rules);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /rules — Update allocation rules
// ---------------------------------------------------------------------------

/**
 * @route   PUT /api/leads/allocation/rules
 * @desc    Updates the allocation rules for the caller's organization.
 *          Stores in Organization.settings JSON under allocationRules key.
 * @access  ADMIN
 * @body    {object} Allocation rules conforming to allocationRulesSchema
 */
router.put(
  '/rules',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(allocationRulesSchema),
  async (req, res, next) => {
    try {
      const rules = req.validated;
      const orgIds = req.orgIds;
      const orgId = req.orgId || (orgIds && orgIds.length > 0 ? orgIds[0] : null);

      // Validate that assignToId references exist and belong to the org
      if (rules.sourceRules.length > 0) {
        const assigneeIds = [...new Set(rules.sourceRules.map((r) => r.assignToId))];
        const validUsers = await prisma.user.findMany({
          where: {
            id: { in: assigneeIds },
            organizationId: orgId,
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
        where: { id: orgId },
        select: { settings: true },
      });

      const currentSettings = (org?.settings || {});
      const previousRules = currentSettings.allocationRules || null;

      const updatedSettings = {
        ...currentSettings,
        allocationRules: rules,
      };

      await prisma.organization.update({
        where: { id: orgId },
        data: { settings: updatedSettings },
      });

      // Audit log
      await createAuditLog({
        userId: req.user.id,
        organizationId: orgId,
        action: 'UPDATE',
        entity: 'AllocationRules',
        entityId: orgId,
        oldData: previousRules,
        newData: rules,
        req,
      });

      res.json(rules);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
