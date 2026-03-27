/**
 * Passive WhatsApp token health tracking.
 *
 * Call `recordTokenOk(orgId)` after any successful Meta API call.
 * Call `recordTokenError(orgId, message)` whenever a Meta call returns 401/190.
 *
 * Status is stored as `whatsappTokenStatus` inside the org's settings JSON column
 * so it survives server restarts and is visible to any instance.
 *
 * The frontend reads it via GET /settings/whatsapp which already returns
 * the sanitized settings object.
 */

const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

// Simple in-process debounce so we don't do a DB write for every single message
const _lastWrite = new Map(); // orgId → { ok: bool, at: number }

async function _writeStatus(orgId, status) {
  const last = _lastWrite.get(orgId);
  // Only debounce "ok" writes (every 10 min is enough); always write errors immediately
  if (status.ok && last?.ok === true && Date.now() - (last?.at || 0) < 10 * 60 * 1000) return;

  _lastWrite.set(orgId, { ok: status.ok, at: Date.now() });

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const current = typeof org?.settings === 'object' && org.settings !== null ? org.settings : {};
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        settings: {
          ...current,
          whatsappTokenStatus: status,
        },
      },
    });
  } catch (err) {
    // Non-critical — don't break callers
    logger.warn('[whatsappTokenHealth] Failed to persist token status', { orgId, err: err?.message });
  }
}

/**
 * Record a successful Meta API call — clears any previous error state.
 */
async function recordTokenOk(orgId) {
  if (!orgId) return;
  await _writeStatus(orgId, { ok: true, checkedAt: new Date().toISOString(), error: null });
}

/**
 * Record a Meta auth failure (401, token expired, permission denied, etc.).
 * @param {string} orgId
 * @param {string} errorMessage — human-readable error from Meta
 */
async function recordTokenError(orgId, errorMessage) {
  if (!orgId) return;
  logger.warn('[whatsappTokenHealth] Token error recorded', { orgId, error: errorMessage });
  await _writeStatus(orgId, {
    ok: false,
    checkedAt: new Date().toISOString(),
    error: errorMessage || 'WhatsApp token is invalid or expired',
  });
}

/**
 * Returns true if the Meta error looks like an auth/token problem.
 */
function isTokenError(httpStatus, metaErrorData) {
  if (httpStatus === 401) return true;
  const code = metaErrorData?.error?.code;
  const subcode = metaErrorData?.error?.error_subcode;
  // Meta token expiry codes: 190, 102, 10 (permissions), 200 (permissions)
  if ([190, 102].includes(code)) return true;
  // subcode 463 = expired, 460 = password changed, 467 = invalid
  if ([463, 460, 467].includes(subcode)) return true;
  const msg = String(metaErrorData?.error?.message || '').toLowerCase();
  if (msg.includes('expired') || msg.includes('invalid token') || msg.includes('session has expired')) return true;
  return false;
}

module.exports = { recordTokenOk, recordTokenError, isTokenError };
