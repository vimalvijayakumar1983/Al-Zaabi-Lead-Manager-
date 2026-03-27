const { Router } = require('express');
const crypto = require('crypto');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');
const { broadcastDataChange } = require('../websocket/server');
const { enrichCommunicationForClient } = require('../utils/inboxCommunication');
const { processInboundWhatsAppMessage, normalizePhone, resolveOrganizationId } = require('../services/whatsappInbound');

/** Prefer contact row whose wa_id matches the message sender (newer payloads include multiple contacts). */
function resolveContactProfileName(value, fromWaId) {
  const contacts = value?.contacts;
  if (!Array.isArray(contacts) || contacts.length === 0) return undefined;
  const fromNorm = normalizePhone(fromWaId);
  if (fromNorm) {
    for (const c of contacts) {
      if (normalizePhone(c.wa_id) === fromNorm) {
        return c.profile?.name;
      }
    }
  }
  return contacts[0]?.profile?.name;
}

const router = Router();

function isValidWebhookSignature(req) {
  const appSecret = config.whatsapp?.appSecret;
  if (!appSecret) return true; // keep local/dev flow working when secret is not configured
  const signatureHeader = req.get('x-hub-signature-256');
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  if (!signatureHeader.startsWith('sha256=')) return false;
  const receivedSig = signatureHeader.slice('sha256='.length).trim();
  if (!receivedSig) return false;
  const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
  const expectedSig = crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(receivedSig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

function normalizeWaStatus(rawStatus) {
  const s = String(rawStatus ?? '').toUpperCase();
  if (!s) return null;
  if (s === 'SENT') return 'SENT';
  if (s === 'DELIVERED') return 'DELIVERED';
  if (s === 'READ') return 'READ';
  if (s === 'FAILED' || s === 'UNDELIVERED') return 'FAILED';
  // Fall back to raw status so we can debug unknown states without losing them.
  return s;
}

function parseWaStatusTimestamp(status) {
  const ts = status?.timestamp ?? status?.time ?? null;
  if (!ts) return null;
  const num = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(num) || num <= 0) return null;
  // Meta usually returns seconds since epoch; handle milliseconds as well.
  const ms = num < 10_000_000_000 ? num * 1000 : num;
  return new Date(ms);
}

async function processStatusUpdates({ phoneNumberId, displayPhoneNumber, statuses }) {
  let organizationId = null;
  try {
    organizationId = await resolveOrganizationId(phoneNumberId, displayPhoneNumber);
  } catch {
    organizationId = null;
  }

  await Promise.allSettled(
    statuses.map(async (s) => {
      const waMessageId = s?.id;
      if (!waMessageId) return;

      const mappedStatus = normalizeWaStatus(s?.status);
      const statusAt = parseWaStatusTimestamp(s) ?? new Date();

      // ── 1. Update inbox Communication record ─────────────────────
      const comm = await prisma.communication.findFirst({
        where: {
          channel: 'WHATSAPP',
          direction: 'OUTBOUND',
          ...(organizationId ? { lead: { organizationId } } : {}),
          metadata: { path: ['waMessageId'], equals: waMessageId },
        },
        select: {
          id: true,
          leadId: true,
          metadata: true,
          lead: { select: { id: true, organizationId: true } },
        },
      });

      if (comm?.lead) {
        const nextMeta = {
          ...(comm.metadata || {}),
          waStatus: mappedStatus,
          waStatusRaw: s?.status,
          waStatusUpdatedAt: statusAt.toISOString(),
          ...(mappedStatus === 'READ' ? { waRecipientReadAt: statusAt.toISOString() } : {}),
        };

        const updated = await prisma.communication
          .update({
            where: { id: comm.id },
            data: { metadata: nextMeta },
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
          })
          .catch(() => null);

        if (updated) {
          let payload;
          try { payload = await enrichCommunicationForClient(updated, comm.leadId); }
          catch { payload = updated; }
          broadcastDataChange(comm.lead.organizationId, 'communication', 'updated', null, {
            entityId: comm.leadId,
            message: payload,
          }).catch(() => {});
        }
      }

      // ── 2. Update BroadcastRecipient by waMessageId ──────────────
      if (!mappedStatus || mappedStatus === 'SENT') return; // SENT is already recorded at send time

      try {
        const recipient = await prisma.whatsAppBroadcastRecipient.findFirst({
          where: { waMessageId },
          select: { id: true, broadcastId: true, status: true, deliveredAt: true, readAt: true },
        });

        if (!recipient) return;

        // Only advance status (SENT → DELIVERED → READ), never go backwards
        const statusRank = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3 };
        const currentRank = statusRank[recipient.status] ?? 0;
        const newRank     = mappedStatus === 'DELIVERED' ? 2 : mappedStatus === 'READ' ? 3 : 0;
        if (newRank <= currentRank) return; // already at same or higher state

        const recipientUpdate = {
          status: mappedStatus === 'DELIVERED' ? 'DELIVERED' : 'READ',
          ...(mappedStatus === 'DELIVERED' && !recipient.deliveredAt ? { deliveredAt: statusAt } : {}),
          ...(mappedStatus === 'READ'       && !recipient.readAt      ? { readAt:       statusAt } : {}),
          ...(mappedStatus === 'READ'       && !recipient.deliveredAt ? { deliveredAt: statusAt } : {}), // read implies delivered
        };

        await prisma.whatsAppBroadcastRecipient.update({
          where: { id: recipient.id },
          data: recipientUpdate,
        });

        // Increment the matching counter on the run (use raw SQL increment to avoid race conditions)
        const runUpdate = {};
        if (mappedStatus === 'DELIVERED') {
          runUpdate.deliveredCount = { increment: 1 };
          if (!recipient.deliveredAt) {} // only first delivery
        }
        if (mappedStatus === 'READ') {
          runUpdate.readCount = { increment: 1 };
          if (!recipient.deliveredAt) {
            runUpdate.deliveredCount = { increment: 1 }; // read implies delivered
          }
        }
        if (Object.keys(runUpdate).length > 0) {
          await prisma.whatsAppBroadcastRun.update({
            where: { id: recipient.broadcastId },
            data: runUpdate,
          }).catch(() => {}); // non-critical
        }
      } catch (err) {
        logger.warn('[Webhook] BroadcastRecipient status update failed', { waMessageId, err: err?.message });
      }
    })
  );
}

/** Check if token is valid: env WHATSAPP_WEBHOOK_VERIFY_TOKEN or any org's settings.whatsappWebhookVerifyToken */
async function isVerifyTokenValid(token) {
  if (!token || typeof token !== 'string') return false;
  if (config.whatsapp?.webhookVerifyToken && token === config.whatsapp.webhookVerifyToken) return true;
  const orgs = await prisma.organization.findMany({ select: { settings: true } });
  for (const org of orgs) {
    const settings = typeof org.settings === 'object' ? org.settings : {};
    if (settings.whatsappWebhookVerifyToken === token) return true;
  }
  return false;
}

// ─── GET: Webhook verification (Meta subscribes to webhook) ───────
router.get('/', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verbose console trace (use alongside logger) — Meta subscription handshake
  console.log('[WhatsApp Webhook] GET /api/whatsapp/webhook (verification)', {
    query: { ...req.query },
    hubMode: mode,
    hasVerifyToken: !!token,
    verifyTokenLength: token ? String(token).length : 0,
    hasChallenge: !!challenge,
  });

  const valid = mode === 'subscribe' && (await isVerifyTokenValid(token));
  logger.info('[WhatsApp Webhook] GET verification', {
    mode,
    challengeLength: challenge ? String(challenge).length : 0,
    tokenLength: token ? String(token).length : 0,
    tokenMatch: valid,
    envTokenSet: !!config.whatsapp?.webhookVerifyToken,
  });

  if (valid) {
    logger.info('[WhatsApp Webhook] Verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('[WhatsApp Webhook] Verification failed – token must match env WHATSAPP_WEBHOOK_VERIFY_TOKEN or Settings → WhatsApp → Verify token', {
      mode,
      tokenPresent: !!token,
      tokenLength: token ? String(token).length : 0,
    });
    res.status(403).send('Forbidden');
  }
});

// ─── POST: Incoming events from Meta ──────────────────────────────
router.post('/', (req, res) => {
  const body = req.body;
  const hasSecret = !!config.whatsapp?.appSecret;

  if (!isValidWebhookSignature(req)) {
    logger.warn('[WhatsApp Webhook] Invalid signature', {
      hasSecret,
      hasSignatureHeader: !!req.get('x-hub-signature-256'),
    });
    res.status(403).send('Forbidden');
    return;
  }

  // Full payload to stdout — use this to map fields → inbox / division routing
  try {
    const raw = JSON.stringify(body, null, 2);
    const maxLen = 120000;
    console.log(
      '\n======== [WhatsApp Webhook] POST raw body (/api/whatsapp/webhook) ========\n',
      raw.length > maxLen ? `${raw.slice(0, maxLen)}\n… [truncated ${raw.length - maxLen} chars]` : raw,
      '\n========================================================================\n',
    );
  } catch (e) {
    console.log('[WhatsApp Webhook] POST body (could not stringify)', body);
  }

  logger.info('[WhatsApp Webhook] POST received', {
    object: body?.object,
    entryCount: Array.isArray(body?.entry) ? body.entry.length : 0,
    hasBody: !!body,
  });

  res.status(200).send('OK');

  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    if (body && body.object !== 'whatsapp_business_account') {
      console.log('[WhatsApp Webhook] Ignoring POST — object is not whatsapp_business_account', {
        object: body?.object,
      });
      logger.debug('[WhatsApp Webhook] Ignored payload (not whatsapp_business_account)', { object: body?.object });
    } else if (!body) {
      console.log('[WhatsApp Webhook] Ignoring POST — empty body');
    }
    return;
  }

  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value || !value.metadata) continue;

      const phoneNumberId = value.metadata.phone_number_id;
      const displayPhoneNumber = value.metadata.display_phone_number;
      const messages = value.messages || [];
      const statuses = value.statuses || [];
      const errors = value.errors || [];

      logger.info('[WhatsApp Webhook] Entry', {
        phoneNumberId,
        displayPhoneNumber,
        messageCount: messages.length,
        statusCount: statuses.length,
        errorCount: errors.length,
      });

      console.log('[WhatsApp Webhook] Parsed change.value summary', {
        phone_number_id: phoneNumberId,
        display_phone_number: displayPhoneNumber,
        field: change.field,
        messages: messages.length,
        statuses: statuses.length,
        errors: errors.length,
        contactsPreview: value.contacts,
        metadata: value.metadata,
      });

      for (const msg of messages) {
        const from = msg.from;
        const messageId = msg.id;
        const msgType = msg.type;

        let bodyText = '';
        let mediaInfo = null;
        const extraMeta = {};

        if (msg.type === 'text' && msg.text) {
          bodyText = msg.text.body || '';
        } else if (msg.type === 'button' && msg.button?.text) {
          bodyText = msg.button.text;
        } else if (msg.type === 'interactive') {
          if (msg.interactive?.button_reply?.title) {
            bodyText = msg.interactive.button_reply.title;
          } else if (msg.interactive?.list_reply?.title) {
            bodyText = msg.interactive.list_reply.title;
          }
        } else if (['image', 'video', 'audio', 'voice', 'document', 'sticker'].includes(msg.type)) {
          const media = msg[msg.type] || {};
          mediaInfo = {
            type: msg.type,
            mediaId: media.id,
            mimeType: media.mime_type || null,
            sha256: media.sha256 || null,
            caption: media.caption || null,
            filename: media.filename || null,
          };
          bodyText = media.caption || '';
        } else if (msg.type === 'location' && msg.location) {
          const location = msg.location || {};
          extraMeta.location = {
            latitude: location.latitude,
            longitude: location.longitude,
            name: location.name || null,
            address: location.address || null,
          };
          mediaInfo = { type: 'location' };
          bodyText = location.name || location.address || '[Location]';
        }

        if (msg.referral && typeof msg.referral === 'object') {
          extraMeta.referral = msg.referral;
          extraMeta.adReferral = {
            sourceType: msg.referral.source_type || null,
            sourceId: msg.referral.source_id || null,
            sourceUrl: msg.referral.source_url || null,
            headline: msg.referral.headline || null,
            body: msg.referral.body || null,
          };
        }
        if (msg.context && typeof msg.context === 'object') {
          extraMeta.context = msg.context;
        }

        const contactName = resolveContactProfileName(value, from);

        logger.info('[WhatsApp Webhook] Incoming message', {
          phoneNumberId,
          displayPhoneNumber,
          from,
          fromFormatted: from ? `+${from}` : undefined,
          messageId,
          type: msgType,
          hasMedia: !!mediaInfo,
          bodyPreview: bodyText ? bodyText.substring(0, 80) + (bodyText.length > 80 ? '...' : '') : '(empty)',
          contactName,
        });

        console.log('[WhatsApp Webhook] Message → will route by phone_number_id to division settings', {
          phoneNumberId,
          displayPhoneNumber,
          senderWaId: from,
          messageId,
          type: msgType,
          bodyText: bodyText || null,
          mediaInfo: mediaInfo || null,
          contactName: contactName || null,
          rawMessageKeys: Object.keys(msg),
        });

        setImmediate(() => {
          processInboundWhatsAppMessage({
            phoneNumberId,
            displayPhoneNumber,
            from,
            messageId,
            bodyText,
            contactName,
            mediaInfo,
            extraMeta,
          }).catch((err) => {
            logger.error('[WhatsApp Webhook] Inbound processing failed', {
              err: err.message,
              stack: err.stack,
              from,
              messageId,
              phoneNumberId,
            });
          });
        });
      }

      if (statuses.length > 0) {
        logger.info('[WhatsApp Webhook] Status updates', { phoneNumberId, statuses: statuses.map((s) => ({ id: s.id, status: s.status, recipient_id: s.recipient_id })) });
        setImmediate(() => {
          processStatusUpdates({ phoneNumberId, displayPhoneNumber, statuses }).catch((err) => {
            logger.error('[WhatsApp Webhook] Status processing failed', { err: err?.message, phoneNumberId });
          });
        });
      }
      if (errors.length > 0) {
        logger.warn('[WhatsApp Webhook] Errors in payload', { phoneNumberId, errors });
      }
    }
  }
});

module.exports = router;
