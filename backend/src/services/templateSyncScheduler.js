/**
 * Template Status Sync Scheduler
 *
 * Runs every 5 minutes. Finds all organizations that have templates in a
 * non-terminal status (PENDING, APPROVED — effectively any status that Meta
 * can still change), fetches the latest statuses from Meta, and updates
 * the local DB records.
 *
 * "PENDING" → Meta is reviewing the template (can become APPROVED or REJECTED)
 * "APPROVED" → Live and usable (can be paused/flagged by Meta without notice)
 *
 * We sync any template that was last synced more than 4 minutes ago to avoid
 * hammering Meta's API while still catching quick approvals.
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { fetchMessageTemplatesFromMeta } = require('./whatsappService');
const { recordTokenOk, recordTokenError, isTokenError } = require('../utils/whatsappTokenHealth');

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Only re-sync templates that haven't been checked in the last 4 minutes
const STALE_THRESHOLD_MS = 4 * 60 * 1000;
// Statuses that Meta can still change — always worth re-checking
const WATCHED_STATUSES = ['PENDING', 'APPROVED', 'PAUSED', 'IN_APPEAL'];

let intervalRef = null;

async function runTemplateSync() {
  // Find all distinct organization IDs that have at least one template in a watched status
  // and that hasn't been synced recently.
  let orgIds;
  try {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);
    const rows = await prisma.whatsAppMessageTemplate.findMany({
      where: {
        status: { in: WATCHED_STATUSES },
        lastSyncedAt: { lt: staleThreshold },
      },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });
    orgIds = rows.map((r) => r.organizationId);
  } catch (err) {
    logger.error('[TemplateSyncScheduler] Failed to query orgs for sync', { err: err?.message });
    return;
  }

  if (orgIds.length === 0) return;

  logger.info('[TemplateSyncScheduler] Syncing template statuses', { orgCount: orgIds.length });

  for (const orgId of orgIds) {
    try {
      const metaTemplates = await fetchMessageTemplatesFromMeta(orgId);
      // Successful fetch — clear any previous token error
      recordTokenOk(orgId).catch(() => {});
      if (!Array.isArray(metaTemplates) || metaTemplates.length === 0) continue;

      const now = new Date();
      // Build a lookup map: waTemplateId → meta data
      const metaMap = new Map(metaTemplates.map((t) => [t.waTemplateId, t]));

      // Fetch all local templates for this org that we're watching
      const localTemplates = await prisma.whatsAppMessageTemplate.findMany({
        where: { organizationId: orgId, status: { in: WATCHED_STATUSES } },
        select: { id: true, waTemplateId: true, status: true, rejectedReason: true },
      });

      for (const local of localTemplates) {
        const meta = metaMap.get(local.waTemplateId);
        if (!meta) continue;

        const statusChanged = meta.status !== local.status;
        const reasonChanged = (meta.rejectedReason ?? null) !== (local.rejectedReason ?? null);

        if (!statusChanged && !reasonChanged) {
          // Still mark lastSyncedAt so we don't keep re-querying unnecessarily
          await prisma.whatsAppMessageTemplate.update({
            where: { id: local.id },
            data: { lastSyncedAt: now },
          });
          continue;
        }

        await prisma.whatsAppMessageTemplate.update({
          where: { id: local.id },
          data: {
            status: meta.status ?? local.status,
            rejectedReason: meta.rejectedReason ?? null,
            components: meta.components ?? undefined,
            lastSyncedAt: now,
            updatedAt: now,
          },
        });

        if (statusChanged) {
          logger.info('[TemplateSyncScheduler] Template status updated', {
            orgId,
            waTemplateId: local.waTemplateId,
            from: local.status,
            to: meta.status,
          });
        }
      }
    } catch (err) {
      // Non-critical: a single org failure should not stop the rest
      logger.warn('[TemplateSyncScheduler] Failed to sync templates for org', {
        orgId,
        err: err?.message,
      });
      // Persist token error if this was an auth failure
      if (isTokenError(err?.statusCode, err?.details)) {
        recordTokenError(orgId, err?.message || 'WhatsApp token expired or invalid').catch(() => {});
      }
    }
  }
}

function startTemplateSyncScheduler(_, opts = {}) {
  const { runOnStart = false, initialDelayMs = 0 } = opts;

  if (intervalRef) return; // already running

  const start = () => {
    intervalRef = setInterval(() => {
      runTemplateSync().catch((err) =>
        logger.error('[TemplateSyncScheduler] Unhandled error', { err: err?.message }),
      );
    }, SYNC_INTERVAL_MS);

    logger.info('[TemplateSyncScheduler] Started', { intervalMs: SYNC_INTERVAL_MS });

    if (runOnStart) {
      runTemplateSync().catch((err) =>
        logger.error('[TemplateSyncScheduler] Initial run failed', { err: err?.message }),
      );
    }
  };

  if (initialDelayMs > 0) {
    setTimeout(start, initialDelayMs);
  } else {
    start();
  }
}

function stopTemplateSyncScheduler() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
    logger.info('[TemplateSyncScheduler] Stopped');
  }
}

module.exports = { startTemplateSyncScheduler, stopTemplateSyncScheduler, runTemplateSync };
