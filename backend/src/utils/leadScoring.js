/**
 * World-Class Lead Scoring Engine v3.0
 * ════════════════════════════════════
 * Multi-dimensional scoring across 4 pillars:
 *   1. Profile Completeness  (0-20) — data quality & completeness
 *   2. Engagement Signals     (0-30) — calls, communications, tasks
 *   3. Source Quality          (0-10) — lead origin channel value
 *   4. Pipeline & Momentum    (0-40) — PIPELINE POSITION + freshness + velocity
 *
 * Pipeline position is the single strongest signal — a lead at "Service/Sale
 * Confirmed" should score far higher than one at "New Inquiry". When a lead
 * is demoted backward in the pipeline, the score drops accordingly.
 *
 * Plus negative signal deductions and smart conversion probability.
 *
 * Terminal override policy:
 * - WON/completed lead => score 100, conversionProb 1.00
 * - LOST lead          => score 0,   conversionProb 0.00
 */
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

// ═══════════════════════════════════════════════════════════════════
// PILLAR 1: Profile Completeness (0-20 pts)
// How complete and high-quality is the lead's data?
// ═══════════════════════════════════════════════════════════════════
function scoreProfile(lead) {
  let score = 0;
  const details = {};

  // Contact info — phone is king in automotive
  if (lead.phone) { score += 5; details.phone = 5; }
  if (lead.email) { score += 3; details.email = 3; }

  // Company info
  if (lead.company) { score += 2; details.company = 2; }
  if (lead.jobTitle) { score += 1; details.jobTitle = 1; }
  if (lead.location) { score += 1; details.location = 1; }

  // Interest & intent
  if (lead.productInterest) { score += 3; details.productInterest = 3; }

  // Budget — graduated scale (higher budget = higher intent signal)
  const budget = parseFloat(lead.budget) || 0;
  if (budget >= 500000) { score += 5; details.budget = 5; }
  else if (budget >= 100000) { score += 4; details.budget = 4; }
  else if (budget >= 25000) { score += 3; details.budget = 3; }
  else if (budget > 0) { score += 2; details.budget = 2; }

  return { score: Math.min(score, 20), details, max: 20 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 2: Engagement Signals (0-30 pts)
// How engaged is this lead based on actual interactions?
// ═══════════════════════════════════════════════════════════════════
const POSITIVE_DISPOSITIONS = [
  'MEETING_ARRANGED', 'APPOINTMENT_BOOKED', 'INTERESTED',
  'QUALIFIED', 'PROPOSAL_REQUESTED',
];
const NEUTRAL_DISPOSITIONS = [
  'CALLBACK', 'CALL_LATER', 'CALL_AGAIN', 'WILL_CALL_US_AGAIN',
  'FOLLOW_UP_EMAIL', 'VOICEMAIL_LEFT', 'ALREADY_COMPLETED_SERVICES', 'OTHER',
];
const NEGATIVE_DISPOSITIONS = [
  'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'NOT_INTERESTED', 'GATEKEEPER',
];

function scoreEngagement(calls, communications, tasks) {
  let score = 0;
  const details = {};

  // ── Calls (0-12 pts) ──
  let callScore = 0;
  for (const call of calls) {
    if (POSITIVE_DISPOSITIONS.includes(call.disposition)) {
      callScore += 4; // Strong positive signal
    } else if (NEUTRAL_DISPOSITIONS.includes(call.disposition)) {
      callScore += 1; // Some effort shown
    }
  }
  callScore = Math.min(callScore, 12);
  details.calls = callScore;
  score += callScore;

  // ── Communications (0-8 pts) ──
  let commScore = 0;
  let hasInbound = false;
  let hasOutbound = false;

  for (const comm of communications) {
    if (comm.direction === 'INBOUND') {
      commScore += 3; // Lead reaching out = strong signal
      hasInbound = true;
    } else {
      commScore += 1; // Outbound effort
      hasOutbound = true;
    }
  }
  // Two-way conversation bonus
  if (hasInbound && hasOutbound) commScore += 2;
  commScore = Math.min(commScore, 8);
  details.communications = commScore;
  score += commScore;

  // ── Tasks (0-5 pts) ──
  let taskScore = 0;
  const completed = tasks.filter(t => t.status === 'COMPLETED');
  taskScore += Math.min(completed.length * 2, 4);
  const hasFollowUp = tasks.some(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueAt
  );
  if (hasFollowUp) taskScore += 1;
  taskScore = Math.min(taskScore, 5);
  details.tasks = taskScore;
  score += taskScore;

  // ── Positive call ratio bonus (0-5 pts) ──
  const totalCalls = calls.length;
  const positiveCalls = calls.filter(c => POSITIVE_DISPOSITIONS.includes(c.disposition)).length;
  let ratioScore = 0;
  if (totalCalls >= 2 && positiveCalls > 0) {
    const ratio = positiveCalls / totalCalls;
    if (ratio >= 0.5) ratioScore = 5;
    else if (ratio >= 0.3) ratioScore = 3;
    else if (ratio >= 0.2) ratioScore = 1;
  }
  ratioScore = Math.min(ratioScore, 5);
  details.positiveCallRatio = ratioScore;
  score += ratioScore;

  return { score: Math.min(score, 30), details, max: 30 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 3: Source Quality (0-10 pts)
// Where did this lead come from?
// ═══════════════════════════════════════════════════════════════════
const SOURCE_SCORES = {
  REFERRAL: 10,       // Warm intro — highest conversion
  PHONE: 9,           // Direct inquiry — strong intent
  WEBSITE_FORM: 9,    // Active search — high intent
  LIVE_CHAT: 8,       // Real-time engagement
  LANDING_PAGE: 8,    // Campaign-driven interest
  WHATSAPP: 8,        // Direct messaging — personal
  EMAIL: 7,           // Inquiry via email
  GOOGLE_ADS: 6,      // Paid search — intent-based
  FACEBOOK_ADS: 5,    // Social discovery
  TIKTOK_ADS: 5,      // Social discovery
  MANUAL: 3,          // Hand-entered
  API: 3,             // System-generated
  CSV_IMPORT: 2,      // Bulk list — lowest quality
  OTHER: 2,
};

function scoreSource(source) {
  const score = SOURCE_SCORES[source] || 2;
  return { score, details: { source: score }, max: 10 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 4: Pipeline & Momentum (0-40 pts)
// Where is this lead in the funnel? Is it moving forward?
//
// THIS IS THE MOST IMPORTANT PILLAR — pipeline position is the
// strongest real-world indicator of a lead's value.
//
// Key behavior: Score goes UP when pipeline advances, DOWN when
// pipeline is demoted. This is DYNAMIC — not cached.
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch the lead's current pipeline position as a percentage (0.0 - 1.0).
 * Returns { position: 0-1, stageName, stageIndex, totalStages, isWon, isLost }
 */
async function getPipelinePosition(lead) {
  try {
    if (!lead.stageId || !lead.organizationId) {
      return { position: 0, stageName: null, stageIndex: 0, totalStages: 0, isWon: false, isLost: false };
    }

    // Get all stages for this org, ordered by position
    // Note: PipelineStage model has no isActive field — all stages are active
    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: lead.organizationId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, isWonStage: true, isLostStage: true },
    });

    if (stages.length === 0) {
      return { position: 0, stageName: null, stageIndex: 0, totalStages: 0, isWon: false, isLost: false };
    }

    // Find current stage
    const currentIndex = stages.findIndex(s => s.id === lead.stageId);
    const currentStage = currentIndex >= 0 ? stages[currentIndex] : null;

    if (!currentStage) {
      return { position: 0, stageName: null, stageIndex: 0, totalStages: stages.length, isWon: false, isLost: false };
    }

    // Calculate position as fraction through the pipeline
    // Stage 1 of 7 = 1/7 = 0.14, Stage 5 of 7 = 5/7 = 0.71, etc.
    const position = (currentIndex + 1) / stages.length;

    return {
      position,
      stageName: currentStage.name,
      stageIndex: currentIndex + 1,
      totalStages: stages.length,
      isWon: currentStage.isWonStage || false,
      isLost: currentStage.isLostStage || false,
    };
  } catch (err) {
    logger.error('Pipeline position lookup failed:', err.message);
    return { position: 0, stageName: null, stageIndex: 0, totalStages: 0, isWon: false, isLost: false };
  }
}

async function scorePipelineAndMomentum(lead, activities, calls) {
  let score = 0;
  const details = {};
  const now = new Date();

  // ── Pipeline Position (0-15 pts) — THE KEY ADDITION ──
  // Dynamically calculated from current stage position
  const pipelinePos = await getPipelinePosition(lead);
  let positionPts = 0;

  if (pipelinePos.isWon) {
    positionPts = 15; // Won = max points
  } else if (pipelinePos.isLost) {
    positionPts = 0;  // Lost = zero
  } else if (pipelinePos.totalStages > 0) {
    // Scale linearly: stage 1/7 = 2.1pts, stage 5/7 = 10.7pts
    positionPts = Math.round(pipelinePos.position * 15);
  }

  details.pipelinePosition = {
    points: positionPts,
    stage: pipelinePos.stageName,
    position: `${pipelinePos.stageIndex}/${pipelinePos.totalStages}`,
  };
  score += positionPts;

  // ── Lead age freshness (0-8 pts) ──
  const daysSinceCreated = (now - new Date(lead.createdAt)) / 86400000;
  let freshness = 0;
  if (daysSinceCreated <= 3)       freshness = 8;
  else if (daysSinceCreated <= 7)  freshness = 7;
  else if (daysSinceCreated <= 14) freshness = 5;
  else if (daysSinceCreated <= 30) freshness = 3;
  else if (daysSinceCreated <= 60) freshness = 1;
  details.leadFreshness = freshness;
  score += freshness;

  // ── Last activity recency (0-8 pts) ──
  const allDates = [
    ...activities.map(a => new Date(a.createdAt)),
    ...calls.map(c => new Date(c.createdAt)),
  ];

  if (allDates.length > 0) {
    const lastActivityDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    const daysSinceLast = (now - lastActivityDate) / 86400000;

    let recencyPts = 0;
    if (daysSinceLast <= 1)       recencyPts = 8;
    else if (daysSinceLast <= 3)  recencyPts = 6;
    else if (daysSinceLast <= 7)  recencyPts = 4;
    else if (daysSinceLast <= 14) recencyPts = 2;
    else if (daysSinceLast <= 28) recencyPts = 1;
    details.lastActivityRecency = recencyPts;
    score += recencyPts;
  } else {
    details.lastActivityRecency = 0;
  }

  // ── Engagement velocity (0-5 pts) ──
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const recentCount = activities.filter(a => new Date(a.createdAt) >= sevenDaysAgo).length;
  const previousCount = activities.filter(a => {
    const d = new Date(a.createdAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  }).length;

  let velocity = 0;
  if (recentCount > previousCount && recentCount > 0) velocity = 5;
  else if (recentCount === previousCount && recentCount > 0) velocity = 2;
  details.engagementVelocity = velocity;
  score += velocity;

  // ── Pipeline progression speed (0-4 pts) ──
  const stageChanges = activities.filter(a =>
    a.type === 'STAGE_CHANGE' || a.type === 'STATUS_CHANGE'
  );
  if (stageChanges.length > 0) {
    const firstProgression = new Date(
      Math.min(...stageChanges.map(a => new Date(a.createdAt).getTime()))
    );
    const daysToProgress = (firstProgression - new Date(lead.createdAt)) / 86400000;

    let progressPts = 0;
    if (daysToProgress <= 3)       progressPts = 4;
    else if (daysToProgress <= 7)  progressPts = 3;
    else if (daysToProgress <= 14) progressPts = 2;
    else if (daysToProgress <= 30) progressPts = 1;
    details.pipelineSpeed = progressPts;
    score += progressPts;
  } else {
    details.pipelineSpeed = 0;
  }

  return { score: Math.min(score, 40), details, max: 40 };
}

// ═══════════════════════════════════════════════════════════════════
// NEGATIVE SIGNALS (Deductions)
// ═══════════════════════════════════════════════════════════════════
function calculatePenalties(lead, calls) {
  let penalty = 0;
  const details = {};

  // DNC = instant zero — blocked leads have no score
  if (lead.doNotCall) {
    return { penalty: 0, details: { dnc: 'force_zero' }, forceZero: true };
  }

  // LOST = instant zero
  if (lead.status === 'LOST') {
    return { penalty: 0, details: { lostStatus: 'force_zero' }, forceZero: true };
  }

  // Wrong number calls: -3 each (bad data signal)
  const wrongNumbers = calls.filter(c => c.disposition === 'WRONG_NUMBER').length;
  if (wrongNumbers > 0) {
    const wnPen = wrongNumbers * 3;
    penalty += wnPen;
    details.wrongNumbers = { count: wrongNumbers, penalty: -wnPen };
  }

  // Not interested: -5 each (strong negative signal)
  const notInterested = calls.filter(c => c.disposition === 'NOT_INTERESTED').length;
  if (notInterested > 0) {
    const niPen = notInterested * 5;
    penalty += niPen;
    details.notInterested = { count: notInterested, penalty: -niPen };
  }

  // Multiple no-answers (3+): -5 (unreachable signal)
  const noAnswers = calls.filter(c => c.disposition === 'NO_ANSWER').length;
  if (noAnswers >= 3) {
    penalty += 5;
    details.unreachable = { noAnswerCount: noAnswers, penalty: -5 };
  }

  // Stale lead — no update in 30+ days
  const daysSinceUpdate = (new Date() - new Date(lead.updatedAt)) / 86400000;
  if (daysSinceUpdate > 60) {
    penalty += 10;
    details.stale = { daysSinceUpdate: Math.round(daysSinceUpdate), penalty: -10 };
  } else if (daysSinceUpdate > 30) {
    penalty += 5;
    details.stale = { daysSinceUpdate: Math.round(daysSinceUpdate), penalty: -5 };
  }

  return { penalty, details, forceZero: false };
}

// ═══════════════════════════════════════════════════════════════════
// CONVERSION PROBABILITY — Multi-factor with Pipeline Position
// ═══════════════════════════════════════════════════════════════════

/**
 * Conversion probability now uses ACTUAL pipeline position (0-1)
 * instead of just the status label. This means:
 * - Stage 5 of 7 = 0.71 pipeline weight (strong)
 * - Stage 1 of 7 = 0.14 pipeline weight (weak)
 * - Won stage = 1.0, Lost stage = 0.0
 *
 * Formula: 20% score + 20% engagement + 15% recency + 45% pipeline position
 * Pipeline position is the dominant factor — as it should be.
 */
function calculateConversionProbability(totalScore, engagement, pipelineMomentum, pipelinePosition) {
  const scoreWeight = totalScore / 100;
  const engagementWeight = engagement.score / engagement.max;
  const recencyWeight = (pipelineMomentum.score - (pipelineMomentum.details.pipelinePosition?.points || 0)) /
    (pipelineMomentum.max - 15); // Recency portion only (excluding pipeline position)
  
  // Use actual pipeline position (0-1) — most accurate signal
  let pipelineWeight = 0;
  if (pipelinePosition.isWon) {
    pipelineWeight = 1.0;
  } else if (pipelinePosition.isLost) {
    pipelineWeight = 0.0;
  } else {
    pipelineWeight = pipelinePosition.position;
  }

  // Weighted: pipeline position = 45% (dominant), score = 20%, engagement = 20%, recency = 15%
  const probability = (
    scoreWeight * 0.20 +
    engagementWeight * 0.20 +
    (isNaN(recencyWeight) ? 0 : recencyWeight) * 0.15 +
    pipelineWeight * 0.45
  );

  return Math.round(Math.min(probability, 1.0) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Full lead scoring — queries database for all engagement signals
 * AND current pipeline position.
 *
 * Score moves dynamically with pipeline:
 *   - Advance pipeline → score increases
 *   - Demote pipeline  → score decreases
 *   - Won stage        → pipeline pillar maxes out
 *   - Lost/DNC         → force zero
 *
 * @param {string} leadId - The lead UUID
 * @returns {{ score: number, conversionProb: number, breakdown: object }}
 */
async function calculateFullScore(leadId) {
  try {
    // Fetch all data in parallel for maximum performance
    const [lead, calls, communications, tasks, activities] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.callLog.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' } }),
      prisma.communication.findMany({ where: { leadId, isDeleted: { not: true } } }),
      prisma.task.findMany({ where: { leadId } }),
      prisma.leadActivity.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' } }),
    ]);

    if (!lead) return { score: 0, conversionProb: 0, breakdown: null };

    // Calculate all 4 pillars (Pillar 4 is now async — fetches pipeline data)
    const profile = scoreProfile(lead);
    const engagement = scoreEngagement(calls, communications, tasks);
    const source = scoreSource(lead.source);
    const pipelineMomentum = await scorePipelineAndMomentum(lead, activities, calls);

    // Also get raw pipeline position for conversion probability
    const pipelinePosition = await getPipelinePosition(lead);

    // Calculate penalties
    const penalties = calculatePenalties(lead, calls);

    // Terminal overrides for deterministic CRM behavior.
    const isWonTerminal = pipelinePosition.isWon || lead.status === 'WON';
    const isLostTerminal = pipelinePosition.isLost || lead.status === 'LOST';

    // Combine
    let totalScore = profile.score + engagement.score + source.score + pipelineMomentum.score;
    let conversionProb;

    if (isWonTerminal) {
      totalScore = 100;
      conversionProb = 1.0;
    } else if (isLostTerminal || penalties.forceZero) {
      totalScore = 0;
      conversionProb = 0;
    } else {
      totalScore = Math.max(0, totalScore - penalties.penalty);
      totalScore = Math.min(totalScore, 100);
      // Conversion probability — pipeline-dominant
      conversionProb = calculateConversionProbability(totalScore, engagement, pipelineMomentum, pipelinePosition);
    }

    return {
      score: totalScore,
      conversionProb,
      breakdown: {
        profile: { score: profile.score, max: profile.max, details: profile.details },
        engagement: { score: engagement.score, max: engagement.max, details: engagement.details },
        source: { score: source.score, max: source.max, details: source.details },
        pipelineAndMomentum: { score: pipelineMomentum.score, max: pipelineMomentum.max, details: pipelineMomentum.details },
        penalties: penalties.details,
        terminalOverride: isWonTerminal ? 'WON' : (isLostTerminal ? 'LOST' : null),
        total: totalScore,
      },
    };
  } catch (err) {
    logger.error('Full lead scoring failed for', leadId, err.message);
    return { score: 0, conversionProb: 0, breakdown: null };
  }
}

/**
 * Basic lead scoring — for new leads with no engagement data yet.
 * Uses only profile completeness + source quality.
 *
 * @param {object} leadData - The lead object (from create payload)
 * @returns {number} Score 0-100
 */
function calculateBasicScore(leadData) {
  const profile = scoreProfile(leadData);
  const source = scoreSource(leadData.source);
  return Math.min(profile.score + source.score, 100);
}

/**
 * Legacy interface — kept for backward compatibility.
 * New code should use calculateFullScore() or calculateBasicScore().
 */
const calculateLeadScore = (lead, activityCount = 0) => {
  const profile = scoreProfile(lead);
  const source = scoreSource(lead.source);
  let score = profile.score + source.score;
  score += Math.min(activityCount * 2, 10);
  return Math.min(score, 100);
};

/**
 * Legacy conversion predictor — kept for backward compatibility.
 */
const predictConversion = (score, status) => {
  const STATUS_PROGRESSION_WEIGHTS = {
    NEW: 0.10, CONTACTED: 0.25, QUALIFIED: 0.50,
    PROPOSAL_SENT: 0.65, NEGOTIATION: 0.75, WON: 1.0, LOST: 0.0,
  };
  const multiplier = STATUS_PROGRESSION_WEIGHTS[status] ?? 0.3;
  return Math.round((score / 100) * multiplier * 100) / 100;
};

/**
 * Rescore a lead and persist the new score to the database.
 * Returns the full breakdown.
 */
async function rescoreAndPersist(leadId) {
  const result = await calculateFullScore(leadId);
  if (result.breakdown) {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        score: result.score,
        conversionProb: result.conversionProb,
      },
    });
  }
  return result;
}

module.exports = {
  calculateLeadScore,
  calculateBasicScore,
  calculateFullScore,
  predictConversion,
  rescoreAndPersist,
};
