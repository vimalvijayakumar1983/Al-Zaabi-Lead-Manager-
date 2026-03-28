/**
 * STT adapters for Deepgram and AssemblyAI.
 *
 * Malayalam QA (operational): run real clinic samples through both providers with
 * language_detection on; if WER is unacceptable, set org settings sttPreferredProvider
 * to the winner or add a forced second pass with explicit language hint in metadata.
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const { logger } = require('../config/logger');
const { config } = require('../config/env');

const HTTPS_INSECURE_MAX_REDIRECTS = 5;

function recordingDownloadTlsInsecureEnabled() {
  return config.callRecording?.fetchTlsInsecure === true;
}

/**
 * Dev-only: download recording with http/https (no fetch).
 * Every HTTPS hop uses rejectUnauthorized: false so http→https redirects to LAN servers
 * with expired/self-signed certs still work. Plain HTTP hops use normal http.
 */
function downloadAudioBufferInsecureDev(urlStr, signal, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const insecureAgent = new https.Agent({ rejectUnauthorized: false });

  const run = (currentUrl, depth) =>
    new Promise((resolve, reject) => {
      if (depth > HTTPS_INSECURE_MAX_REDIRECTS) {
        reject(new Error('Too many redirects'));
        return;
      }
      if (Date.now() > deadline) {
        reject(Object.assign(new Error('Audio download timed out'), { name: 'AbortError' }));
        return;
      }
      if (signal?.aborted) {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        return;
      }

      let req;
      const cleanup = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
      };
      const onAbort = () => {
        if (req) req.destroy();
        cleanup();
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      let url;
      try {
        url = new URL(currentUrl);
      } catch (e) {
        cleanup();
        reject(e);
        return;
      }

      const isHttps = url.protocol === 'https:';
      const isHttp = url.protocol === 'http:';
      if (!isHttp && !isHttps) {
        cleanup();
        reject(new Error(`Unsupported recording URL scheme: ${url.protocol}`));
        return;
      }

      const lib = isHttps ? https : http;
      const requestOpts = {
        method: 'GET',
        headers: { Accept: 'audio/*,*/*' },
      };
      if (isHttps) requestOpts.agent = insecureAgent;

      req = lib.request(
        url,
        requestOpts,
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = new URL(res.headers.location, url).href;
            cleanup();
            run(next, depth + 1).then(resolve, reject);
            return;
          }
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            let preview = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              preview += chunk;
              if (preview.length > 200) res.destroy();
            });
            res.on('end', () => {
              cleanup();
              reject(
                new Error(`Failed to download audio (${res.statusCode}): ${preview.slice(0, 200)}`)
              );
            });
            res.on('error', (err) => {
              cleanup();
              reject(err);
            });
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            cleanup();
            const buf = Buffer.concat(chunks);
            if (!buf.length) reject(new Error('Empty audio response'));
            else resolve(buf);
          });
          res.on('error', (err) => {
            cleanup();
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        cleanup();
        reject(err);
      });

      req.setTimeout(Math.max(1000, deadline - Date.now()), () => {
        req.destroy();
        cleanup();
        reject(Object.assign(new Error('Audio download timed out'), { name: 'AbortError' }));
      });

      req.end();
    });

  return run(urlStr, 0);
}

function audioFetchTimeoutMs() {
  const n = Number(config.callRecording?.fetchTimeoutMs);
  return Number.isFinite(n) && n > 0 ? n : 120000;
}

/** Guess Content-Type for STT upload (wrong type can degrade accuracy). */
function sniffAudioMime(buffer) {
  if (!buffer || buffer.length < 4) return 'application/octet-stream';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (buffer.slice(0, 3).toString('ascii') === 'ID3') return 'audio/mpeg';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'audio/wav';
  if (buffer.slice(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buffer.slice(0, 4).toString('ascii') === 'fLaC') return 'audio/flac';
  return 'application/octet-stream';
}

function normalizeDeepgramModel(m) {
  const s = String(m || '').trim();
  if (!s || s === 'nova-2') return 'nova-2-general';
  return s;
}

/**
 * Deepgram JSON → full transcript + language. Uses paragraphs and words if top-level transcript is thin.
 */
function parseDeepgramListenResponse(data) {
  const ch0 = data?.results?.channels?.[0];
  const alt = ch0?.alternatives?.[0];
  if (!alt) {
    return { text: '', detectedLanguage: null, languageConfidence: null };
  }

  let text = String(alt.transcript || '').trim();
  const pt = alt.paragraphs;
  if (pt && typeof pt.transcript === 'string' && pt.transcript.trim().length > text.length) {
    text = pt.transcript.trim();
  }
  const paras = pt?.paragraphs;
  if (Array.isArray(paras) && paras.length > 0) {
    const fromPara = paras
      .map((p) =>
        Array.isArray(p?.sentences) ? p.sentences.map((s) => String(s?.text || '').trim()).filter(Boolean).join(' ') : ''
      )
      .filter(Boolean)
      .join('\n\n')
      .trim();
    if (fromPara.length > text.length) text = fromPara;
  }
  if ((!text || text.length < 8) && Array.isArray(alt.words) && alt.words.length > 0) {
    const fromWords = alt.words
      .map((w) => String(w?.punctuated_word || w?.word || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (fromWords.length > text.length) text = fromWords;
  }

  const detected =
    ch0?.detected_language ||
    (Array.isArray(alt.languages) && alt.languages.length ? alt.languages[0] : null) ||
    data?.metadata?.detected_language ||
    null;

  const languageConfidence =
    typeof ch0?.language_confidence === 'number'
      ? ch0.language_confidence
      : typeof alt?.confidence === 'number'
        ? alt.confidence
        : null;

  return {
    text: text.trim(),
    detectedLanguage: detected ? String(detected) : null,
    languageConfidence,
  };
}

/** BCP-47-ish code for AssemblyAI. */
function assemblyAiLanguageCode(fixed) {
  const s = String(fixed || '').trim().toLowerCase().replace(/_/g, '-');
  if (!s || s === 'multi') return '';
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(s)) return s;
  const base = s.split('-')[0];
  return /^[a-z]{2,3}$/.test(base) ? base : '';
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
    if (recordingDownloadTlsInsecureEnabled()) {
      logger.warn(
        '[CallTranscription] Recording download: dev TLS-insecure path (all HTTP/HTTPS hops; HTTPS uses rejectUnauthorized:false)'
      );
      const buf = await downloadAudioBufferInsecureDev(u, controller.signal, timeoutMs);
      return buf;
    }

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
 * @param {{
 *   model?: string,
 *   fixedLanguage?: string,
 *   deepgramMode?: 'multilingual' | 'detect',
 * }} opts
 * fixedLanguage: BCP-47 e.g. ar, ar-ae — skips multi/detect. Empty → mode below.
 * deepgramMode: multilingual (language=multi, Arabic/mixed) vs detect (35 langs, no Arabic in detect list).
 */
async function transcribeDeepgram(buffer, apiKey, opts = {}) {
  const model = normalizeDeepgramModel(opts.model);
  let contentType = sniffAudioMime(buffer);
  if (contentType === 'application/octet-stream') {
    contentType = 'audio/mpeg';
  }

  const params = new URLSearchParams({
    model,
    smart_format: 'true',
    paragraphs: 'true',
  });

  const fixed = String(opts.fixedLanguage || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const mode = opts.deepgramMode === 'detect' ? 'detect' : 'multilingual';

  if (fixed && fixed !== 'multi') {
    params.set('language', fixed);
  } else if (mode === 'detect') {
    params.set('detect_language', 'true');
  } else {
    params.set('language', 'multi');
  }

  const qs = params.toString();
  logger.info('[CallTranscription] Deepgram request', {
    model,
    contentType,
    languageParam: fixed && fixed !== 'multi' ? fixed : mode === 'detect' ? 'detect_language' : 'multi',
  });

  const resp = await fetch(`https://api.deepgram.com/v1/listen?${qs}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.err_msg || data?.error || JSON.stringify(data).slice(0, 300);
    throw new Error(`Deepgram error: ${msg}`);
  }

  const parsed = parseDeepgramListenResponse(data);
  return {
    text: parsed.text,
    detectedLanguage: parsed.detectedLanguage,
    languageConfidence: parsed.languageConfidence,
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

function normalizeAssemblyAiUtterances(row) {
  const list = row?.utterances;
  if (!Array.isArray(list) || list.length === 0) return [];
  return list
    .map((u) => ({
      speaker: String(u.speaker ?? '?').trim() || '?',
      text: String(u.text || '').trim(),
      start: typeof u.start === 'number' ? u.start : 0,
    }))
    .filter((u) => u.text.length > 0)
    .sort((a, b) => a.start - b.start);
}

function assemblyAiSpeechModels(opts = {}) {
  const raw = String(opts.speechModel || '').trim().toLowerCase();
  if (raw === 'universal-3-pro' || raw === 'universal_3_pro') return ['universal-3-pro'];
  if (raw === 'universal-2' || raw === 'universal_2') return ['universal-2'];
  if (Array.isArray(opts.speechModels) && opts.speechModels.length) {
    const allowed = new Set(['universal-3-pro', 'universal-2']);
    const list = opts.speechModels.map((s) => String(s).trim()).filter((s) => allowed.has(s));
    if (list.length) return list;
  }
  return ['universal-2'];
}

async function transcribeAssemblyAi(buffer, apiKey, opts = {}) {
  const detect = opts.detectLanguage !== false;
  const uploadUrl = await assemblyAiUpload(buffer, apiKey);
  const fixedCode = assemblyAiLanguageCode(opts.fixedLanguage);
  const body = {
    audio_url: uploadUrl,
    speech_models: assemblyAiSpeechModels(opts),
    language_detection: fixedCode ? false : detect,
    speaker_labels: opts.speakerLabels !== false,
    punctuate: opts.punctuate !== false,
    format_text: opts.formatText !== false,
  };
  if (fixedCode) {
    body.language_code = fixedCode;
  }

  if (opts.translateToEnglish === true) {
    body.speech_understanding = {
      request: {
        translation: {
          target_languages: ['en'],
          formal: opts.translationFormal === true,
        },
      },
    };
  }

  const createResp = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
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
  let translatedEnglish = null;
  let utterances = [];
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
      const tt = row?.translated_texts;
      if (tt && typeof tt === 'object' && tt.en != null) {
        translatedEnglish = String(tt.en).trim() || null;
      }
      utterances = normalizeAssemblyAiUtterances(row);
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
    translatedEnglish,
    utterances,
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
  const orgSettings = org?.settings && typeof org.settings === 'object' ? { ...org.settings } : {};
  const pref = String(orgSettings.sttPreferredProvider || '')
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

  if (pref === 'deepgram' && byPlatform.deepgram) {
    return { platform: 'deepgram', integration: byPlatform.deepgram, orgSettings };
  }
  if (pref === 'assemblyai' && byPlatform.assemblyai) {
    return { platform: 'assemblyai', integration: byPlatform.assemblyai, orgSettings };
  }

  if (byPlatform.deepgram) return { platform: 'deepgram', integration: byPlatform.deepgram, orgSettings };
  if (byPlatform.assemblyai) return { platform: 'assemblyai', integration: byPlatform.assemblyai, orgSettings };
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
  const deepgramMode = cfg.transcribeMode === 'detect' ? 'detect' : 'multilingual';

  const fromOrg = String(picked.orgSettings?.sttDefaultLanguage || '').trim();
  const fromInteg = String(cfg.language || '').trim();
  const fixedLanguage = (fromOrg || fromInteg).toLowerCase().replace(/_/g, '-');

  logger.info('[CallTranscription] Downloading audio', {
    organizationId,
    platform: picked.platform,
    sttLanguage: fixedLanguage || (picked.platform === 'deepgram' ? deepgramMode : 'auto'),
  });
  const buffer = await downloadAudioBuffer(recordingUrl);

  if (picked.platform === 'deepgram') {
    return transcribeDeepgram(buffer, apiKey, { model, fixedLanguage, deepgramMode });
  }
  return transcribeAssemblyAi(buffer, apiKey, {
    detectLanguage,
    fixedLanguage,
    speechModel: cfg.speechModel,
    speechModels: cfg.speechModels,
    speakerLabels: cfg.speakerLabels !== false,
    punctuate: cfg.punctuate !== false,
    formatText: cfg.formatText !== false,
    translateToEnglish: cfg.translateToEnglish === true,
    translationFormal: cfg.translationFormal === true,
  });
}

module.exports = {
  downloadAudioBuffer,
  transcribeDeepgram,
  transcribeAssemblyAi,
  pickSttIntegration,
  transcribeRecordingForOrg,
};
