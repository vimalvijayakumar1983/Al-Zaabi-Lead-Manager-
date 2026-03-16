const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');

/**
 * Resolve phoneNumberId and token for sending. Uses org settings if provided and set.
 */
async function resolveSendConfig(organizationId) {
  const globalId = config.whatsapp?.phoneNumberId;
  const globalToken = config.whatsapp?.token;

  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const settings = typeof org?.settings === 'object' ? org.settings : {};
    const orgPhoneNumberId = settings.whatsappPhoneNumberId;
    const orgToken = settings.whatsappToken;
    return {
      phoneNumberId: orgPhoneNumberId || globalId,
      token: orgToken || globalToken,
    };
  }

  return {
    phoneNumberId: globalId,
    token: globalToken,
  };
}

/**
 * Send a text message via WhatsApp Cloud API.
 * @param {string} to - Recipient wa_id (digits only, no +)
 * @param {string} body - Message text
 * @param {string} [organizationId] - Optional; if provided, may use org-specific phoneNumberId/token from settings
 * @returns {Promise<{ messageId: string }>} - Cloud API response or throws
 */
async function sendText(to, body, organizationId = null) {
  const { phoneNumberId, token } = await resolveSendConfig(organizationId);

  if (!phoneNumberId || !token) {
    const err = new Error('WhatsApp not configured: missing phoneNumberId or token');
    err.statusCode = 503;
    throw err;
  }

  const apiUrl = config.whatsapp?.apiUrl?.replace(/\/$/, '');
  if (!apiUrl) {
    const err = new Error('WhatsApp not configured: missing WHATSAPP_API_URL');
    err.statusCode = 503;
    throw err;
  }

  const url = `${apiUrl}/${phoneNumberId}/messages`;
  const normalizedTo = String(to).replace(/\D/g, '');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedTo,
    type: 'text',
    text: {
      preview_url: false,
      body,
    },
  };

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

module.exports = { sendText, resolveSendConfig };
