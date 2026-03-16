const { Router } = require('express');
const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { processInboundWhatsAppMessage } = require('../services/whatsappInbound');

const router = Router();

// ─── GET: Webhook verification (Meta subscribes to webhook) ───────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp?.webhookVerifyToken) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('WhatsApp webhook verification failed', { mode, tokenPresent: !!token });
    res.status(403).send('Forbidden');
  }
});

// ─── POST: Incoming events from Meta ──────────────────────────────
router.post('/', (req, res) => {
  res.status(200).send('OK');

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    return;
  }

  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value;
      if (!value || !value.metadata) continue;

      const phoneNumberId = value.metadata.phone_number_id;
      const messages = value.messages || [];

      for (const msg of messages) {
        const from = msg.from;
        const messageId = msg.id;

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

        setImmediate(() => {
          processInboundWhatsAppMessage({
            phoneNumberId,
            from,
            messageId,
            bodyText,
            contactName,
          }).catch((err) => {
            logger.error('WhatsApp inbound processing failed', { err: err.message, from, messageId });
          });
        });
      }
    }
  }
});

module.exports = router;
