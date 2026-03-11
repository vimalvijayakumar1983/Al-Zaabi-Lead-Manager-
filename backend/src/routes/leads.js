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
  minScore: z.coerce.number().optional(),
  maxScore: z.coerce.number().optional(),
});

// ─── List Leads ──────────────────────────────────────────────────
router.get('/', validateQuery(leadFilterSchema), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder, search, status, source, assignedToId, stageId, tag, minScore, maxScore } = req.validatedQuery;

    const where = {
      organizationId: req.orgId,
      isArchived: false,
    };

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
      ];
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

// ─── Get Lead by ID ──────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, organizationId: req.orgId },
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

    // Duplicate detection
    const duplicates = await detectDuplicates(req.orgId, {
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
        where: { organizationId: req.orgId, isDefault: true },
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
          organizationId: req.orgId,
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
            where: { organizationId_name: { organizationId: req.orgId, name } },
            create: { name, organizationId: req.orgId },
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
      organizationId: req.orgId,
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
      where: { id: req.params.id, organizationId: req.orgId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const data = req.validated;
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

      // Update tags
      if (tagNames) {
        await tx.leadTag.deleteMany({ where: { leadId: existing.id } });
        for (const name of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: req.orgId, name } },
            create: { name, organizationId: req.orgId },
            update: {},
          });
          await tx.leadTag.create({ data: { leadId: existing.id, tagId: tag.id } });
        }
      }

      return updated;
    });

    await createAuditLog({
      userId: req.user.id,
      organizationId: req.orgId,
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
      where: { id: req.params.id, organizationId: req.orgId },
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
      organizationId: req.orgId,
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
      where: { id: req.params.id, organizationId: req.orgId },
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

    await prisma.lead.updateMany({
      where: { id: { in: leadIds }, organizationId: req.orgId },
      data,
    });

    res.json({ message: `${leadIds.length} leads updated` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
