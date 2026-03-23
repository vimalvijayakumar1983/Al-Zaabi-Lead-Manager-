/**
 * Will-Call-Again Safety Net Scheduler
 *
 * For call logs marked as WILL_CALL_US_AGAIN, create a gentle, low-priority
 * follow-up only if the lead has not sent any inbound communication within
 * the expected callback window.
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { createNotification, NOTIFICATION_TYPES } = require('./notificationService');

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const DEFAULT_WAIT_DAYS = 7;
const EXPECTED_WINDOW_DAYS = {
  WITHIN_24_HOURS: 1,
  WITHIN_3_DAYS: 3,
  WITHIN_7_DAYS: 7,
  WITHIN_14_DAYS: 14,
};

let intervalHandle = null;

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

function asObject(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function resolveWaitDays(expectedCallbackWindow) {
  return EXPECTED_WINDOW_DAYS[expectedCallbackWindow] || DEFAULT_WAIT_DAYS;
}

async function checkWillCallAgainSafetyNet() {
  try {
    const now = new Date();
    const callLogs = await prisma.callLog.findMany({
      where: {
        disposition: 'WILL_CALL_US_AGAIN',
        followUpTaskId: null,
        NOT: {
          metadata: {
            path: ['safetyNetResolved'],
            equals: true,
          },
        },
      },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            organizationId: true,
            assignedToId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const logEntry of callLogs) {
      try {
        if (!logEntry.lead) continue;
        if (['WON', 'LOST'].includes(logEntry.lead.status)) continue;

        const metadata = asObject(logEntry.metadata);
        if (metadata.safetyNetTaskCreated || metadata.clientCalledBack) continue;

        const waitDays = resolveWaitDays(metadata.expectedCallbackWindow);
        const thresholdDate = new Date(new Date(logEntry.createdAt).getTime() + waitDays * 24 * 60 * 60 * 1000);
        if (thresholdDate > now) continue;

        const inbound = await prisma.communication.findFirst({
          where: {
            leadId: logEntry.leadId,
            direction: 'INBOUND',
            createdAt: { gt: logEntry.createdAt },
          },
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        });

        if (inbound) {
          await prisma.callLog.update({
            where: { id: logEntry.id },
            data: {
              metadata: {
                ...metadata,
                safetyNetResolved: true,
                clientCalledBack: true,
                clientCalledBackAt: inbound.createdAt.toISOString(),
              },
            },
          });
          continue;
        }

        const assigneeId = logEntry.lead.assignedToId || logEntry.userId;
        if (!assigneeId) {
          logger.warn(`[WillCallAgainSafetyNet] Skipped call log ${logEntry.id} (no assignee)`);
          continue;
        }

        const safetyMarker = `SafetyNetRef:${logEntry.id}`;
        const existingTask = await prisma.task.findFirst({
          where: {
            leadId: logEntry.leadId,
            status: { in: ['PENDING', 'IN_PROGRESS'] },
            description: { contains: safetyMarker },
          },
          select: { id: true },
        });

        if (existingTask) {
          await prisma.callLog.update({
            where: { id: logEntry.id },
            data: {
              followUpTaskId: existingTask.id,
              metadata: {
                ...metadata,
                safetyNetTaskCreated: true,
                safetyNetTaskCreatedAt: now.toISOString(),
                safetyNetResolved: true,
              },
            },
          });
          continue;
        }

        const leadName = getDisplayName(logEntry.lead);
        const task = await prisma.task.create({
          data: {
            title: `Gentle check-in: ${leadName}`,
            description: `Client said they will call us again, but no inbound response arrived in ${waitDays} day(s). Send a soft, value-first update about services/brand.\n\n${safetyMarker}`,
            type: 'EMAIL',
            priority: 'LOW',
            status: 'PENDING',
            dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            leadId: logEntry.leadId,
            assigneeId,
            createdById: logEntry.userId || assigneeId,
          },
        });

        await prisma.callLog.update({
          where: { id: logEntry.id },
          data: {
            followUpTaskId: task.id,
            metadata: {
              ...metadata,
              safetyNetTaskCreated: true,
              safetyNetTaskCreatedAt: now.toISOString(),
              safetyNetResolved: true,
            },
          },
        });

        await prisma.leadActivity.create({
          data: {
            leadId: logEntry.leadId,
            userId: logEntry.userId || assigneeId,
            type: 'TASK_CREATED',
            description: `Safety net task created after no client callback (${waitDays} day inactivity window).`,
            metadata: {
              trigger: 'will_call_us_again_safety_net',
              callLogId: logEntry.id,
              taskId: task.id,
              inactivityDays: waitDays,
            },
          },
        });

        await createNotification({
          type: NOTIFICATION_TYPES.TASK_ASSIGNED,
          title: `Safety Net Follow-up: ${leadName}`,
          message: `Client said they would call back, but no inbound response was received. A gentle follow-up task has been created.`,
          userId: assigneeId,
          entityType: 'task',
          entityId: task.id,
          metadata: { callLogId: logEntry.id, trigger: 'will_call_us_again_safety_net' },
          organizationId: logEntry.lead.organizationId,
        });

        logger.info(`[WillCallAgainSafetyNet] Created safety-net task ${task.id} for call log ${logEntry.id}`);
      } catch (entryErr) {
        logger.error(`[WillCallAgainSafetyNet] Failed processing call log ${logEntry.id}:`, entryErr.message);
      }
    }
  } catch (err) {
    logger.error('[WillCallAgainSafetyNet] Scheduler error:', err.message);
  }
}

function startWillCallAgainSafetyNetScheduler(intervalMs = CHECK_INTERVAL_MS, options = {}) {
  const { runOnStart = true, initialDelayMs = 0 } = options;
  if (intervalHandle) {
    logger.warn('[WillCallAgainSafetyNet] Scheduler already running');
    return;
  }

  logger.info(`[WillCallAgainSafetyNet] Starting scheduler (interval: ${intervalMs / 1000}s)`);
  if (runOnStart) {
    setTimeout(() => {
      checkWillCallAgainSafetyNet().catch((err) => logger.error('[WillCallAgainSafetyNet] Initial check failed:', err.message));
    }, Math.max(0, Number(initialDelayMs) || 0));
  }
  intervalHandle = setInterval(() => {
    checkWillCallAgainSafetyNet().catch((runErr) => logger.error('[WillCallAgainSafetyNet] Periodic check failed:', runErr.message));
  }, intervalMs);
}

function stopWillCallAgainSafetyNetScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('[WillCallAgainSafetyNet] Scheduler stopped');
  }
}

module.exports = {
  startWillCallAgainSafetyNetScheduler,
  stopWillCallAgainSafetyNetScheduler,
  checkWillCallAgainSafetyNet,
};
