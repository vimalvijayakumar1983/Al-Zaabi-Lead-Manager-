/**
 * STT adapters for Deepgram and AssemblyAI.
 *
 * Malayalam QA (operational): run real clinic samples through both providers with
 * language_detection on; if WER is unacceptable, set org settings sttPreferredProvider
 * to the winner or add a forced second pass with explicit language hint in metadata.
 */

const { logger } = require('../config/logger');
const { config } = require('../config/env');

function audioFetchTimeoutMs() {
  const n = Number(config.callRecording?.fetchTimeoutMs);
  return Number.isFinite(n) && n > 0 ? n : 120000;
}
const ASSEMBLYAI_POLL_INTERVAL_MS = 3000;
const ASSEMBLYAI_POLL_MAX_MS = 600000;

function isLikelyPrivateOrLocalHost(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    const m = /^172\.(\d{1,3})\./.exec(h);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function formatDownloadError(urlStr, err) {
  const timeoutMs = audioFetchTimeoutMs();
  if (err?.name === 'AbortError') {
    return `Audio download timed out after ${timeoutMs}ms`;
  }
  const cause = err?.cause;
  const code = cause?.code || cause?.errno;
  const causeMsg = cause && typeof cause.message === 'string' ? cause.message : '';
  const parts = [err?.message, code, causeMsg].filter(Boolean);
  const detail = parts.length ? parts.join(' — ') : 'unknown error';
  const lanHint = isLikelyPrivateOrLocalHost(urlStr)
    ? ' Recording URL uses a private/local host: the API server must run where it can reach that address (same LAN/VPN), or use a public HTTPS or presigned S3 URL.'
    : '';
  return `Audio download failed:${lanHint} ${detail}`;
}

async function downloadAudioBuffer(url) {
  const u = String(url || '').trim();
  if (!u) throw new Error('Missing recording URL');
  const timeoutMs = audioFetchTimeoutMs();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(u, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'audio/*,*/*' },
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Failed to download audio (${resp.status}): ${text.slice(0, 200)}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) throw new Error('Empty audio response');
    return buf;
  } catch (err) {
    const m = String(err?.message || '');
    if (m.startsWith('Failed to download audio (')) throw err;
    if (m === 'Empty audio response') throw err;
    throw new Error(formatDownloadError(u, err));
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {Buffer} buffer
 * @param {string} apiKey
 * @param {{ model?: string, detectLanguage?: boolean }} opts
 */
async function transcribeDeepgram(buffer, apiKey, opts = {}) {
  const model = String(opts.model || 'nova-2').trim() || 'nova-2';
  const detect = opts.detectLanguage !== false;
  const params = new URLSearchParams({
    model,
    smart_format: 'true',
  });
  if (detect) params.set('detect_language', 'true');

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/mpeg',
    },
    body: buffer,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.err_msg || data?.error || JSON.stringify(data).slice(0, 300);
    throw new Error(`Deepgram error: ${msg}`);
  }
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const transcript = String(alt?.transcript || '').trim();
  const detected =
    data?.results?.channels?.[0]?.detected_language ||
    data?.metadata?.detected_language ||
    alt?.languages?.[0] ||
    null;
  const confidence =
    typeof alt?.confidence === 'number'
      ? alt.confidence
      : typeof data?.metadata?.confidence === 'number'
        ? data.metadata.confidence
        : null;
  return {
    text: transcript,
    detectedLanguage: detected ? String(detected) : null,
    languageConfidence: confidence,
    rawProvider: 'deepgram',
  };
}

async function assemblyAiUpload(buffer, apiKey) {
  const resp = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream',
    },
    body: buffer,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`AssemblyAI upload failed: ${data?.error || resp.status}`);
  }
  const uploadUrl = data?.upload_url;
  if (!uploadUrl) throw new Error('AssemblyAI upload missing upload_url');
  return uploadUrl;
}

async function transcribeAssemblyAi(buffer, apiKey, opts = {}) {
  const detect = opts.detectLanguage !== false;
  const uploadUrl = await assemblyAiUpload(buffer, apiKey);

  const createResp = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      language_detection: detect,
    }),
  });
  const created = await createResp.json().catch(() => ({}));
  if (!createResp.ok) {
    throw new Error(`AssemblyAI transcript create failed: ${created?.error || createResp.status}`);
  }
  const id = created?.id;
  if (!id) throw new Error('AssemblyAI missing transcript id');

  const started = Date.now();
  let transcript = '';
  let detectedLanguage = null;
  let languageConfidence = null;
  let status = created.status;

  while (Date.now() - started < ASSEMBLYAI_POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, ASSEMBLYAI_POLL_INTERVAL_MS));
    const poll = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { authorization: apiKey },
    });
    const row = await poll.json().catch(() => ({}));
    status = row?.status;
    if (status === 'completed') {
      transcript = String(row?.text || '').trim();
      detectedLanguage = row?.language_code ? String(row.language_code) : null;
      languageConfidence =
        typeof row?.language_confidence === 'number' ? row.language_confidence : null;
      break;
    }
    if (status === 'error') {
      throw new Error(`AssemblyAI failed: ${row?.error || 'unknown'}`);
    }
  }

  if (status !== 'completed') {
    throw new Error('AssemblyAI transcription timed out');
  }

  return {
    text: transcript,
    detectedLanguage,
    languageConfidence,
    rawProvider: 'assemblyai',
  };
}

/**
 * Pick STT integration for org: respect Organization.settings.sttPreferredProvider,
 * else first connected integration among deepgram / assemblyai.
 */
async function pickSttIntegration(prisma, organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const pref = String(org?.settings?.sttPreferredProvider || '')
    .toLowerCase()
    .trim();

  const integrations = await prisma.integration.findMany({
    where: {
      organizationId,
      platform: { in: ['deepgram', 'assemblyai'] },
    },
  });

  const withKey = integrations.filter((row) => {
    const k = String(row.credentials?.apiKey || '').trim();
    return k.length > 0 && row.status !== 'error';
  });

  const byPlatform = Object.fromEntries(withKey.map((i) => [i.platform, i]));

  if (pref === 'deepgram' && byPlatform.deepgram) return { platform: 'deepgram', integration: byPlatform.deepgram };
  if (pref === 'assemblyai' && byPlatform.assemblyai)
    return { platform: 'assemblyai', integration: byPlatform.assemblyai };

  if (byPlatform.deepgram) return { platform: 'deepgram', integration: byPlatform.deepgram };
  if (byPlatform.assemblyai) return { platform: 'assemblyai', integration: byPlatform.assemblyai };
  return null;
}

async function transcribeRecordingForOrg(prisma, organizationId, recordingUrl) {
  const picked = await pickSttIntegration(prisma, organizationId);
  if (!picked) {
    throw new Error('No connected Deepgram or AssemblyAI integration for this division');
  }

  const apiKey = String(picked.integration.credentials?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(`Missing API key for ${picked.platform} integration`);
  }

  const cfg = picked.integration.config && typeof picked.integration.config === 'object'
    ? picked.integration.config
    : {};
  const model = cfg.model;
  const detectLanguage = cfg.detectLanguage !== false;

  logger.info('[CallTranscription] Downloading audio', { organizationId, platform: picked.platform });
  const buffer = await downloadAudioBuffer(recordingUrl);

  if (picked.platform === 'deepgram') {
    return transcribeDeepgram(buffer, apiKey, { model, detectLanguage });
  }
  return transcribeAssemblyAi(buffer, apiKey, { detectLanguage });
}

module.exports = {
  downloadAudioBuffer,
  transcribeDeepgram,
  transcribeAssemblyAi,
  pickSttIntegration,
  transcribeRecordingForOrg,
};
