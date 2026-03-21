const { prisma } = require('../config/database');
const { createBulkNotifications, NOTIFICATION_TYPES } = require('./notificationService');

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

async function markNotificationAction(notification, actionType, extraMetadata = {}, markRead = true) {
  const metadata = asObject(notification.metadata);
  const now = new Date();

  return prisma.notification.update({
    where: { id: notification.id },
    data: {
      isRead: markRead ? true : notification.isRead,
      readAt: markRead ? notification.readAt || now : notification.readAt,
      metadata: {
        ...metadata,
        actionType,
        actionedAt: now.toISOString(),
        ...extraMetadata,
      },
    },
  });
}

async function completeTaskFromNotification(notification, userId) {
  if (notification.entityType !== 'task' || !notification.entityId) {
    return { ok: false, error: 'Notification is not linked to a task' };
  }

  const task = await prisma.task.findUnique({
    where: { id: notification.entityId },
    select: {
      id: true,
      title: true,
      status: true,
      assigneeId: true,
      leadId: true,
      assignee: { select: { organizationId: true } },
    },
  });

  if (!task || task.assigneeId !== userId) {
    return { ok: false, error: 'Task not found or not assigned to you' };
  }

  if (task.status === 'COMPLETED') {
    return { ok: true, alreadyCompleted: true, taskId: task.id, title: task.title };
  }

  await prisma.task.update({
    where: { id: task.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  if (task.leadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: task.leadId,
        userId,
        type: 'TASK_COMPLETED',
        description: `Task completed from notification: ${task.title}`,
        metadata: { source: 'notification_action', notificationId: notification.id },
      },
    });
  }

  return {
    ok: true,
    taskId: task.id,
    title: task.title,
    organizationId: task.assignee.organizationId,
  };
}

async function snoozeNotification(notification, userId, minutes) {
  const snoozeMinutes = Number.isFinite(minutes) ? Math.max(5, Math.min(10080, Math.floor(minutes))) : 15;
  const now = new Date();
  const snoozedUntil = new Date(now.getTime() + snoozeMinutes * 60 * 1000);

  if (notification.entityType === 'task' && notification.entityId) {
    const task = await prisma.task.findUnique({
      where: { id: notification.entityId },
      select: {
        id: true,
        title: true,
        assigneeId: true,
      },
    });

    if (!task || task.assigneeId !== userId) {
      return { ok: false, error: 'Task not found or not assigned to you' };
    }

    await prisma.task.update({
      where: { id: task.id },
      data: { reminder: snoozedUntil },
    });

    return {
      ok: true,
      kind: 'task',
      snoozedUntil: snoozedUntil.toISOString(),
      message: `Task reminder snoozed by ${snoozeMinutes} minute(s).`,
    };
  }

  const metadata = asObject(notification.metadata);
  const callLogId = metadata.callLogId;
  if (typeof callLogId === 'string' && callLogId) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
      include: {
        lead: { select: { assignedToId: true } },
      },
    });

    if (!callLog || (callLog.lead?.assignedToId && callLog.lead.assignedToId !== userId)) {
      return { ok: false, error: 'Callback record unavailable for snooze' };
    }

    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        callbackDate: snoozedUntil,
        metadata: {
          ...asObject(callLog.metadata),
          reminderSent: false,
          reminderSentAt: null,
          snoozedByUserId: userId,
          snoozedAt: now.toISOString(),
          snoozedUntil: snoozedUntil.toISOString(),
        },
      },
    });

    return {
      ok: true,
      kind: 'callback',
      snoozedUntil: snoozedUntil.toISOString(),
      message: `Callback reminder snoozed by ${snoozeMinutes} minute(s).`,
    };
  }

  return { ok: false, error: 'This notification type cannot be snoozed' };
}

async function escalateNotification(notification, actorUserId, reason = 'manual') {
  const currentMetadata = asObject(notification.metadata);
  if (currentMetadata.escalatedAt) {
    return { ok: true, alreadyEscalated: true, count: 0 };
  }

  const recipients = await prisma.user.findMany({
    where: {
      organizationId: notification.organizationId,
      isActive: true,
      role: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] },
      id: { notIn: [notification.userId, actorUserId].filter(Boolean) },
    },
    orderBy: [{ role: 'desc' }, { lastLoginAt: 'desc' }],
    select: { id: true, firstName: true, lastName: true },
    take: 5,
  });

  if (recipients.length === 0) {
    return { ok: false, error: 'No escalation recipients found' };
  }

  const escalations = recipients.map((recipient) => ({
    type: NOTIFICATION_TYPES.NOTIFICATION_ESCALATED,
    title: `Escalation: ${notification.title}`,
    message: `${notification.message}\n\nEscalated for attention.`,
    userId: recipient.id,
    actorId: actorUserId || null,
    entityType: notification.entityType,
    entityId: notification.entityId,
    metadata: {
      sourceNotificationId: notification.id,
      sourceType: notification.type,
      escalationReason: reason,
      escalatedByUserId: actorUserId || null,
    },
    organizationId: notification.organizationId,
  }));

  await createBulkNotifications(escalations);

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      metadata: {
        ...currentMetadata,
        escalatedAt: new Date().toISOString(),
        escalatedByUserId: actorUserId || null,
        escalationReason: reason,
        escalationRecipientIds: recipients.map((r) => r.id),
      },
    },
  });

  return { ok: true, count: recipients.length };
}

module.exports = {
  markNotificationAction,
  completeTaskFromNotification,
  snoozeNotification,
  escalateNotification,
};
