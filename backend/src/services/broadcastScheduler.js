const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { sendTemplate: sendWhatsAppTemplate } = require('./whatsappService');

const BROADCAST_SCHEDULER_INTERVAL_MS = 30 * 1000;
// Keep well below Meta's ~80 msg/s soft limit. 50ms gives ~20 msg/s — safe for large lists.
const SEND_THROTTLE_MS = 50;
let intervalRef = null;
let isRunning = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildTemplateComponentsFromVariables(variables) {
  if (!variables || typeof variables !== 'object') return [];
  const entries = Object.entries(variables)
    .map(([k, v]) => [String(k || '').trim(), String(v ?? '').trim()])
    .filter(([k, v]) => k && v);
  if (entries.length === 0) return [];
  entries.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));
  return [
    {
      type: 'body',
      parameters: entries.map(([, value]) => ({ type: 'text', text: value })),
    },
  ];
}

async function runBroadcastNow(broadcastId) {
  const run = await prisma.whatsAppBroadcastRun.findUnique({
    where: { id: broadcastId },
  });
  if (!run) throw new Error('Broadcast run not found');
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
    return run;
  }

  await prisma.whatsAppBroadcastRun.update({
    where: { id: broadcastId },
    data: { status: 'RUNNING', startedAt: run.startedAt || new Date(), lastError: null },
  });

  const recipients = await prisma.whatsAppBroadcastRecipient.findMany({
    where: { broadcastId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  const components = buildTemplateComponentsFromVariables(run.variables || {});
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    try {
      const out = await sendWhatsAppTemplate(
        r.phone,
        run.templateName,
        run.templateLanguage || 'en_US',
        run.organizationId,
        components,
      );
      sent++;
      await prisma.whatsAppBroadcastRecipient.update({
        where: { id: r.id },
        data: {
          status: 'SENT',
          waMessageId: out?.messageId || null,
          attemptCount: { increment: 1 },
          sentAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      failed++;
      await prisma.whatsAppBroadcastRecipient.update({
        where: { id: r.id },
        data: {
          status: 'FAILED',
          attemptCount: { increment: 1 },
          error: err?.message || 'Send failed',
        },
      });
    }
    // Rate throttle — avoid hammering Meta API; skip delay after last recipient
    if (i < recipients.length - 1) {
      await sleep(SEND_THROTTLE_MS);
    }
  }

  const totals = await prisma.whatsAppBroadcastRecipient.groupBy({
    by: ['status'],
    where: { broadcastId },
    _count: { _all: true },
  });
  const sentCount = Number(totals.find((t) => t.status === 'SENT')?._count?._all || 0);
  const failedCount = Number(totals.find((t) => t.status === 'FAILED')?._count?._all || 0);
  const totalRecipients = sentCount + failedCount;

  return prisma.whatsAppBroadcastRun.update({
    where: { id: broadcastId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      sentCount,
      failedCount,
      totalRecipients,
      lastError: failed > 0 ? `${failed} recipients failed` : null,
    },
  });
}

async function runDueScheduledBroadcasts() {
  if (isRunning) return;
  isRunning = true;
  try {
    const dueRuns = await prisma.whatsAppBroadcastRun.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      select: { id: true },
    });
    for (const run of dueRuns) {
      try {
        await runBroadcastNow(run.id);
      } catch (err) {
        await prisma.whatsAppBroadcastRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            lastError: err?.message || 'Broadcast execution failed',
          },
        }).catch(() => {});
        logger.error('[BroadcastScheduler] Run failed', { runId: run.id, err: err?.message || String(err) });
      }
    }
  } finally {
    isRunning = false;
  }
}

function startBroadcastScheduler(intervalMs = BROADCAST_SCHEDULER_INTERVAL_MS, options = {}) {
  const { runOnStart = true, initialDelayMs = 15000 } = options;
  if (intervalRef) return;
  logger.info(`[BroadcastScheduler] Starting scheduler (interval: ${Math.round(intervalMs / 1000)}s)`);
  if (runOnStart) {
    setTimeout(() => {
      runDueScheduledBroadcasts().catch((err) =>
        logger.error('[BroadcastScheduler] Initial check failed', { err: err?.message || String(err) }),
      );
    }, Math.max(0, Number(initialDelayMs) || 0));
  }
  intervalRef = setInterval(() => {
    runDueScheduledBroadcasts().catch((err) =>
      logger.error('[BroadcastScheduler] Periodic check failed', { err: err?.message || String(err) }),
    );
  }, intervalMs);
}

function stopBroadcastScheduler() {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
  logger.info('[BroadcastScheduler] Scheduler stopped');
}

module.exports = {
  buildTemplateComponentsFromVariables,
  runBroadcastNow,
  runDueScheduledBroadcasts,
  startBroadcastScheduler,
  stopBroadcastScheduler,
};
