const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  fetchMessageTemplatesFromMeta,
  createMessageTemplateInMeta,
  updateMessageTemplateInMeta,
  deleteMessageTemplateInMeta,
  uploadTemplateHeaderSampleHandle,
} = require('../services/whatsappService');
const { logger } = require('../config/logger');

const router = Router();
router.use(authenticate, orgScope);
const ALLOWED_CATEGORIES = new Set(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
const ALLOWED_HEADER_FORMATS = new Set(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']);
const ALLOWED_BUTTON_TYPES = new Set(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']);

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

function mapTemplateRouteError(err) {
  if (!err?.statusCode) return null;
  // Meta token/session expiry should not be treated as app-auth 401 by frontend.
  if (err.statusCode === 401) {
    return {
      status: 400,
      body: {
        error: 'WhatsApp authorization failed. Refresh WhatsApp token in Settings and try again.',
        reasonCode: 'WHATSAPP_TOKEN_EXPIRED',
        details: err.details || null,
      },
    };
  }
  const subcode = Number(err?.details?.error?.error_subcode || 0);
  if (err.statusCode === 400 && subcode === 2388273) {
    return {
      status: 400,
      body: {
        error:
          'Media header templates require a valid sample. Provide a reachable media URL (or upload media in studio) so a sample handle can be generated.',
        reasonCode: 'WHATSAPP_TEMPLATE_MEDIA_SAMPLE_REQUIRED',
        details: err.details || null,
      },
    };
  }
  if (err.statusCode === 400 && subcode === 2388299) {
    return {
      status: 400,
      body: {
        error: 'Variables cannot be at the start or end of template text.',
        reasonCode: 'WHATSAPP_TEMPLATE_LEADING_TRAILING_VARIABLE',
        details: err.details || null,
      },
    };
  }
  if (err.statusCode === 400 && subcode === 2494102) {
    return {
      status: 400,
      body: {
        error:
          'Invalid media sample handle for template header. Ensure META_APP_ID is set and samples use the resumable upload flow (JPEG/PNG/MP4/PDF as required).',
        reasonCode: 'WHATSAPP_TEMPLATE_INVALID_MEDIA_HANDLE',
        details: err.details || null,
      },
    };
  }
  return {
    status: err.statusCode,
    body: { error: err.message, details: err.details || null },
  };
}

function normalizeTemplateName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeTemplatePayload(raw) {
  const name = normalizeTemplateName(raw?.name);
  const language = String(raw?.language || '').trim();
  const category = String(raw?.category || '').trim().toUpperCase();
  const components = Array.isArray(raw?.components) ? raw.components : [];
  return { name, language, category, components };
}

function validateTemplatePayload({ category, components }, { allowPartial = false } = {}) {
  if (!allowPartial && !ALLOWED_CATEGORIES.has(category)) {
    return 'Invalid category';
  }
  if (!Array.isArray(components)) {
    return 'Components must be an array';
  }

  let hasBody = false;
  let buttonsCount = 0;
  const startsWithVariable = (text) => /^\s*\{\{[^}]+\}\}/.test(String(text || ''));
  const endsWithVariable = (text) => /\{\{[^}]+\}\}\s*$/.test(String(text || ''));
  for (const c of components) {
    if (!c || typeof c !== 'object') return 'Each component must be an object';
    const type = String(c.type || '').toUpperCase();
    if (!['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(type)) return `Unsupported component type: ${type}`;
    if (type === 'BODY') {
      hasBody = true;
      const bodyText = String(c.text || '');
      if (!bodyText.trim()) return 'BODY component must include text';
      if (startsWithVariable(bodyText) || endsWithVariable(bodyText)) {
        return 'Variables cannot be at the start or end of BODY text';
      }
    }
    if (type === 'HEADER') {
      const format = String(c.format || '').toUpperCase();
      if (!ALLOWED_HEADER_FORMATS.has(format)) return 'HEADER format must be TEXT, IMAGE, VIDEO, or DOCUMENT';
      if (format === 'TEXT') {
        const headerText = String(c.text || '');
        if (!headerText.trim()) return 'TEXT header must include text';
        if (startsWithVariable(headerText) || endsWithVariable(headerText)) {
          return 'Variables cannot be at the start or end of HEADER text';
        }
      }
    }
    if (type === 'BUTTONS') {
      const buttons = Array.isArray(c.buttons) ? c.buttons : [];
      buttonsCount += buttons.length;
      for (const b of buttons) {
        const bt = String(b?.type || '').toUpperCase();
        if (!ALLOWED_BUTTON_TYPES.has(bt)) return `Unsupported button type: ${bt}`;
        if (!String(b?.text || '').trim()) return 'Button text is required';
        if (bt === 'URL') {
          const url = String(b?.url || '').trim();
          if (!/^https?:\/\//i.test(url)) return 'URL button must start with http:// or https://';
        }
        if (bt === 'PHONE_NUMBER') {
          const phone = String(b?.phone_number || '').trim();
          if (!/^\+?[0-9]{7,15}$/.test(phone)) return 'PHONE_NUMBER button must be valid E.164/digits';
        }
      }
    }
  }

  if (!allowPartial && !hasBody) return 'Template must contain BODY component';
  if (!allowPartial && category === 'AUTHENTICATION' && buttonsCount > 0) {
    return 'AUTHENTICATION templates cannot include buttons in this studio';
  }
  if (!allowPartial && category !== 'AUTHENTICATION' && buttonsCount > 3) {
    return 'Maximum 3 buttons allowed';
  }
  return null;
}

function defaultMimeByHeaderFormat(format) {
  if (format === 'IMAGE') return 'image/jpeg';
  if (format === 'VIDEO') return 'video/mp4';
  return 'application/pdf';
}

function defaultFilenameByHeaderFormat(format) {
  if (format === 'IMAGE') return 'template-header.jpg';
  if (format === 'VIDEO') return 'template-header.mp4';
  return 'template-header.pdf';
}

function inferMimeFromFilename(filename, fallbackMime) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.3gp') || name.endsWith('.3gpp')) return 'video/3gpp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return fallbackMime;
}

async function resolveHeaderSampleHandle(rawHandle, format, orgId) {
  const value = String(rawHandle || '').trim();
  if (!value) {
    const err = new Error(`HEADER ${format} requires sample media URL/handle`);
    err.statusCode = 400;
    throw err;
  }
  // If caller already provides a non-URL handle/id, forward it as-is.
  if (!/^https?:\/\//i.test(value) && !/^data:/i.test(value)) {
    return value;
  }

  let buffer;
  let mimeType = defaultMimeByHeaderFormat(format);
  let filename = defaultFilenameByHeaderFormat(format);

  if (/^data:/i.test(value)) {
    const m = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) {
      const err = new Error('Invalid data URL for media header sample');
      err.statusCode = 400;
      throw err;
    }
    mimeType = m[1] || mimeType;
    buffer = Buffer.from(m[2], 'base64');
    mimeType = inferMimeFromFilename(filename, mimeType);
  } else {
    const resp = await fetch(value);
    if (!resp.ok) {
      const err = new Error(`Unable to fetch media sample URL (${resp.status})`);
      err.statusCode = 400;
      throw err;
    }
    const ct = String(resp.headers.get('content-type') || '').split(';')[0].trim();
    if (ct && ct !== 'application/octet-stream') mimeType = ct;
    buffer = Buffer.from(await resp.arrayBuffer());
    try {
      const u = new URL(value);
      const path = u.pathname || '';
      const name = path.split('/').filter(Boolean).pop();
      if (name) filename = name;
    } catch {}
    mimeType = inferMimeFromFilename(filename, mimeType);
  }

  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = defaultMimeByHeaderFormat(format);
  }

  try {
    const { handle } = await uploadTemplateHeaderSampleHandle(buffer, mimeType, filename, format, orgId);
    return handle;
  } catch (uploadErr) {
    if (uploadErr.statusCode) throw uploadErr;
    const err = new Error(
      `Invalid media sample for ${format} header: ${uploadErr?.message || String(uploadErr)}`
    );
    err.statusCode = 400;
    err.details = { upstream: uploadErr?.message || String(uploadErr), mimeType, filename, format };
    throw err;
  }
}

async function prepareTemplateComponentsForMeta(components, orgId) {
  if (!Array.isArray(components)) return [];
  const out = [];
  for (const c of components) {
    if (!c || typeof c !== 'object') {
      out.push(c);
      continue;
    }
    const type = String(c.type || '').toUpperCase();
    if (type !== 'HEADER') {
      out.push(c);
      continue;
    }
    const format = String(c.format || '').toUpperCase();
    if (!['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
      out.push(c);
      continue;
    }
    const handles = Array.isArray(c?.example?.header_handle) ? c.example.header_handle : [];
    const first = handles[0];
    const handle = await resolveHeaderSampleHandle(first, format, orgId);
    out.push({
      ...c,
      example: { header_handle: [handle] },
    });
  }
  return out;
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
    if (err.statusCode) {
      const mapped = mapTemplateRouteError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
    }
    next(err);
  }
});

const templateCreateSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
  category: z.string().min(1),
  components: z.array(z.record(z.unknown())).min(1),
});

router.post('/templates', authorize('ADMIN'), validate(templateCreateSchema), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp templates');
    if (!orgId) return;
    const normalized = normalizeTemplatePayload(req.validated);
    const { name, language, category, components } = normalized;
    if (!name || !language) {
      return res.status(400).json({ error: 'Template name and language are required' });
    }
    const payloadErr = validateTemplatePayload({ category, components });
    if (payloadErr) return res.status(400).json({ error: payloadErr });
    const duplicate = await prisma.whatsAppMessageTemplate.findFirst({
      where: {
        organizationId: orgId,
        name,
        language,
      },
      select: { id: true },
    });
    if (duplicate) {
      return res.status(409).json({
        error: 'Template with same name and language already exists in this division.',
      });
    }
    const preparedComponents = await prepareTemplateComponentsForMeta(components, orgId);
    const meta = await createMessageTemplateInMeta(orgId, {
      name,
      language,
      category,
      components: preparedComponents,
    });
    const now = new Date();
    const row = await prisma.whatsAppMessageTemplate.upsert({
      where: {
        organizationId_waTemplateId: {
          organizationId: orgId,
          waTemplateId: String(meta.id || `${name}:${language}`),
        },
      },
      create: {
        organizationId: orgId,
        waTemplateId: String(meta.id || `${name}:${language}`),
        name,
        language,
        status: meta.status != null ? String(meta.status) : 'PENDING',
        category,
        rejectedReason: null,
        components: preparedComponents,
        lastSyncedAt: now,
      },
      update: {
        name,
        language,
        status: meta.status != null ? String(meta.status) : 'PENDING',
        category,
        components: preparedComponents,
        lastSyncedAt: now,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    if (err.statusCode) {
      const mapped = mapTemplateRouteError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
    }
    next(err);
  }
});

const templateUpdateSchema = z.object({
  category: z.string().optional(),
  components: z.array(z.record(z.unknown())).optional(),
});

router.patch('/templates/:id', authorize('ADMIN'), validate(templateUpdateSchema), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp templates');
    if (!orgId) return;
    const row = await prisma.whatsAppMessageTemplate.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!row) return res.status(404).json({ error: 'Template not found' });
    const payload = {};
    if (req.validated.category) payload.category = String(req.validated.category).toUpperCase();
    if (req.validated.components) payload.components = req.validated.components;
    if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'No updatable fields provided' });
    const nextCategory = payload.category || String(row.category || '').toUpperCase();
    const nextComponents = payload.components || (Array.isArray(row.components) ? row.components : []);
    const payloadErr = validateTemplatePayload(
      { category: nextCategory, components: nextComponents },
      { allowPartial: false }
    );
    if (payloadErr) return res.status(400).json({ error: payloadErr });
    const payloadForMeta = { ...payload };
    if (payloadForMeta.components) {
      payloadForMeta.components = await prepareTemplateComponentsForMeta(payloadForMeta.components, orgId);
    }
    const meta = await updateMessageTemplateInMeta(orgId, row.waTemplateId, payloadForMeta);
    const updated = await prisma.whatsAppMessageTemplate.update({
      where: { id: row.id },
      data: {
        ...(req.validated.category ? { category: req.validated.category } : {}),
        ...(req.validated.components ? { components: req.validated.components } : {}),
        ...(meta?.status ? { status: String(meta.status) } : {}),
        lastSyncedAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) {
    if (err.statusCode) {
      const mapped = mapTemplateRouteError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
    }
    next(err);
  }
});

router.delete('/templates/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const orgId = await resolveDivisionScopedOrgId(req, res, 'WhatsApp templates');
    if (!orgId) return;
    const row = await prisma.whatsAppMessageTemplate.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!row) return res.status(404).json({ error: 'Template not found' });
    await deleteMessageTemplateInMeta(orgId, row.name);
    await prisma.whatsAppMessageTemplate.delete({ where: { id: row.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode) {
      const mapped = mapTemplateRouteError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
    }
    next(err);
  }
});

module.exports = router;
