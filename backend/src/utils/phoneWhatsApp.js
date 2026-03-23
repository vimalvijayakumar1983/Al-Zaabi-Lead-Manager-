/**
 * WhatsApp / Meta uses wa_id as digits only (no +). Users often save UAE numbers as
 * +971 0 55… (local trunk 0 after country code) which must match +971 55… for API/send.
 */

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Strip national trunk "0" immediately after UAE country code 971.
 * e.g. 9710551543872 → 971551543872 (same as Meta wa_id)
 */
function canonicalPhoneDigitsForWhatsApp(digits) {
  let d = digitsOnly(digits);
  if (!d) return d;
  // UAE: international format is 971 + 9 digits (mobile starts with 5); never 9710…
  if (d.startsWith('971') && d.length >= 5 && d[3] === '0') {
    d = d.slice(0, 3) + d.slice(4);
  }
  return d;
}

/**
 * Values to match against lead.phone (stored with or without +).
 */
function buildWhatsAppPhoneLookupVariants(canonicalDigits) {
  const canon = canonicalPhoneDigitsForWhatsApp(canonicalDigits);
  if (!canon) return [];
  const variants = new Set([canon, `+${canon}`]);
  // DB typo: +9710XXXXXXXX (extra 0) when canonical is 971XXXXXXXXX
  if (canon.startsWith('971') && canon.length >= 4 && canon[3] !== '0') {
    const withTrunkTypo = `9710${canon.slice(3)}`;
    variants.add(withTrunkTypo);
    variants.add(`+${withTrunkTypo}`);
  }
  return [...variants];
}

module.exports = {
  digitsOnly,
  canonicalPhoneDigitsForWhatsApp,
  buildWhatsAppPhoneLookupVariants,
};
