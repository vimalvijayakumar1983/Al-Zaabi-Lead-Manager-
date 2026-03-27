/**
 * Line-level earnings trace (no extra npm deps; use Number + careful rounding).
 */

function roundHalfUp(value, scale = 2) {
  const m = 10 ** scale;
  return Math.round((Number(value) + Number.EPSILON) * m) / m;
}

function baseAmountFromEvent(event, baseField) {
  if (baseField === 'amount' && event.amount != null) return Number(event.amount);
  const p = event.payload || {};
  if (typeof p[baseField] === 'number') return p[baseField];
  if (p[baseField] != null && !Number.isNaN(Number(p[baseField]))) return Number(p[baseField]);
  return 0;
}

function computeTieredPercent(base, tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return { amount: 0, trace: { tiers: [] } };
  let remaining = Number(base);
  let total = 0;
  const traceTiers = [];
  for (const t of tiers) {
    const upTo = t.upTo == null ? null : Number(t.upTo);
    const pct = Number(t.percent || 0) / 100;
    const slice = upTo == null ? remaining : Math.min(remaining, upTo);
    const part = slice * pct;
    total += part;
    traceTiers.push({ upTo, percent: t.percent, slice, part });
    remaining -= slice;
    if (remaining <= 0) break;
  }
  return { amount: total, trace: { tiers: traceTiers } };
}

function computeEarningAmount({ earningsConfig, eventType, event }) {
  const cfg = earningsConfig || {};
  const et =
    (cfg.eventTypes && cfg.eventTypes[eventType]) || cfg.defaultEventRule || { type: 'fixed', amount: 0 };
  const scale = cfg.roundingScale ?? 2;
  const trace = {
    formula: et.type,
    eventType,
    intermediate: {},
    rounding: { scale, mode: 'HALF_UP' },
  };

  let raw = 0;

  switch (et.type) {
    case 'fixed':
      raw = Number(et.amount || 0);
      trace.intermediate.fixed = et.amount;
      break;
    case 'percent': {
      const base = baseAmountFromEvent(event, et.baseField || 'amount');
      trace.intermediate.base = base;
      trace.intermediate.percent = et.percent;
      raw = base * (Number(et.percent || 0) / 100);
      break;
    }
    case 'tiered_percent': {
      const base = baseAmountFromEvent(event, et.baseField || 'amount');
      trace.intermediate.base = base;
      const { amount, trace: tr } = computeTieredPercent(base, et.tiers);
      trace.intermediate.tiered = tr;
      raw = amount;
      break;
    }
    case 'hybrid': {
      const base = baseAmountFromEvent(event, et.baseField || 'amount');
      const fixed = Number(et.fixed || 0);
      const pctPart = base * (Number(et.percent || 0) / 100);
      raw = fixed + pctPart;
      trace.intermediate = { base, fixed: et.fixed, percent: et.percent, pctPart };
      break;
    }
    case 'flat_percent':
      raw = baseAmountFromEvent(event, et.baseField || 'amount') * (Number(et.percent || 0) / 100);
      break;
    default:
      raw = 0;
      trace.intermediate.note = 'unknown_type';
  }

  if (cfg.accelerator && cfg.accelerator.threshold != null && cfg.accelerator.multiplier) {
    const b = baseAmountFromEvent(event, cfg.accelerator.baseField || 'amount');
    if (b >= Number(cfg.accelerator.threshold)) {
      raw *= Number(cfg.accelerator.multiplier);
      trace.intermediate.accelerator = cfg.accelerator;
    }
  }

  let final = roundHalfUp(raw, scale);

  const floor = cfg.floorPerEvent != null ? Number(cfg.floorPerEvent) : null;
  const cap = cfg.capPerEvent != null ? Number(cfg.capPerEvent) : null;
  if (floor != null && final < floor) final = floor;
  if (cap != null && final > cap) final = cap;

  const minPayout = cfg.minPayout != null ? Number(cfg.minPayout) : 0;
  if (final < minPayout) {
    trace.intermediate.belowMinPayout = { minPayout, before: final };
    final = 0;
  }

  trace.finalAmount = final;
  return { amount: final, trace };
}

function simulateEarning(input) {
  return computeEarningAmount(input);
}

module.exports = {
  computeEarningAmount,
  simulateEarning,
  roundHalfUp,
  baseAmountFromEvent,
};
