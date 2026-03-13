const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginationSchema, paginate, paginatedResponse } = require('../utils/pagination');
const { createAuditLog } = require('../middleware/auditLog');
const { logger } = require('../config/logger');

const router = Router();
router.use(authenticate, orgScope);

// ─── Validation Schemas ──────────────────────────────────────────

const contactSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  mobile: z.string().max(30).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  department: z.string().max(200).optional().nullable(),
  source: z.enum([
    'WEBSITE_FORM', 'LANDING_PAGE', 'WHATSAPP', 'FACEBOOK_ADS',
    'GOOGLE_ADS', 'TIKTOK_ADS', 'MANUAL', 'CSV_IMPORT', 'API',
    'REFERRAL', 'EMAIL', 'PHONE', 'OTHER',
  ]).optional(),
  lifecycle: z.enum([
    'SUBSCRIBER', 'LEAD', 'MARKETING_QUALIFIED', 'SALES_QUALIFIED',
    'OPPORTUNITY', 'CUSTOMER', 'EVANGELIST', 'OTHER',
  ]).optional(),
  type: z.enum(['PROSPECT', 'CUSTOMER', 'PARTNER', 'VENDOR', 'INFLUENCER', 'OTHER']).optional(),
  salutation: z.string().max(20).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  website: z.string().max(500).optional().nullable(),
  linkedin: z.string().max(500).optional().nullable(),
  twitter: z.string().max(500).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  doNotEmail: z.boolean().optional(),
  doNotCall: z.boolean().optional(),
  hasOptedOutEmail: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  customData: z.record(z.unknown()).optional(),
});

const updateContactSchema = contactSchema.partial();

const listContactsSchema = paginationSchema.extend({
  lifecycle: z.string().optional(),
  type: z.string().optional(),
  source: z.string().optional(),
  ownerId: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  tag: z.string().optional(),
  tags: z.string().optional(),
  hasEmail: z.string().optional(),
  hasPhone: z.string().optional(),
  doNotEmail: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minScore: z.string().optional(),
  maxScore: z.string().optional(),
});

const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  lifecycle: z.enum([
    'SUBSCRIBER', 'LEAD', 'MARKETING_QUALIFIED', 'SALES_QUALIFIED',
    'OPPORTUNITY', 'CUSTOMER', 'EVANGELIST', 'OTHER',
  ]).optional(),
  type: z.enum(['PROSPECT', 'CUSTOMER', 'PARTNER', 'VENDOR', 'INFLUENCER', 'OTHER']).optional(),
  createDeal: z.boolean().optional(),
  dealName: z.string().optional(),
  dealAmount: z.number().optional(),
});

const mergeContactsSchema = z.object({
  primaryContactId: z.string().uuid(),
  secondaryContactId: z.string().uuid(),
  fieldsToKeep: z.record(z.enum(['primary', 'secondary'])).optional(),
});

// ─── GET / — List Contacts ──────────────────────────────────────

router.get('/', validateQuery(listContactsSchema), async (req, res, next) => {
  try {
    const q = req.validatedQuery || req.query;
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', search } = q;
    const { skip, take } = paginate(page, limit);

    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
    };

    // Text search
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { mobile: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filters
    if (q.lifecycle) {
      const vals = q.lifecycle.split(',');
      where.lifecycle = vals.length > 1 ? { in: vals } : vals[0];
    }
    if (q.type) {
      const vals = q.type.split(',');
      where.type = vals.length > 1 ? { in: vals } : vals[0];
    }
    if (q.source) {
      const vals = q.source.split(',');
      where.source = vals.length > 1 ? { in: vals } : vals[0];
    }
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.company) where.company = { contains: q.company, mode: 'insensitive' };
    if (q.city) where.city = { contains: q.city, mode: 'insensitive' };
    if (q.country) where.country = { contains: q.country, mode: 'insensitive' };
    if (q.hasEmail === 'true') where.email = { not: null };
    if (q.hasPhone === 'true') where.OR = [{ phone: { not: null } }, { mobile: { not: null } }];
    if (q.doNotEmail === 'true') where.doNotEmail = true;
    if (q.doNotEmail === 'false') where.doNotEmail = false;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }
    if (q.minScore || q.maxScore) {
      where.score = {};
      if (q.minScore) where.score.gte = parseInt(q.minScore, 10);
      if (q.maxScore) where.score.lte = parseInt(q.maxScore, 10);
    }
    if (q.tag) {
      where.tags = { some: { tag: { name: q.tag } } };
    }
    if (q.tags) {
      const tagNames = q.tags.split(',');
      where.tags = { some: { tag: { name: { in: tagNames } } } };
    }

    // Sort
    const orderBy = {};
    const validSorts = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'company', 'lifecycle', 'score', 'lastContactedAt'];
    orderBy[validSorts.includes(sortBy) ? sortBy : 'createdAt'] = sortOrder === 'asc' ? 'asc' : 'desc';

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          tags: { include: { tag: true } },
          _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json(paginatedResponse(contacts, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// ─── GET /stats — Contact Statistics ────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const where = { organizationId: { in: req.orgIds }, isArchived: false };

    const [total, byLifecycle, byType, recentlyAdded, recentlyContacted] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.groupBy({ by: ['lifecycle'], where, _count: { _all: true } }),
      prisma.contact.groupBy({ by: ['type'], where, _count: { _all: true } }),
      prisma.contact.count({ where: { ...where, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      prisma.contact.count({ where: { ...where, lastContactedAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    ]);

    res.json({
      total,
      byLifecycle: byLifecycle.reduce((acc, r) => ({ ...acc, [r.lifecycle]: r._count._all }), {}),
      byType: byType.reduce((acc, r) => ({ ...acc, [r.type]: r._count._all }), {}),
      recentlyAdded,
      recentlyContacted,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /filter-values — Dynamic Filter Options ────────────────

router.get('/filter-values', async (req, res, next) => {
  try {
    const where = { organizationId: { in: req.orgIds }, isArchived: false };

    const [companies, cities, countries, tags, users] = await Promise.all([
      prisma.contact.findMany({ where: { ...where, company: { not: null } }, select: { company: true }, distinct: ['company'], take: 100 }),
      prisma.contact.findMany({ where: { ...where, city: { not: null } }, select: { city: true }, distinct: ['city'], take: 100 }),
      prisma.contact.findMany({ where: { ...where, country: { not: null } }, select: { country: true }, distinct: ['country'], take: 100 }),
      prisma.tag.findMany({ where: { organizationId: { in: req.orgIds }, contacts: { some: {} } }, select: { id: true, name: true, color: true } }),
      prisma.user.findMany({ where: { organizationId: { in: req.orgIds }, isActive: true }, select: { id: true, firstName: true, lastName: true } }),
    ]);

    res.json({
      companies: companies.map(c => c.company).filter(Boolean),
      cities: cities.map(c => c.city).filter(Boolean),
      countries: countries.map(c => c.country).filter(Boolean),
      tags,
      users,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /search/global — Global Contact Search ─────────────────

router.get('/search/global', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: { in: req.orgIds },
        isArchived: false,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { company: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        tags: { include: { tag: true } },
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    res.json(contacts);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id — Contact Detail ──────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        convertedFromLead: { select: { id: true, firstName: true, lastName: true, status: true } },
        tags: { include: { tag: true } },
        activities: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        notes: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        },
        tasks: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { dueAt: 'asc' },
          take: 20,
        },
        deals: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
      },
    });

    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

// ─── POST / — Create Contact ────────────────────────────────────

router.post('/', validate(contactSchema), async (req, res, next) => {
  try {
    const data = req.validated;
    const tagNames = data.tags || [];
    delete data.tags;

    // Duplicate detection
    if (data.email) {
      const existing = await prisma.contact.findFirst({
        where: { email: data.email, organizationId: { in: req.orgIds }, isArchived: false },
      });
      if (existing) {
        return res.status(409).json({
          error: 'A contact with this email already exists',
          existingContact: { id: existing.id, firstName: existing.firstName, lastName: existing.lastName },
        });
      }
    }

    const contact = await prisma.$transaction(async (tx) => {
      // Create contact
      const created = await tx.contact.create({
        data: {
          ...data,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          organizationId: req.orgId,
          createdById: req.user.id,
          ownerId: data.ownerId || req.user.id,
        },
      });

      // Handle tags
      if (tagNames.length > 0) {
        for (const tagName of tagNames) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: req.orgId, name: tagName } },
            create: { name: tagName, organizationId: req.orgId },
            update: {},
          });
          await tx.contactTag.create({ data: { contactId: created.id, tagId: tag.id } });
        }
      }

      // Activity log
      await tx.contactActivity.create({
        data: {
          contactId: created.id,
          userId: req.user.id,
          type: 'CUSTOM',
          description: 'Contact created',
        },
      });

      return created;
    });

    // Fetch with relations
    const full = await prisma.contact.findUnique({
      where: { id: contact.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        tags: { include: { tag: true } },
        _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
      },
    });

    createAuditLog({
      userId: req.user.id, organizationId: req.orgId,
      action: 'create', entity: 'contact', entityId: contact.id,
      newData: data, req,
    });

    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id — Update Contact ──────────────────────────────────

router.put('/:id', validate(updateContactSchema), async (req, res, next) => {
  try {
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
      include: { tags: { include: { tag: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const data = req.validated;
    const tagNames = data.tags;
    delete data.tags;

    if (data.dateOfBirth) data.dateOfBirth = new Date(data.dateOfBirth);

    const contact = await prisma.$transaction(async (tx) => {
      const updated = await tx.contact.update({
        where: { id: req.params.id },
        data,
      });

      // Handle tags if provided
      if (tagNames !== undefined) {
        await tx.contactTag.deleteMany({ where: { contactId: req.params.id } });
        for (const tagName of tagNames || []) {
          const tag = await tx.tag.upsert({
            where: { organizationId_name: { organizationId: req.orgId, name: tagName } },
            create: { name: tagName, organizationId: req.orgId },
            update: {},
          });
          await tx.contactTag.create({ data: { contactId: req.params.id, tagId: tag.id } });
        }
      }

      // Track changes
      const changes = [];
      if (data.lifecycle && data.lifecycle !== existing.lifecycle) changes.push(`Lifecycle: ${existing.lifecycle} → ${data.lifecycle}`);
      if (data.type && data.type !== existing.type) changes.push(`Type: ${existing.type} → ${data.type}`);
      if (data.ownerId && data.ownerId !== existing.ownerId) changes.push('Owner reassigned');

      if (changes.length > 0) {
        await tx.contactActivity.create({
          data: {
            contactId: req.params.id,
            userId: req.user.id,
            type: changes.some(c => c.includes('Lifecycle')) ? 'STATUS_CHANGE' : 'CUSTOM',
            description: changes.join('; '),
            metadata: { changes },
          },
        });
      }

      return updated;
    });

    const full = await prisma.contact.findUnique({
      where: { id: contact.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        tags: { include: { tag: true } },
        _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
      },
    });

    createAuditLog({
      userId: req.user.id, organizationId: req.orgId,
      action: 'update', entity: 'contact', entityId: contact.id,
      oldData: existing, newData: data, req,
    });

    res.json(full);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id — Archive Contact ──────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    await prisma.contact.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    createAuditLog({
      userId: req.user.id, organizationId: req.orgId,
      action: 'delete', entity: 'contact', entityId: req.params.id, req,
    });

    res.json({ message: 'Contact archived' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/notes — Add Note ────────────────────────────────

router.post('/:id/notes', validate(z.object({
  content: z.string().min(1),
  isPinned: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const [note] = await prisma.$transaction([
      prisma.contactNote.create({
        data: {
          content: req.validated.content,
          isPinned: req.validated.isPinned || false,
          contactId: req.params.id,
          userId: req.user.id,
        },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.contactActivity.create({
        data: {
          contactId: req.params.id,
          userId: req.user.id,
          type: 'NOTE_ADDED',
          description: `Note added: ${req.validated.content.substring(0, 80)}`,
        },
      }),
    ]);

    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

// ─── POST /convert-lead — Convert Lead to Contact ───────────────

router.post('/convert-lead', validate(convertLeadSchema), async (req, res, next) => {
  try {
    const { leadId, lifecycle, type, createDeal, dealName, dealAmount } = req.validated;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
      include: { tags: { include: { tag: true } } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Check if already converted
    const alreadyConverted = await prisma.contact.findFirst({
      where: { convertedFromLeadId: leadId },
    });
    if (alreadyConverted) {
      return res.status(409).json({
        error: 'This lead has already been converted to a contact',
        contactId: alreadyConverted.id,
      });
    }

    const contact = await prisma.$transaction(async (tx) => {
      // Create the contact from lead data
      const created = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          jobTitle: lead.jobTitle,
          source: lead.source,
          lifecycle: lifecycle || 'CUSTOMER',
          type: type || 'CUSTOMER',
          score: lead.score,
          website: lead.website,
          location: lead.location ? undefined : undefined,
          customData: lead.customData || {},
          organizationId: lead.organizationId,
          ownerId: lead.assignedToId || req.user.id,
          createdById: req.user.id,
          convertedFromLeadId: leadId,
        },
      });

      // Copy tags
      for (const lt of lead.tags || []) {
        await tx.contactTag.create({
          data: { contactId: created.id, tagId: lt.tagId },
        }).catch(() => {}); // Ignore if tag link already exists
      }

      // Mark lead as WON
      await tx.lead.update({
        where: { id: leadId },
        data: { status: 'WON', wonAt: new Date() },
      });

      // Activity on contact
      await tx.contactActivity.create({
        data: {
          contactId: created.id,
          userId: req.user.id,
          type: 'CUSTOM',
          description: `Converted from lead: ${lead.firstName} ${lead.lastName}`,
          metadata: { leadId, leadStatus: lead.status },
        },
      });

      // Create deal if requested
      if (createDeal) {
        await tx.deal.create({
          data: {
            name: dealName || `${lead.company || lead.firstName} - Deal`,
            amount: dealAmount || lead.budget || null,
            contactId: created.id,
            organizationId: lead.organizationId,
            ownerId: lead.assignedToId || req.user.id,
          },
        });
      }

      return created;
    });

    const full = await prisma.contact.findUnique({
      where: { id: contact.id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        tags: { include: { tag: true } },
        deals: true,
        _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
      },
    });

    createAuditLog({
      userId: req.user.id, organizationId: req.orgId,
      action: 'convert_lead', entity: 'contact', entityId: contact.id,
      newData: { leadId, lifecycle, type }, req,
    });

    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
});

// ─── POST /merge — Merge Two Contacts ───────────────────────────

router.post('/merge', validate(mergeContactsSchema), async (req, res, next) => {
  try {
    const { primaryContactId, secondaryContactId, fieldsToKeep } = req.validated;

    const [primary, secondary] = await Promise.all([
      prisma.contact.findFirst({ where: { id: primaryContactId, organizationId: { in: req.orgIds } }, include: { tags: { include: { tag: true } } } }),
      prisma.contact.findFirst({ where: { id: secondaryContactId, organizationId: { in: req.orgIds } }, include: { tags: { include: { tag: true } } } }),
    ]);

    if (!primary || !secondary) return res.status(404).json({ error: 'One or both contacts not found' });

    // Build merged data
    const mergeFields = ['email', 'phone', 'mobile', 'company', 'jobTitle', 'department',
      'website', 'linkedin', 'twitter', 'address', 'city', 'state', 'country', 'postalCode', 'description'];

    const mergedData = {};
    for (const field of mergeFields) {
      if (fieldsToKeep?.[field] === 'secondary' && secondary[field]) {
        mergedData[field] = secondary[field];
      }
      // Otherwise keep primary's value (or fill from secondary if primary is null)
      else if (!primary[field] && secondary[field]) {
        mergedData[field] = secondary[field];
      }
    }

    // Take higher score
    mergedData.score = Math.max(primary.score, secondary.score);

    await prisma.$transaction(async (tx) => {
      // Update primary with merged data
      await tx.contact.update({ where: { id: primaryContactId }, data: mergedData });

      // Move secondary's tags to primary
      for (const ct of secondary.tags) {
        await tx.contactTag.create({
          data: { contactId: primaryContactId, tagId: ct.tagId },
        }).catch(() => {}); // Ignore duplicates
      }

      // Move secondary's tasks to primary
      await tx.task.updateMany({ where: { contactId: secondaryContactId }, data: { contactId: primaryContactId } });

      // Move secondary's deals to primary
      await tx.deal.updateMany({ where: { contactId: secondaryContactId }, data: { contactId: primaryContactId } });

      // Log merge activity
      await tx.contactActivity.create({
        data: {
          contactId: primaryContactId,
          userId: req.user.id,
          type: 'CUSTOM',
          description: `Merged with contact: ${secondary.firstName} ${secondary.lastName}`,
          metadata: { mergedContactId: secondaryContactId },
        },
      });

      // Archive secondary
      await tx.contact.update({ where: { id: secondaryContactId }, data: { isArchived: true } });
    });

    const merged = await prisma.contact.findUnique({
      where: { id: primaryContactId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        tags: { include: { tag: true } },
        _count: { select: { activities: true, tasks: true, notes: true, deals: true } },
      },
    });

    res.json(merged);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /bulk — Bulk Update Contacts ─────────────────────────

router.patch('/bulk', validate(z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
  data: z.object({
    lifecycle: z.string().optional(),
    type: z.string().optional(),
    ownerId: z.string().uuid().optional().nullable(),
    doNotEmail: z.boolean().optional(),
    doNotCall: z.boolean().optional(),
  }),
})), async (req, res, next) => {
  try {
    const { contactIds, data } = req.validated;

    const result = await prisma.contact.updateMany({
      where: { id: { in: contactIds }, organizationId: { in: req.orgIds } },
      data,
    });

    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/deals — Create Deal for Contact ─────────────────

router.post('/:id/deals', validate(z.object({
  name: z.string().min(1).max(200),
  amount: z.number().optional(),
  stage: z.string().max(100).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  closeDate: z.string().optional(),
  description: z.string().max(5000).optional(),
})), async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const data = req.validated;
    const deal = await prisma.deal.create({
      data: {
        name: data.name,
        amount: data.amount || null,
        stage: data.stage || 'QUALIFICATION',
        probability: data.probability || 0,
        closeDate: data.closeDate ? new Date(data.closeDate) : null,
        description: data.description || null,
        contactId: req.params.id,
        organizationId: contact.organizationId,
        ownerId: req.user.id,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.contactActivity.create({
      data: {
        contactId: req.params.id,
        userId: req.user.id,
        type: 'CUSTOM',
        description: `Deal created: ${data.name}`,
        metadata: { dealId: deal.id },
      },
    });

    res.status(201).json(deal);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:contactId/deals/:dealId — Update Deal ────────────────

router.put('/:contactId/deals/:dealId', validate(z.object({
  name: z.string().min(1).max(200).optional(),
  amount: z.number().optional().nullable(),
  stage: z.string().max(100).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  closeDate: z.string().optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(['OPEN', 'WON', 'LOST']).optional(),
})), async (req, res, next) => {
  try {
    const deal = await prisma.deal.findFirst({
      where: { id: req.params.dealId, contactId: req.params.contactId, organizationId: { in: req.orgIds } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const data = req.validated;
    if (data.closeDate) data.closeDate = new Date(data.closeDate);

    const updated = await prisma.deal.update({
      where: { id: req.params.dealId },
      data,
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
