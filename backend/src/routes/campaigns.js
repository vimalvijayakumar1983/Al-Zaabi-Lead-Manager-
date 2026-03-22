const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { broadcastDataChange } = require('../websocket/server');
const { upsertRecycleBinItem } = require('../services/recycleBinService');

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

// ─── Validation Schemas ────────────────────────────────────────────────────────

const campaignTypeEnum = z.enum([
  'FACEBOOK_ADS',
  'GOOGLE_ADS',
  'EMAIL',
  'WHATSAPP',
  'LANDING_PAGE',
  'REFERRAL',
  'TIKTOK_ADS',
  'WEBSITE_FORM',
  'OTHER',
]);

const campaignStatusEnum = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']);

const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(200),
  type: campaignTypeEnum,
  status: campaignStatusEnum.optional().default('DRAFT'),
  budget: z.number().min(0, 'Budget must be non-negative').optional(),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  organizationId: z.string().uuid().optional(),
  metadata: z
    .object({
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_content: z.string().optional(),
      utm_term: z.string().optional(),
      targetLeads: z.number().int().min(0).optional(),
      targetConversions: z.number().int().min(0).optional(),
      targetRevenue: z.number().min(0).optional(),
    })
    .passthrough()
    .optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: campaignTypeEnum.optional(),
  status: campaignStatusEnum.optional(),
  budget: z.number().min(0).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  organizationId: z.string().uuid().optional(),
  metadata: z
    .object({
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      utm_content: z.string().optional(),
      utm_term: z.string().optional(),
      targetLeads: z.number().int().min(0).optional(),
      targetConversions: z.number().int().min(0).optional(),
      targetRevenue: z.number().min(0).optional(),
    })
    .passthrough()
    .optional(),
});

const listCampaignsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  divisionId: z.string().uuid().optional(),
  startDateFrom: z.string().datetime().optional(),
  startDateTo: z.string().datetime().optional(),
  budgetMin: z
    .string()
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(0))
    .optional(),
  budgetMax: z
    .string()
    .transform((v) => parseFloat(v))
    .pipe(z.number().min(0))
    .optional(),
  sortBy: z
    .enum(['name', 'budget', 'startDate', 'endDate', 'createdAt'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  includeOrganization: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
  data: z.object({
    status: campaignStatusEnum.optional(),
  }),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'At least one ID is required'),
});

// ─── Apply Auth Middleware ──────────────────────────────────────────────────────

router.use(authenticate, orgScope);

// ─── GET /stats — Dashboard Statistics ──────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const orgFilter = { organizationId: { in: req.orgIds } };

    const [campaigns, leads] = await Promise.all([
      prisma.campaign.findMany({
        where: orgFilter,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          budget: true,
        },
      }),
      prisma.lead.findMany({
        where: { organizationId: { in: req.orgIds }, campaign: { not: null } },
        select: {
          campaign: true,
          status: true,
          budget: true,
        },
      }),
    ]);

    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
    const totalBudget = campaigns.reduce(
      (sum, c) => sum + (c.budget ? parseFloat(c.budget) : 0),
      0
    );

    const leadsByCampaign = {};
    for (const lead of leads) {
      if (!lead.campaign) continue;
      if (!leadsByCampaign[lead.campaign]) {
        leadsByCampaign[lead.campaign] = { total: 0, won: 0, totalValue: 0 };
      }
      leadsByCampaign[lead.campaign].total += 1;
      if (lead.status === 'WON') {
        leadsByCampaign[lead.campaign].won += 1;
      }
      leadsByCampaign[lead.campaign].totalValue += lead.budget
        ? parseFloat(lead.budget)
        : 0;
    }

    const totalLeads = leads.length;
    const avgCostPerLead = totalLeads > 0 ? totalBudget / totalLeads : 0;

    let bestPerforming = null;
    let maxLeadCount = 0;
    for (const campaign of campaigns) {
      const stats = leadsByCampaign[campaign.name];
      const count = stats ? stats.total : 0;
      if (count > maxLeadCount) {
        maxLeadCount = count;
        bestPerforming = {
          id: campaign.id,
          name: campaign.name,
          leadCount: count,
        };
      }
    }

    const byTypeMap = {};
    for (const campaign of campaigns) {
      if (!byTypeMap[campaign.type]) {
        byTypeMap[campaign.type] = { type: campaign.type, count: 0, leads: 0 };
      }
      byTypeMap[campaign.type].count += 1;
      const stats = leadsByCampaign[campaign.name];
      byTypeMap[campaign.type].leads += stats ? stats.total : 0;
    }
    const byType = Object.values(byTypeMap);

    const byStatusMap = {};
    for (const campaign of campaigns) {
      if (!byStatusMap[campaign.status]) {
        byStatusMap[campaign.status] = { status: campaign.status, count: 0 };
      }
      byStatusMap[campaign.status].count += 1;
    }
    const byStatus = Object.values(byStatusMap);

    res.json({
      totalCampaigns,
      activeCampaigns,
      totalBudget: Math.round(totalBudget * 100) / 100,
      totalLeads,
      avgCostPerLead: Math.round(avgCostPerLead * 100) / 100,
      bestPerforming,
      byType,
      byStatus,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET / — List Campaigns with Filtering & Analytics ──────────────────────────

router.get('/', validateQuery(listCampaignsQuerySchema), async (req, res, next) => {
  try {
    const q = req.validatedQuery || req.query;
    const {
      search,
      type,
      status,
      divisionId,
      startDateFrom,
      startDateTo,
      budgetMin,
      budgetMax,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeOrganization,
      page = 1,
      limit = 20,
    } = q;

    const where = {
      organizationId: { in: req.orgIds },
    };

    if (divisionId) {
      if (!req.orgIds.includes(divisionId)) {
        return res.status(403).json({ error: 'Access denied to specified division' });
      }
      where.organizationId = divisionId;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (type) {
      const types = type.split(',').map((t) => t.trim());
      where.type = { in: types };
    }

    if (status) {
      const statuses = status.split(',').map((s) => s.trim());
      where.status = { in: statuses };
    }

    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) where.startDate.gte = new Date(startDateFrom);
      if (startDateTo) where.startDate.lte = new Date(startDateTo);
    }

    if (budgetMin !== undefined || budgetMax !== undefined) {
      where.budget = {};
      if (budgetMin !== undefined) where.budget.gte = budgetMin;
      if (budgetMax !== undefined) where.budget.lte = budgetMax;
    }

    const orderBy = { [sortBy]: sortOrder };

    const { skip, take } = paginate(page, limit);

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy,
        skip,
        take,
        include: includeOrganization
          ? { organization: { select: { id: true, name: true } } }
          : undefined,
      }),
      prisma.campaign.count({ where }),
    ]);

    const campaignNames = campaigns.map((c) => c.name);

    const leadsForCampaigns = await prisma.lead.findMany({
      where: {
        organizationId: { in: req.orgIds },
        campaign: { in: campaignNames },
      },
      select: {
        campaign: true,
        status: true,
        budget: true,
      },
    });

    const leadStatsByCampaign = {};
    for (const lead of leadsForCampaigns) {
      if (!lead.campaign) continue;
      if (!leadStatsByCampaign[lead.campaign]) {
        leadStatsByCampaign[lead.campaign] = {
          leadCount: 0,
          wonLeads: 0,
          totalLeadValue: 0,
        };
      }
      leadStatsByCampaign[lead.campaign].leadCount += 1;
      if (lead.status === 'WON') {
        leadStatsByCampaign[lead.campaign].wonLeads += 1;
      }
      leadStatsByCampaign[lead.campaign].totalLeadValue += lead.budget
        ? parseFloat(lead.budget)
        : 0;
    }

    const enrichedCampaigns = campaigns.map((campaign) => {
      const stats = leadStatsByCampaign[campaign.name] || {
        leadCount: 0,
        wonLeads: 0,
        totalLeadValue: 0,
      };
      const budgetVal = campaign.budget ? parseFloat(campaign.budget) : 0;
      const costPerLead =
        stats.leadCount > 0
          ? Math.round((budgetVal / stats.leadCount) * 100) / 100
          : 0;
      const conversionRate =
        stats.leadCount > 0
          ? Math.round((stats.wonLeads / stats.leadCount) * 10000) / 100
          : 0;

      return {
        ...campaign,
        budget: campaign.budget ? parseFloat(campaign.budget) : null,
        leadCount: stats.leadCount,
        wonLeads: stats.wonLeads,
        totalLeadValue: Math.round(stats.totalLeadValue * 100) / 100,
        costPerLead,
        conversionRate,
      };
    });

    res.json(paginatedResponse(enrichedCampaigns, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// ─── POST / — Create Campaign ───────────────────────────────────────────────────

router.post('/', validate(createCampaignSchema), async (req, res, next) => {
  try {
    const { name, type, status, budget, description, startDate, endDate, metadata, organizationId } =
      req.validated;

    const targetOrgId = organizationId || req.orgId;
    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified organization' });
    }

    const campaignData = {
      name,
      type,
      status: status || 'DRAFT',
      organizationId: targetOrgId,
      metadata: metadata || {},
    };

    if (budget !== undefined) campaignData.budget = budget;
        if (startDate) campaignData.startDate = new Date(startDate);
    if (endDate) campaignData.endDate = new Date(endDate);

    const campaign = await prisma.campaign.create({ data: campaignData });

    res.status(201).json({
      ...campaign,
      budget: campaign.budget ? parseFloat(campaign.budget) : null,
    });

    // ── Fire-and-forget notification — notify org admins ──
    notifyOrgAdmins(targetOrgId, {
      type: NOTIFICATION_TYPES.CAMPAIGN_STARTED,
      title: 'New Campaign Created',
      message: `${getDisplayName(req.user)} created campaign: ${name}`,
      entityType: 'campaign',
      entityId: campaign.id,
    }, req.user.id).catch(() => {});

    broadcastDataChange(targetOrgId, 'campaign', 'created', req.user.id, { entityId: campaign.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/duplicate — Duplicate a Campaign ────────────────────────────────

router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const { id } = req.params;

    const original = await prisma.campaign.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!original) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const duplicate = await prisma.campaign.create({
      data: {
        name: `Copy of ${original.name}`,
        type: original.type,
        status: 'DRAFT',
        budget: original.budget,
        description: original.description,
        startDate: original.startDate,
        endDate: original.endDate,
        metadata: original.metadata || {},
        organizationId: original.organizationId,
      },
    });

    res.status(201).json({
      ...duplicate,
      budget: duplicate.budget ? parseFloat(duplicate.budget) : null,
    });

    broadcastDataChange(original.organizationId, 'campaign', 'created', req.user.id, { entityId: duplicate.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── POST /bulk-update — Bulk Update Campaigns ─────────────────────────────────

router.post('/bulk-update', validate(bulkUpdateSchema), async (req, res, next) => {
  try {
    const { ids, data } = req.validated;

    const existing = await prisma.campaign.findMany({
      where: { id: { in: ids }, organizationId: { in: req.orgIds } },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        budget: true,
        description: true,
        startDate: true,
        endDate: true,
        metadata: true,
        organizationId: true,
      },
    });

    const existingIds = existing.map((c) => c.id);
    const missingIds = ids.filter((id) => !existingIds.includes(id));

    if (missingIds.length > 0) {
      return res.status(403).json({
        error: 'Some campaigns were not found or access denied',
        missingIds,
      });
    }

    const result = await prisma.campaign.updateMany({
      where: { id: { in: ids }, organizationId: { in: req.orgIds } },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    res.json({ updated: result.count, message: `${result.count} campaign(s) updated` });

    broadcastDataChange(req.user.organizationId, 'campaign', 'bulk_updated', req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── POST /bulk-delete — Bulk Delete Campaigns ─────────────────────────────────

router.post('/bulk-delete', validate(bulkDeleteSchema), async (req, res, next) => {
  try {
    const { ids } = req.validated;

    const existing = await prisma.campaign.findMany({
      where: { id: { in: ids }, organizationId: { in: req.orgIds } },
      select: { id: true },
    });

    const existingIds = existing.map((c) => c.id);
    const missingIds = ids.filter((id) => !existingIds.includes(id));

    if (missingIds.length > 0) {
      return res.status(403).json({
        error: 'Some campaigns were not found or access denied',
        missingIds,
      });
    }

    await Promise.all(
      existing.map((campaign) =>
        upsertRecycleBinItem({
          entityType: 'CAMPAIGN',
          entityId: campaign.id,
          entityLabel: campaign.name,
          organizationId: campaign.organizationId,
          deletedById: req.user.id,
          snapshot: {
            name: campaign.name,
            type: campaign.type,
            status: campaign.status,
            budget: campaign.budget ? Number(campaign.budget) : null,
            description: campaign.description,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            metadata: campaign.metadata,
          },
        })
      )
    );

    const result = await prisma.campaign.deleteMany({
      where: { id: { in: ids }, organizationId: { in: req.orgIds } },
    });

    res.json({ deleted: result.count, message: `${result.count} campaign(s) moved to recycle bin` });

    broadcastDataChange(req.user.organizationId, 'campaign', 'deleted', req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id — Update Campaign ─────────────────────────────────────────────────

router.put('/:id', validate(updateCampaignSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const updateData = {};

    const body = req.validated;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.budget !== undefined) updateData.budget = body.budget;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.startDate !== undefined) {
      updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    }
    if (body.endDate !== undefined) {
      updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    }
    if (body.organizationId !== undefined) {
      if (!req.orgIds.includes(body.organizationId)) {
        return res.status(403).json({ error: 'Access denied to specified organization' });
      }
      updateData.organizationId = body.organizationId;
    }
    if (body.metadata !== undefined) {
      updateData.metadata = {
        ...(typeof existing.metadata === 'object' ? existing.metadata : {}),
        ...body.metadata,
      };
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    res.json({
      ...campaign,
      budget: campaign.budget ? parseFloat(campaign.budget) : null,
    });

    // ── Fire-and-forget notifications ──
    const campaignName = campaign.name;

    if (body.status && body.status !== existing.status) {
      if (body.status === 'ACTIVE') {
        // Campaign activated → notify org admins
        notifyOrgAdmins(existing.organizationId, {
          type: NOTIFICATION_TYPES.CAMPAIGN_STARTED,
          title: 'Campaign Activated',
          message: `Campaign ${campaignName} is now active`,
          entityType: 'campaign',
          entityId: campaign.id,
        }, req.user.id).catch(() => {});
      }

      if (body.status === 'COMPLETED') {
        // Campaign completed → notify org admins
        notifyOrgAdmins(existing.organizationId, {
          type: NOTIFICATION_TYPES.CAMPAIGN_COMPLETED,
          title: 'Campaign Completed',
          message: `Campaign ${campaignName} completed`,
          entityType: 'campaign',
          entityId: campaign.id,
        }, req.user.id).catch(() => {});
      }
    }

    broadcastDataChange(existing.organizationId, 'campaign', 'updated', req.user.id, { entityId: campaign.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id — Delete Campaign ──────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    await upsertRecycleBinItem({
      entityType: 'CAMPAIGN',
      entityId: existing.id,
      entityLabel: existing.name,
      organizationId: existing.organizationId,
      deletedById: req.user.id,
      snapshot: {
        name: existing.name,
        type: existing.type,
        status: existing.status,
        budget: existing.budget ? Number(existing.budget) : null,
        description: existing.description,
        startDate: existing.startDate,
        endDate: existing.endDate,
        metadata: existing.metadata,
      },
    });

    await prisma.campaign.delete({ where: { id } });

    res.json({ message: 'Campaign moved to recycle bin successfully' });

    broadcastDataChange(existing.organizationId, 'campaign', 'deleted', req.user.id, { entityId: id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
