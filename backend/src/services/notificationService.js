const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser } = require('../websocket/server');
const { shouldDeliverInAppNotification } = require('./notificationPreferences');

const NOTIFICATION_TYPES = {
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_WON: 'LEAD_WON',
  LEAD_LOST: 'LEAD_LOST',
  LEAD_SCORE_CHANGED: 'LEAD_SCORE_CHANGED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_REMINDER: 'TASK_REMINDER',
  PIPELINE_STAGE_CHANGED: 'PIPELINE_STAGE_CHANGED',
  CAMPAIGN_STARTED: 'CAMPAIGN_STARTED',
  CAMPAIGN_COMPLETED: 'CAMPAIGN_COMPLETED',
  CAMPAIGN_BUDGET_ALERT: 'CAMPAIGN_BUDGET_ALERT',
  INTEGRATION_CONNECTED: 'INTEGRATION_CONNECTED',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INTEGRATION_LEAD_RECEIVED: 'INTEGRATION_LEAD_RECEIVED',
  TEAM_MEMBER_INVITED: 'TEAM_MEMBER_INVITED',
  TEAM_MEMBER_ROLE_CHANGED: 'TEAM_MEMBER_ROLE_CHANGED',
  TEAM_MEMBER_DEACTIVATED: 'TEAM_MEMBER_DEACTIVATED',
  DIVISION_CREATED: 'DIVISION_CREATED',
  DIVISION_USER_TRANSFERRED: 'DIVISION_USER_TRANSFERRED',
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  IMPORT_FAILED: 'IMPORT_FAILED',
  AUTOMATION_TRIGGERED: 'AUTOMATION_TRIGGERED',
  AUTOMATION_ERROR: 'AUTOMATION_ERROR',
  CALLBACK_REMINDER: 'CALLBACK_REMINDER',
  CALLBACK_REMINDER_HANDOFF: 'CALLBACK_REMINDER_HANDOFF',
  SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
  NOTIFICATION_ESCALATED: 'NOTIFICATION_ESCALATED',
};

const BUNDLE_ELIGIBLE_TYPES = new Set([
  NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
  NOTIFICATION_TYPES.AUTOMATION_TRIGGERED,
  NOTIFICATION_TYPES.LEAD_SCORE_CHANGED,
  NOTIFICATION_TYPES.CAMPAIGN_BUDGET_ALERT,
]);

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function buildDefaultDedupeKey({ type, entityType, entityId, metadata }) {
  const md = asObject(metadata);

  if ((type === NOTIFICATION_TYPES.CALLBACK_REMINDER || type === NOTIFICATION_TYPES.CALLBACK_REMINDER_HANDOFF) && md.callLogId) {
    return `callback:${md.callLogId}:${type}`;
  }

  if ((type === NOTIFICATION_TYPES.TASK_REMINDER || type === NOTIFICATION_TYPES.TASK_DUE_SOON) && entityType === 'task' && entityId) {
    return `task:${entityId}:${type}`;
  }

  if (type === NOTIFICATION_TYPES.TASK_OVERDUE && entityType === 'task' && entityId) {
    const sixHourBucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
    return `task:${entityId}:${type}:${sixHourBucket}`;
  }

  return null;
}

async function createNotification(data) {
  try {
    const {
      type,
      title,
      message,
      userId,
      actorId = null,
      entityType = null,
      entityId = null,
      metadata = {},
      organizationId,
    } = data;

    const metadataObject = asObject(metadata);

    const shouldSend = await shouldDeliverInAppNotification({
      userId,
      organizationId,
      type,
    });
    if (!shouldSend) {
      return null;
    }

    const dedupeKey = typeof metadataObject.dedupeKey === 'string' && metadataObject.dedupeKey
      ? metadataObject.dedupeKey
      : buildDefaultDedupeKey({ type, entityType, entityId, metadata: metadataObject });
    const dedupeWindowMinutes = Number.isFinite(metadataObject.dedupeWindowMinutes)
      ? Math.max(1, Number(metadataObject.dedupeWindowMinutes))
      : 30;
    const bundleEnabled = metadataObject.bundle === true
      || (metadataObject.bundle !== false && BUNDLE_ELIGIBLE_TYPES.has(type));

    if (dedupeKey) {
      const windowStart = new Date(Date.now() - dedupeWindowMinutes * 60 * 1000);
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          isArchived: false,
          metadata: { path: ['dedupeKey'], equals: dedupeKey },
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        if (bundleEnabled && !existing.isRead) {
          const existingMetadata = asObject(existing.metadata);
          const bundleCount = Number(existingMetadata.bundleCount || 1) + 1;
          const updated = await prisma.notification.update({
            where: { id: existing.id },
            data: {
              title,
              message,
              metadata: {
                ...existingMetadata,
                ...metadataObject,
                dedupeKey,
                bundleCount,
                latestMessage: message,
                latestAt: new Date().toISOString(),
              },
            },
          });
          try {
            notifyUser(userId, {
              type: 'notification_updated',
              notification: updated,
            });
          } catch (wsError) {
            logger.warn('Failed to send bundled WebSocket notification', {
              userId,
              notificationId: updated.id,
              error: wsError.message,
            });
          }
          return updated;
        }
        return existing;
      }
    }

    const created = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        userId,
        actorId,
        entityType,
        entityId,
        metadata: {
          ...metadataObject,
          dedupeKey: dedupeKey || undefined,
          bundleCount: metadataObject.bundleCount || 1,
        },
        organizationId,
      },
    });

    try {
      notifyUser(userId, {
        type: 'notification',
        notification: created,
      });
    } catch (wsError) {
      logger.warn('Failed to send WebSocket notification', {
        userId,
        notificationId: created.id,
        error: wsError.message,
      });
    }

    logger.debug('Notification created', { id: created.id, type, userId });
    return created;
  } catch (error) {
    logger.error('Failed to create notification', {
      error: error.message,
      data: { type: data.type, userId: data.userId },
    });
    return null;
  }
}

async function createBulkNotifications(notifications) {
  if (!notifications || notifications.length === 0) return [];

  try {
    const created = [];
    for (const item of notifications) {
      const notification = await createNotification(item);
      if (notification) {
        created.push(notification);
      }
    }
    logger.debug('Bulk notifications created', { count: created.length });
    return created;
  } catch (error) {
    logger.error('Failed to create bulk notifications', {
      error: error.message,
      count: notifications.length,
    });
    return [];
  }
}

async function notifyOrgAdmins(organizationId, data) {
  try {
    const admins = await prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    if (!admins || admins.length === 0) return [];

    const notifications = admins.map((admin) => ({
      ...data,
      userId: admin.id,
      organizationId,
    }));

    return await createBulkNotifications(notifications);
  } catch (error) {
    logger.error('Failed to notify org admins', {
      error: error.message,
      organizationId,
    });
    return [];
  }
}

async function notifyLeadOwner(leadId, data) {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedToId: true, organizationId: true },
    });

    if (!lead || !lead.assignedToId) {
      logger.debug('No assigned owner for lead', { leadId });
      return null;
    }

    return await createNotification({
      ...data,
      userId: lead.assignedToId,
      organizationId: data.organizationId || lead.organizationId,
    });
  } catch (error) {
    logger.error('Failed to notify lead owner', {
      error: error.message,
      leadId,
    });
    return null;
  }
}

async function notifyTeamMembers(organizationId, data, excludeUserId = null) {
  try {
    const where = {
      organizationId,
      isActive: true,
    };

    if (excludeUserId) {
      where.id = { not: excludeUserId };
    }

    const members = await prisma.user.findMany({
      where,
      select: { id: true },
    });

    if (!members || members.length === 0) return [];

    const notifications = members.map((member) => ({
      ...data,
      userId: member.id,
      organizationId,
    }));

    return await createBulkNotifications(notifications);
  } catch (error) {
    logger.error('Failed to notify team members', {
      error: error.message,
      organizationId,
    });
    return [];
  }
}

module.exports = {
  createNotification,
  createBulkNotifications,
  notifyOrgAdmins,
  notifyLeadOwner,
  notifyTeamMembers,
  NOTIFICATION_TYPES,
};
