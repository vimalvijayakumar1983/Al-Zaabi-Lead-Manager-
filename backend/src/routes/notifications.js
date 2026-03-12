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
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM notifications WHERE "userId" = $1 AND "isRead" = false AND "isArchived" = false`,
      req.user.id
    );
    res.json({ count: result[0]?.count || 0 });
  } catch (error) {
    logger.error('Failed to get unread count', { error: error.message });
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ─── GET /preferences ───────────────────────────────────────────────

router.get('/preferences', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT preferences FROM notification_preferences WHERE "userId" = $1`,
      req.user.id
    );
    const defaults = {
      soundEnabled: true, desktopEnabled: false, emailEnabled: true,
      leads: true, tasks: true, campaigns: true,
      integrations: true, team: true, system: true,
    };
    res.json(result[0]?.preferences || defaults);
  } catch (error) {
    logger.error('Failed to get notification preferences', { error: error.message });
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// ─── PUT /preferences ───────────────────────────────────────────────

router.put('/preferences', async (req, res) => {
  try {
    const prefs = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO notification_preferences ("userId", preferences, "updatedAt")
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT ("userId") DO UPDATE SET preferences = $2::jsonb, "updatedAt" = NOW()`,
      req.user.id,
      JSON.stringify(prefs)
    );
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
    const { type, isRead, entityType, dateFrom, dateTo, grouped, page = 1, limit = 20 } = q;

    const conditions = ['"userId" = $1', '"isArchived" = false'];
    const params = [req.user.id];
    let paramIdx = 2;

    if (type) {
      conditions.push(`type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }
    if (isRead !== undefined && isRead !== null) {
      conditions.push(`"isRead" = $${paramIdx}`);
      params.push(isRead);
      paramIdx++;
    }
    if (entityType) {
      conditions.push(`"entityType" = $${paramIdx}`);
      params.push(entityType);
      paramIdx++;
    }
    if (dateFrom) {
      conditions.push(`"createdAt" >= $${paramIdx}::timestamp`);
      params.push(dateFrom);
      paramIdx++;
    }
    if (dateTo) {
      conditions.push(`"createdAt" <= $${paramIdx}::timestamp`);
      params.push(dateTo);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    // Count
    const countResult = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as total FROM notifications WHERE ${where}`,
      ...params
    );
    const total = countResult[0]?.total || 0;

    // Fetch with actor info
    const offset = (page - 1) * limit;
    const notifications = await prisma.$queryRawUnsafe(
      `SELECT n.*, 
        json_build_object('id', u.id, 'firstName', u."firstName", 'lastName', u."lastName", 'avatar', u.avatar) as actor
       FROM notifications n
       LEFT JOIN users u ON n."actorId" = u.id
       WHERE ${where}
       ORDER BY n."createdAt" DESC
       LIMIT ${limit} OFFSET ${offset}`,
      ...params
    );

    res.json(paginatedResponse(notifications, total, page, limit));
  } catch (error) {
    logger.error('Failed to list notifications', { error: error.message });
    res.status(500).json({ error: 'Failed to list notifications' });
  }
});

// ─── POST /:id/read ─────────────────────────────────────────────────

router.post('/:id/read', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW(), "updatedAt" = NOW() WHERE id = $1 AND "userId" = $2`,
      req.params.id,
      req.user.id
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ─── POST /read-all ──────────────────────────────────────────────────

router.post('/read-all', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE notifications SET "isRead" = true, "readAt" = NOW(), "updatedAt" = NOW() WHERE "userId" = $1 AND "isRead" = false`,
      req.user.id
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to mark all as read', { error: error.message });
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ─── POST /:id/archive ──────────────────────────────────────────────

router.post('/:id/archive', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE notifications SET "isArchived" = true, "updatedAt" = NOW() WHERE id = $1 AND "userId" = $2`,
      req.params.id,
      req.user.id
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to archive notification', { error: error.message });
    res.status(500).json({ error: 'Failed to archive' });
  }
});

// ─── DELETE /:id ─────────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe(
      `DELETE FROM notifications WHERE id = $1 AND "userId" = $2`,
      req.params.id,
      req.user.id
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete notification', { error: error.message });
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

module.exports = router;
