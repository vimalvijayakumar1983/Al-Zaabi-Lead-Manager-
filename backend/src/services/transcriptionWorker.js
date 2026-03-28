const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { transcribeRecordingForOrg } = require('./callTranscriptionService');
const { generateCallPerformanceInsights } = require('./aiService');

const INTERVAL_MS = 15 * 1000;
const MAX_ATTEMPTS = 5;
const STUCK_PROCESSING_MS = 20 * 60 * 1000;

let intervalRef = null;

function mergeMetadata(prev, patch) {
  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
  return { ...base, ...patch };
}

async function resetStuckJobs() {
  const threshold = new Date(Date.now() - STUCK_PROCESSING_MS);
  const res = await prisma.callTranscriptionJob.updateMany({
    where: {
      status: 'PROCESSING',
      updatedAt: { lt: threshold },
    },
    data: {
      status: 'PENDING',
      lastError: 'Reset after stuck PROCESSING',
    },
  });
  if (res.count > 0) {
    logger.warn('[TranscriptionWorker] Reset stuck jobs', { count: res.count });
  }
}

async function processOneJob() {
  await resetStuckJobs();

  const job = await prisma.$transaction(async (tx) => {
    const next = await tx.callTranscriptionJob.findFirst({
      where: {
        status: 'PENDING',
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) return null;

    const updated = await tx.callTranscriptionJob.updateMany({
      where: { id: next.id, status: 'PENDING' },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (updated.count === 0) return null;
    return tx.callTranscriptionJob.findUnique({ where: { id: next.id } });
  });

  if (!job) return;

  const callLog = await prisma.callLog.findUnique({
    where: { id: job.callLogId },
    include: {
      lead: { select: { firstName: true, lastName: true, phone: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });

  if (!callLog) {
    await prisma.callTranscriptionJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: 'Call log missing' },
    });
    return;
  }

  const meta = callLog.metadata && typeof callLog.metadata === 'object' ? callLog.metadata : {};
  const recordingUrl = String(meta.recordingUrl || meta.filename || '').trim();
  if (!recordingUrl) {
    await prisma.callTranscriptionJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', lastError: 'No recording URL in metadata' },
    });
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        metadata: mergeMetadata(meta, {
          processingStatus: 'FAILED',
          processingError: 'No recording URL',
        }),
      },
    });
    return;
  }

  try {
    const stt = await transcribeRecordingForOrg(prisma, job.organizationId, recordingUrl);

    const callMeta = {
      durationSeconds: callLog.duration,
      detectedLanguage: stt.detectedLanguage,
      agentName: callLog.user
        ? `${callLog.user.firstName} ${callLog.user.lastName}`.trim()
        : null,
      leadPhone: callLog.lead?.phone || null,
    };

    const insights = await generateCallPerformanceInsights({
      transcript: stt.text,
      callMeta,
    });

    const nextMeta = mergeMetadata(meta, {
      transcript: stt.text,
      detectedLanguage: stt.detectedLanguage,
      languageConfidence: stt.languageConfidence,
      sttProvider: stt.rawProvider,
      callPerformance: insights,
      processingStatus: 'DONE',
      processingError: null,
    });

    await prisma.$transaction([
      prisma.callLog.update({
        where: { id: callLog.id },
        data: { metadata: nextMeta },
      }),
      prisma.callTranscriptionJob.update({
        where: { id: job.id },
        data: { status: 'DONE', lastError: null },
      }),
    ]);

    logger.info('[TranscriptionWorker] Completed job', { jobId: job.id, callLogId: callLog.id });
  } catch (err) {
    const msg = String(err?.message || err).slice(0, 1200);
    const attemptsAfter = job.attempts;
    const requeue = attemptsAfter < MAX_ATTEMPTS;

    await prisma.callTranscriptionJob.update({
      where: { id: job.id },
      data: {
        status: requeue ? 'PENDING' : 'FAILED',
        lastError: msg,
      },
    });

    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        metadata: mergeMetadata(meta, {
          processingStatus: requeue ? 'PENDING_RETRY' : 'FAILED',
          processingError: msg,
        }),
      },
    });

    logger.warn('[TranscriptionWorker] Job failed', {
      jobId: job.id,
      requeue,
      error: msg,
    });
  }
}

async function tick() {
  try {
    await processOneJob();
  } catch (e) {
    logger.error('[TranscriptionWorker] tick error', { message: e.message });
  }
}

function startTranscriptionWorker(intervalMs = INTERVAL_MS, options = {}) {
  const { runOnStart = true, initialDelayMs = 5000 } = options;
  if (intervalRef) return;
  logger.info(`[TranscriptionWorker] Starting (interval ${Math.round(intervalMs / 1000)}s)`);
  if (runOnStart) {
    setTimeout(() => {
      tick();
    }, Math.max(0, Number(initialDelayMs) || 0));
  }
  intervalRef = setInterval(tick, intervalMs);
}

function stopTranscriptionWorker() {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
  logger.info('[TranscriptionWorker] Stopped');
}

module.exports = {
  startTranscriptionWorker,
  stopTranscriptionWorker,
  processOneJob,
  MAX_ATTEMPTS,
};
