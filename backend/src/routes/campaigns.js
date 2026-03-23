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
  templateId: z.string().uuid().optional().nullable(),
  campaignCode: z.string().max(80).optional(),
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
  templateId: z.string().uuid().optional().nullable(),
  campaignCode: z.string().max(80).optional().nullable(),
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

const assignmentStatusEnum = z.enum(['ELIGIBLE', 'CONTACTED', 'ACCEPTED', 'REDEEMED', 'EXPIRED', 'REJECTED']);
const assignmentSourceEnum = z.enum(['IMPORT', 'RULE', 'MANUAL', 'API']);

const campaignTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
  config: z.record(z.any()).optional(),
  divisionId: z.string().uuid().optional(),
});

const updateCampaignTemplateSchema = campaignTemplateSchema.partial();

const audienceFiltersSchema = z.object({
  divisionIds: z.array(z.string().uuid()).optional(),
  statuses: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  assignedToIds: z.array(z.string().uuid()).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  maxScore: z.number().int().min(0).max(100).optional(),
  createdBeforeDays: z.number().int().min(1).max(3650).optional(),
  noCallsInDays: z.number().int().min(1).max(3650).optional(),
  minCallCount: z.number().int().min(0).optional(),
  maxCallCount: z.number().int().min(0).optional(),
  tagsAny: z.array(z.string()).optional(),
  tagsAll: z.array(z.string()).optional(),
  hasActiveOffer: z.boolean().optional(),
  excludeAssignedToCampaign: z.boolean().optional(),
  search: z.string().optional(),
});

const assignmentApplySchema = z.object({
  filters: audienceFiltersSchema.optional(),
  leadIds: z.array(z.string().uuid()).optional(),
  source: assignmentSourceEnum.optional(),
  notes: z.string().max(1000).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  status: assignmentStatusEnum.optional(),
  overwriteExisting: z.boolean().optional(),
});

const assignmentUpdateSchema = z.object({
  status: assignmentStatusEnum.optional(),
  notes: z.string().max(1000).optional().nullable(),
  discussedAt: z.string().datetime().optional().nullable(),
  redeemedAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

const assignmentListQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
  assignedToId: z.string().optional(),
  sortBy: z.enum(['assignedAt', 'updatedAt', 'status', 'leadName']).optional().default('assignedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function toLeadName(lead) {
  return [lead?.firstName, lead?.lastName].filter(Boolean).join(' ').trim() || 'Unknown';
}

// ─── Apply Auth Middleware ──────────────────────────────────────────────────────

router.use(authenticate, orgScope);

async function buildAudienceLeadWhere(req, campaign, filters = {}) {
  const where = {
    organizationId: { in: req.orgIds },
    isArchived: false,
  };

  if (campaign?.organizationId) {
    where.organizationId = campaign.organizationId;
  }

  if (filters.divisionIds && filters.divisionIds.length > 0) {
    const allowed = filters.divisionIds.filter((id) => req.orgIds.includes(id));
    if (allowed.length > 0) where.organizationId = { in: allowed };
  }

  if (req.isRestrictedRole) {
    where.assignedToId = req.user.id;
  } else if (filters.assignedToIds && filters.assignedToIds.length > 0) {
    where.assignedToId = { in: filters.assignedToIds };
  }

  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }
  if (filters.sources && filters.sources.length > 0) {
    const builtIn = filters.sources.filter((s) => /^[A-Z_]+$/.test(String(s || '')) && s === String(s).toUpperCase());
    if (builtIn.length > 0) where.source = { in: builtIn };
  }
  if (filters.minScore !== undefined || filters.maxScore !== undefined) {
    where.score = {};
    if (filters.minScore !== undefined) where.score.gte = filters.minScore;
    if (filters.maxScore !== undefined) where.score.lte = filters.maxScore;
  }
  if (filters.createdBeforeDays) {
    where.createdAt = { lte: addDays(filters.createdBeforeDays) };
  }
  if (filters.search) {
    where.OR = [
      { firstName: { contains: filters.search, mode: 'insensitive' } },
      { lastName: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
      { phone: { contains: filters.search } },
      { company: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.tagsAny && filters.tagsAny.length > 0) {
    where.tags = { some: { tag: { name: { in: filters.tagsAny } } } };
  }
  if (filters.tagsAll && filters.tagsAll.length > 0) {
    where.AND = [
      ...(where.AND || []),
      ...filters.tagsAll.map((tagName) => ({ tags: { some: { tag: { name: tagName } } } })),
    ];
  }

  if (filters.hasActiveOffer === true) {
    where.campaignAssignments = { some: { status: { in: ['ELIGIBLE', 'CONTACTED', 'ACCEPTED'] } } };
  } else if (filters.hasActiveOffer === false) {
    where.campaignAssignments = { none: { status: { in: ['ELIGIBLE', 'CONTACTED', 'ACCEPTED'] } } };
  }

  if (filters.excludeAssignedToCampaign && campaign?.id) {
    where.AND = [
      ...(where.AND || []),
      { campaignAssignments: { none: { campaignId: campaign.id } } },
    ];
  }

  if (
    filters.noCallsInDays !== undefined ||
    filters.minCallCount !== undefined ||
    filters.maxCallCount !== undefined
  ) {
    const groupWhere = { lead: { organizationId: where.organizationId, isArchived: false } };
    if (req.isRestrictedRole) groupWhere.lead.assignedToId = req.user.id;
    if (where.status) groupWhere.lead.status = where.status;
    if (where.source) groupWhere.lead.source = where.source;
    if (where.score) groupWhere.lead.score = where.score;

    const callRows = await prisma.callLog.groupBy({
      by: ['leadId'],
      _count: { id: true },
      _max: { createdAt: true },
      where: groupWhere,
    });

    let leadIds = callRows.map((r) => r.leadId);
    if (filters.minCallCount !== undefined) {
      leadIds = leadIds.filter((id) => {
        const row = callRows.find((x) => x.leadId === id);
        return (row?._count?.id || 0) >= filters.minCallCount;
      });
    }
    if (filters.maxCallCount !== undefined) {
      leadIds = leadIds.filter((id) => {
        const row = callRows.find((x) => x.leadId === id);
        return (row?._count?.id || 0) <= filters.maxCallCount;
      });
    }
    if (filters.noCallsInDays !== undefined) {
      const cutoff = addDays(filters.noCallsInDays);
      leadIds = leadIds.filter((id) => {
        const row = callRows.find((x) => x.leadId === id);
        return !row?._max?.createdAt || new Date(row._max.createdAt) <= cutoff;
      });

      const neverCalled = await prisma.lead.findMany({
        where: {
          organizationId: where.organizationId,
          isArchived: false,
          callLogs: { none: {} },
        },
        select: { id: true },
      });
      leadIds = [...new Set([...leadIds, ...neverCalled.map((l) => l.id)])];
    }

    where.AND = [
      ...(where.AND || []),
      { id: { in: leadIds.length > 0 ? leadIds : ['__none__'] } },
    ];
  }

  return where;
}

async function fetchAudiencePreview(req, campaign, filters = {}, limit = 200) {
  const where = await buildAudienceLeadWhere(req, campaign, filters);
  const leads = await prisma.lead.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      company: true,
      score: true,
      status: true,
      source: true,
      sourceDetail: true,
      organizationId: true,
      assignedToId: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { callLogs: true, campaignAssignments: true } },
      updatedAt: true,
    },
  });
  return leads;
}

// ─── GET /stats — Dashboard Statistics ──────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const orgFilter = { organizationId: { in: req.orgIds } };

    const [campaigns, leads, assignmentStats] = await Promise.all([
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
      prisma.leadCampaignAssignment.groupBy({
        by: ['campaignId'],
        where: { organizationId: { in: req.orgIds } },
        _count: { leadId: true },
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

    const assignmentCountByCampaignId = assignmentStats.reduce((acc, row) => {
      acc[row.campaignId] = row._count.leadId || 0;
      return acc;
    }, {});

    const totalLeads =
      Object.values(assignmentCountByCampaignId).reduce((sum, n) => sum + n, 0) || leads.length;
    const avgCostPerLead = totalLeads > 0 ? totalBudget / totalLeads : 0;

    let bestPerforming = null;
    let maxLeadCount = 0;
    for (const campaign of campaigns) {
      const stats = leadsByCampaign[campaign.name];
      const count = assignmentCountByCampaignId[campaign.id] || (stats ? stats.total : 0);
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
      byTypeMap[campaign.type].leads += assignmentCountByCampaignId[campaign.id] || (stats ? stats.total : 0);
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
    const campaignIds = campaigns.map((c) => c.id);

    const [leadsForCampaigns, assignmentRows] = await Promise.all([
      prisma.lead.findMany({
        where: {
          organizationId: { in: req.orgIds },
          campaign: { in: campaignNames },
        },
        select: {
          campaign: true,
          status: true,
          budget: true,
        },
      }),
      prisma.leadCampaignAssignment.groupBy({
        by: ['campaignId'],
        where: { organizationId: { in: req.orgIds }, campaignId: { in: campaignIds } },
        _count: { leadId: true },
      }),
    ]);
    const assignmentLeadCounts = assignmentRows.reduce((acc, row) => {
      acc[row.campaignId] = row._count.leadId || 0;
      return acc;
    }, {});

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
        leadCount: assignmentLeadCounts[campaign.id] || stats.leadCount,
        wonLeads: stats.wonLeads,
        totalLeadValue: Math.round(stats.totalLeadValue * 100) / 100,
        costPerLead: (assignmentLeadCounts[campaign.id] || stats.leadCount) > 0
          ? Math.round((budgetVal / (assignmentLeadCounts[campaign.id] || stats.leadCount)) * 100) / 100
          : 0,
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
    const { name, type, status, budget, description, startDate, endDate, metadata, templateId, campaignCode, organizationId } =
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
      metadata: {
        ...(metadata || {}),
        ...(campaignCode ? { campaignCode } : {}),
      },
    };

    if (budget !== undefined) campaignData.budget = budget;
    if (description !== undefined) campaignData.description = description;
    if (startDate) campaignData.startDate = new Date(startDate);
    if (endDate) campaignData.endDate = new Date(endDate);
    if (templateId !== undefined) campaignData.templateId = templateId || null;

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

// ─── Offer Templates ───────────────────────────────────────────────────────────
router.get('/templates', async (req, res, next) => {
  try {
    const divisionId = typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;
    let orgScope = req.orgIds;
    if (divisionId) {
      if (!req.orgIds.includes(divisionId)) {
        return res.status(403).json({ error: 'Access denied to specified division' });
      }
      orgScope = [divisionId];
    }
    const templates = await prisma.campaignTemplate.findMany({
      where: { organizationId: { in: orgScope } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

router.post('/templates', authorize('ADMIN', 'MANAGER'), validate(campaignTemplateSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const targetOrgId = payload.divisionId || req.orgId;
    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified division' });
    }
    const created = await prisma.campaignTemplate.create({
      data: {
        name: payload.name,
        description: payload.description || null,
        config: payload.config || {},
        isActive: payload.isActive !== false,
        organizationId: targetOrgId,
        createdById: req.user.id,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/templates/:id', authorize('ADMIN', 'MANAGER'), validate(updateCampaignTemplateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.campaignTemplate.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    const payload = req.validated;
    const updated = await prisma.campaignTemplate.update({
      where: { id: existing.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description || null } : {}),
        ...(payload.config !== undefined ? { config: payload.config || {} } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/templates/:id', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.campaignTemplate.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    await prisma.campaignTemplate.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Offer Assignments Engine ─────────────────────────────────────────────────
router.post('/:id/assignments/preview', authorize('ADMIN', 'MANAGER'), validate(audienceFiltersSchema), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, name: true, organizationId: true, metadata: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const leads = await fetchAudiencePreview(req, campaign, req.validated, 300);
    res.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      totalMatched: leads.length,
      leads: leads.map((lead) => ({
        ...lead,
        fullName: toLeadName(lead),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/assignments/apply', authorize('ADMIN', 'MANAGER'), validate(assignmentApplySchema), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, name: true, organizationId: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const payload = req.validated;
    let targetLeadIds = Array.isArray(payload.leadIds) ? payload.leadIds : [];
    if ((!targetLeadIds || targetLeadIds.length === 0) && payload.filters) {
      const preview = await fetchAudiencePreview(req, campaign, payload.filters, 50000);
      targetLeadIds = preview.map((lead) => lead.id);
    }

    if (!targetLeadIds || targetLeadIds.length === 0) {
      return res.status(400).json({ error: 'No matching leads to assign' });
    }

    const existing = await prisma.leadCampaignAssignment.findMany({
      where: {
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        leadId: { in: targetLeadIds },
      },
      select: { id: true, leadId: true },
    });
    const existingLeadIds = new Set(existing.map((e) => e.leadId));
    const overwrite = payload.overwriteExisting === true;

    let createdCount = 0;
    let updatedCount = 0;
    await prisma.$transaction(async (tx) => {
      if (overwrite && existing.length > 0) {
        const result = await tx.leadCampaignAssignment.updateMany({
          where: {
            campaignId: campaign.id,
            leadId: { in: targetLeadIds },
            organizationId: campaign.organizationId,
          },
          data: {
            source: payload.source || 'RULE',
            status: payload.status || 'ELIGIBLE',
            notes: payload.notes || null,
            expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
            assignedById: req.user.id,
            assignedAt: new Date(),
            updatedAt: new Date(),
          },
        });
        updatedCount = result.count;
      }

      const toCreate = targetLeadIds.filter((id) => !existingLeadIds.has(id));
      if (toCreate.length > 0) {
        const result = await tx.leadCampaignAssignment.createMany({
          data: toCreate.map((leadId) => ({
            organizationId: campaign.organizationId,
            leadId,
            campaignId: campaign.id,
            source: payload.source || 'RULE',
            status: payload.status || 'ELIGIBLE',
            notes: payload.notes || null,
            expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
            assignedById: req.user.id,
          })),
          skipDuplicates: true,
        });
        createdCount = result.count;
      }
    });

    res.json({
      success: true,
      campaignId: campaign.id,
      created: createdCount,
      updated: updatedCount,
      skipped: Math.max(targetLeadIds.length - createdCount - updatedCount, 0),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/assignments', validateQuery(assignmentListQuerySchema), async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, organizationId: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const q = req.validatedQuery;
    const where = {
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
    };
    if (q.status) {
      const statuses = q.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) where.status = { in: statuses };
    }
    if (q.assignedToId) where.assignedById = q.assignedToId;
    if (q.search) {
      where.lead = {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { phone: { contains: q.search } },
          { company: { contains: q.search, mode: 'insensitive' } },
        ],
      };
    }

    const orderBy = (() => {
      if (q.sortBy === 'leadName') return { lead: { firstName: q.sortOrder } };
      return { [q.sortBy]: q.sortOrder };
    })();

    const { skip, take } = paginate(q.page, q.limit);
    const [rows, total] = await Promise.all([
      prisma.leadCampaignAssignment.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              company: true,
              score: true,
              status: true,
              assignedTo: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          assignedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.leadCampaignAssignment.count({ where }),
    ]);

    res.json(paginatedResponse(rows.map((row) => ({
      ...row,
      leadName: toLeadName(row.lead),
    })), total, q.page, q.limit));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/offer-analytics', async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, organizationId: true, name: true },
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const rows = await prisma.leadCampaignAssignment.findMany({
      where: { campaignId: campaign.id, organizationId: campaign.organizationId },
      select: {
        id: true,
        status: true,
        assignedAt: true,
        discussedAt: true,
        redeemedAt: true,
      },
    });
    const total = rows.length;
    const byStatus = rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    const discussed = rows.filter((r) => !!r.discussedAt).length;
    const redeemed = rows.filter((r) => r.status === 'REDEEMED' || !!r.redeemedAt).length;
    const accepted = rows.filter((r) => r.status === 'ACCEPTED' || r.status === 'REDEEMED').length;
    const contacted = rows.filter((r) => r.status === 'CONTACTED' || r.status === 'ACCEPTED' || r.status === 'REDEEMED').length;

    res.json({
      campaignId: campaign.id,
      campaignName: campaign.name,
      totalAssignments: total,
      byStatus,
      funnel: {
        assigned: total,
        contacted,
        discussed,
        accepted,
        redeemed,
      },
      conversion: {
        contactedRate: total > 0 ? Math.round((contacted / total) * 10000) / 100 : 0,
        acceptanceRate: total > 0 ? Math.round((accepted / total) * 10000) / 100 : 0,
        redemptionRate: total > 0 ? Math.round((redeemed / total) * 10000) / 100 : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/assignments/:assignmentId', authorize('ADMIN', 'MANAGER'), validate(assignmentUpdateSchema), async (req, res, next) => {
  try {
    const existing = await prisma.leadCampaignAssignment.findFirst({
      where: { id: req.params.assignmentId, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    const payload = req.validated;
    const updated = await prisma.leadCampaignAssignment.update({
      where: { id: existing.id },
      data: {
        ...(payload.status !== undefined ? { status: payload.status } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes || null } : {}),
        ...(payload.discussedAt !== undefined ? { discussedAt: payload.discussedAt ? new Date(payload.discussedAt) : null } : {}),
        ...(payload.redeemedAt !== undefined ? { redeemedAt: payload.redeemedAt ? new Date(payload.redeemedAt) : null } : {}),
        ...(payload.expiresAt !== undefined ? { expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null } : {}),
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    res.json(updated);
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
    if (body.templateId !== undefined) {
      updateData.templateId = body.templateId || null;
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
    if (body.campaignCode !== undefined) {
      updateData.metadata = {
        ...(typeof updateData.metadata === 'object'
          ? updateData.metadata
          : (typeof existing.metadata === 'object' ? existing.metadata : {})),
        ...(body.campaignCode ? { campaignCode: body.campaignCode } : { campaignCode: null }),
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
