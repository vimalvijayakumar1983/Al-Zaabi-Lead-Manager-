const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyTeamMembers, notifyOrgAdmins, notifyLeadOwner, NOTIFICATION_TYPES } = require('../services/notificationService');
const { checkTaskReminders } = require('../services/taskReminderScheduler');

// ─── Display name helper (deduplication) ─────────────────────────
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown';
  if (!ln) return fn;
  if (!fn) return ln;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

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

// ─── Task Stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const where = {};
    if (req.isRestrictedRole) {
      where.assigneeId = req.user.id;
    } else {
      where.assignee = { organizationId: { in: req.orgIds } };
    }

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay()));
    weekEnd.setHours(23, 59, 59, 999);

    const [total, pending, inProgress, completed, cancelled, overdue, completedToday, dueThisWeek, byPriority, byType] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: 'PENDING' } }),
      prisma.task.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.task.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.task.count({ where: { ...where, dueAt: { lt: now }, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
      prisma.task.count({ where: { ...where, status: 'COMPLETED', completedAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.task.count({ where: { ...where, status: { not: 'COMPLETED' }, dueAt: { gte: todayStart, lte: weekEnd } } }),
      prisma.task.groupBy({ by: ['priority'], where, _count: true }),
      prisma.task.groupBy({ by: ['type'], where, _count: true }),
    ]);

    res.json({
      total, pending, inProgress, completed, cancelled, overdue, completedToday, dueThisWeek,
      byPriority: byPriority.reduce((acc, r) => ({ ...acc, [r.priority]: r._count }), {}),
      byType: byType.reduce((acc, r) => ({ ...acc, [r.type]: r._count }), {}),
    });
  } catch (err) {
    next(err);
  }
});

// ─── List Tasks ──────────────────────────────────────────────────
router.get('/', validateQuery(paginationSchema.extend({
  search: z.string().optional(),
  status: z.string().optional(),
  statuses: z.string().optional(),
  priority: z.string().optional(),
  priorities: z.string().optional(),
  assigneeId: z.string().optional(),
  leadId: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
})), async (req, res, next) => {
  try {
    const { page, limit, sortBy, sortOrder, search, status, statuses, priority, priorities, assigneeId, leadId, overdue } = req.validatedQuery;

    const where = {};
    const allowedStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
    const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

    const parsedStatuses = (statuses || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => allowedStatuses.includes(s));
    const parsedPriorities = (priorities || '')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter((p) => allowedPriorities.includes(p));

    // Scope to org via assignee's organization
    if (leadId) {
      where.leadId = leadId;
    }
    if (req.isRestrictedRole) {
      // SALES_REP / VIEWER only sees their own tasks
      where.assigneeId = req.user.id;
    } else if (assigneeId) {
      where.assigneeId = assigneeId;
    } else {
      // Default: show tasks for users in the accessible orgs
      where.assignee = { organizationId: { in: req.orgIds } };
    }

    if (parsedStatuses.length > 1) {
      where.status = { in: parsedStatuses };
    } else if (parsedStatuses.length === 1) {
      where.status = parsedStatuses[0];
    } else if (status && allowedStatuses.includes(String(status).toUpperCase())) {
      where.status = String(status).toUpperCase();
    }

    if (parsedPriorities.length > 1) {
      where.priority = { in: parsedPriorities };
    } else if (parsedPriorities.length === 1) {
      where.priority = parsedPriorities[0];
    } else if (priority && allowedPriorities.includes(String(priority).toUpperCase())) {
      where.priority = String(priority).toUpperCase();
    }

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        {
          lead: {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (overdue) {
      where.dueAt = { lt: new Date() };
      const dueStatuses = ['PENDING', 'IN_PROGRESS'];
      if (typeof where.status === 'string') {
        where.status = dueStatuses.includes(where.status) ? where.status : { in: [] };
      } else if (where.status?.in && Array.isArray(where.status.in)) {
        const intersected = where.status.in.filter((s) => dueStatuses.includes(s));
        where.status = { in: intersected };
      } else {
        where.status = { in: dueStatuses };
      }
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

    notifyUser(data.assigneeId, {
      type: data.assigneeId === req.user.id ? 'task_created' : 'task_assigned',
      task: { id: task.id, title: task.title },
    });

    res.status(201).json(task);

    // ── Fire-and-forget notification ──
    if (data.assigneeId) {
      const isSelfAssigned = data.assigneeId === req.user.id;
      createNotification({
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: isSelfAssigned ? 'Task Created' : 'New Task Assigned',
        message: isSelfAssigned
          ? `You created a new task: ${task.title}`
          : `${getDisplayName(req.user)} assigned you task: ${task.title}`,
        userId: data.assigneeId,
        actorId: req.user.id,
        entityType: 'task',
        entityId: task.id,
        organizationId: req.user.organizationId,
      }).catch(() => {});
    }

    broadcastDataChange(req.user.organizationId, 'task', 'created', req.user.id, { entityId: task.id }).catch(() => {});

    // Trigger immediate reminder check so notifications fire without waiting for next poll cycle
    if (data.reminder || data.dueAt) {
      checkTaskReminders().catch(() => {});
    }
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

    broadcastDataChange(req.user.organizationId, 'task', 'updated', req.user.id, { entityId: task.id }).catch(() => {});

    // Trigger immediate reminder check when due date or reminder is changed
    if (data.reminder || data.dueAt) {
      checkTaskReminders().catch(() => {});
    }
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

    // ── Fire-and-forget notification — notify task creator ──
    if (task.createdById && task.createdById !== req.user.id) {
      createNotification({
        type: NOTIFICATION_TYPES.TASK_COMPLETED,
        title: 'Task Completed',
        message: `${getDisplayName(req.user)} completed task: ${task.title}`,
        userId: task.createdById,
        actorId: req.user.id,
        entityType: 'task',
        entityId: task.id,
        organizationId: req.user.organizationId,
      }).catch(() => {});
    }

    broadcastDataChange(req.user.organizationId, 'task', 'updated', req.user.id, { entityId: task.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Bulk Update Tasks ──────────────────────────────────────────
router.patch('/bulk', validate(z.object({
  taskIds: z.array(z.string().uuid()).min(1),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().uuid().optional(),
  delete: z.boolean().optional(),
})), async (req, res, next) => {
  try {
    const { taskIds, delete: shouldDelete, ...updateData } = req.validated;

    // Verify tasks belong to accessible orgs
    const accessibleTasks = await prisma.task.findMany({
      where: { id: { in: taskIds }, assignee: { organizationId: { in: req.orgIds } } },
      select: { id: true },
    });
    const accessibleIds = accessibleTasks.map(t => t.id);

    if (accessibleIds.length === 0) return res.status(404).json({ error: 'No accessible tasks found' });

    if (shouldDelete) {
      await prisma.task.deleteMany({ where: { id: { in: accessibleIds } } });
      res.json({ message: `${accessibleIds.length} tasks deleted`, count: accessibleIds.length });
    } else {
      const data = {};
      if (updateData.status) data.status = updateData.status;
      if (updateData.priority) data.priority = updateData.priority;
      if (updateData.assigneeId) data.assigneeId = updateData.assigneeId;
      if (updateData.status === 'COMPLETED') data.completedAt = new Date();

      await prisma.task.updateMany({ where: { id: { in: accessibleIds } }, data });
      res.json({ message: `${accessibleIds.length} tasks updated`, count: accessibleIds.length });
    }

    broadcastDataChange(req.user.organizationId, 'task', 'updated', req.user.id, {}).catch(() => {});
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

    broadcastDataChange(req.user.organizationId, 'task', 'deleted', req.user.id, { entityId: req.params.id }).catch(() => {});
  } catch (err) {
    next(err);
  }
});

module.exports = router;
