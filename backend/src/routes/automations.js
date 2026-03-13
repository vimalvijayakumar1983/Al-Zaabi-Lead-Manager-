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

// ─── Templates ──────────────────────────────────────────────────
const AUTOMATION_TEMPLATES = [
  {
    id: 'auto-assign-new',
    name: 'Auto-Assign New Leads',
    description: 'Automatically assign new leads to a team member using round-robin',
    category: 'assignment',
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'assign_lead', config: { method: 'round_robin' } }],
  },
  {
    id: 'welcome-email',
    name: 'Send Welcome Email',
    description: 'Send a welcome email when a new lead is created',
    category: 'communication',
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'send_email', config: { subject: 'Welcome!', template: 'welcome' } }],
  },
  {
    id: 'hot-lead-notify',
    name: 'Hot Lead Alert',
    description: 'Notify the team when a lead score exceeds 80',
    category: 'notification',
    trigger: 'LEAD_SCORE_CHANGED',
    conditions: [{ field: 'score', operator: 'gt', value: 80 }],
    actions: [{ type: 'notify_user', config: { message: 'Hot lead detected! Score above 80.' } }],
  },
  {
    id: 'follow-up-task',
    name: 'Create Follow-Up Task',
    description: 'Create a follow-up task when a lead is contacted',
    category: 'task',
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'CONTACTED' }],
    actions: [{ type: 'create_task', config: { title: 'Follow up', taskType: 'FOLLOW_UP_CALL', dueInHours: 48 } }],
  },
  {
    id: 'stage-change-whatsapp',
    name: 'WhatsApp on Stage Change',
    description: 'Send a WhatsApp message when a lead moves to proposal stage',
    category: 'communication',
    trigger: 'LEAD_STAGE_CHANGED',
    conditions: [],
    actions: [{ type: 'send_whatsapp', config: { message: 'Your proposal is ready!' } }],
  },
  {
    id: 'inactive-reminder',
    name: 'Inactive Lead Reminder',
    description: 'Create a task when a lead has been inactive for too long',
    category: 'task',
    trigger: 'LEAD_INACTIVE',
    conditions: [],
    actions: [
      { type: 'create_task', config: { title: 'Re-engage inactive lead', taskType: 'FOLLOW_UP_CALL', dueInHours: 24, priority: 'HIGH' } },
      { type: 'notify_user', config: { message: 'Lead has gone inactive — follow up needed.' } },
    ],
  },
  {
    id: 'won-deal-tag',
    name: 'Tag Won Deals',
    description: 'Automatically tag leads when they are marked as won',
    category: 'organization',
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'WON' }],
    actions: [{ type: 'add_tag', config: { tagName: 'Closed Won' } }],
  },
  {
    id: 'webhook-lead-created',
    name: 'Webhook on New Lead',
    description: 'Fire a webhook to an external system when a lead is created',
    category: 'integration',
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: '', method: 'POST' } }],
  },
];

// ─── Get Templates ──────────────────────────────────────────────
router.get('/templates', (req, res) => {
  res.json(AUTOMATION_TEMPLATES);
});

// ─── Global Automation Stats (must be before /:id) ──────────────
router.get('/stats/overview', async (req, res, next) => {
  try {
    const orgFilter = { organizationId: { in: req.orgIds } };

    const [totalRules, activeRules] = await Promise.all([
      prisma.automationRule.count({ where: orgFilter }),
      prisma.automationRule.count({ where: { ...orgFilter, isActive: true } }),
    ]);

    // AutomationLog queries — gracefully handle if table doesn't exist yet
    let totalExecutions = 0;
    let recentLogs = [];
    let dailyLogs = [];
    try {
      [totalExecutions, recentLogs] = await Promise.all([
        prisma.automationLog.count({
          where: { rule: { organizationId: { in: req.orgIds } } },
        }),
        prisma.automationLog.findMany({
          where: { rule: { organizationId: { in: req.orgIds } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { rule: { select: { name: true } } },
        }),
      ]);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);
      dailyLogs = await prisma.automationLog.groupBy({
        by: ['status'],
        where: {
          rule: { organizationId: { in: req.orgIds } },
          createdAt: { gte: sevenDaysAgo },
        },
        _count: true,
      });
    } catch {
      // AutomationLog table may not exist yet — return zeros
    }

    const successRate = totalExecutions > 0
      ? ((dailyLogs.find(d => d.status === 'success')?._count || 0) /
         dailyLogs.reduce((sum, d) => sum + d._count, 0) * 100).toFixed(1)
      : '0';

    res.json({
      totalRules,
      activeRules,
      totalExecutions,
      successRate: parseFloat(successRate),
      recentActivity: recentLogs,
      dailyBreakdown: dailyLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ─── List Automations ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    let rules;
    try {
      rules = await prisma.automationRule.findMany({
        where: { organizationId: { in: req.orgIds } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { logs: true } } },
      });
    } catch {
      // Fallback if logs relation not available yet
      rules = await prisma.automationRule.findMany({
        where: { organizationId: { in: req.orgIds } },
        orderBy: { createdAt: 'desc' },
      });
    }
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

// ─── Get Single Automation with Stats ────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    let rule;
    try {
      rule = await prisma.automationRule.findFirst({
        where: { id: req.params.id, organizationId: { in: req.orgIds } },
        include: { _count: { select: { logs: true } } },
      });
    } catch {
      rule = await prisma.automationRule.findFirst({
        where: { id: req.params.id, organizationId: { in: req.orgIds } },
      });
    }
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    // Get recent execution stats (graceful fallback)
    let successCount = 0, failedCount = 0, recentLogs = [];
    try {
      [successCount, failedCount, recentLogs] = await Promise.all([
        prisma.automationLog.count({ where: { ruleId: rule.id, status: 'success' } }),
        prisma.automationLog.count({ where: { ruleId: rule.id, status: 'failed' } }),
        prisma.automationLog.findMany({
          where: { ruleId: rule.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
    } catch {
      // AutomationLog table may not exist yet
    }

    res.json({
      ...rule,
      stats: { successCount, failedCount, totalLogs: rule._count?.logs || 0 },
      recentLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Automation Logs ─────────────────────────────────────────
router.get('/:id/logs', async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;

    const where = { ruleId: req.params.id };
    if (status) where.status = status;

    let logs = [], total = 0;
    try {
      [logs, total] = await Promise.all([
        prisma.automationLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.automationLog.count({ where }),
      ]);
    } catch {
      // AutomationLog table may not exist yet
    }

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
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

// ─── Duplicate Automation ────────────────────────────────────────
router.post('/:id/duplicate', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const { id, createdAt, updatedAt, executionCount, lastExecutedAt, ...data } = existing;
    const duplicate = await prisma.automationRule.create({
      data: {
        ...data,
        name: `${data.name} (Copy)`,
        isActive: false,
        executionCount: 0,
      },
    });
    res.status(201).json(duplicate);
  } catch (err) {
    next(err);
  }
});

// ─── Update Automation ───────────────────────────────────────────
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(automationSchema.partial()), async (req, res, next) => {
  try {
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
