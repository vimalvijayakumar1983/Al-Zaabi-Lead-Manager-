const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');
const { canonicalPhoneDigitsForWhatsApp } = require('../utils/phoneWhatsApp');

function trimStr(v) {
  return String(v ?? '').trim();
}

/**
 * Resolve phoneNumberId, token, and optional apiUrl for sending.
 * Uses org settings first (whatsappNumbers[] or whatsappPhoneNumberId/whatsappToken), then env.
 * All values are trimmed so credentials saved in settings work reliably.
 */
async function resolveSendConfig(organizationId) {
  const globalId = trimStr(config.whatsapp?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID);
  const globalToken = trimStr(config.whatsapp?.token || process.env.WHATSAPP_TOKEN);
  const globalApiUrl = trimStr(config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL);

  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = typeof org?.settings === 'object' ? org.settings : {};
    const numbers = settings.whatsappNumbers;
    if (Array.isArray(numbers) && numbers.length > 0) {
      const apiUrl = trimStr(settings.whatsappApiUrl) || globalApiUrl;
      // Prefer first row that can send (id + token); skip displayPhone-only routing rows
      const sendable = numbers.find((n) => trimStr(n?.phoneNumberId) && trimStr(n?.token));
      if (sendable) {
        return {
          phoneNumberId: trimStr(sendable.phoneNumberId),
          token: trimStr(sendable.token),
          apiUrl: apiUrl || null,
        };
      }
    }
    const orgPhoneNumberId = trimStr(settings.whatsappPhoneNumberId);
    const orgToken = trimStr(settings.whatsappToken);
    const apiUrl = trimStr(settings.whatsappApiUrl) || globalApiUrl;
    return {
      phoneNumberId: orgPhoneNumberId || globalId,
      token: orgToken || globalToken,
      apiUrl: apiUrl || null,
    };
  }

  return {
    phoneNumberId: globalId,
    token: globalToken,
    apiUrl: globalApiUrl || null,
  };
}

// Default Meta WhatsApp Cloud API base (must not include /messages)
const DEFAULT_WHATSAPP_API_URL = 'https://graph.facebook.com/v22.0';

/**
 * Send a text message via WhatsApp Cloud API.
 * Same as: POST https://graph.facebook.com/v22.0/{phone-number-id}/messages
 * with body: { messaging_product, to, type: "text", text: { body } }
 * @param {string} to - Recipient wa_id (digits only, no +)
 * @param {string} body - Message text
 * @param {string} [organizationId] - Optional; if provided, may use org-specific phoneNumberId/token from settings
 * @returns {Promise<{ messageId: string }>} - Cloud API response or throws
 */
async function sendText(to, body, organizationId = null) {
  const resolved = await resolveSendConfig(organizationId);
  const { phoneNumberId, token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!phoneNumberId || !token) {
    const err = new Error('WhatsApp not configured: add Phone Number ID and Access Token in Settings → WhatsApp (or set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TOKEN in .env)');
    err.statusCode = 503;
    throw err;
  }

  const url = `${apiUrl}/${String(phoneNumberId).trim()}/messages`;
  const normalizedTo = canonicalPhoneDigitsForWhatsApp(String(to).replace(/\D/g, ''));

  // Meta Cloud API format: https://graph.facebook.com/v22.0/{phone-number-id}/messages
  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'text',
    text: {
      preview_url: false,
      body,
    },
  };

  logger.info('WhatsApp send request', { url, to: normalizedTo });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error('WhatsApp send failed', { status: response.status, data, to: normalizedTo });
    const err = new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    logger.info('WhatsApp message sent', { messageId, to: normalizedTo });
  }
  return { messageId: messageId || null, ...data };
}

/**
 * Send a template message (e.g. hello_world) to open the 24h conversation window.
 * Same format as: POST https://graph.facebook.com/v22.0/{phone-number-id}/messages
 * with type: "template", template: { name, language: { code } }.
 */
async function sendTemplate(to, templateName, languageCode, organizationId = null) {
  const resolved = await resolveSendConfig(organizationId);
  const { phoneNumberId, token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!phoneNumberId || !token || !apiUrl) {
    const err = new Error('WhatsApp not configured: set API URL, Phone Number ID and Access Token in Settings → WhatsApp');
    err.statusCode = 503;
    throw err;
  }

  const url = `${apiUrl}/${String(phoneNumberId).trim()}/messages`;
  const normalizedTo = canonicalPhoneDigitsForWhatsApp(String(to).replace(/\D/g, ''));

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'template',
    template: {
      name: templateName || 'hello_world',
      language: { code: languageCode || 'en_US' },
    },
  };

  logger.info('WhatsApp template request', { url, template: payload.template.name, toLast4: normalizedTo.slice(-4) });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error('WhatsApp template send failed', { status: response.status, data, to: normalizedTo });
    const err = new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    logger.info('WhatsApp template sent', { messageId, to: normalizedTo });
  }
  return { messageId: messageId || null, ...data };
}

module.exports = { sendText, sendTemplate, resolveSendConfig };
