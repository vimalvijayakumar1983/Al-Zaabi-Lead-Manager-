const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const {
  normalizeMobileForExternal,
  normalizeAgentIdForMatch,
  normalizeExtensionForMatch,
  didFromPayload,
  normalizeDidForMatch,
} = require('../utils/callCenterPhone');

const router = Router();

function parseExternalDate(value) {
  if (!value) return null;
  const normalized = String(value).replace(/\.\d+$/, '').replace(' ', 'T');
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDurationSeconds(startAt, endAt) {
  if (!startAt || !endAt) return null;
  const diff = Math.round((endAt.getTime() - startAt.getTime()) / 1000);
  return diff > 0 ? diff : null;
}

const ingestSchema = z.object({
  uniqueid: z.string().min(1),
  callerid: z.string().min(1),
  dnid: z.union([z.string(), z.number()]).optional(),
  did: z.union([z.string(), z.number()]).optional(),
  filename: z.string().optional(),
  agentid: z.union([z.string(), z.number()]).optional(),
  answextn: z.union([z.string(), z.number()]).optional(),
  callstarttime: z.string().optional(),
  agentanswertime: z.string().optional(),
  callendtime: z.string().optional(),
  cliniccode: z.string().optional(),
});

function userMatchesPbxUser(user, agentNorm, extNorm) {
  const ua = normalizeAgentIdForMatch(user.callCenterAgentId);
  const ue = normalizeExtensionForMatch(user.callCenterExtension);
  if (agentNorm) {
    if (!ua || ua !== agentNorm) return false;
  }
  if (extNorm) {
    if (!ue || ue !== extNorm) return false;
  }
  return Boolean(agentNorm || extNorm);
}

async function resolveCallCenterUserId(organizationId, agentRaw, extRaw) {
  const agentNorm = normalizeAgentIdForMatch(agentRaw);
  const extNorm = normalizeExtensionForMatch(extRaw);
  if (!agentNorm && !extNorm) return null;

  const users = await prisma.user.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, callCenterAgentId: true, callCenterExtension: true },
  });

  const hits = users.filter((u) => userMatchesPbxUser(u, agentNorm, extNorm));
  if (hits.length === 0) return null;
  if (hits.length > 1) {
    logger.warn('[CallCenterWebhook] Multiple users matched PBX identity; using first', {
      organizationId,
      agentNorm,
      extNorm,
      count: hits.length,
    });
  }
  return hits[0].id;
}

async function findLeadIdByCaller(organizationId, callerid) {
  const normalized = normalizeMobileForExternal(callerid);
  if (!normalized) return null;

  const leads = await prisma.lead.findMany({
    where: { organizationId, isArchived: false, phone: { not: null } },
    select: { id: true, phone: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });

  for (const L of leads) {
    if (normalizeMobileForExternal(L.phone) === normalized) return L.id;
  }
  return null;
}

/**
 * Match existing lead by normalized caller id, or create a minimal lead in the division (PHONE source).
 */
async function findOrCreateLeadForCaller(organizationId, callerid, uniqueid) {
  const normalized = normalizeMobileForExternal(callerid);
  if (!normalized) {
    return { leadId: null, leadCreated: false };
  }

  const existingId = await findLeadIdByCaller(organizationId, callerid);
  if (existingId) {
    return { leadId: existingId, leadCreated: false };
  }

  const lead = await prisma.lead.create({
    data: {
      organizationId,
      firstName: 'Inbound',
      lastName: 'Call',
      phone: normalized,
      source: 'PHONE',
      sourceDetail: `call_center_webhook uniqueid=${String(uniqueid || '').slice(0, 120)}`,
      status: 'NEW',
    },
  });

  logger.info('[CallCenterWebhook] Created lead for unknown caller', {
    organizationId,
    leadId: lead.id,
    phone: normalized,
    uniqueid: String(uniqueid || '').slice(0, 80),
  });

  return { leadId: lead.id, leadCreated: true };
}

/**
 * Find division orgs whose settings.didNumber matches the PBX DID (normalized).
 */
async function findDivisionsByDid(normalizedDid) {
  if (!normalizedDid) return [];
  const rows = await prisma.organization.findMany({
    where: { type: 'DIVISION' },
    select: { id: true, name: true, settings: true },
  });
  return rows.filter((r) => {
    const s = r.settings && typeof r.settings === 'object' ? r.settings : {};
    const configured = normalizeDidForMatch(s.didNumber);
    return configured && configured === normalizedDid;
  });
}

/**
 * POST /call-center/webhook
 * Resolves division from payload dnid/did ↔ Organization.settings.didNumber.
 * Header: X-Webhook-Secret must match that division's settings.callWebhookSecret
 * If callerid does not match an existing lead, a new lead is created (PHONE source) when the number normalizes.
 *
 * Optional legacy: POST /call-center/webhook/:organizationId — URL id must match the division resolved by DID.
 */
async function processCallCenterWebhook(req, res, next, { urlOrganizationId } = {}) {
  try {
    const secretHeader = String(req.get('x-webhook-secret') || '').trim();
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const payloadDid = didFromPayload(body);
    if (!payloadDid) {
      return res.status(400).json({
        error: 'Missing dnid or did',
        detail: 'Send PBX DID in dnid or did so the division can be resolved',
      });
    }

    const matches = await findDivisionsByDid(payloadDid);
    if (matches.length === 0) {
      return res.status(404).json({
        error: 'Unknown DID',
        detail: 'No division has this DID in Call Center DID Number settings',
      });
    }
    if (matches.length > 1) {
      logger.warn('[CallCenterWebhook] Multiple divisions share the same DID', {
        did: payloadDid,
        count: matches.length,
        ids: matches.map((m) => m.id),
      });
      return res.status(409).json({
        error: 'Ambiguous DID',
        detail: 'More than one division is configured with this DID; fix division settings',
        divisionIds: matches.map((m) => m.id),
      });
    }

    const org = matches[0];
    const organizationId = org.id;

    if (urlOrganizationId && String(urlOrganizationId) !== String(organizationId)) {
      return res.status(400).json({
        error: 'URL organization mismatch',
        detail: 'Path organization id does not match the division resolved from DID',
      });
    }

    const settings = org.settings && typeof org.settings === 'object' ? org.settings : {};
    const expectedSecret = String(settings.callWebhookSecret || '').trim();
    if (!expectedSecret || secretHeader !== expectedSecret) {
      return res.status(401).json({ error: 'Invalid or missing webhook secret' });
    }

    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const row = parsed.data;
    const uniqueId = String(row.uniqueid).trim();
    const rowDid = didFromPayload(row);
    if (rowDid !== payloadDid) {
      return res.status(400).json({ error: 'DID mismatch', detail: 'Body dnid/did inconsistent' });
    }

    const { leadId, leadCreated } = await findOrCreateLeadForCaller(
      organizationId,
      row.callerid,
      uniqueId
    );
    if (!leadId) {
      return res.status(400).json({
        error: 'Invalid caller id',
        detail: 'callerid could not be normalized to a phone number for this division',
      });
    }

    const existing = await prisma.callLog.findFirst({
      where: {
        leadId,
        metadata: {
          path: ['uniqueid'],
          equals: uniqueId,
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        callLogId: existing.id,
        leadId,
        organizationId,
        message: 'Call log already ingested for this uniqueid',
      });
    }

    const startAt = parseExternalDate(row.callstarttime);
    const endAt = parseExternalDate(row.callendtime);
    const duration = toDurationSeconds(startAt, endAt);

    const recordingUrl = String(row.filename || '').trim() || null;
    const agentIdStr = row.agentid != null ? String(row.agentid).trim() : '';
    const agentExtnStr = row.answextn != null ? String(row.answextn).trim() : '';

    const userId = await resolveCallCenterUserId(organizationId, row.agentid, row.answextn);

    const metadata = {
      external: true,
      webhook: true,
      externalProvider: 'call_center_webhook',
      uniqueid: uniqueId,
      callerid: row.callerid,
      did: rowDid || null,
      cliniccode: row.cliniccode || null,
      callstarttime: row.callstarttime || null,
      agentanswertime: row.agentanswertime || null,
      callendtime: row.callendtime || null,
      agentid: agentIdStr || null,
      answextn: agentExtnStr || null,
      recordingUrl,
      processingStatus: recordingUrl ? 'PENDING' : 'SKIPPED_NO_AUDIO',
      processingError: recordingUrl ? null : 'No recording URL in payload',
    };

    const callLog = await prisma.callLog.create({
      data: {
        leadId,
        userId,
        disposition: 'OTHER',
        notes: 'Call recording ingested via webhook',
        duration,
        metadata,
      },
    });

    if (recordingUrl) {
      await prisma.callTranscriptionJob.create({
        data: {
          callLogId: callLog.id,
          organizationId,
          status: 'PENDING',
        },
      });
    }

    logger.info('[CallCenterWebhook] Ingested call', {
      organizationId,
      callLogId: callLog.id,
      leadId,
      uniqueid: uniqueId,
      did: rowDid,
    });

    return res.status(202).json({
      ok: true,
      organizationId,
      leadId,
      leadCreated,
      callLogId: callLog.id,
      transcriptionQueued: Boolean(recordingUrl),
    });
  } catch (err) {
    next(err);
  }
}

router.post('/webhook', (req, res, next) => processCallCenterWebhook(req, res, next, {}));

router.post('/webhook/:organizationId', (req, res, next) =>
  processCallCenterWebhook(req, res, next, { urlOrganizationId: req.params.organizationId }),
);

module.exports = router;
