const LEAD_STATUS_VALUES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];

const STATUS_TO_KEYWORDS = {
  NEW: ['new', 'untouched', 'fresh', 'incoming', 'inquiry'],
  // Do not use "assessment" / "inspect" here: stages like "Vehicle assessment" are later pipeline steps
  // and must not be chosen when the *lead status* is only CONTACTED (e.g. after a call log).
  CONTACTED: ['contact', 'touched', 'follow', 'reach', 'called', 'engaged'],
  QUALIFIED: ['qualif', 'interested', 'hot', 'warm', 'ready', 'service', 'sale', 'confirm', 'active', 'pending', 'assessment', 'inspect', 'evaluat'],
  PROPOSAL_SENT: ['proposal', 'quote', 'offer', 'sent', 'quotation'],
  NEGOTIATION: ['negotiation', 'negotiat', 'counter', 'terms', 'bargain'],
  WON: ['won', 'converted', 'signed', 'closed won', 'completed', 'done', 'finished'],
  LOST: ['lost', 'dead', 'rejected', 'disqualif', 'closed lost', 'cancelled', 'canceled'],
};

function asObject(value) {
  return (typeof value === 'object' && value !== null) ? value : {};
}

function normalizeLeadStatus(status) {
  if (!status) return null;
  const normalized = String(status).trim().toUpperCase();
  return LEAD_STATUS_VALUES.includes(normalized) ? normalized : null;
}

function getStatusStageMappingFromSettings(settings, divisionId) {
  if (!divisionId) return {};
  const normalizedSettings = asObject(settings);
  const mappingRoot = asObject(normalizedSettings.statusStageMapping);
  const divKey = `division_${divisionId}`;
  return asObject(mappingRoot[divKey]);
}

function mapStageToStatusByFallback(stageName, isWonStage, isLostStage, currentStatus) {
  if (isWonStage) return 'WON';
  if (isLostStage) return 'LOST';

  const name = (stageName || '').toLowerCase().trim();

  if (/\bnew\b|untouched|fresh|incoming|unassigned|inquiry/.test(name)) return 'NEW';
  // "Assessment" / inspection-style stages align with QUALIFIED, not first contact (CONTACTED).
  if (/contact|touched|follow[\s-]?up|reach|called|responded|engaged|attempt/.test(name)) return 'CONTACTED';
  if (/proposal|quote|offer|sent|quotation/.test(name)) return 'PROPOSAL_SENT';
  if (/negotiation|negotiat|counter|terms|bargain/.test(name)) return 'NEGOTIATION';
  if (/qualif|interested|hot|warm|ready|present|demo|trial|review|meeting|scheduled|in[\s-]?progress|processing|working|active|pending|deliver|visit|booked|service|sale|confirm|assessment|inspect|evaluat/.test(name)) return 'QUALIFIED';
  if (/\bwon\b|closed[\s-]?won|deal[\s-]?won|converted|signed|completed|done|finished/.test(name)) return 'WON';
  if (/\blost\b|closed[\s-]?lost|dead|rejected|disqualif|churned|cancelled|canceled/.test(name)) return 'LOST';

  if (currentStatus === 'WON' || currentStatus === 'LOST') return 'QUALIFIED';
  return normalizeLeadStatus(currentStatus) || 'NEW';
}

function resolveStatusForStage({ stage, currentStatus, settings, divisionId }) {
  const mapping = getStatusStageMappingFromSettings(settings, divisionId);
  const manual = normalizeLeadStatus(mapping[stage.id]);
  if (manual) return manual;
  return mapStageToStatusByFallback(stage.name, stage.isWonStage, stage.isLostStage, currentStatus);
}

function findStageForStatus({ targetStatus, stages, settings, divisionId }) {
  const normalizedTarget = normalizeLeadStatus(targetStatus);
  if (!normalizedTarget || !Array.isArray(stages) || stages.length === 0) return null;

  const mapping = getStatusStageMappingFromSettings(settings, divisionId);
  const manualStage = stages.find((stage) => normalizeLeadStatus(mapping[stage.id]) === normalizedTarget);
  if (manualStage) return manualStage;

  if (normalizedTarget === 'WON') {
    const won = stages.find((stage) => stage.isWonStage);
    if (won) return won;
  }
  if (normalizedTarget === 'LOST') {
    const lost = stages.find((stage) => stage.isLostStage);
    if (lost) return lost;
  }

  const keywords = STATUS_TO_KEYWORDS[normalizedTarget] || [];
  if (keywords.length === 0) return null;
  return stages.find((stage) => {
    const name = String(stage.name || '').toLowerCase();
    return keywords.some((kw) => name.includes(kw));
  }) || null;
}

function buildStageStatusRows(stages, settings, divisionId) {
  const mapping = getStatusStageMappingFromSettings(settings, divisionId);
  return (stages || []).map((stage) => {
    const manual = normalizeLeadStatus(mapping[stage.id]);
    const fallback = mapStageToStatusByFallback(stage.name, stage.isWonStage, stage.isLostStage, 'NEW');
    return {
      stageId: stage.id,
      stageName: stage.name,
      isDefault: !!stage.isDefault,
      isWonStage: !!stage.isWonStage,
      isLostStage: !!stage.isLostStage,
      mappedStatus: manual || fallback,
      source: manual ? 'manual' : 'fallback',
      fallbackStatus: fallback,
    };
  });
}

module.exports = {
  LEAD_STATUS_VALUES,
  normalizeLeadStatus,
  getStatusStageMappingFromSettings,
  mapStageToStatusByFallback,
  resolveStatusForStage,
  findStageForStatus,
  buildStageStatusRows,
};
