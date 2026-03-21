const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { escalateNotification } = require('./notificationActionService');

const ESCALATION_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_ESCALATION_DELAY_MINUTES = 20;

let intervalHandle = null;

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

async function checkNotificationEscalations() {
  try {
    const cutoff = new Date(Date.now() - DEFAULT_ESCALATION_DELAY_MINUTES * 60 * 1000);
    const candidates = await prisma.notification.findMany({
      where: {
        isRead: false,
        isArchived: false,
        type: { in: ['TASK_REMINDER', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'CALLBACK_REMINDER', 'CALLBACK_REMINDER_HANDOFF'] },
        createdAt: { lte: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    for (const notification of candidates) {
      const metadata = asObject(notification.metadata);
      if (metadata.escalatedAt || metadata.escalationDisabled === true) {
        continue;
      }

      const result = await escalateNotification(notification, null, 'auto_timeout');
      if (result.ok && !result.alreadyEscalated) {
        logger.info('[NotificationEscalation] Escalated stale notification', {
          notificationId: notification.id,
          recipients: result.count,
        });
      }
    }
  } catch (error) {
    logger.error('[NotificationEscalation] Scheduler error', { error: error.message });
  }
}

function startNotificationEscalationScheduler(intervalMs = ESCALATION_INTERVAL_MS) {
  if (intervalHandle) {
    logger.warn('[NotificationEscalation] Scheduler already running');
    return;
  }

  logger.info(`[NotificationEscalation] Starting scheduler (interval: ${Math.floor(intervalMs / 1000)}s)`);
  checkNotificationEscalations().catch(() => {});
  intervalHandle = setInterval(() => {
    checkNotificationEscalations().catch(() => {});
  }, intervalMs);
}

function stopNotificationEscalationScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[NotificationEscalation] Scheduler stopped');
  }
}

module.exports = {
  startNotificationEscalationScheduler,
  stopNotificationEscalationScheduler,
  checkNotificationEscalations,
};
