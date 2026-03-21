const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginationSchema, paginatedResponse } = require('../utils/pagination');
const {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} = require('../services/notificationPreferences');
const {
  markNotificationAction,
  completeTaskFromNotification,
  snoozeNotification,
  escalateNotification,
} = require('../services/notificationActionService');

const router = Router();

const DEFAULT_ROLE_NOTIFICATION_ACCESS = {
  SUPER_ADMIN: true,
  ADMIN: true,
  MANAGER: true,
  SALES_REP: true,
  VIEWER: true,
};

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

async function ensureNotificationAccess(req, res, next) {
  try {
    if (req.user?.role === 'SUPER_ADMIN') {
      return next();
    }

    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      select: { settings: true },
    });
    const settings = asObject(org?.settings);
    const rolePermissions = asObject(settings.rolePermissions);
    const userOverrides = asObject(settings.userPermissionOverrides);

    let allowed = DEFAULT_ROLE_NOTIFICATION_ACCESS[req.user.role] ?? true;
    if (typeof rolePermissions?.[req.user.role]?.notifications === 'boolean') {
      allowed = rolePermissions[req.user.role].notifications;
    }
    if (typeof userOverrides?.[req.user.id]?.notifications === 'boolean') {
      allowed = userOverrides[req.user.id].notifications;
    }

    const customRoleAllow = req.user.customRole?.permissions?.notifications?.view;
    if (typeof customRoleAllow === 'boolean') {
      allowed = allowed && customRoleAllow;
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Notifications access denied for your role' });
    }
    return next();
  } catch (error) {
    logger.error('Notification access check failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to validate notification access' });
  }
}

router.use(authenticate, orgScope, ensureNotificationAccess);

const listNotificationsSchema = paginationSchema.extend({
  type: z.string().optional(),
  isRead: z.string().transform((v) => v === 'true').optional(),
  entityType: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  divisionId: z.string().uuid().optional(),
});

const analyticsQuerySchema = z.object({
  range: z.enum(['24h', '7d', '30d']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  divisionId: z.string().uuid().optional(),
});

const digestQuerySchema = analyticsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

const actionSchema = z.object({
  action: z.enum(['MARK_DONE', 'SNOOZE', 'ESCALATE']),
  minutes: z.number().int().min(5).max(10080).optional(),
});

const snoozeSchema = z.object({
  minutes: z.number().int().min(5).max(10080).optional(),
});

function resolveRange(query) {
  if (query.dateFrom || query.dateTo) {
    return {
      from: query.dateFrom ? new Date(query.dateFrom) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: query.dateTo ? new Date(query.dateTo) : new Date(),
    };
  }

  if (query.range === '24h') {
    return { from: new Date(Date.now() - 24 * 60 * 60 * 1000), to: new Date() };
  }
  if (query.range === '30d') {
    return { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() };
  }
  return { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), to: new Date() };
}

function resolveDivisionScope(req, requestedDivisionId) {
  if (requestedDivisionId) {
    if (!req.orgIds.includes(requestedDivisionId)) {
      const error = new Error('Invalid division scope');
      error.status = 403;
      throw error;
    }
    return requestedDivisionId;
  }

  if (req.orgIds.length === 1) {
    return req.orgIds[0];
  }

  return null;
}

async function getUnreadCount(userId, divisionId = null) {
  const where = {
    userId,
    isRead: false,
    isArchived: false,
  };
  if (divisionId) {
    where.organizationId = divisionId;
  }
  return prisma.notification.count({
    where,
  });
}

async function getUserNotification(notificationId, userId) {
  return prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
}

async function executeNotificationAction(notification, userContext, action, minutes) {
  let result = null;
  let updatedNotification = notification;

  if (action === 'MARK_DONE') {
    result = await completeTaskFromNotification(notification, userContext);
    if (!result.ok) {
      return { ok: false, error: result.error || 'Unable to mark task done' };
    }
    updatedNotification = await markNotificationAction(notification, 'MARK_DONE', {
      completedTaskId: result.taskId,
    }, true);
  } else if (action === 'SNOOZE') {
    result = await snoozeNotification(notification, userContext, minutes || 15);
    if (!result.ok) {
      return { ok: false, error: result.error || 'Unable to snooze notification' };
    }
    updatedNotification = await markNotificationAction(notification, 'SNOOZE', {
      snoozedUntil: result.snoozedUntil,
    }, true);
  } else if (action === 'ESCALATE') {
    result = await escalateNotification(notification, userContext.id, 'manual');
    if (!result.ok) {
      return { ok: false, error: result.error || 'Unable to escalate notification' };
    }
    const refreshed = await prisma.notification.findUnique({ where: { id: notification.id } });
    if (refreshed) {
      updatedNotification = await markNotificationAction(refreshed, 'ESCALATE', {
        escalationRequestedAt: new Date().toISOString(),
      }, false);
    }
  }

  return { ok: true, result, notification: updatedNotification };
}

router.get('/unread-count', async (req, res) => {
  try {
    const requestedDivisionId =
      typeof req.query.divisionId === 'string' ? req.query.divisionId : undefined;
    const divisionScope = resolveDivisionScope(req, requestedDivisionId);
    const count = await getUnreadCount(req.user.id, divisionScope);
    res.json({ count });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Failed to get unread count', { error: error.message });
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

router.get('/preferences', async (req, res) => {
  try {
    const prefs = await getUserNotificationPreferences(req.user.id, req.orgId);
    res.json(prefs);
  } catch (error) {
    logger.error('Failed to get notification preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

router.put('/preferences', validate(z.record(z.boolean())), async (req, res) => {
  try {
    const updated = await updateUserNotificationPreferences(req.user.id, req.orgId, req.validated);
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update notification preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/', validateQuery(listNotificationsSchema), async (req, res) => {
  try {
    const q = req.validatedQuery || req.query;
    const {
      type,
      isRead,
      entityType,
      dateFrom,
      dateTo,
      divisionId,
      page = 1,
      limit = 20,
    } = q;
    const divisionScope = resolveDivisionScope(req, divisionId);

    const where = {
      userId: req.user.id,
      isArchived: false,
    };
    if (divisionScope) {
      where.organizationId = divisionScope;
    }

    if (type) where.type = type;
    if (isRead !== undefined && isRead !== null) where.isRead = isRead;
    if (entityType) where.entityType = entityType;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    res.json(paginatedResponse(notifications, total, page, limit));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Failed to list notifications', { error: error.message });
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

router.get('/digest', validateQuery(digestQuerySchema), async (req, res) => {
  try {
    const { limit, divisionId } = req.validatedQuery;
    const divisionScope = resolveDivisionScope(req, divisionId);
    const { from, to } = resolveRange(req.validatedQuery);
    const where = {
      userId: req.user.id,
      isArchived: false,
      createdAt: { gte: from, lte: to },
    };
    if (divisionScope) {
      where.organizationId = divisionScope;
    }
    const rows = await prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const byType = {};
    let bundleEvents = 0;
    for (const row of rows) {
      byType[row.type] = (byType[row.type] || 0) + 1;
      const metadata = asObject(row.metadata);
      if (Number(metadata.bundleCount || 1) > 1) {
        bundleEvents += 1;
      }
    }

    const unread = rows.filter((r) => !r.isRead);
    const topUnread = unread.slice(0, limit).map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      message: r.message,
      createdAt: r.createdAt,
    }));

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        notifications: rows.length,
        unread: unread.length,
        read: rows.length - unread.length,
        readRate: rows.length > 0 ? Number((((rows.length - unread.length) / rows.length) * 100).toFixed(1)) : 0,
        bundledItems: bundleEvents,
      },
      byType,
      topUnread,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Failed to generate notification digest', { error: error.message });
    res.status(500).json({ error: 'Failed to generate digest' });
  }
});

router.get('/analytics', validateQuery(analyticsQuerySchema), async (req, res) => {
  try {
    const divisionScope = resolveDivisionScope(req, req.validatedQuery.divisionId);
    const { from, to } = resolveRange(req.validatedQuery);
    const where = {
      userId: req.user.id,
      isArchived: false,
      createdAt: { gte: from, lte: to },
    };
    if (divisionScope) {
      where.organizationId = divisionScope;
    }
    const rows = await prisma.notification.findMany({
      where,
      select: {
        id: true,
        type: true,
        isRead: true,
        readAt: true,
        createdAt: true,
        metadata: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let read = 0;
    let actioned = 0;
    let snoozed = 0;
    let escalated = 0;
    let totalReadLatencyMinutes = 0;
    let readLatencySamples = 0;
    const byType = {};

    for (const row of rows) {
      const metadata = asObject(row.metadata);
      if (!byType[row.type]) {
        byType[row.type] = { sent: 0, read: 0, actioned: 0, unread: 0 };
      }
      byType[row.type].sent += 1;

      if (row.isRead || row.readAt) {
        read += 1;
        byType[row.type].read += 1;
        if (row.readAt) {
          totalReadLatencyMinutes += (new Date(row.readAt).getTime() - new Date(row.createdAt).getTime()) / 60000;
          readLatencySamples += 1;
        }
      } else {
        byType[row.type].unread += 1;
      }

      if (metadata.actionedAt) {
        actioned += 1;
        byType[row.type].actioned += 1;
      }
      if (metadata.snoozedUntil || metadata.actionType === 'SNOOZE') {
        snoozed += 1;
      }
      if (metadata.escalatedAt) {
        escalated += 1;
      }
    }

    const total = rows.length;
    const unread = total - read;
    const readRate = total > 0 ? Number(((read / total) * 100).toFixed(1)) : 0;
    const actionRate = total > 0 ? Number(((actioned / total) * 100).toFixed(1)) : 0;
    const avgReadLatencyMinutes = readLatencySamples > 0
      ? Number((totalReadLatencyMinutes / readLatencySamples).toFixed(1))
      : null;

    const noisyTypes = Object.entries(byType)
      .map(([type, metrics]) => ({
        type,
        sent: metrics.sent,
        readRate: metrics.sent > 0 ? metrics.read / metrics.sent : 0,
      }))
      .filter((item) => item.sent >= 5 && item.readRate < 0.5)
      .sort((a, b) => b.sent - a.sent);

    const staleUnread = rows.filter(
      (row) => !row.isRead && new Date(row.createdAt).getTime() < Date.now() - 24 * 60 * 60 * 1000
    ).length;

    const optimizationSignals = [];
    if (readRate < 60) {
      optimizationSignals.push('Read rate is below 60%. Consider bundling lower-priority alerts more aggressively.');
    }
    if (staleUnread > 0) {
      optimizationSignals.push(`${staleUnread} notification(s) have been unread for over 24h. Escalation rules may need tighter thresholds.`);
    }
    if (noisyTypes.length > 0) {
      optimizationSignals.push(`"${noisyTypes[0].type}" is high-volume with low engagement. Recommend digest-first delivery.`);
    }

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        sent: total,
        read,
        unread,
        actioned,
        snoozed,
        escalated,
        readRate,
        actionRate,
        avgReadLatencyMinutes,
      },
      byType,
      optimizationSignals,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    logger.error('Failed to build notification analytics', { error: error.message });
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

router.post('/:id/action', validate(actionSchema), async (req, res) => {
  try {
    const notification = await getUserNotification(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const { action, minutes } = req.validated;
    const actionResult = await executeNotificationAction(
      notification,
      {
        id: req.user.id,
        role: req.user.role,
        organizationId: req.user.organizationId,
        orgIds: req.orgIds,
      },
      action,
      minutes
    );
    if (!actionResult.ok) {
      return res.status(400).json({ error: actionResult.error });
    }

    const { result, notification: updatedNotification } = actionResult;

    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    return res.json({
      success: true,
      action,
      result,
      notification: updatedNotification,
      unreadCount,
    });
  } catch (error) {
    logger.error('Failed to execute notification action', { error: error.message });
    return res.status(500).json({ error: 'Failed to execute action' });
  }
});

router.post('/:id/snooze', validate(snoozeSchema), async (req, res) => {
  try {
    const notification = await getUserNotification(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const actionResult = await executeNotificationAction(
      notification,
      {
        id: req.user.id,
        role: req.user.role,
        organizationId: req.user.organizationId,
        orgIds: req.orgIds,
      },
      'SNOOZE',
      req.validated.minutes || 15
    );
    if (!actionResult.ok) {
      return res.status(400).json({ error: actionResult.error });
    }
    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    return res.json({
      success: true,
      action: 'SNOOZE',
      result: actionResult.result,
      notification: actionResult.notification,
      unreadCount,
    });
  } catch (error) {
    logger.error('Failed to snooze notification', { error: error.message });
    return res.status(500).json({ error: 'Failed to snooze notification' });
  }
});

router.post('/:id/escalate', async (req, res) => {
  try {
    const notification = await getUserNotification(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const actionResult = await executeNotificationAction(
      notification,
      {
        id: req.user.id,
        role: req.user.role,
        organizationId: req.user.organizationId,
        orgIds: req.orgIds,
      },
      'ESCALATE'
    );
    if (!actionResult.ok) {
      return res.status(400).json({ error: actionResult.error });
    }
    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    return res.json({
      success: true,
      action: 'ESCALATE',
      result: actionResult.result,
      notification: actionResult.notification,
      unreadCount,
    });
  } catch (error) {
    logger.error('Failed to escalate notification', { error: error.message });
    return res.status(500).json({ error: 'Failed to escalate notification' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const updated = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    res.json({ success: true, changed: updated.count, unreadCount });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    const divisionScope = resolveDivisionScope(req);
    const where = { userId: req.user.id, isRead: false, isArchived: false };
    if (divisionScope) {
      where.organizationId = divisionScope;
    }
    const updated = await prisma.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });
    const unreadCount = await getUnreadCount(req.user.id, divisionScope);
    res.json({ success: true, changed: updated.count, unreadCount });
  } catch (error) {
    logger.error('Failed to mark all as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { isArchived: true },
    });
    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    res.json({ success: true, unreadCount });
  } catch (error) {
    logger.error('Failed to archive notification', { error: error.message });
    res.status(500).json({ error: 'Failed to archive' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    const unreadCount = await getUnreadCount(req.user.id, resolveDivisionScope(req));
    res.json({ success: true, unreadCount });
  } catch (error) {
    logger.error('Failed to delete notification', { error: error.message });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
