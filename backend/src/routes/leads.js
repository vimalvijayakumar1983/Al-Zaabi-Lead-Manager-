const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { calculateLeadScore, predictConversion, calculateFullScore, rescoreAndPersist } = require('../utils/leadScoring');
const { detectDuplicates } = require('../utils/duplicateDetection');
const { createAuditLog } = require('../middleware/auditLog');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { autoAssign, getNextAssignee } = require('../services/leadAssignment');
const { executeAutomations } = require('../services/automationEngine');
const { getLeadSLAInfo, getSLAConfig } = require('../services/slaMonitor');

const router = Router();
router.use(authenticate, orgScope);

// Smart name display — deduplicates when firstName and lastName are identical
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return '';
  if (!ln) return fn;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

// ─── Schemas ─────────────────────────────────────────────────────
const createLeadSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional().default(''),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  source: z.enum([
    'WEBSITE_FORM', 'LIVE_CHAT', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
    'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
  ]).optional(),
  budget: z.number().optional().nullable(),
  productInterest: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  campaign: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  customData: z.record(z.unknown()).optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial().extend({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  lostReason: z.string().optional().nullable(),
});

const leadFilterSchema = paginationSchema.extend({
  status: z.string().optional(),
  source: z.string().optional(),
  assignedToId: z.string().optional(),
  stageId: z.string().optional(),
  tag: z.string().optional(),
  tags: z.string().optional(), // comma-separated tag names
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  productInterest: z.string().optional(),
  campaign: z.string().optional(),
  minBudget: z.coerce.number().optional(),
  maxBudget: z.coerce.number().optional(),
  budgetMin: z.coerce.number().optional(),
  budgetMax: z.coerce.number().optional(),
  hasEmail: z.string().optional(), // 'true' or 'false'
  hasPhone: z.string().optional(),
  conversionMin: z.coerce.number().optional(),
  conversionMax: z.coerce.number().optional(),
  customField: z.string().optional(), // JSON encoded: {"fieldName":"value"} for custom field filtering
  divisionId: z.string().optional(),
  callOutcome: z.string().optional(), // comma-separated CallDisposition values
  minCallCount: z.coerce.number().int().min(0).optional(),
  maxCallCount: z.coerce.number().int().min(0).optional(),
  showBlocked: z.string().optional(), // 'true' to show only DNC/blocked leads (admin only)
});

// ─── List Leads ──────────────────────────────────────────────────
router.get('/', validateQuery(leadFilterSchema), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder, search, status, source, assignedToId, stageId, tag, tags, minScore, maxScore, dateFrom, dateTo, company, jobTitle, location, campaign, productInterest, budgetMin, budgetMax, minBudget, maxBudget, hasEmail, hasPhone, conversionMin, conversionMax, customField, divisionId, callOutcome, minCallCount, maxCallCount, showBlocked } = req.validatedQuery;

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
    };

    // ── Do Not Call / Blocked filter ──
    // By default, hide DNC leads from all views
    // showBlocked=true shows ONLY DNC leads (admin Blocked tab)
    if (showBlocked === 'true') {
      if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only admins can view blocked leads' });
      }
      where.doNotCall = true;
    } else {
      where.doNotCall = false;
    }

    // Role-based data scoping: SALES_REP only sees their own assigned leads
    if (req.isRestrictedRole) {
      where.assignedToId = req.user.id;
    }

    // Optional: filter to specific division
    if (divisionId && req.isSuperAdmin) {
      where.organizationId = divisionId;
    }

    if (status) {
      if (status.includes(',')) {
        where.status = { in: status.split(',').map(s => s.trim()) };
      } else {
        where.status = status;
      }
    }
    if (source) {
      if (source.includes(',')) {
        where.source = { in: source.split(',').map(s => s.trim()) };
      } else {
        where.source = source;
      }
    }
    if (assignedToId && !req.isRestrictedRole) {
      if (assignedToId === 'unassigned' || assignedToId === '__unassigned__') {
        where.assignedToId = null;
      } else if (assignedToId === '__current_user__') {
        where.assignedToId = req.user.id;
      } else {
        where.assignedToId = assignedToId;
      }
    }
    if (stageId) {
      // Support comma-separated stage IDs for multi-org drill-down
      const ids = stageId.split(',').filter(Boolean);
      where.stageId = ids.length === 1 ? ids[0] : { in: ids };
    }
    if (minScore !== undefined || maxScore !== undefined) {
      where.score = {};
      if (minScore !== undefined) where.score.gte = minScore;
      if (maxScore !== undefined) where.score.lte = maxScore;
    }
    if (tag) {
      where.tags = { some: { tag: { name: tag } } };
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { productInterest: { contains: search, mode: 'insensitive' } },
        { campaign: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { tags: { some: { tag: { name: { contains: search, mode: 'insensitive' } } } } },
      ];
    }

    // Date range — resolve shortcut tokens first
    let resolvedFrom = dateFrom;
    let resolvedTo = dateTo;
    if (resolvedFrom === '__this_week__') {
      const now = new Date();
      const day = now.getDay(); // 0=Sun
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      resolvedFrom = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
      resolvedTo = undefined; // up to now
    } else if (resolvedFrom === '__today__') {
      resolvedFrom = new Date().toISOString().split('T')[0];
      resolvedTo = resolvedFrom;
    } else if (resolvedFrom === '__this_month__') {
      const now = new Date();
      resolvedFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      resolvedTo = undefined;
    } else if (resolvedFrom === '__last_7_days__') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      resolvedFrom = d.toISOString().split('T')[0];
      resolvedTo = undefined;
    } else if (resolvedFrom === '__last_30_days__') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      resolvedFrom = d.toISOString().split('T')[0];
      resolvedTo = undefined;
    }
    if (resolvedFrom || resolvedTo) {
      where.createdAt = {};
      if (resolvedFrom) where.createdAt.gte = new Date(resolvedFrom);
      if (resolvedTo) where.createdAt.lte = new Date(resolvedTo + 'T23:59:59.999Z');
    }
    // Text field filters
    if (company) where.company = { contains: company, mode: 'insensitive' };
    if (jobTitle) where.jobTitle = { contains: jobTitle, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (productInterest) where.productInterest = { contains: productInterest, mode: 'insensitive' };
    if (campaign) where.campaign = { contains: campaign, mode: 'insensitive' };
    // Budget range (support both minBudget/maxBudget and budgetMin/budgetMax)
    const effectiveBudgetMin = budgetMin !== undefined ? budgetMin : minBudget;
    const effectiveBudgetMax = budgetMax !== undefined ? budgetMax : maxBudget;
    if (effectiveBudgetMin !== undefined || effectiveBudgetMax !== undefined) {
      where.budget = {};
      if (effectiveBudgetMin !== undefined) where.budget.gte = effectiveBudgetMin;
      if (effectiveBudgetMax !== undefined) where.budget.lte = effectiveBudgetMax;
    }
    // Has email/phone
    if (hasEmail === 'true') where.email = { not: null };
    if (hasEmail === 'false') where.email = null;
    if (hasPhone === 'true') where.phone = { not: null };
    if (hasPhone === 'false') where.phone = null;
    // Multiple tags (comma-separated)
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        where.tags = { some: { tag: { name: { in: tagList } } } };
      }
    }
    // Conversion probability range
    if (conversionMin !== undefined || conversionMax !== undefined) {
      where.conversionProb = {};
      if (conversionMin !== undefined) where.conversionProb.gte = conversionMin;
      if (conversionMax !== undefined) where.conversionProb.lte = conversionMax;
    }
    // Call outcome filtering (filter leads by their last/any call disposition)
    if (callOutcome) {
      const outcomes = callOutcome.split(',').map(s => s.trim()).filter(Boolean);
      if (outcomes.length > 0) {
        where.callLogs = { some: { disposition: outcomes.length === 1 ? outcomes[0] : { in: outcomes } } };
      }
    }
    // Custom field filtering (JSON encoded)
    if (customField) {
      try {
        const cfFilters = JSON.parse(customField);
        // Build path filter for customData JSON field
        const cfConditions = [];
        for (const [key, value] of Object.entries(cfFilters)) {
          if (value !== '' && value !== null && value !== undefined) {
            cfConditions.push({ customData: { path: [key], string_contains: String(value) } });
          }
        }
        if (cfConditions.length > 0) {
          where.AND = [...(where.AND || []), ...cfConditions];
        }
      } catch { /* ignore invalid JSON */ }
    }

    // ─── Call Count Filtering ──────────────────────────────────
    if (minCallCount !== undefined || maxCallCount !== undefined) {
      const min = minCallCount !== undefined ? Number(minCallCount) : 0;
      const max = maxCallCount !== undefined ? Number(maxCallCount) : Infinity;

      if (min > 0) {
        // Only leads that have been called at least `min` times
        const having = { id: { _count: { gte: min } } };
        if (max < Infinity) having.id._count.lte = max;

        const results = await prisma.callLog.groupBy({
          by: ['leadId'],
          _count: { id: true },
          having,
        });
        const ids = results.map(r => r.leadId);
        // If no leads match, add impossible condition to return 0 results
        where.AND = [...(where.AND || []), { id: { in: ids.length > 0 ? ids : ['__none__'] } }];
      } else if (max < Infinity) {
        // Min is 0, so include leads with 0 calls too
        // Exclude leads with MORE than max calls
        const tooMany = await prisma.callLog.groupBy({
          by: ['leadId'],
          _count: { id: true },
          having: { id: { _count: { gt: max } } },
        });
        const excludeIds = tooMany.map(r => r.leadId);
        if (excludeIds.length > 0) {
          where.AND = [...(where.AND || []), { id: { notIn: excludeIds } }];
        }
      }
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
          organization: { select: { id: true, name: true } },
          _count: { select: { activities: true, tasks: true, communications: true, callLogs: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      prisma.lead.count({ where }),
    ]);

    // Fetch per-channel communication counts, unread counts, last message, and last call outcome for the current page of leads
    const leadIds = leads.map(l => l.id);
    let channelCountsMap = {};
    let unreadChannelCountsMap = {};
    let lastMessageMap = {};
    let lastCallOutcomeMap = {};
    if (leadIds.length > 0) {
      // Fetch last call log per lead (most recent call's disposition + date)
      const lastCallLogs = await prisma.callLog.findMany({
        where: { leadId: { in: leadIds } },
        orderBy: { createdAt: 'desc' },
        distinct: ['leadId'],
        select: { leadId: true, disposition: true, notes: true, createdAt: true },
      });
      for (const cl of lastCallLogs) {
        lastCallOutcomeMap[cl.leadId] = {
          disposition: cl.disposition,
          notes: cl.notes,
          date: cl.createdAt,
        };
      }

      const [channelCounts, unreadChannelCounts, lastMessages] = await Promise.all([
        prisma.communication.groupBy({
          by: ['leadId', 'channel'],
          where: { leadId: { in: leadIds } },
          _count: { id: true },
        }),
        prisma.communication.groupBy({
          by: ['leadId', 'channel'],
          where: { leadId: { in: leadIds }, isRead: false, direction: 'INBOUND' },
          _count: { id: true },
        }),
        prisma.communication.findMany({
          where: { leadId: { in: leadIds }, direction: 'INBOUND' },
          orderBy: { createdAt: 'desc' },
          distinct: ['leadId'],
          select: { leadId: true, channel: true, body: true, createdAt: true },
        }),
      ]);

      // Build channel counts map: { leadId: { WHATSAPP: 3, EMAIL: 5, ... } }
      for (const row of channelCounts) {
        if (!channelCountsMap[row.leadId]) channelCountsMap[row.leadId] = {};
        channelCountsMap[row.leadId][row.channel] = row._count.id;
      }

      // Build unread channel counts map: { leadId: { WHATSAPP: 1, ... } }
      for (const row of unreadChannelCounts) {
        if (!unreadChannelCountsMap[row.leadId]) unreadChannelCountsMap[row.leadId] = {};
        unreadChannelCountsMap[row.leadId][row.channel] = row._count.id;
      }

      // Build last message map: { leadId: { channel, body, createdAt } }
      for (const msg of lastMessages) {
        lastMessageMap[msg.leadId] = {
          channel: msg.channel,
          body: msg.body?.substring(0, 100) || '',
          createdAt: msg.createdAt,
        };
      }
    }

    // Get org settings for SLA info
    let orgSettings = null;
    try {
      const org = await prisma.organization.findFirst({
        where: { id: { in: req.orgIds } },
        select: { settings: true },
      });
      orgSettings = org?.settings;
    } catch { /* non-critical */ }

    // Enrich leads with channel counts, unread counts, last message, last call outcome, and SLA info
    const enrichedLeads = leads.map(lead => ({
      ...lead,
      doNotCall: lead.doNotCall || false,
      doNotCallAt: lead.doNotCallAt || null,
      channelCounts: channelCountsMap[lead.id] || {},
      unreadChannelCounts: unreadChannelCountsMap[lead.id] || {},
      lastInboundMessage: lastMessageMap[lead.id] || null,
      lastCallOutcome: lastCallOutcomeMap[lead.id] || null,
      slaInfo: getLeadSLAInfo(lead, orgSettings),
    }));

    res.json(paginatedResponse(enrichedLeads, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// ─── Global Search ──────────────────────────────────────────────
router.get('/search/global', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || String(q).trim().length < 2) {
      return res.json({ leads: [], total: 0 });
    }
    const search = String(q).trim();

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
        { productInterest: { contains: search, mode: 'insensitive' } },
        { campaign: { contains: search, mode: 'insensitive' } },
        { website: { contains: search, mode: 'insensitive' } },
        { tags: { some: { tag: { name: { contains: search, mode: 'insensitive' } } } } },
      ],
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      prisma.lead.count({ where }),
    ]);

    // Compute match context - which field matched
    const results = leads.map(lead => {
      const matchFields = [];
      const lowerSearch = search.toLowerCase();
      if (lead.firstName?.toLowerCase().includes(lowerSearch)) matchFields.push('name');
      if (lead.lastName?.toLowerCase().includes(lowerSearch)) matchFields.push('name');
      if (lead.email?.toLowerCase().includes(lowerSearch)) matchFields.push('email');
      if (lead.phone?.includes(search)) matchFields.push('phone');
      if (lead.company?.toLowerCase().includes(lowerSearch)) matchFields.push('company');
      if (lead.jobTitle?.toLowerCase().includes(lowerSearch)) matchFields.push('jobTitle');
      if (lead.location?.toLowerCase().includes(lowerSearch)) matchFields.push('location');
      if (lead.productInterest?.toLowerCase().includes(lowerSearch)) matchFields.push('productInterest');
      if (lead.campaign?.toLowerCase().includes(lowerSearch)) matchFields.push('campaign');
      if (lead.website?.toLowerCase().includes(lowerSearch)) matchFields.push('website');
      const tagMatch = (lead.tags || []).find(t => t.tag.name.toLowerCase().includes(lowerSearch));
      if (tagMatch) matchFields.push('tag');
      return { ...lead, matchFields: [...new Set(matchFields)] };
    });

    res.json({ leads: results, total });
  } catch (err) {
    next(err);
  }
});

// ─── Filter Values (unique values for dynamic filters) ──────────
router.get('/filter-values', async (req, res, next) => {
  try {
    const orgWhere = { organizationId: { in: req.orgIds }, isArchived: false };

    const [companies, jobTitles, locations, products, campaigns, tags, stages, users] = await Promise.all([
      prisma.lead.findMany({ where: { ...orgWhere, company: { not: null } }, select: { company: true }, distinct: ['company'], take: 100, orderBy: { company: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, jobTitle: { not: null } }, select: { jobTitle: true }, distinct: ['jobTitle'], take: 100, orderBy: { jobTitle: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, location: { not: null } }, select: { location: true }, distinct: ['location'], take: 100, orderBy: { location: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, productInterest: { not: null } }, select: { productInterest: true }, distinct: ['productInterest'], take: 100, orderBy: { productInterest: 'asc' } }),
      prisma.lead.findMany({ where: { ...orgWhere, campaign: { not: null } }, select: { campaign: true }, distinct: ['campaign'], take: 100, orderBy: { campaign: 'asc' } }),
      prisma.tag.findMany({ where: { organizationId: { in: req.orgIds } }, select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
      prisma.pipelineStage.findMany({ where: { organizationId: { in: req.orgIds } }, select: { id: true, name: true, color: true }, orderBy: { order: 'asc' } }),
      prisma.user.findMany({ where: { organizationId: { in: req.orgIds }, isActive: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    ]);

    res.json({
      companies: companies.map(c => c.company).filter(Boolean),
      jobTitles: jobTitles.map(j => j.jobTitle).filter(Boolean),
      locations: locations.map(l => l.location).filter(Boolean),
      products: products.map(p => p.productInterest).filter(Boolean),
      campaigns: campaigns.map(c => c.campaign).filter(Boolean),
      tags,
      stages,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Tags List ──────────────────────────────────────────────────
router.get('/tags', async (req, res, next) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (err) {
    next(err);
  }
});

// ─── Create Tag ─────────────────────────────────────────────────
router.post('/tags', async (req, res, next) => {
  try {
    const { name, color, organizationId } = req.body;
    if (!name || !organizationId) {
      return res.status(400).json({ error: 'Name and organizationId are required' });
    }
    // Check org access
    if (!req.orgIds.includes(organizationId)) {
      return res.status(403).json({ error: 'Access denied to this division' });
    }
    // Check duplicate
    const existing = await prisma.tag.findUnique({
      where: { organizationId_name: { organizationId, name: name.trim() } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Tag already exists in this division' });
    }
    const tag = await prisma.tag.create({
      data: { name: name.trim(), color: color || '#6366f1', organizationId },
    });
    res.status(201).json(tag);
  } catch (err) {
    next(err);
  }
});

// ─── Update Tag ─────────────────────────────────────────────────
router.put('/tags/:id', async (req, res, next) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    
    const { name, color } = req.body;
    const updateData = {};
    if (name !== undefined) {
      // Check duplicate name in same org
      const dup = await prisma.tag.findFirst({
        where: { organizationId: tag.organizationId, name: name.trim(), id: { not: tag.id } },
      });
      if (dup) return res.status(409).json({ error: 'A tag with this name already exists' });
      updateData.name = name.trim();
    }
    if (color !== undefined) updateData.color = color;
    
    const updated = await prisma.tag.update({
      where: { id: tag.id },
      data: updateData,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Tag ─────────────────────────────────────────────────
router.delete('/tags/:id', async (req, res, next) => {
  try {
    const tag = await prisma.tag.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    
    // Delete all lead-tag associations first, then the tag
    await prisma.$transaction([
      prisma.leadTag.deleteMany({ where: { tagId: tag.id } }),
      prisma.contactTag.deleteMany({ where: { tagId: tag.id } }),
      prisma.tag.delete({ where: { id: tag.id } }),
    ]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Add Tags to Lead ───────────────────────────────────────────
router.post('/:id/tags', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const { tagIds, tagNames } = req.body;
    const results = [];
    
    // Add by tag IDs
    if (tagIds && Array.isArray(tagIds)) {
      for (const tagId of tagIds) {
        try {
          await prisma.leadTag.create({ data: { leadId: lead.id, tagId } });
          results.push({ tagId, added: true });
        } catch (e) {
          // Already exists - skip
          results.push({ tagId, added: false, reason: 'already assigned' });
        }
      }
    }
    
    // Add by tag names (create-on-the-fly)
    if (tagNames && Array.isArray(tagNames)) {
      for (const name of tagNames) {
        const tag = await prisma.tag.upsert({
          where: { organizationId_name: { organizationId: lead.organizationId, name: name.trim() } },
          create: { name: name.trim(), organizationId: lead.organizationId },
          update: {},
        });
        try {
          await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tag.id } });
          results.push({ tagId: tag.id, name: tag.name, added: true });
        } catch (e) {
          results.push({ tagId: tag.id, name: tag.name, added: false, reason: 'already assigned' });
        }
      }
    }
    
    // Return updated lead with tags
    const updated = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { tags: { include: { tag: true } } },
    });
    res.json({ tags: updated.tags, results });
  } catch (err) {
    next(err);
  }
});

// ─── Remove Tag from Lead ───────────────────────────────────────
router.delete('/:id/tags/:tagId', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    await prisma.leadTag.delete({
      where: { leadId_tagId: { leadId: lead.id, tagId: req.params.tagId } },
    }).catch(() => {});
    
    // Return updated tags
    const updated = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { tags: { include: { tag: true } } },
    });
    res.json({ tags: updated.tags });
  } catch (err) {
    next(err);
  }
});

// ─── Get Lead by ID ──────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const detailWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) detailWhere.assignedToId = req.user.id;

    const lead = await prisma.lead.findFirst({
      where: detailWhere,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        stage: true,
        tags: { include: { tag: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        notes: {
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        tasks: {
          orderBy: { dueAt: 'asc' },
          include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
        },
        communications: { orderBy: { createdAt: 'desc' }, take: 20 },
        attachments: { orderBy: { createdAt: 'desc' } },
        _count: { select: { activities: true, tasks: true, communications: true } },
      },
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Count unread inbound communications and fetch org settings for SLA
    const [unreadCount, orgForSLA] = await Promise.all([
      prisma.communication.count({
        where: { leadId: lead.id, isRead: false, direction: 'INBOUND' },
      }),
      prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { settings: true },
      }),
    ]);

    // Fetch DNC blocker info if lead is blocked
    let doNotCallByUser = null;
    if (lead.doNotCall && lead.doNotCallById) {
      try {
        doNotCallByUser = await prisma.user.findUnique({
          where: { id: lead.doNotCallById },
          select: { id: true, firstName: true, lastName: true },
        });
      } catch { /* non-critical */ }
    }

    // Calculate full score breakdown for display and return fresh values
    let scoreBreakdown = null;
    let freshScore = lead.score;
    let freshConversionProb = lead.conversionProb;
    try {
      const scoreResult = await calculateFullScore(lead.id);
      scoreBreakdown = scoreResult.breakdown;
      freshScore = scoreResult.score;
      freshConversionProb = scoreResult.conversionProb;
      // If score has drifted, silently update it
      if (scoreResult.score !== lead.score || scoreResult.conversionProb !== lead.conversionProb) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { score: scoreResult.score, conversionProb: scoreResult.conversionProb },
        });
      }
    } catch { /* non-critical — breakdown is optional */ }

    res.json({
      ...lead,
      score: freshScore,
      conversionProb: freshConversionProb,
      unreadCommunications: unreadCount,
      slaInfo: getLeadSLAInfo(lead, orgForSLA?.settings),
      doNotCallByUser,
      scoreBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Create Lead ─────────────────────────────────────────────────
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    // Smart-split unified "name" field into firstName / lastName
    if (data.name && !data.firstName) {
      const parts = data.name.trim().split(/\s+/);
      if (parts.length === 1) {
        data.firstName = parts[0];
        data.lastName = '';
      } else {
        data.lastName = parts.pop();
        data.firstName = parts.join(' ');
      }
    }
    delete data.name;

    // Ensure firstName is present
    if (!data.firstName || data.firstName.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (data.lastName === undefined || data.lastName === null) data.lastName = '';

    // ─── Dynamic Required Field Validation ─────────────────────────────
    // Check field config for the target division to enforce required fields
    try {
      const targetDivId = (req.isSuperAdmin && data.divisionId) ? data.divisionId : req.orgId;
      const configOrg = await prisma.organization.findUnique({
        where: { id: targetDivId },
        select: { settings: true },
      });
      const settings = configOrg?.settings || {};
      const divKey = `division_${targetDivId}`;
      const fieldConfig = settings.fieldConfig?.[divKey] || settings.fieldConfig?.['default'] || {};

      const missingFields = [];
      // Map of config key to request data key
      const fieldKeyMap = {
        email: 'email', phone: 'phone', company: 'company', jobTitle: 'jobTitle',
        source: 'source', budget: 'budget', productInterest: 'productInterest',
        location: 'location', website: 'website', campaign: 'campaign',
      };
      for (const [configKey, dataKey] of Object.entries(fieldKeyMap)) {
        if (fieldConfig[configKey]?.isRequired) {
          const val = data[dataKey];
          if (val === undefined || val === null || String(val).trim() === '') {
            // Find the label from BUILT_IN_FIELDS or use the key
            const builtIn = BUILT_IN_FIELDS.find(f => f.key === configKey);
            missingFields.push(builtIn?.label || configKey);
          }
        }
      }
      if (missingFields.length > 0) {
        return res.status(400).json({
          error: `Required fields missing: ${missingFields.join(', ')}`,
          missingFields,
        });
      }
    } catch (configErr) {
      // Don't block lead creation if field config check fails
      console.warn('Field config validation warning:', configErr.message);
    }

    // Determine target org: SUPER_ADMIN can target a division.
    // If SUPER_ADMIN doesn't specify a division, fall back to the first child
    // division instead of the GROUP org (which has no pipeline stages).
    let targetOrgId = req.orgId;
    if (req.isSuperAdmin) {
      if (data.divisionId) {
        targetOrgId = data.divisionId;
      } else {
        // Find the first child division under the group
        const firstDivision = await prisma.organization.findFirst({
          where: { parentId: req.user.organizationId, type: 'DIVISION' },
          select: { id: true },
          orderBy: { name: 'asc' },
        });
        if (firstDivision) targetOrgId = firstDivision.id;
      }
    }
    delete data.divisionId;


    // Auto-assign if no assignee specified — uses org's configured allocation method
    if (!data.assignedToId) {
      try {
        const orgSettings = await prisma.organization.findUnique({
          where: { id: targetOrgId },
          select: { settings: true }
        });
        const rules = (orgSettings?.settings)?.allocationRules;
        if (rules?.autoAssignOnCreate !== false) {
          const assigneeId = await getNextAssignee(targetOrgId, data);
          if (assigneeId) data.assignedToId = assigneeId;
        }
      } catch (autoAssignErr) {
        // Non-critical: continue without auto-assignment
      }
    }

    // Duplicate detection
    const duplicates = await detectDuplicates(targetOrgId, {
      email: data.email,
      phone: data.phone,
    });

    if (duplicates.length > 0) {
      return res.status(409).json({
        error: 'Potential duplicate leads found',
        duplicates,
      });
    }

    // Get default stage if not specified
    if (!data.stageId) {
      const defaultStage = await prisma.pipelineStage.findFirst({
        where: { organizationId: targetOrgId, isDefault: true },
      });
      if (defaultStage) data.stageId = defaultStage.id;
    }

    // Calculate lead score
    const score = calculateLeadScore(data);
    const conversionProb = predictConversion(score, 'NEW');

    const { tags: tagNames, ...leadData } = data;

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          ...leadData,
          score,
          conversionProb,
          organizationId: targetOrgId,
          createdById: req.user.id,
        },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          stage: { select: { id: true, name: true, color: true } },
        },
      });

      // Create tags
      if (tagNames && tagNames.length > 0) {
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: targetOrgId, name } },
            create: { name, organizationId: targetOrgId },
            update: {},
          });
          await tx.leadTag.create({
            data: { leadId: created.id, tagId: tag.id },
          });
        }
      }

      // Create activity
      await tx.leadActivity.create({
        data: {
          leadId: created.id,
          userId: req.user.id,
          type: 'STATUS_CHANGE',
          description: `Lead created with status NEW`,
        },
      });

      return created;
    });

    // Notify assigned user (websocket — existing)
    if (lead.assignedToId && lead.assignedToId !== req.user.id) {
      notifyUser(lead.assignedToId, {
        type: 'lead_assigned',
        lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      });
    }

    await createAuditLog({
      userId: req.user.id,
      organizationId: targetOrgId,
      action: 'CREATE',
      entity: 'Lead',
      entityId: lead.id,
      newData: lead,
      req,
    });

    res.status(201).json(lead);

    // ── Fire-and-forget notifications ──
    // Notify assigned user (if different from creator)
    if (lead.assignedToId && lead.assignedToId !== req.user.id) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'New Lead Assigned',
        message: `${getDisplayName(req.user)} assigned lead ${getDisplayName(lead)} to you`,
        userId: lead.assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: lead.id,
        organizationId: targetOrgId,
      }).catch(() => {});
    }

    // Notify org admins about new lead
    notifyOrgAdmins(targetOrgId, {
      type: NOTIFICATION_TYPES.LEAD_CREATED,
      title: 'New Lead Created',
      message: `${getDisplayName(req.user)} created lead ${getDisplayName(lead)}`,
      entityType: 'lead',
      entityId: lead.id,
    }, req.user.id).catch(() => {});

    // Fire automation rules
    executeAutomations('LEAD_CREATED', { organizationId: targetOrgId, lead }).catch(() => {});

    // Broadcast data change to all org users
    broadcastDataChange(targetOrgId, 'lead', 'created', req.user.id, { entityId: lead.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Update Lead ─────────────────────────────────────────────────
router.put('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const updateWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) updateWhere.assignedToId = req.user.id;

    const existing = await prisma.lead.findFirst({
      where: updateWhere,
    });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const data = req.validated;
    delete data.divisionId; // not applicable for update

    // Smart-split unified "name" field into firstName / lastName
    if (data.name) {
      const parts = data.name.trim().split(/\s+/);
      if (parts.length === 1) {
        data.firstName = parts[0];
        data.lastName = '';
      } else {
        data.lastName = parts.pop();
        data.firstName = parts.join(' ');
      }
      delete data.name;
    }
    if (data.lastName === undefined || data.lastName === null) data.lastName = '';

    const { tags: tagNames, ...updateData } = data;

    // Score will be recalculated AFTER save via rescoreAndPersist
    // so the new pipeline position, status, and profile data are all captured.
    // We skip pre-save scoring to avoid stale pipeline position issues.

    // Handle won/lost timestamps
    if (updateData.status === 'WON' && existing.status !== 'WON') {
      updateData.wonAt = new Date();
      updateData.lostAt = null;  // Clear lost if re-won
    } else if (updateData.status === 'LOST' && existing.status !== 'LOST') {
      updateData.lostAt = new Date();
      updateData.wonAt = null;   // Clear won if lost
    } else if (updateData.status && updateData.status !== 'WON' && updateData.status !== 'LOST') {
      // Moving away from terminal status — clear both dates (deal re-opened)
      if (existing.status === 'WON') updateData.wonAt = null;
      if (existing.status === 'LOST') updateData.lostAt = null;
    }

    // Mark first response — any status change from NEW counts as "responded"
    if (!existing.firstRespondedAt && updateData.status && updateData.status !== 'NEW') {
      updateData.firstRespondedAt = new Date();
      updateData.slaStatus = 'RESPONDED';
    }

    // ── Reverse sync: status change → find matching pipeline stage ──
    if (updateData.status && updateData.status !== existing.status && !updateData.stageId) {
      const statusToKeywords = {
        NEW:       ['new', 'untouched', 'fresh', 'incoming'],
        CONTACTED: ['contact', 'touched', 'follow', 'reach', 'called', 'engaged'],
        QUALIFIED: ['qualif', 'interested', 'hot', 'warm', 'ready'],
        WON:       ['won', 'converted', 'signed', 'closed won'],
        LOST:      ['lost', 'dead', 'rejected', 'disqualif', 'closed lost'],
      };

      const keywords = statusToKeywords[updateData.status] || [];
      if (keywords.length > 0) {
        const orgStages = await prisma.pipelineStage.findMany({
          where: { organizationId: existing.organizationId },
          orderBy: { order: 'asc' },
        });

        // Find best matching stage by keyword
        let matchedStage = null;
        for (const stage of orgStages) {
          const sName = stage.name.toLowerCase();
          if (keywords.some(kw => sName.includes(kw))) {
            matchedStage = stage;
            break;
          }
        }

        // Also check isWonStage / isLostStage flags
        if (!matchedStage && updateData.status === 'WON') {
          matchedStage = orgStages.find(s => s.isWonStage);
        }
        if (!matchedStage && updateData.status === 'LOST') {
          matchedStage = orgStages.find(s => s.isLostStage);
        }

        if (matchedStage && matchedStage.id !== existing.stageId) {
          updateData.stageId = matchedStage.id;
        }
      }
    }

    // Handle tag updates if provided
    if (tagNames && Array.isArray(tagNames)) {
      // Remove all existing tags
      await prisma.leadTag.deleteMany({ where: { leadId: existing.id } });
      // Add new tags
      for (const name of tagNames) {
        const tag = await prisma.tag.upsert({
          where: { organizationId_name: { organizationId: existing.organizationId, name: name.trim() } },
          create: { name: name.trim(), organizationId: existing.organizationId },
          update: {},
        });
        await prisma.leadTag.create({ data: { leadId: existing.id, tagId: tag.id } });
      }
    }

    const lead = await prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
        },
      });

      // Log status change
      if (data.status && data.status !== existing.status) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'STATUS_CHANGE',
            description: `Status changed from ${existing.status} to ${data.status}`,
          },
        });
      }

      // Log stage change
      if (data.stageId && data.stageId !== existing.stageId) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'STAGE_CHANGE',
            description: `Pipeline stage changed`,
          },
        });
      }

      // Log assignment change
      if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
        await tx.leadActivity.create({
          data: {
            leadId: existing.id,
            userId: req.user.id,
            type: 'ASSIGNMENT_CHANGED',
            description: `Lead reassigned`,
          },
        });

        notifyUser(data.assignedToId, {
          type: 'lead_assigned',
          lead: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName },
        });
      }

      // Update tags — use the lead's own organizationId for tag scoping
      if (tagNames) {
        await tx.leadTag.deleteMany({ where: { leadId: existing.id } });
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: existing.organizationId, name } },
            create: { name, organizationId: existing.organizationId },
            update: {},
          });
          await tx.leadTag.create({ data: { leadId: existing.id, tagId: tag.id } });
        }
      }

      return updated;
    });

    await createAuditLog({
      userId: req.user.id,
      organizationId: existing.organizationId,
      action: 'UPDATE',
      entity: 'Lead',
      entityId: lead.id,
      oldData: existing,
      newData: lead,
      req,
    });

    res.json(lead);

    // ── Fire-and-forget rescore with SAVED data ──
    // This ensures pipeline position, status, and profile changes
    // are all reflected in the score. Score updates are persisted
    // asynchronously — the response has the lead data, next view
    // shows the accurate score.
    rescoreAndPersist(lead.id).catch(err =>
      logger.error('Post-update rescore failed:', err.message)
    );

    // ── Fire-and-forget notifications ──
    const leadName = getDisplayName(lead);
    const actorName = getDisplayName(req.user);

    // Status changed notification
    if (data.status && data.status !== existing.status) {
      // General status change → notify lead owner
      if (existing.assignedToId && existing.assignedToId !== req.user.id) {
        createNotification({
          type: NOTIFICATION_TYPES.LEAD_STATUS_CHANGED,
          title: 'Lead Status Changed',
          message: `${actorName} changed ${leadName} status to ${data.status}`,
          userId: existing.assignedToId,
          actorId: req.user.id,
          entityType: 'lead',
          entityId: lead.id,
          organizationId: existing.organizationId,
        }).catch(() => {});
      }

      // Won → notify team
      if (data.status === 'WON' && existing.status !== 'WON') {
        notifyTeamMembers(existing.organizationId, {
          type: NOTIFICATION_TYPES.LEAD_WON,
          title: '🎉 Lead Won!',
          message: `${leadName} marked as Won by ${actorName}`,
          entityType: 'lead',
          entityId: lead.id,
        }, req.user.id).catch(() => {});
      }

      // Lost → notify lead owner
      if (data.status === 'LOST' && existing.status !== 'LOST') {
        if (existing.assignedToId && existing.assignedToId !== req.user.id) {
          createNotification({
            type: NOTIFICATION_TYPES.LEAD_LOST,
            title: 'Lead Lost',
            message: `${leadName} marked as Lost`,
            userId: existing.assignedToId,
            actorId: req.user.id,
            entityType: 'lead',
            entityId: lead.id,
            organizationId: existing.organizationId,
          }).catch(() => {});
        }
      }
    }

    // Assignment changed → notify new assignee
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Assigned to You',
        message: `${actorName} assigned ${leadName} to you`,
        userId: data.assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: lead.id,
        organizationId: existing.organizationId,
      }).catch(() => {});
    }

    // Score changed significantly (>10 points) → notify lead owner
    if (existing.score !== null && updateData.score !== undefined) {
      const scoreDiff = Math.abs((updateData.score || 0) - (existing.score || 0));
      if (scoreDiff > 10 && existing.assignedToId) {
        createNotification({
          type: NOTIFICATION_TYPES.LEAD_SCORE_CHANGED,
          title: 'Lead Score Updated',
          message: `${leadName} score updated to ${updateData.score}`,
          userId: existing.assignedToId,
          actorId: req.user.id,
          entityType: 'lead',
          entityId: lead.id,
          organizationId: existing.organizationId,
        }).catch(() => {});
      }
    }

    // ── Fire automation rules ──
    const autoCtx = { organizationId: existing.organizationId, lead, previousData: existing };
    if (data.status && data.status !== existing.status) {
      executeAutomations('LEAD_STATUS_CHANGED', autoCtx).catch(() => {});
    }
    if (data.assignedToId && data.assignedToId !== existing.assignedToId) {
      executeAutomations('LEAD_ASSIGNED', autoCtx).catch(() => {});
    }
    if (updateData.score !== undefined && updateData.score !== existing.score) {
      executeAutomations('LEAD_SCORE_CHANGED', autoCtx).catch(() => {});
    }

    // Broadcast data change to all org users
    broadcastDataChange(existing.organizationId, 'lead', 'updated', req.user.id, { entityId: lead.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Delete (Archive) Lead ───────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const deleteWhere = { id: req.params.id, organizationId: { in: req.orgIds } };
    if (req.isRestrictedRole) deleteWhere.assignedToId = req.user.id;

    const lead = await prisma.lead.findFirst({
      where: deleteWhere,
    });
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    await prisma.lead.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    await createAuditLog({
      userId: req.user.id,
      organizationId: lead.organizationId,
      action: 'ARCHIVE',
      entity: 'Lead',
      entityId: req.params.id,
      req,
    });

    res.json({ message: 'Lead archived' });

    broadcastDataChange(lead.organizationId, 'lead', 'deleted', req.user.id, { entityId: req.params.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Add Note ────────────────────────────────────────────────────
router.post('/:id/notes', validate(z.object({
  content: z.string().min(1),
  isPinned: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const note = await prisma.leadNote.create({
      data: {
        content: req.validated.content,
        isPinned: req.validated.isPinned || false,
        leadId: lead.id,
        userId: req.user.id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'NOTE_ADDED',
        description: 'Note added',
      },
    });

    // Mark first response — adding a note counts as attending to the lead
    if (!lead.firstRespondedAt) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { firstRespondedAt: new Date(), slaStatus: 'RESPONDED' },
      });
    }

    res.status(201).json(note);

    broadcastDataChange(lead.organizationId, 'note', 'created', req.user.id, { entityId: lead.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Bulk Update Leads ───────────────────────────────────────────

// ---------------------------------------------------------------------------
// POST /:id/reassign — Reassign a lead to a different team member
// ---------------------------------------------------------------------------

router.post('/:id/reassign', validate(z.object({
  assignedToId: z.string().refine(v => v === '__auto__' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), { message: 'Must be a valid UUID or __auto__' }),
  reason: z.string().max(500).optional(),
})), async (req, res, next) => {
  try {
    let { assignedToId, reason } = req.validated;
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Handle auto-assign: find best user via org's configured allocation rules
    if (assignedToId === '__auto__') {
      // Try lead's own org first
      let autoId = await getNextAssignee(lead.organizationId, lead);
      // If no users in lead's org, try other orgs in scope
      if (!autoId && req.orgIds.length > 1) {
        for (const altOrgId of req.orgIds) {
          if (altOrgId === lead.organizationId) continue;
          autoId = await getNextAssignee(altOrgId, lead);
          if (autoId) break;
        }
      }
      if (!autoId) {
        return res.status(400).json({ error: 'No eligible team members found for auto-assignment' });
      }
      assignedToId = autoId;
    }

    const previousAssignee = lead.assignedTo;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: req.params.id },
        data: { assignedToId },
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
        },
      });

      const prevName = previousAssignee ? getDisplayName(previousAssignee) : 'Unassigned';
      const newName = getDisplayName(result.assignedTo);

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: req.user.id,
          type: 'ASSIGNMENT_CHANGED',
          description: reason
            ? `Reassigned from ${prevName} to ${newName}. Reason: ${reason}`
            : `Reassigned from ${prevName} to ${newName}`,
          metadata: {
            previousAssigneeId: previousAssignee?.id || null,
            newAssigneeId: assignedToId,
            reason: reason || null,
          },
        },
      });

      return result;
    });

    // Notify new assignee
    if (assignedToId !== req.user.id) {
      notifyUser(assignedToId, {
        type: 'lead_assigned',
        lead: { id: updated.id, firstName: updated.firstName, lastName: updated.lastName },
      });
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Reassigned to You',
        message: `${getDisplayName(req.user)} reassigned ${getDisplayName(updated)} to you${reason ? '. Reason: ' + reason : ''}`,
        userId: assignedToId,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: updated.id,
        organizationId: lead.organizationId,
      }).catch(() => {});
    }

    // Notify previous assignee
    if (previousAssignee && previousAssignee.id !== req.user.id && previousAssignee.id !== assignedToId) {
      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'Lead Reassigned',
        message: `${getDisplayName(req.user)} reassigned ${getDisplayName(updated)} to another team member${reason ? '. Reason: ' + reason : ''}`,
        userId: previousAssignee.id,
        actorId: req.user.id,
        entityType: 'lead',
        entityId: updated.id,
        organizationId: lead.organizationId,
      }).catch(() => {});
    }

    await createAuditLog({
      userId: req.user.id,
      organizationId: lead.organizationId,
      action: 'REASSIGN',
      entity: 'Lead',
      entityId: lead.id,
      oldData: { assignedToId: previousAssignee?.id },
      newData: { assignedToId, reason },
      req,
    });

    res.json(updated);

    broadcastDataChange(lead.organizationId, 'lead', 'updated', req.user.id, { entityId: updated.id }).catch(() => {});
  } catch (err) { next(err); }
});

router.patch('/bulk', validate(z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(100),
  data: updateLeadSchema,
})), async (req, res, next) => {
  try {
    const { leadIds, data } = req.validated;
    delete data.divisionId;

    await prisma.lead.updateMany({
      where: { id: { in: leadIds }, organizationId: { in: req.orgIds } },
      data,
    });

    res.json({ message: `${leadIds.length} leads updated` });

    // ── Fire-and-forget notification ──
    notifyOrgAdmins(req.user.organizationId, {
      type: NOTIFICATION_TYPES.LEAD_STATUS_CHANGED,
      title: 'Bulk Lead Update',
      message: `${getDisplayName(req.user)} updated ${leadIds.length} leads`,
      entityType: 'lead',
      entityId: null,
    }, req.user.id).catch(() => {});

    broadcastDataChange(req.user.organizationId, 'lead', 'bulk_updated', req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Block Lead (Do Not Call) ────────────────────────────────────
router.post('/:id/block', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        doNotCall: true,
        doNotCallAt: new Date(),
        doNotCallById: req.user.id,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead manually blocked (Do Not Call) by ${getDisplayName(req.user)}`,
        metadata: { trigger: 'manual_block' },
      },
    });

    res.json({ success: true, message: 'Lead blocked — removed from active outreach' });
  } catch (err) {
    next(err);
  }
});

// ─── Unblock Lead (Remove Do Not Call) ───────────────────────────
router.post('/:id/unblock', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.doNotCall) return res.status(400).json({ error: 'Lead is not blocked' });

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        doNotCall: false,
        doNotCallAt: null,
        doNotCallById: null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user.id,
        type: 'STATUS_CHANGE',
        description: `Lead unblocked by ${getDisplayName(req.user)} — restored to active outreach`,
        metadata: { trigger: 'manual_unblock' },
      },
    });

    res.json({ success: true, message: 'Lead unblocked — restored to active leads' });
  } catch (err) {
    next(err);
  }
});

// ─── Rescore a single lead (GET score breakdown) ─────────────────
router.get('/:id/score', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await calculateFullScore(lead.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── Rescore a single lead and persist ──────────────────────────
router.post('/:id/rescore', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      select: { id: true, score: true },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const result = await rescoreAndPersist(lead.id);
    res.json({
      success: true,
      data: {
        previousScore: lead.score,
        newScore: result.score,
        conversionProb: result.conversionProb,
        breakdown: result.breakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Bulk rescore all leads in org ──────────────────────────────
router.post('/bulk/rescore', async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: { id: true },
    });

    let scored = 0;
    let errors = 0;
    for (const lead of leads) {
      try {
        await rescoreAndPersist(lead.id);
        scored++;
      } catch {
        errors++;
      }
    }

    res.json({
      success: true,
      data: { total: leads.length, scored, errors },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
