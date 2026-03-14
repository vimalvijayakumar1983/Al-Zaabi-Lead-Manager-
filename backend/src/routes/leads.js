const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');
const { detectDuplicates } = require('../utils/duplicateDetection');
const { createAuditLog } = require('../middleware/auditLog');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { autoAssign, getNextAssignee } = require('../services/leadAssignment');
const { executeAutomations } = require('../services/automationEngine');

const router = Router();
router.use(authenticate, orgScope);

// ─── Schemas ─────────────────────────────────────────────────────
const createLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  source: z.enum([
    'WEBSITE_FORM', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
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
});

// ─── List Leads ──────────────────────────────────────────────────
router.get('/', validateQuery(leadFilterSchema), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder, search, status, source, assignedToId, stageId, tag, tags, minScore, maxScore, dateFrom, dateTo, company, jobTitle, location, campaign, productInterest, budgetMin, budgetMax, minBudget, maxBudget, hasEmail, hasPhone, conversionMin, conversionMax, customField, divisionId } = req.validatedQuery;

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
    };

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
    if (assignedToId && !req.isRestrictedRole) where.assignedToId = assignedToId;
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

    // Date range
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo + 'T23:59:59.999Z');
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

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          stage: { select: { id: true, name: true, color: true } },
          tags: { include: { tag: true } },
          _count: { select: { activities: true, tasks: true, communications: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      prisma.lead.count({ where }),
    ]);

    res.json(paginatedResponse(leads, total, page, limit));
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
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// ─── Create Lead ─────────────────────────────────────────────────
router.post('/', validate(createLeadSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    // Determine target org: SUPER_ADMIN can target a division
    const targetOrgId = (req.isSuperAdmin && data.divisionId) ? data.divisionId : req.orgId;
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
        message: `${req.user.firstName} ${req.user.lastName} assigned lead ${lead.firstName} ${lead.lastName} to you`,
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
      message: `${req.user.firstName} ${req.user.lastName} created lead ${lead.firstName} ${lead.lastName}`,
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
    const { tags: tagNames, ...updateData } = data;

    // Recalculate score if relevant fields change
    const merged = { ...existing, ...updateData };
    const activityCount = await prisma.leadActivity.count({ where: { leadId: existing.id } });
    updateData.score = calculateLeadScore(merged, activityCount);
    updateData.conversionProb = predictConversion(updateData.score, updateData.status || existing.status);

    // Handle won/lost timestamps
    if (updateData.status === 'WON' && existing.status !== 'WON') {
      updateData.wonAt = new Date();
    }
    if (updateData.status === 'LOST' && existing.status !== 'LOST') {
      updateData.lostAt = new Date();
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

    // ── Fire-and-forget notifications ──
    const leadName = `${lead.firstName} ${lead.lastName}`;
    const actorName = `${req.user.firstName} ${req.user.lastName}`;

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

      const prevName = previousAssignee ? `${previousAssignee.firstName} ${previousAssignee.lastName}` : 'Unassigned';
      const newName = `${result.assignedTo.firstName} ${result.assignedTo.lastName}`;

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
        message: `${req.user.firstName} ${req.user.lastName} reassigned ${updated.firstName} ${updated.lastName} to you${reason ? '. Reason: ' + reason : ''}`,
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
        message: `${req.user.firstName} ${req.user.lastName} reassigned ${updated.firstName} ${updated.lastName} to another team member${reason ? '. Reason: ' + reason : ''}`,
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
      message: `${req.user.firstName} ${req.user.lastName} updated ${leadIds.length} leads`,
      entityType: 'lead',
      entityId: null,
    }, req.user.id).catch(() => {});

    broadcastDataChange(req.user.organizationId, 'lead', 'bulk_updated', req.user.id).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
