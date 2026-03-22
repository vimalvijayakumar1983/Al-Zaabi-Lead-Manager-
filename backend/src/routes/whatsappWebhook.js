const { Router } = require('express');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');
const { processInboundWhatsAppMessage } = require('../services/whatsappInbound');

const router = Router();

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
        if (msg.type === 'text' && msg.text) {
          bodyText = msg.text.body || '';
        }
        if (msg.type === 'button' && msg.button?.text) {
          bodyText = msg.button.text;
        }
        if (msg.type === 'interactive') {
          if (msg.interactive?.button_reply?.title) {
            bodyText = msg.interactive.button_reply.title;
          } else if (msg.interactive?.list_reply?.title) {
            bodyText = msg.interactive.list_reply.title;
          }
        }

        const contactName = value.contacts?.[0]?.profile?.name;

        logger.info('[WhatsApp Webhook] Incoming message', {
          phoneNumberId,
          displayPhoneNumber,
          from,
          fromFormatted: from ? `+${from}` : undefined,
          messageId,
          type: msgType,
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
          contactName: contactName || null,
          rawMessageKeys: Object.keys(msg),
        });

        setImmediate(() => {
          processInboundWhatsAppMessage({
            phoneNumberId,
            from,
            messageId,
            bodyText,
            contactName,
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
      }
      if (errors.length > 0) {
        logger.warn('[WhatsApp Webhook] Errors in payload', { phoneNumberId, errors });
      }
    }
  }
});

module.exports = router;
