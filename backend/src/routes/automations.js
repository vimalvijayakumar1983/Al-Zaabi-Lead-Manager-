const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, orgScope);

const automationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  trigger: z.enum([
    'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_STAGE_CHANGED',
    'LEAD_ASSIGNED', 'LEAD_SCORE_CHANGED', 'LEAD_INACTIVE',
    'TASK_DUE', 'TASK_OVERDUE',
  ]),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'in']),
    value: z.unknown(),
  })),
  actions: z.array(z.object({
    type: z.enum([
      'send_email', 'send_whatsapp', 'assign_lead', 'change_status',
      'change_stage', 'add_tag', 'create_task', 'notify_user', 'webhook',
    ]),
    config: z.record(z.unknown()),
  })),
  isActive: z.boolean().optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

// ─── List Automations ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const rules = await prisma.automationRule.findMany({
      where: { organizationId: { in: req.orgIds } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

// ─── Create Automation ───────────────────────────────────────────
router.post('/', authorize('ADMIN', 'MANAGER'), validate(automationSchema), async (req, res, next) => {
  try {
    const { divisionId, ...data } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    const rule = await prisma.automationRule.create({
      data: { ...data, organizationId: targetOrgId },
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Update Automation ───────────────────────────────────────────
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(automationSchema.partial()), async (req, res, next) => {
  try {
    // Verify rule belongs to accessible orgs
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const { divisionId, ...data } = req.validated;
    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data,
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Toggle Automation ───────────────────────────────────────────
router.post('/:id/toggle', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Automation ───────────────────────────────────────────
router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    await prisma.automationRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Automation deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
