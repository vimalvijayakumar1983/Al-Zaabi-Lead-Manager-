const express = require('express');
const router = express.Router();
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { authenticate } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginationSchema } = require('../utils/pagination');
const Joi = require('joi');

// All notification routes require authentication (user-scoped, no orgScope needed)
router.use(authenticate);

// ============================================================
// GET / — List notifications (paginated, filterable)
// ============================================================
const listNotificationsSchema = Joi.object({
  ...paginationSchema,
  type: Joi.string().optional(),
  isRead: Joi.string().valid('true', 'false').optional(),
  entityType: Joi.string().optional(),
  dateFrom: Joi.string().isoDate().optional(),
  dateTo: Joi.string().isoDate().optional(),
  grouped: Joi.string().valid('true', 'false').optional(),
});

router.get('/', validateQuery(listNotificationsSchema), async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { type, isRead, entityType, dateFrom, dateTo, grouped } = req.query;

    // Build WHERE conditions
    const conditions = ['"userId" = $1', '"isArchived" = false'];
    const params = [userId];
    let paramIdx = 2;

    if (type) {
      conditions.push(`type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }

    if (isRead !== undefined) {
      conditions.push(`"isRead" = $${paramIdx}`);
      params.push(isRead === 'true');
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

    const whereClause = conditions.join(' AND ');

    // Count total
    const countResult = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS total FROM notifications WHERE ${whereClause}`,
      ...params
    );
    const total = countResult[0]?.total || 0;

    // Fetch notifications with actor info
    const notifications = await prisma.$queryRawUnsafe(
      `SELECT
         n.*,
         json_build_object(
           'id', a.id,
           'firstName', a."firstName",
           'lastName', a."lastName",
           'avatar', a.avatar
         ) AS actor
       FROM notifications n
       LEFT JOIN users a ON n."actorId" = a.id
       WHERE ${whereClause}
       ORDER BY n."createdAt" DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      limit,
      offset
    );

    // Clean up actor field when there's no actor
    const cleaned = notifications.map((n) => ({
      ...n,
      actor: n.actorId ? n.actor : null,
    }));

    // Group by date if requested
    if (grouped === 'true') {
      const groupedByDate = {};
      for (const n of cleaned) {
        const dateKey = new Date(n.createdAt).toISOString().split('T')[0];
        if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
        groupedByDate[dateKey].push(n);
      }

      return res.json({
        success: true,
        data: cleaned,
        groupedByDate,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    res.json({
      success: true,
      data: cleaned,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error('Failed to list notifications', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

// ============================================================
// GET /unread-count — Lightweight unread count
// ============================================================
router.get('/unread-count', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE "userId" = $1 AND "isRead" = false AND "isArchived" = false`,
      req.user.id
    );

    res.json({
      success: true,
      data: { count: result[0]?.count || 0 },
    });
  } catch (error) {
    logger.error('Failed to get unread count', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

// ============================================================
// POST /:id/read — Mark single notification as read
// ============================================================
router.post('/:id/read', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await prisma.$queryRawUnsafe(
      `UPDATE notifications
       SET "isRead" = true, "readAt" = $1::timestamp, "updatedAt" = $1::timestamp
       WHERE id = $2 AND "userId" = $3
       RETURNING *`,
      now,
      req.params.id,
      req.user.id
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: result[0] });
  } catch (error) {
    logger.error('Failed to mark notification as read', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

// ============================================================
// POST /read-all — Mark all notifications as read
// ============================================================
router.post('/read-all', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await prisma.$queryRawUnsafe(
      `UPDATE notifications
       SET "isRead" = true, "readAt" = $1::timestamp, "updatedAt" = $1::timestamp
       WHERE "userId" = $2 AND "isRead" = false
       RETURNING id`,
      now,
      req.user.id
    );

    res.json({
      success: true,
      data: { updatedCount: result ? result.length : 0 },
    });
  } catch (error) {
    logger.error('Failed to mark all as read', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

// ============================================================
// POST /:id/archive — Archive a notification
// ============================================================
router.post('/:id/archive', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const result = await prisma.$queryRawUnsafe(
      `UPDATE notifications
       SET "isArchived" = true, "updatedAt" = $1::timestamp
       WHERE id = $2 AND "userId" = $3
       RETURNING *`,
      now,
      req.params.id,
      req.user.id
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: result[0] });
  } catch (error) {
    logger.error('Failed to archive notification', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to archive notification' });
  }
});

// ============================================================
// DELETE /:id — Delete a notification
// ============================================================
router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(
      `DELETE FROM notifications WHERE id = $1 AND "userId" = $2 RETURNING id`,
      req.params.id,
      req.user.id
    );

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    logger.error('Failed to delete notification', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
});

// ============================================================
// GET /preferences — Get notification preferences
// ============================================================
router.get('/preferences', async (req, res) => {
  try {
    const result = await prisma.$queryRawUnsafe(
      `SELECT preferences FROM notification_preferences WHERE "userId" = $1`,
      req.user.id
    );

    const preferences = result && result.length > 0 ? result[0].preferences : {};

    res.json({ success: true, data: preferences });
  } catch (error) {
    logger.error('Failed to get notification preferences', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to get preferences' });
  }
});

// ============================================================
// PUT /preferences — Update notification preferences
// ============================================================
const preferencesSchema = Joi.object({
  email: Joi.object({
    enabled: Joi.boolean(),
    types: Joi.array().items(Joi.string()),
  }).optional(),
  push: Joi.object({
    enabled: Joi.boolean(),
    types: Joi.array().items(Joi.string()),
  }).optional(),
  inApp: Joi.object({
    enabled: Joi.boolean(),
    types: Joi.array().items(Joi.string()),
  }).optional(),
  quiet: Joi.object({
    enabled: Joi.boolean(),
    startTime: Joi.string().optional(),
    endTime: Joi.string().optional(),
  }).optional(),
}).min(1);

router.put('/preferences', validate(preferencesSchema), async (req, res) => {
  try {
    const now = new Date().toISOString();
    const prefs = JSON.stringify(req.body);

    const result = await prisma.$queryRawUnsafe(
      `INSERT INTO notification_preferences ("userId", preferences, "updatedAt")
       VALUES ($1, $2::jsonb, $3::timestamp)
       ON CONFLICT ("userId")
       DO UPDATE SET preferences = notification_preferences.preferences || $2::jsonb, "updatedAt" = $3::timestamp
       RETURNING preferences`,
      req.user.id,
      prefs,
      now
    );

    res.json({ success: true, data: result[0].preferences });
  } catch (error) {
    logger.error('Failed to update notification preferences', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to update preferences' });
  }
});

module.exports = router;
