const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { fetchMessageTemplatesFromMeta } = require('../services/whatsappService');
const { logger } = require('../config/logger');

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

router.get('/templates', async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp templates');
    if (!orgId) return;

    const rows = await prisma.whatsAppMessageTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: [{ name: 'asc' }, { language: 'asc' }],
    });

    const lastSyncedAt = rows.length
      ? rows.reduce((max, r) => (r.lastSyncedAt > max ? r.lastSyncedAt : max), rows[0].lastSyncedAt)
      : null;

    res.json({ templates: rows, lastSyncedAt });
  } catch (err) {
    next(err);
  }
});

router.post('/templates/sync', authorize('ADMIN'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp templates');
    if (!orgId) return;

    const metaRows = await fetchMessageTemplatesFromMeta(orgId);
    const now = new Date();
    const seen = new Set();

    for (const t of metaRows) {
      seen.add(t.waTemplateId);
      await prisma.whatsAppMessageTemplate.upsert({
        where: {
          organizationId_waTemplateId: {
            organizationId: orgId,
            waTemplateId: t.waTemplateId,
          },
        },
        create: {
          organizationId: orgId,
          waTemplateId: t.waTemplateId,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          rejectedReason: t.rejectedReason,
          components: t.components,
          lastSyncedAt: now,
        },
        update: {
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          rejectedReason: t.rejectedReason,
          components: t.components,
          lastSyncedAt: now,
        },
      });
    }

    if (metaRows.length === 0) {
      await prisma.whatsAppMessageTemplate.deleteMany({ where: { organizationId: orgId } });
    } else {
      await prisma.whatsAppMessageTemplate.deleteMany({
        where: {
          organizationId: orgId,
          waTemplateId: { notIn: [...seen] },
        },
      });
    }

    const rows = await prisma.whatsAppMessageTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: [{ name: 'asc' }, { language: 'asc' }],
    });

    logger.info('WhatsApp templates synced', { organizationId: orgId, count: rows.length });

    res.json({
      success: true,
      syncedCount: metaRows.length,
      templates: rows,
      lastSyncedAt: now.toISOString(),
    });
  } catch (err) {
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
