const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { v4: uuidv4 } = require('uuid');

const router = Router();
router.use(authenticate, orgScope);

// ─── List Webhooks ───────────────────────────────────────────────
router.get('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { organizationId: req.orgId },
    });
    res.json(webhooks);
  } catch (err) {
    next(err);
  }
});

// ─── Create Webhook ──────────────────────────────────────────────
router.post('/', authorize('ADMIN'), validate(z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
})), async (req, res, next) => {
  try {
    const webhook = await prisma.webhook.create({
      data: {
        ...req.validated,
        secret: uuidv4(),
        organizationId: req.orgId,
      },
    });
    res.status(201).json(webhook);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Webhook ──────────────────────────────────────────────
router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.json({ message: 'Webhook deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Incoming Webhook (for lead capture) ─────────────────────────
router.post('/incoming/:secret', async (req, res, next) => {
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { secret: req.params.secret, isActive: true },
    });
    if (!webhook) return res.status(404).json({ error: 'Invalid webhook' });

    // Create lead from webhook payload
    const { firstName, lastName, email, phone, source, ...rest } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }

    const defaultStage = await prisma.pipelineStage.findFirst({
      where: { organizationId: webhook.organizationId, isDefault: true },
    });

    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        source: source || 'API',
        organizationId: webhook.organizationId,
        stageId: defaultStage?.id,
        customData: rest,
      },
    });

    res.status(201).json({ id: lead.id, message: 'Lead created' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
