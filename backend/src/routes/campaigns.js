const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');

const router = Router();
router.use(authenticate, orgScope);

const campaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['FACEBOOK_ADS', 'GOOGLE_ADS', 'EMAIL', 'WHATSAPP', 'LANDING_PAGE', 'REFERRAL', 'OTHER']),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
  budget: z.number().optional().nullable(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

router.get('/', validateQuery(paginationSchema), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder } = req.validatedQuery;
    const where = { organizationId: { in: req.orgIds } };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      prisma.campaign.count({ where }),
    ]);

    // Enrich with lead counts
    const enriched = await Promise.all(
      campaigns.map(async (c) => {
        const leadCount = await prisma.lead.count({
          where: { organizationId: { in: req.orgIds }, campaign: c.name },
        });
        return { ...c, leadCount };
      })
    );

    res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err) {
    next(err);
  }
});

router.post('/', authorize('ADMIN', 'MANAGER'), validate(campaignSchema), async (req, res, next) => {
  try {
    const { divisionId, ...data } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);

    const campaign = await prisma.campaign.create({
      data: { ...data, organizationId: targetOrgId },
    });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(campaignSchema.partial()), async (req, res, next) => {
  try {
    // Verify campaign belongs to accessible orgs
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    const { divisionId, ...data } = req.validated;
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    // Verify campaign belongs to accessible orgs
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.json({ message: 'Campaign deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
