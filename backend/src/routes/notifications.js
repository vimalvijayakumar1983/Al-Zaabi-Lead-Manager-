const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { authenticate } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');
const { paginationSchema, paginatedResponse } = require('../utils/pagination');

const router = Router();

// All notification routes require authentication (user-scoped)
router.use(authenticate);

// ─── Validation Schemas ─────────────────────────────────────────────

const listNotificationsSchema = paginationSchema.extend({
  type: z.string().optional(),
  isRead: z.string().transform(v => v === 'true').optional(),
  entityType: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  grouped: z.string().transform(v => v === 'true').optional(),
});

// ─── GET /unread-count ──────────────────────────────────────────────

router.get('/unread-count', async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
        isArchived: false,
      },
    });
    res.json({ count });
  } catch (error) {
    logger.error('Failed to get unread count', { error: error.message });
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ─── GET /preferences ───────────────────────────────────────────────

router.get('/preferences', async (req, res) => {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: req.user.id },
    });
    const defaults = {
      soundEnabled: true, desktopEnabled: false, emailEnabled: true,
      leads: true, tasks: true, campaigns: true,
      integrations: true, team: true, system: true,
    };
    res.json(pref?.preferences || defaults);
  } catch (error) {
    logger.error('Failed to get notification preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// ─── PUT /preferences ───────────────────────────────────────────────

router.put('/preferences', async (req, res) => {
  try {
    const prefs = req.body;
    await prisma.notificationPreference.upsert({
      where: { userId: req.user.id },
      update: { preferences: prefs },
      create: { userId: req.user.id, preferences: prefs },
    });
    res.json({ success: true, preferences: prefs });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ─── GET / — List notifications ─────────────────────────────────────

router.get('/', validateQuery(listNotificationsSchema), async (req, res) => {
  try {
    const q = req.validatedQuery || req.query;
    const { type, isRead, entityType, dateFrom, dateTo, page = 1, limit = 20 } = q;

    const where = {
      userId: req.user.id,
      isArchived: false,
    };

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
    logger.error('Failed to list notifications', { error: error.message });
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// ─── POST /:id/read ─────────────────────────────────────────────────

router.post('/:id/read', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ─── POST /read-all ──────────────────────────────────────────────────

router.post('/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark all as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ─── POST /:id/archive ──────────────────────────────────────────────

router.post('/:id/archive', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { isArchived: true },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to archive notification', { error: error.message });
    res.status(500).json({ error: 'Failed to archive' });
  }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete notification', { error: error.message });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
