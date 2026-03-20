const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser } = require('../websocket/server');

// ============================================================
// Notification Type Constants
// ============================================================
const NOTIFICATION_TYPES = {
  // Lead notifications
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_STATUS_CHANGED: 'LEAD_STATUS_CHANGED',
  LEAD_WON: 'LEAD_WON',
  LEAD_LOST: 'LEAD_LOST',
  LEAD_SCORE_CHANGED: 'LEAD_SCORE_CHANGED',

  // Task notifications
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_REMINDER: 'TASK_REMINDER',

  // Pipeline notifications
  PIPELINE_STAGE_CHANGED: 'PIPELINE_STAGE_CHANGED',

  // Campaign notifications
  CAMPAIGN_STARTED: 'CAMPAIGN_STARTED',
  CAMPAIGN_COMPLETED: 'CAMPAIGN_COMPLETED',
  CAMPAIGN_BUDGET_ALERT: 'CAMPAIGN_BUDGET_ALERT',

  // Integration notifications
  INTEGRATION_CONNECTED: 'INTEGRATION_CONNECTED',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INTEGRATION_LEAD_RECEIVED: 'INTEGRATION_LEAD_RECEIVED',

  // Team notifications
  TEAM_MEMBER_INVITED: 'TEAM_MEMBER_INVITED',
  TEAM_MEMBER_ROLE_CHANGED: 'TEAM_MEMBER_ROLE_CHANGED',
  TEAM_MEMBER_DEACTIVATED: 'TEAM_MEMBER_DEACTIVATED',

  // Division notifications
  DIVISION_CREATED: 'DIVISION_CREATED',
  DIVISION_USER_TRANSFERRED: 'DIVISION_USER_TRANSFERRED',

  // Import notifications
  IMPORT_COMPLETED: 'IMPORT_COMPLETED',
  IMPORT_FAILED: 'IMPORT_FAILED',

  // Automation notifications
  AUTOMATION_TRIGGERED: 'AUTOMATION_TRIGGERED',
  AUTOMATION_ERROR: 'AUTOMATION_ERROR',

  // Callback reminder notifications
  CALLBACK_REMINDER: 'CALLBACK_REMINDER',
  CALLBACK_REMINDER_HANDOFF: 'CALLBACK_REMINDER_HANDOFF',

  // System notifications
  SYSTEM_ANNOUNCEMENT: 'SYSTEM_ANNOUNCEMENT',
};

// ============================================================
// Core: Create a single notification
// ============================================================
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

    const notification = await prisma.notification.create({
      data: {
        type,
        title,
        message,
        userId,
        actorId,
        entityType,
        entityId,
        metadata,
        organizationId,
      },
    });

    // Send real-time WebSocket notification
    try {
      notifyUser(userId, {
        type: 'notification',
        notification,
      });
    } catch (wsError) {
      logger.warn('Failed to send WebSocket notification', {
        userId,
        notificationId: notification.id,
        error: wsError.message,
      });
    }

    logger.debug('Notification created', { id: notification.id, type, userId });
    return notification;
  } catch (error) {
    logger.error('Failed to create notification', {
      error: error.message,
      data: { type: data.type, userId: data.userId },
    });
    return null;
  }
}

// ============================================================
// Core: Create bulk notifications (transactional)
// ============================================================
async function createBulkNotifications(notifications) {
  if (!notifications || notifications.length === 0) return [];

  try {
    const created = [];

    await prisma.$transaction(async (tx) => {
      for (const data of notifications) {
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

        const notification = await tx.notification.create({
          data: {
            type,
            title,
            message,
            userId,
            actorId,
            entityType,
            entityId,
            metadata,
            organizationId,
          },
        });

        created.push(notification);
      }
    });

    // Send WebSocket notifications outside the transaction
    for (const notification of created) {
      try {
        notifyUser(notification.userId, {
          type: 'notification',
          notification,
        });
      } catch (wsError) {
        logger.warn('Failed to send WebSocket notification', {
          userId: notification.userId,
          notificationId: notification.id,
          error: wsError.message,
        });
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

// ============================================================
// Helper: Notify all org admins
// ============================================================
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

// ============================================================
// Helper: Notify the assigned owner of a lead
// ============================================================
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

// ============================================================
// Helper: Notify all active team members (except actor)
// ============================================================
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
