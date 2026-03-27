const { config } = require('../config/env');
const { logger } = require('../config/logger');
const { prisma } = require('../config/database');
const { canonicalPhoneDigitsForWhatsApp } = require('../utils/phoneWhatsApp');
const { recordTokenOk, recordTokenError, isTokenError } = require('../utils/whatsappTokenHealth');
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
    if (organizationId && isTokenError(response.status, data)) {
      recordTokenError(organizationId, data.error?.message || `Token error (HTTP ${response.status})`).catch(() => {});
    }
    const err = new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    logger.info('WhatsApp message sent', { messageId, to: normalizedTo });
    if (organizationId) recordTokenOk(organizationId).catch(() => {});
  }
  return { messageId: messageId || null, ...data };
}

/**
 * Send a template message (e.g. hello_world) to open the 24h conversation window.
 * Same format as: POST https://graph.facebook.com/v22.0/{phone-number-id}/messages
 * with type: "template", template: { name, language: { code } }.
 */
async function sendTemplate(to, templateName, languageCode, organizationId = null, components = undefined) {
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
      ...(Array.isArray(components) && components.length > 0 ? { components } : {}),
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
    if (organizationId && isTokenError(response.status, data)) {
      recordTokenError(organizationId, data.error?.message || `Token error (HTTP ${response.status})`).catch(() => {});
    }
    const err = new Error(data.error?.message || `WhatsApp API error: ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }

  const messageId = data.messages?.[0]?.id;
  if (messageId) {
    logger.info('WhatsApp template sent', { messageId, to: normalizedTo });
    if (organizationId) recordTokenOk(organizationId).catch(() => {});
  }
  return { messageId: messageId || null, ...data };
}

async function createMessageTemplateInMeta(organizationId, payload) {
  const { token, apiUrl, wabaId } = await resolveWabaManagementConfig(organizationId);
  const url = `${apiUrl}/${encodeURIComponent(wabaId)}/message_templates`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error?.message || `WhatsApp template create failed: ${resp.status}`);
    err.statusCode = resp.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function updateMessageTemplateInMeta(organizationId, waTemplateId, payload) {
  const { token, apiUrl } = await resolveWabaManagementConfig(organizationId);
  const url = `${apiUrl}/${encodeURIComponent(waTemplateId)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error?.message || `WhatsApp template update failed: ${resp.status}`);
    err.statusCode = resp.status;
    err.details = data;
    throw err;
  }
  return data;
}

async function deleteMessageTemplateInMeta(organizationId, templateName) {
  const { token, apiUrl, wabaId } = await resolveWabaManagementConfig(organizationId);
  const url = `${apiUrl}/${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(templateName)}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.error?.message || `WhatsApp template delete failed: ${resp.status}`);
    err.statusCode = resp.status;
    err.details = data;
    throw err;
  }
  return data;
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

function inferMimeFromFilenameForTemplate(filename, hintMime) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.3gp') || name.endsWith('.3gpp')) return 'video/3gpp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  const h = String(hintMime || '').split(';')[0].trim().toLowerCase();
  if (h === 'image/jpg') return 'image/jpeg';
  return h;
}

/**
 * Meta only allows these MIME types for Graph API resumable upload sessions
 * (used for message template media samples).
 * @see https://developers.facebook.com/docs/graph-api/guides/upload
 */
function normalizeToResumableFileType(mimeType, format, filename) {
  const f = String(format || '').toUpperCase();
  let m = String(mimeType || '').split(';')[0].trim().toLowerCase();
  m = inferMimeFromFilenameForTemplate(filename, m) || m;
  if (m === 'image/jpg') m = 'image/jpeg';

  const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'video/mp4']);

  if (allowed.has(m)) return m;

  if (f === 'IMAGE') {
    if (m === 'image/webp') {
      const err = new Error(
        'Image template samples: use JPEG or PNG. Meta resumable upload (template header examples) does not support WebP.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (!m || m === 'application/octet-stream') return 'image/jpeg';
    const err = new Error(`Unsupported image type for template sample (${m}). Use JPEG or PNG.`);
    err.statusCode = 400;
    throw err;
  }
  if (f === 'VIDEO') {
    if (m === 'video/3gpp' || m === 'video/3gp') {
      const err = new Error('Video template samples: use MP4. Meta resumable upload accepts video/mp4 only.');
      err.statusCode = 400;
      throw err;
    }
    return 'video/mp4';
  }
  if (f === 'DOCUMENT') {
    if (m !== 'application/pdf') {
      const err = new Error(
        'Document template samples: use a PDF file. Meta resumable upload for template headers supports application/pdf only.'
      );
      err.statusCode = 400;
      throw err;
    }
    return 'application/pdf';
  }
  return 'image/jpeg';
}

/**
 * Meta App ID for Graph `/{app-id}/uploads` (template media samples). Per-division in
 * `organization.settings.whatsappMetaAppId`, then env `META_APP_ID` / `config.whatsapp.appId`.
 */
async function resolveMetaAppIdForOrg(organizationId) {
  const envFallback = trimStr(
    config.whatsapp?.appId || process.env.META_APP_ID || process.env.WHATSAPP_META_APP_ID
  );
  if (!organizationId) return envFallback;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = typeof org?.settings === 'object' && org.settings ? org.settings : {};
  const fromSettings = trimStr(settings.whatsappMetaAppId);
  return fromSettings || envFallback;
}

/**
 * Upload bytes via Graph Resumable Upload API and return handle `h` for template `example.header_handle`.
 * This is NOT the same as POST /{phone-number-id}/media (sending) — template creation rejects that id with error_subcode 2494102.
 * @see https://developers.facebook.com/docs/graph-api/guides/upload
 * @returns {Promise<{ handle: string }>}
 */
async function uploadTemplateHeaderSampleHandle(buffer, mimeType, filename, format, organizationId = null) {
  const appId = await resolveMetaAppIdForOrg(organizationId);
  if (!appId) {
    const err = new Error(
      'Meta App ID is not set. Add it in Settings → WhatsApp (Meta App ID) for this division, or set META_APP_ID in server env. Required for IMAGE/VIDEO/DOCUMENT template header samples (Graph resumable upload). Find the ID under Meta App → App settings → Basic.'
    );
    err.statusCode = 400;
    err.reasonCode = 'META_APP_ID_REQUIRED';
    throw err;
  }

  const resolved = await resolveSendConfig(organizationId);
  const { token, apiUrl: resolvedApiUrl } = resolved;
  const apiUrl = trimStr(resolvedApiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');

  if (!token) {
    const err = new Error('WhatsApp access token is not configured.');
    err.statusCode = 400;
    throw err;
  }

  const fileName = trimStr(filename) || 'template-sample.bin';
  const fileType = normalizeToResumableFileType(mimeType, format, fileName);

  const startUrl = new URL(`${apiUrl}/${encodeURIComponent(appId)}/uploads`);
  startUrl.searchParams.set('file_name', fileName);
  startUrl.searchParams.set('file_length', String(buffer.length));
  startUrl.searchParams.set('file_type', fileType);
  startUrl.searchParams.set('access_token', token);

  logger.info('WhatsApp template sample: start resumable upload session', {
    appId,
    fileName,
    fileType,
    size: buffer.length,
  });

  const startResp = await fetch(startUrl.toString(), { method: 'POST' });
  const startData = await startResp.json().catch(() => ({}));
  if (!startResp.ok) {
    logger.error('Resumable upload session failed', { status: startResp.status, startData });
    const err = new Error(
      startData.error?.message || `Could not start media upload session for template sample: ${startResp.status}`
    );
    err.statusCode = startResp.status >= 400 && startResp.status < 500 ? 400 : startResp.status;
    err.details = startData;
    throw err;
  }

  const uploadSessionId = startData.id;
  if (!uploadSessionId || typeof uploadSessionId !== 'string') {
    const err = new Error('Resumable upload did not return a session id');
    err.statusCode = 500;
    err.details = startData;
    throw err;
  }

  const binaryBody = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const uploadUrl = `${apiUrl}/${uploadSessionId}`;

  const uploadResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      // Graph resumable upload step 2 uses OAuth prefix per Meta docs (same access token as Bearer elsewhere).
      Authorization: `OAuth ${token}`,
      file_offset: '0',
    },
    body: binaryBody,
  });
  const uploadData = await uploadResp.json().catch(() => ({}));
  if (!uploadResp.ok) {
    logger.error('Resumable upload binary transfer failed', { status: uploadResp.status, uploadData });
    const err = new Error(uploadData.error?.message || `Template sample upload failed: ${uploadResp.status}`);
    err.statusCode = uploadResp.status >= 400 && uploadResp.status < 500 ? 400 : uploadResp.status;
    err.details = uploadData;
    throw err;
  }

  const handle = uploadData.h;
  if (!handle || typeof handle !== 'string') {
    const err = new Error('Media upload did not return a valid template header_handle (expected field h)');
    err.statusCode = 500;
    err.details = uploadData;
    throw err;
  }

  logger.info('WhatsApp template sample: resumable upload complete', { handlePrefix: handle.slice(0, 24) });
  return { handle };
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

/**
 * WABA + token for Graph management calls (message_templates, etc.).
 */
async function resolveWabaManagementConfig(organizationId) {
  const resolved = await resolveSendConfig(organizationId);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = typeof org?.settings === 'object' ? org.settings : {};
  const wabaId = trimStr(settings.whatsappBusinessAccountId);
  if (!wabaId) {
    const err = new Error(
      'WhatsApp Business Account ID (WABA) is not set. Add it in Settings → WhatsApp, then sync templates.'
    );
    err.statusCode = 400;
    throw err;
  }
  const token = trimStr(resolved.token);
  if (!token) {
    const err = new Error('WhatsApp access token is not configured.');
    err.statusCode = 400;
    throw err;
  }
  const apiUrl = trimStr(resolved.apiUrl || config.whatsapp?.apiUrl || process.env.WHATSAPP_API_URL || DEFAULT_WHATSAPP_API_URL).replace(/\/$/, '');
  return { token, apiUrl, wabaId };
}

function normalizeTemplateLanguage(t) {
  const lang = t?.language;
  if (lang && typeof lang === 'object' && lang.code) return String(lang.code);
  return String(lang || '');
}

/**
 * Fetch all message templates for the org WABA from Meta Graph (paginated).
 */
async function fetchMessageTemplatesFromMeta(organizationId) {
  const { token, apiUrl, wabaId } = await resolveWabaManagementConfig(organizationId);
  const all = [];
  let url = `${apiUrl}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,status,language,category,components,rejected_reason&limit=100`;

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.error?.message || `WhatsApp template API error: ${resp.status}`);
      err.statusCode = resp.status;
      err.details = data;
      throw err;
    }
    if (Array.isArray(data.data)) {
      for (const row of data.data) {
        all.push({
          waTemplateId: String(row.id),
          name: String(row.name || ''),
          language: normalizeTemplateLanguage(row),
          status: row.status != null ? String(row.status) : null,
          category: row.category != null ? String(row.category) : null,
          rejectedReason: row.rejected_reason != null ? String(row.rejected_reason) : null,
          components: row.components != null ? row.components : null,
        });
      }
    }
    url = data.paging?.next || null;
  }
  return all;
}

module.exports = {
  sendText,
  sendTemplate,
  sendMedia,
  uploadMedia,
  uploadTemplateHeaderSampleHandle,
  resolveMetaAppIdForOrg,
  downloadMedia,
  resolveSendConfig,
  resolveWabaManagementConfig,
  fetchMessageTemplatesFromMeta,
  createMessageTemplateInMeta,
  updateMessageTemplateInMeta,
  deleteMessageTemplateInMeta,
  MEDIA_MIME_MAP,
};
