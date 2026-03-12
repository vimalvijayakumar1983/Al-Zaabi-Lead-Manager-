const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { notifyUser } = require('../websocket/server');

const router = Router();
router.use(authenticate, orgScope);

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(['FOLLOW_UP_CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'DEMO', 'PROPOSAL', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueAt: z.string().datetime(),
  leadId: z.string().uuid().optional().nullable(),
  assigneeId: z.string().uuid(),
  isRecurring: z.boolean().optional(),
  recurRule: z.string().optional().nullable(),
  reminder: z.string().datetime().optional().nullable(),
});

// ─── List Tasks ──────────────────────────────────────────────────
router.get('/', validateQuery(paginationSchema.extend({
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  leadId: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
})), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder, status, priority, assigneeId, leadId, overdue } = req.validatedQuery;

    const where = {};

    // Scope to org via assignee's organization
    if (leadId) {
      where.leadId = leadId;
    }
    if (assigneeId) {
      where.assigneeId = assigneeId;
    } else {
      // Default: show tasks for users in the accessible orgs
      where.assignee = { organizationId: { in: req.orgIds } };
    }
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (overdue) {
      where.dueAt = { lt: new Date() };
      where.status = { in: ['PENDING', 'IN_PROGRESS'] };
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        ...paginate(page, limit),
      }),
      prisma.task.count({ where }),
    ]);

    res.json(paginatedResponse(tasks, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// ─── Create Task ─────────────────────────────────────────────────
router.post('/', validate(taskSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    const task = await prisma.task.create({
      data: {
        ...data,
        dueAt: new Date(data.dueAt),
        reminder: data.reminder ? new Date(data.reminder) : null,
        createdById: req.user.id,
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (data.leadId) {
      await prisma.leadActivity.create({
        data: {
          leadId: data.leadId,
          userId: req.user.id,
          type: 'TASK_CREATED',
          description: `Task created: ${data.title}`,
        },
      });
    }

    if (data.assigneeId !== req.user.id) {
      notifyUser(data.assigneeId, {
        type: 'task_assigned',
        task: { id: task.id, title: task.title },
      });
    }

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// ─── Update Task ─────────────────────────────────────────────────
router.put('/:id', validate(taskSchema.partial()), async (req, res, next) => {
  try {
    // Verify task belongs to accessible orgs via assignee
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, assignee: { organizationId: { in: req.orgIds } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const data = req.validated;
    if (data.dueAt) data.dueAt = new Date(data.dueAt);
    if (data.reminder) data.reminder = new Date(data.reminder);

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// ─── Complete Task ───────────────────────────────────────────────
router.post('/:id/complete', async (req, res, next) => {
  try {
    // Verify task belongs to accessible orgs
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, assignee: { organizationId: { in: req.orgIds } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    if (task.leadId) {
      await prisma.leadActivity.create({
        data: {
          leadId: task.leadId,
          userId: req.user.id,
          type: 'TASK_COMPLETED',
          description: `Task completed: ${task.title}`,
        },
      });
    }

    res.json(task);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Task ─────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    // Verify task belongs to accessible orgs
    const existing = await prisma.task.findFirst({
      where: { id: req.params.id, assignee: { organizationId: { in: req.orgIds } } },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
