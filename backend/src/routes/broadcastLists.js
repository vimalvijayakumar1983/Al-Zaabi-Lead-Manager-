const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { runBroadcastNow } = require('../services/broadcastScheduler');

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

    const targets = (await prisma.$queryRawUnsafe(
      `
      SELECT bll.id AS "memberId", bll."leadId", COALESCE(l.phone, '') AS phone
      FROM "whatsapp_broadcast_list_leads" bll
      JOIN "leads" l ON l.id = bll."leadId"
      WHERE bll."listId" = $1
    `,
      list.id,
    ))
      .map((m) => ({
        memberId: m.memberId,
        leadId: m.leadId,
        phone: String(m.phone || '').trim(),
      }))
      .filter((m) => !!m.phone);
    if (targets.length === 0) {
      return res.status(400).json({ error: 'This broadcast list has no members.' });
    }

    const scheduleAtDate =
      String(mode) === 'later'
        ? (scheduledAt ? new Date(scheduledAt) : new Date())
        : null;
    if (scheduleAtDate && Number.isNaN(scheduleAtDate.getTime())) {
      return res.status(400).json({ error: 'scheduledAt must be a valid ISO datetime' });
    }
    const run = await prisma.whatsAppBroadcastRun.create({
      data: {
        organizationId: orgId,
        listId: list.id,
        requestedById: req.user?.id || null,
        mode: String(mode) === 'later' ? 'LATER' : 'NOW',
        status: String(mode) === 'later' ? 'SCHEDULED' : 'RUNNING',
        templateId: template.id,
        templateName: template.name,
        templateLanguage: template.language || 'en_US',
        variables: variables && typeof variables === 'object' ? variables : {},
        scheduledAt: scheduleAtDate,
        startedAt: String(mode) === 'later' ? null : new Date(),
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

    if (String(mode) === 'later') {
      return res.status(202).json({
        ok: true,
        mode: 'later',
        runId: run.id,
        scheduledAt: run.scheduledAt,
        message: 'Broadcast scheduled successfully.',
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
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
