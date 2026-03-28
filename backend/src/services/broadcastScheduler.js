const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { sendTemplate: sendWhatsAppTemplate } = require('./whatsappService');

const BROADCAST_SCHEDULER_INTERVAL_MS = 30 * 1000;
// Keep well below Meta's ~80 msg/s soft limit. 50ms gives ~20 msg/s — safe for large lists.
const SEND_THROTTLE_MS = 50;
const MAX_BROADCAST_RETRY_ATTEMPTS = 3;
let intervalRef = null;
let isRunning = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeWhatsAppSendError(err) {
  const details = err?.details?.error || err?.details || {};
  const code = details?.code != null ? String(details.code) : null;
  const subcode = details?.error_subcode != null ? String(details.error_subcode) : null;
  const transient = details?.is_transient === true;
  const title = String(details?.error_user_title || details?.type || '').trim();
  const userMsg = String(details?.error_user_msg || '').trim();
  const baseMessage = String(err?.message || 'Send failed').trim();

  const codePart = [code, subcode].filter(Boolean).join('/');
  const prefix = codePart ? `[WA_${codePart}] ` : '';
  const hint = userMsg || title || '';
  const tail = hint && hint !== baseMessage ? ` - ${hint}` : '';
  const transientTag = transient ? ' (transient)' : '';
  return `${prefix}${baseMessage}${tail}${transientTag}`.slice(0, 500);
}

async function claimScheduledRun(runId) {
  const now = new Date();
  const result = await prisma.whatsAppBroadcastRun.updateMany({
    where: { id: runId, status: 'SCHEDULED' },
    data: { status: 'RUNNING', startedAt: now, lastError: null },
  });
  return result.count > 0;
}

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
  let run = await prisma.whatsAppBroadcastRun.findUnique({
    where: { id: broadcastId },
  });
  if (!run) throw new Error('Broadcast run not found');
  if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
    return run;
  }

  // Idempotent transition: only claim from SCHEDULED once.
  if (run.status === 'SCHEDULED') {
    const claimed = await claimScheduledRun(broadcastId);
    if (!claimed) {
      // Another worker/process claimed it first.
      const latest = await prisma.whatsAppBroadcastRun.findUnique({ where: { id: broadcastId } });
      return latest || run;
    }
    run = await prisma.whatsAppBroadcastRun.findUnique({ where: { id: broadcastId } });
  } else if (run.status === 'RUNNING' && !run.startedAt) {
    // Backfill startedAt when needed; keep RUNNING state untouched.
    await prisma.whatsAppBroadcastRun.update({
      where: { id: broadcastId },
      data: { startedAt: new Date(), lastError: null },
    });
  }

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
          error: normalizeWhatsAppSendError(err),
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

  const finalStatus = sentCount === 0 && failedCount > 0 ? 'FAILED' : 'COMPLETED';
  return prisma.whatsAppBroadcastRun.update({
    where: { id: broadcastId },
    data: {
      status: finalStatus,
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
        const claimed = await claimScheduledRun(run.id);
        if (!claimed) continue;
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
  MAX_BROADCAST_RETRY_ATTEMPTS,
  buildTemplateComponentsFromVariables,
  claimScheduledRun,
  runBroadcastNow,
  runDueScheduledBroadcasts,
  startBroadcastScheduler,
  stopBroadcastScheduler,
};
