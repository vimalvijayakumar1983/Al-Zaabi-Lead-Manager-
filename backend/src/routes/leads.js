const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');
const { detectDuplicates } = require('../utils/duplicateDetection');
const { createAuditLog } = require('../middleware/auditLog');
const { notifyUser } = require('../websocket/server');

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
    'GOOGLE_ADS', 'MANUAL', 'CSV_IMPORT', 'API', 'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
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

    // Optional: filter to specific division
    if (divisionId && req.isSuperAdmin) {
      where.organizationId = divisionId;
    }

    if (status) where.status = status;
    if (source) where.source = source;
    if (assignedToId) where.assignedToId = assignedToId;
    if (stageId) where.stageId = stageId;
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
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
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

    // Notify assigned user
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
  } catch (err) {
    next(err);
  }
});

// ─── Update Lead ─────────────────────────────────────────────────
router.put('/:id', validate(updateLeadSchema), async (req, res, next) => {
  try {
    const existing = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
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
  } catch (err) {
    next(err);
  }
});

// ─── Delete (Archive) Lead ───────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
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
  } catch (err) {
    next(err);
  }
});

// ─── Bulk Update Leads ───────────────────────────────────────────
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
  } catch (err) {
    next(err);
  }
});

module.exports = router;
