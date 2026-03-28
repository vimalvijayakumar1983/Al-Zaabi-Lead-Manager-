const { Router } = require('express');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { runBroadcastNow, MAX_BROADCAST_RETRY_ATTEMPTS } = require('../services/broadcastScheduler');

const router = Router();
router.use(authenticate, orgScope);

async function resolveDivisionScopedOrgId(req, res, featureLabel) {
  const { divisionId } = req.query;
  if (req.isSuperAdmin) {
    if (!divisionId) {
      res.status(400).json({ error: `Please select a division to use ${featureLabel}` });
      return null;
    }
    if (!req.orgIds.includes(divisionId)) {
      res.status(403).json({ error: 'Division not found or access denied' });
      return null;
    }
    return divisionId;
  }
  return req.orgId;
}

function parseScheduledAtUAE(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;

  // If timezone is already explicit (Z / +HH:mm / -HH:mm), trust it.
  const hasExplicitTz = /(Z|[+-]\d{2}:\d{2})$/i.test(value);
  const normalized = hasExplicitTz
    ? value
    // Treat timezone-less inputs as UAE local time (+04:00).
    : `${value.replace(' ', 'T')}+04:00`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/** List broadcast lists for the org (division when super admin passes divisionId). */
router.get('/', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast lists');
    if (!orgId) return;

    const lists = await prisma.whatsAppBroadcastList.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        memberCount: Number(l.memberCount || 0),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/runs', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast runs');
    if (!orgId) return;
    const runs = await prisma.whatsAppBroadcastRun.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        list: { select: { id: true, name: true } },
      },
    });
    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

router.get('/runs/:runId', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast runs');
    if (!orgId) return;
    const run = await prisma.whatsAppBroadcastRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: {
        list: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!run) return res.status(404).json({ error: 'Broadcast run not found' });

    const recipients = await prisma.whatsAppBroadcastRecipient.findMany({
      where: { broadcastId: run.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            whatsappOptOut: true,
            whatsappOptOutAt: true,
          },
        },
      },
      take: 5000,
    });

    return res.json({
      run: {
        ...run,
        recipients: recipients.map((r) => ({
          id: r.id,
          leadId: r.leadId,
          phone: r.phone,
          status: r.status,
          waMessageId: r.waMessageId,
          error: r.error,
          attemptCount: r.attemptCount,
          sentAt: r.sentAt,
          deliveredAt: r.deliveredAt,
          readAt: r.readAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          lead: r.lead,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Single list with members (capped). */
router.get('/:id', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast lists');
    if (!orgId) return;

    const list = await prisma.whatsAppBroadcastList.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });

    if (!list) {
      return res.status(404).json({ error: 'Broadcast list not found' });
    }

    res.json({
      list: {
        id: list.id,
        name: list.name,
        slug: list.slug,
        memberCount: Number(list.memberCount || 0),
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        members: (
          await prisma.$queryRawUnsafe(
            `
            SELECT
              bll.id,
              COALESCE(l.phone, '') AS phone,
              COALESCE(l.phone, '') AS "phoneRaw",
              NULLIF(TRIM(COALESCE(l."firstName", '') || ' ' || COALESCE(l."lastName", '')), '') AS "displayName",
              bll."leadId",
              json_build_object(
                'id', l.id,
                'firstName', l."firstName",
                'lastName', l."lastName",
                'phone', l.phone,
                'email', l.email
              ) AS lead
            FROM "whatsapp_broadcast_list_leads" bll
            JOIN "leads" l ON l.id = bll."leadId"
            WHERE bll."listId" = $1
            ORDER BY bll."createdAt" ASC
            LIMIT 2000
          `,
            list.id,
          )
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Delete a list and all members. */
router.delete('/:id', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast lists');
    if (!orgId) return;

    const result = await prisma.whatsAppBroadcastList.deleteMany({
      where: { id: req.params.id, organizationId: orgId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Broadcast list not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send-template', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast lists');
    if (!orgId) return;

    const { templateId, variables = {}, mode = 'now', scheduledAt = null } = req.body || {};
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });

    const list = await prisma.whatsAppBroadcastList.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!list) return res.status(404).json({ error: 'Broadcast list not found' });

    const template = await prisma.whatsAppMessageTemplate.findFirst({
      where: { id: String(templateId), organizationId: orgId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const status = String(template.status || '').toUpperCase();
    if (status && status !== 'APPROVED') {
      return res.status(400).json({ error: `Template status is ${template.status}. Only APPROVED templates can be broadcast.` });
    }

    // ── Idempotency guard: block if an identical run is already active ────
    // "Identical" = same list + template, started within last 10 minutes, not yet failed/cancelled
    const recentRun = await prisma.whatsAppBroadcastRun.findFirst({
      where: {
        organizationId: orgId,
        listId: list.id,
        templateId: template.id,
        status: { in: ['SCHEDULED', 'RUNNING', 'COMPLETED'] },
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
      select: { id: true, status: true, createdAt: true },
    });
    if (recentRun) {
      return res.status(409).json({
        error: `A broadcast for this list + template is already ${recentRun.status.toLowerCase()} (run ID: ${recentRun.id}). Wait 10 minutes or use a different template.`,
        code: 'DUPLICATE_BROADCAST_RUN',
        existingRunId: recentRun.id,
      });
    }

    // ── Fetch eligible recipients: skip doNotCall and WhatsApp opted-out leads ──
    const allTargets = (await prisma.$queryRawUnsafe(
      `
      SELECT bll.id AS "memberId", bll."leadId", COALESCE(l.phone, '') AS phone,
             l."doNotCall", COALESCE(l."whatsappOptOut", false) AS "whatsappOptOut"
      FROM "whatsapp_broadcast_list_leads" bll
      JOIN "leads" l ON l.id = bll."leadId"
      WHERE bll."listId" = $1
    `,
      list.id,
    ));

    const skippedDoNotCall = allTargets.filter((m) => m.doNotCall).length;
    const skippedWhatsappOptOut = allTargets.filter((m) => !m.doNotCall && m.whatsappOptOut).length;
    const totalSkipped = skippedDoNotCall + skippedWhatsappOptOut;

    const targets = allTargets
      .filter((m) => !m.doNotCall && !m.whatsappOptOut)
      .map((m) => ({
        memberId: m.memberId,
        leadId: m.leadId,
        phone: String(m.phone || '').trim(),
      }))
      .filter((m) => !!m.phone);

    if (targets.length === 0) {
      return res.status(400).json({
        error: totalSkipped > 0
          ? `All ${totalSkipped} members are opted out. No messages sent.`
          : 'This broadcast list has no members with valid phone numbers.',
        skippedDoNotCall,
        skippedWhatsappOptOut,
      });
    }

    const isLaterMode = String(mode) === 'later';
    let scheduleAtDate = null;
    if (isLaterMode) {
      if (!scheduledAt) {
        return res.status(400).json({ error: 'scheduledAt is required when mode is later' });
      }
      scheduleAtDate = parseScheduledAtUAE(String(scheduledAt));
      if (!scheduleAtDate) {
        return res.status(400).json({
          error: 'scheduledAt must be a valid datetime (ISO with timezone or UAE local datetime)',
        });
      }
      if (scheduleAtDate.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'scheduledAt must be in the future' });
      }
    }
    const run = await prisma.whatsAppBroadcastRun.create({
      data: {
        organizationId: orgId,
        listId: list.id,
        requestedById: req.user?.id || null,
        mode: isLaterMode ? 'LATER' : 'NOW',
        status: isLaterMode ? 'SCHEDULED' : 'RUNNING',
        templateId: template.id,
        templateName: template.name,
        templateLanguage: template.language || 'en_US',
        variables: variables && typeof variables === 'object' ? variables : {},
        scheduledAt: scheduleAtDate,
        startedAt: isLaterMode ? null : new Date(),
        totalRecipients: targets.length,
      },
    });

    if (targets.length > 0) {
      await prisma.whatsAppBroadcastRecipient.createMany({
        data: targets.map((t) => ({
          broadcastId: run.id,
          leadId: t.leadId,
          phone: t.phone,
          status: 'PENDING',
          attemptCount: 0,
        })),
        skipDuplicates: true,
      });
    }

    if (isLaterMode) {
      return res.status(202).json({
        ok: true,
        mode: 'later',
        runId: run.id,
        scheduledAt: run.scheduledAt,
        skippedDoNotCall,
        skippedWhatsappOptOut,
        message: `Broadcast scheduled for ${targets.length} recipients${totalSkipped > 0 ? ` (${totalSkipped} opted-out leads skipped)` : ''}.`,
      });
    }

    const completed = await runBroadcastNow(run.id);
    return res.json({
      ok: true,
      mode: 'now',
      runId: completed.id,
      listId: list.id,
      template: { id: template.id, name: template.name, language: template.language },
      total: completed.totalRecipients,
      sent: completed.sentCount,
      failed: completed.failedCount,
      skippedDoNotCall,
    });
  } catch (err) {
    next(err);
  }
});

// ── Cancel a SCHEDULED run ────────────────────────────────────────────
router.patch('/runs/:runId/cancel', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast runs');
    if (!orgId) return;

    const run = await prisma.whatsAppBroadcastRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      select: { id: true, status: true },
    });
    if (!run) return res.status(404).json({ error: 'Broadcast run not found' });
    if (run.status !== 'SCHEDULED') {
      return res.status(409).json({
        error: `Cannot cancel a run that is ${run.status.toLowerCase()}. Only SCHEDULED runs can be cancelled.`,
      });
    }

    const cancelled = await prisma.whatsAppBroadcastRun.update({
      where: { id: run.id },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
        lastError: 'Cancelled by user',
      },
    });

    // Mark all pending recipients as failed (they were never sent)
    await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { broadcastId: run.id, status: 'PENDING' },
      data: { status: 'FAILED', error: 'Broadcast cancelled' },
    });

    logger.info('[BroadcastRun] Cancelled by user', { runId: run.id, orgId });
    res.json({ ok: true, run: { id: cancelled.id, status: cancelled.status } });
  } catch (err) {
    next(err);
  }
});

// ── Retry FAILED recipients in a completed/failed run ─────────────────
router.post('/runs/:runId/retry', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp broadcast runs');
    if (!orgId) return;

    const run = await prisma.whatsAppBroadcastRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      select: { id: true, status: true, failedCount: true },
    });
    if (!run) return res.status(404).json({ error: 'Broadcast run not found' });
    if (!['COMPLETED', 'FAILED'].includes(run.status)) {
      return res.status(409).json({
        error: `Can only retry COMPLETED or FAILED runs (current status: ${run.status}).`,
      });
    }
    if (run.failedCount === 0) {
      return res.status(400).json({ error: 'No failed recipients to retry.' });
    }

    const failedRecipients = await prisma.whatsAppBroadcastRecipient.findMany({
      where: { broadcastId: run.id, status: 'FAILED' },
      select: { id: true, attemptCount: true, error: true },
    });
    if (failedRecipients.length === 0) {
      return res.status(400).json({ error: 'No failed recipients found to retry.' });
    }

    const retryableIds = failedRecipients
      .filter((r) => Number(r.attemptCount || 0) < MAX_BROADCAST_RETRY_ATTEMPTS)
      .map((r) => r.id);
    const exhaustedCount = failedRecipients.length - retryableIds.length;
    if (retryableIds.length === 0) {
      return res.status(409).json({
        error: `Retry limit reached. Max ${MAX_BROADCAST_RETRY_ATTEMPTS} attempts per recipient.`,
        retrying: 0,
        exhausted: exhaustedCount,
      });
    }

    // Reset retryable failed recipients back to PENDING so runBroadcastNow picks them up
    const resetResult = await prisma.whatsAppBroadcastRecipient.updateMany({
      where: { id: { in: retryableIds } },
      data: { status: 'PENDING', error: null },
    });

    // Reset run status back to RUNNING
    await prisma.whatsAppBroadcastRun.update({
      where: { id: run.id },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        completedAt: null,
        lastError: null,
        failedCount: 0,
      },
    });

    logger.info('[BroadcastRun] Retrying failed recipients', { runId: run.id, count: resetResult.count, orgId });

    // Execute immediately in background — don't await so response is instant
    runBroadcastNow(run.id).catch((err) => {
      logger.error('[BroadcastRun] Retry execution failed', { runId: run.id, err: err?.message });
    });

    res.json({
      ok: true,
      runId: run.id,
      retrying: resetResult.count,
      exhausted: exhaustedCount,
      maxAttempts: MAX_BROADCAST_RETRY_ATTEMPTS,
      message: `Retrying ${resetResult.count} failed recipient${resetResult.count !== 1 ? 's' : ''}${exhaustedCount > 0 ? ` (${exhaustedCount} reached retry limit)` : ''}.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
