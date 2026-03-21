const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope, authorize } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginationSchema, paginatedResponse } = require('../utils/pagination');
const { broadcastDataChange } = require('../websocket/server');
const {
  getRecycleBinAccessSettings,
  updateRecycleBinAccessSettings,
  resolveRecycleBinRule,
  resolveDivisionScopedOrgIds,
  canRestoreRecycleItem,
  canPurgeRecycleItem,
  restoreRecycleBinItem,
  permanentlyDeleteRecycleBinItem,
} = require('../services/recycleBinService');

const router = Router();
router.use(authenticate, orgScope);

const scopeSchema = z.enum(['none', 'own', 'team', 'division', 'all']);
const roleAccessSchema = z.object({
  view: scopeSchema.optional(),
  restore: scopeSchema.optional(),
  purge: z.boolean().optional(),
});

const listRecycleQuerySchema = paginationSchema.extend({
  type: z.enum(['LEAD', 'CONTACT', 'TASK', 'CAMPAIGN']).optional(),
  search: z.string().optional(),
  divisionId: z.string().uuid().optional(),
  expiringInDays: z.coerce.number().int().min(1).max(60).optional(),
  sortBy: z.enum(['deletedAt', 'purgeAt', 'entityLabel']).optional().default('deletedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const updateAccessSchema = z.object({
  roleScopes: z
    .record(roleAccessSchema)
    .optional(),
  userOverrides: z
    .record(z.union([roleAccessSchema, z.null()]))
    .optional(),
});

router.get('/access-settings', authorize('ADMIN', 'SUPER_ADMIN'), async (req, res, next) => {
  try {
    const settings = await getRecycleBinAccessSettings(req.orgId);
    res.json({
      settings,
      availableScopes: ['none', 'own', 'team', 'division', 'all'],
    });
  } catch (err) {
    next(err);
  }
});

router.put('/access-settings', authorize('ADMIN', 'SUPER_ADMIN'), validate(updateAccessSchema), async (req, res, next) => {
  try {
    const updated = await updateRecycleBinAccessSettings(req.orgId, req.validated);
    res.json({ settings: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/', validateQuery(listRecycleQuerySchema), async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      search,
      divisionId,
      expiringInDays,
      sortBy = 'deletedAt',
      sortOrder = 'desc',
    } = req.validatedQuery;

    const accessSettings = await getRecycleBinAccessSettings(req.orgId);
    const accessRule = resolveRecycleBinRule(accessSettings, {
      id: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId,
      orgIds: req.orgIds,
    });

    const scopedOrgIds = resolveDivisionScopedOrgIds(req, accessRule.view, divisionId);
    if (scopedOrgIds.length === 0) {
      return res.json(paginatedResponse([], 0, page, limit));
    }

    const where = {
      organizationId: { in: scopedOrgIds },
    };
    if (type) where.entityType = type;
    if (search?.trim()) {
      where.entityLabel = { contains: search.trim(), mode: 'insensitive' };
    }
    if (expiringInDays) {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() + expiringInDays);
      where.purgeAt = { lte: threshold };
    }
    if (accessRule.view === 'own') {
      where.OR = [
        { recordOwnerId: req.user.id },
        { recordAssigneeId: req.user.id },
        { recordCreatorId: req.user.id },
        { deletedById: req.user.id },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.recycleBinItem.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.recycleBinItem.count({ where }),
    ]);

    const now = Date.now();
    const data = rows.map((row) => {
      const daysUntilPurge = Math.max(
        0,
        Math.ceil((new Date(row.purgeAt).getTime() - now) / (24 * 60 * 60 * 1000))
      );
      return {
        ...row,
        daysUntilPurge,
        capabilities: {
          canRestore: canRestoreRecycleItem(accessRule, row, {
            id: req.user.id,
            role: req.user.role,
            organizationId: req.user.organizationId,
            orgIds: req.orgIds,
          }),
          canPurge: canPurgeRecycleItem(accessRule, req.user),
        },
      };
    });

    res.json(
      paginatedResponse(data, total, page, limit)
    );
  } catch (err) {
    next(err);
  }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    const item = await prisma.recycleBinItem.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!item) return res.status(404).json({ error: 'Recycle bin item not found' });

    const accessSettings = await getRecycleBinAccessSettings(req.orgId);
    const accessRule = resolveRecycleBinRule(accessSettings, {
      id: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId,
      orgIds: req.orgIds,
    });

    const canRestore = canRestoreRecycleItem(accessRule, item, {
      id: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId,
      orgIds: req.orgIds,
    });
    if (!canRestore) {
      return res.status(403).json({ error: 'You do not have permission to restore this record' });
    }

    const result = await restoreRecycleBinItem(item, req.user.id);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Unable to restore record' });
    }

    res.json({ success: true, result });
    broadcastDataChange(item.organizationId, 'recycle_bin', 'restored', req.user.id, {
      entityId: item.entityId,
      entityType: item.entityType,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/permanent', async (req, res, next) => {
  try {
    const item = await prisma.recycleBinItem.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!item) return res.status(404).json({ error: 'Recycle bin item not found' });

    const accessSettings = await getRecycleBinAccessSettings(req.orgId);
    const accessRule = resolveRecycleBinRule(accessSettings, {
      id: req.user.id,
      role: req.user.role,
      organizationId: req.user.organizationId,
      orgIds: req.orgIds,
    });
    const canPurge = canPurgeRecycleItem(accessRule, req.user);
    if (!canPurge) {
      return res.status(403).json({ error: 'Only administrators can permanently delete records' });
    }

    const result = await permanentlyDeleteRecycleBinItem(item);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Unable to permanently delete record' });
    }

    res.json({ success: true, result });
    broadcastDataChange(item.organizationId, 'recycle_bin', 'purged', req.user.id, {
      entityId: item.entityId,
      entityType: item.entityType,
    }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
