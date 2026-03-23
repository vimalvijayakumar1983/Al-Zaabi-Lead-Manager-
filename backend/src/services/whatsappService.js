const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');
const { canonicalPhoneDigitsForWhatsApp } = require('../utils/phoneWhatsApp');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

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

// ─── Media helpers ──────────────────────────────────────────────────

const MEDIA_MIME_MAP = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/ogg',
  voice: 'audio/ogg',
  document: 'application/octet-stream',
  sticker: 'image/webp',
};

/**
 * Download media from Meta Cloud API by media ID.
 * Step 1: GET /{media-id} → returns { url, mime_type, ... }
 * Step 2: GET that url with Bearer token → binary content
 * Returns { buffer, mimeType, fileSize }
 */
async function downloadMedia(mediaId, organizationId = null) {
  const resolved = await resolveSendConfig(organizationId);
  const { token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!token) {
    throw new Error('WhatsApp token not configured — cannot download media');
  }

  const metaUrl = `${apiUrl}/${mediaId}`;
  logger.info('WhatsApp media metadata fetch', { metaUrl });

  const metaResp = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const metaData = await metaResp.json().catch(() => ({}));
  if (!metaResp.ok) {
    logger.error('WhatsApp media metadata failed', { status: metaResp.status, metaData });
    throw new Error(metaData.error?.message || `Media metadata fetch failed: ${metaResp.status}`);
  }

  const downloadUrl = metaData.url;
  const mimeType = metaData.mime_type || 'application/octet-stream';
  const fileSize = metaData.file_size || 0;

  if (!downloadUrl) {
    throw new Error('No download URL in media metadata');
  }

  logger.info('WhatsApp media download', { downloadUrl, mimeType, fileSize });

  const dlResp = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!dlResp.ok) {
    throw new Error(`Media binary download failed: ${dlResp.status}`);
  }

  const arrayBuf = await dlResp.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    mimeType,
    fileSize: fileSize || arrayBuf.byteLength,
  };
}

const WA_SUPPORTED_AUDIO = new Set([
  'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg', 'audio/opus',
]);

/**
 * Convert unsupported audio formats (e.g. audio/webm from Chrome) to OGG Opus
 * via system ffmpeg. Returns { buffer, mimeType, filename } with converted data,
 * or the originals unchanged if already supported or ffmpeg not available.
 */
function convertAudioForWhatsApp(buffer, mimeType, filename) {
  if (!mimeType.startsWith('audio/') || WA_SUPPORTED_AUDIO.has(mimeType.split(';')[0])) {
    return Promise.resolve({ buffer, mimeType, filename });
  }

  return new Promise((resolve, reject) => {
    const tmpDir = os.tmpdir();
    const base = `wa-audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inPath = path.join(tmpDir, `${base}.webm`);
    const outPath = path.join(tmpDir, `${base}.ogg`);

    fs.writeFileSync(inPath, buffer);

    execFile('ffmpeg', [
      '-i', inPath, '-vn', '-c:a', 'libopus', '-b:a', '64k', '-y', outPath,
    ], { timeout: 30000 }, (err) => {
      const cleanup = () => {
        try { fs.unlinkSync(inPath); } catch (_) {}
        try { fs.unlinkSync(outPath); } catch (_) {}
      };

      if (err) {
        cleanup();
        logger.warn('ffmpeg audio conversion failed — sending original format', { err: err.message });
        resolve({ buffer, mimeType, filename });
        return;
      }

      try {
        const converted = fs.readFileSync(outPath);
        const newFilename = filename.replace(/\.\w+$/, '.ogg') || `${filename}.ogg`;
        cleanup();
        logger.info('Audio converted for WhatsApp', {
          from: mimeType, to: 'audio/ogg', originalSize: buffer.length, convertedSize: converted.length,
        });
        resolve({ buffer: converted, mimeType: 'audio/ogg', filename: newFilename });
      } catch (readErr) {
        cleanup();
        reject(readErr);
      }
    });
  });
}

/**
 * Upload media to Meta Cloud API for sending.
 * POST /{phone-number-id}/media with multipart form data.
 * Automatically converts unsupported audio formats to OGG Opus.
 * Returns { mediaId }
 */
async function uploadMedia(inputBuffer, inputMimeType, inputFilename, organizationId = null) {
  const { buffer, mimeType, filename } = await convertAudioForWhatsApp(inputBuffer, inputMimeType, inputFilename);

  const resolved = await resolveSendConfig(organizationId);
  const { phoneNumberId, token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!phoneNumberId || !token) {
    throw new Error('WhatsApp not configured — cannot upload media');
  }

  const url = `${apiUrl}/${phoneNumberId}/media`;
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', mimeType);
  form.set('file', new Blob([buffer], { type: mimeType }), filename);

  logger.info('WhatsApp media upload', { url, mimeType, filename, size: buffer.length });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    logger.error('WhatsApp media upload failed', { status: resp.status, data });
    throw new Error(data.error?.message || `Media upload failed: ${resp.status}`);
  }

  return { mediaId: data.id };
}

/**
 * Send a media message (image, video, audio, document) via WhatsApp Cloud API.
 * @param {string} to - Recipient wa_id
 * @param {'image'|'video'|'audio'|'document'} mediaType
 * @param {string} mediaId - Meta media ID (from uploadMedia)
 * @param {string} [caption] - Optional caption (image/video/document only)
 * @param {string} [filename] - Required for document type
 * @param {string} [organizationId]
 */
async function sendMedia(to, mediaType, mediaId, caption, filename, organizationId = null) {
  const resolved = await resolveSendConfig(organizationId);
  const { phoneNumberId, token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!phoneNumberId || !token) {
    throw new Error('WhatsApp not configured — cannot send media');
  }

  const url = `${apiUrl}/${phoneNumberId}/messages`;
  const normalizedTo = canonicalPhoneDigitsForWhatsApp(String(to).replace(/\D/g, ''));

  const mediaObj = { id: mediaId };
  if (caption && mediaType !== 'audio') mediaObj.caption = caption;
  if (filename && mediaType === 'document') mediaObj.filename = filename;

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: mediaType,
    [mediaType]: mediaObj,
  };

  logger.info('WhatsApp send media', { url, mediaType, mediaId, to: normalizedTo });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logger.error('WhatsApp send media failed', { status: response.status, data, to: normalizedTo });
    const err = new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    logger.info('WhatsApp media sent', { messageId, mediaType, to: normalizedTo });
  }
  return { messageId: messageId || null, ...data };
}

module.exports = {
  sendText,
  sendTemplate,
  sendMedia,
  uploadMedia,
  downloadMedia,
  resolveSendConfig,
  MEDIA_MIME_MAP,
};
