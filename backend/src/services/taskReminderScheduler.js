/**
 * Task Reminder Scheduler
 *
 * Monitors tasks for due-soon and overdue conditions and fires
 * real-time popup notifications to assigned users.
 *
 * ── How It Works ────────────────────────────────────────────────────
 *
 *  1. Runs every 30 seconds
 *  2. Finds tasks that are due within the next 30 minutes (TASK_DUE_SOON)
 *  3. Finds tasks that are past their due date (TASK_OVERDUE)
 *  4. Sends notifications only once per task per type (tracked via metadata)
 *  5. Also sends TASK_DUE_SOON when a task is due within 1 hour
 *
 * @module services/taskReminderScheduler
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { createNotification, NOTIFICATION_TYPES } = require('./notificationService');

// Check every 30 seconds for near-instant reminder delivery
const TASK_CHECK_INTERVAL = 30 * 1000;

// Due-soon threshold: notify when task is due within 30 minutes
const DUE_SOON_MINUTES = 30;

let taskReminderInterval = null;

/**
 * Main scheduler loop — checks for due-soon and overdue tasks.
 */
async function checkTaskReminders() {
  try {
    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + DUE_SOON_MINUTES * 60 * 1000);

    // ── Find tasks that are DUE SOON (due within next 30 minutes, not yet notified) ──
    const dueSoonTasks = await prisma.task.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: {
          gt: now,
          lte: dueSoonThreshold,
        },
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, organizationId: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const task of dueSoonTasks) {
      try {
        const minutesLeft = Math.round((new Date(task.dueAt).getTime() - now.getTime()) / 60000);
        const leadName = task.lead
          ? `${(task.lead.firstName || '').trim()} ${(task.lead.lastName || '').trim()}`.trim() || 'Unknown'
          : '';
        const leadContext = leadName ? ` for ${leadName}` : '';

        await createNotification({
          type: NOTIFICATION_TYPES.TASK_DUE_SOON,
          title: 'Task Due Soon',
          message: `"${task.title}"${leadContext} is due in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}`,
          userId: task.assigneeId,
          entityType: 'task',
          entityId: task.id,
          metadata: {
            minutesLeft,
            taskTitle: task.title,
            dedupeKey: `task_due_soon:${task.id}:${new Date(task.dueAt).toISOString()}`,
            dedupeWindowMinutes: 1440,
            bundle: false,
          },
          organizationId: task.assignee.organizationId,
        });
        logger.info(`[TaskReminder] Due-soon notification sent for task ${task.id} to user ${task.assigneeId}`);
      } catch (err) {
        logger.error(`[TaskReminder] Error sending due-soon for task ${task.id}:`, err.message);
      }
    }

    // ── Find tasks with a custom REMINDER time that has arrived ──
    const reminderTasks = await prisma.task.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        reminder: {
          gt: new Date(now.getTime() - 60 * 1000), // within last 60s (to catch on this poll cycle)
          lte: now,
        },
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, organizationId: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const task of reminderTasks) {
      try {
        const leadName = task.lead
          ? `${(task.lead.firstName || '').trim()} ${(task.lead.lastName || '').trim()}`.trim() || 'Unknown'
          : '';
        const leadContext = leadName ? ` for ${leadName}` : '';

        await createNotification({
          type: NOTIFICATION_TYPES.TASK_REMINDER,
          title: 'Task Reminder',
          message: `Reminder: "${task.title}"${leadContext}`,
          userId: task.assigneeId,
          entityType: 'task',
          entityId: task.id,
          metadata: {
            taskTitle: task.title,
            dedupeKey: `task_reminder:${task.id}:${task.reminder ? new Date(task.reminder).toISOString() : 'none'}`,
            dedupeWindowMinutes: 1440,
            bundle: false,
          },
          organizationId: task.assignee.organizationId,
        });
        logger.info(`[TaskReminder] Reminder notification sent for task ${task.id} to user ${task.assigneeId}`);
      } catch (err) {
        logger.error(`[TaskReminder] Error sending reminder for task ${task.id}:`, err.message);
      }
    }

    // ── Find OVERDUE tasks (past due date, still open, not yet notified) ──
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueAt: { lt: now },
      },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, organizationId: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    for (const task of overdueTasks) {
      try {
        const minutesOverdue = Math.round((now.getTime() - new Date(task.dueAt).getTime()) / 60000);
        const leadName = task.lead
          ? `${(task.lead.firstName || '').trim()} ${(task.lead.lastName || '').trim()}`.trim() || 'Unknown'
          : '';
        const leadContext = leadName ? ` for ${leadName}` : '';

        let overdueText;
        if (minutesOverdue < 60) {
          overdueText = `${minutesOverdue} minute${minutesOverdue !== 1 ? 's' : ''} overdue`;
        } else {
          const hours = Math.round(minutesOverdue / 60);
          overdueText = `${hours} hour${hours !== 1 ? 's' : ''} overdue`;
        }

        await createNotification({
          type: NOTIFICATION_TYPES.TASK_OVERDUE,
          title: 'Task Overdue',
          message: `"${task.title}"${leadContext} is ${overdueText}`,
          userId: task.assigneeId,
          entityType: 'task',
          entityId: task.id,
          metadata: {
            minutesOverdue,
            taskTitle: task.title,
            dedupeKey: `task_overdue:${task.id}:${Math.floor(now.getTime() / (6 * 60 * 60 * 1000))}`,
            dedupeWindowMinutes: 360,
            bundle: false,
          },
          organizationId: task.assignee.organizationId,
        });
        logger.info(`[TaskReminder] Overdue notification sent for task ${task.id} to user ${task.assigneeId}`);
      } catch (err) {
        logger.error(`[TaskReminder] Error sending overdue for task ${task.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('[TaskReminder] Scheduler error:', err.message);
  }
}

/**
 * Start the task reminder scheduler.
 */
function startTaskReminderScheduler(intervalMs = TASK_CHECK_INTERVAL) {
  if (taskReminderInterval) {
    logger.warn('[TaskReminder] Scheduler already running');
    return;
  }

  logger.info(`[TaskReminder] Starting task reminder scheduler (interval: ${intervalMs / 1000}s)`);

  // Run immediately on start
  checkTaskReminders().catch((err) => logger.error('[TaskReminder] Initial check failed:', err.message));

  taskReminderInterval = setInterval(() => {
    checkTaskReminders().catch((err) => logger.error('[TaskReminder] Periodic check failed:', err.message));
  }, intervalMs);
}

/**
 * Stop the task reminder scheduler.
 */
function stopTaskReminderScheduler() {
  if (taskReminderInterval) {
    clearInterval(taskReminderInterval);
    taskReminderInterval = null;
    logger.info('[TaskReminder] Scheduler stopped');
  }
}

module.exports = {
  startTaskReminderScheduler,
  stopTaskReminderScheduler,
  checkTaskReminders,
};
