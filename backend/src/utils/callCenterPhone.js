function toDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Normalize lead phone to local style for external call-center APIs (UAE-focused).
 */
function normalizeMobileForExternal(phone) {
  const digits = toDigits(phone);
  if (!digits) return '';
  if (digits.startsWith('00971') && digits.length >= 13) return `0${digits.slice(5)}`;
  if (digits.startsWith('971') && digits.length >= 12) return `0${digits.slice(3)}`;
  if (digits.startsWith('5') && digits.length === 9) return `0${digits}`;
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(0, 10);
  return digits;
}

/**
 * Normalize PBX agent id for matching (e.g. "5030.0" -> "5030").
 */
function normalizeAgentIdForMatch(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const n = parseFloat(s.replace(/,/g, ''));
  if (Number.isFinite(n) && String(n) === s.replace(/\.0+$/, '')) {
    return String(Math.trunc(n));
  }
  return s.replace(/\.0+$/, '').trim();
}

function normalizeExtensionForMatch(value) {
  return String(value ?? '').trim();
}

/**
 * Normalize PBX DID / dnid for matching division settings.didNumber (e.g. "3071192.0" -> "3071192").
 */
function normalizeDidForMatch(value) {
  if (value == null || value === '') return '';
  return String(value).replace(/\.0+$/, '').trim();
}

/** Extract DID from webhook/API row (dnid or did). */
function didFromPayload(row) {
  if (!row || typeof row !== 'object') return '';
  const v = row.dnid ?? row.did;
  return normalizeDidForMatch(v);
}

module.exports = {
  toDigits,
  normalizeMobileForExternal,
  normalizeAgentIdForMatch,
  normalizeExtensionForMatch,
  normalizeDidForMatch,
  didFromPayload,
};
