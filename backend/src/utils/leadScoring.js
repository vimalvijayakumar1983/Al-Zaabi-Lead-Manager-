/**
 * World-Class Lead Scoring Engine v2.0
 * ════════════════════════════════════
 * Multi-dimensional scoring across 4 pillars:
 *   1. Profile Completeness (0-25) — data quality & completeness
 *   2. Engagement Signals   (0-35) — calls, communications, tasks
 *   3. Source Quality        (0-15) — lead origin channel value
 *   4. Recency & Momentum   (0-25) — freshness, velocity, progression
 *
 * Plus negative signal deductions and smart conversion probability.
 */
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');

// ═══════════════════════════════════════════════════════════════════
// PILLAR 1: Profile Completeness (0-25 pts)
// How complete and high-quality is the lead's data?
// ═══════════════════════════════════════════════════════════════════
function scoreProfile(lead) {
  let score = 0;
  const details = {};

  // Contact info
  if (lead.email) { score += 4; details.email = 4; }
  if (lead.phone) { score += 4; details.phone = 4; }

  // Company info
  if (lead.company) { score += 3; details.company = 3; }
  if (lead.jobTitle) { score += 2; details.jobTitle = 2; }
  if (lead.location) { score += 2; details.location = 2; }

  // Interest & intent
  if (lead.productInterest) { score += 3; details.productInterest = 3; }

  // Budget — graduated scale (higher budget = higher intent signal)
  const budget = parseFloat(lead.budget) || 0;
  if (budget >= 500000) { score += 5; details.budget = 5; }
  else if (budget >= 100000) { score += 4; details.budget = 4; }
  else if (budget >= 25000) { score += 3; details.budget = 3; }
  else if (budget > 0) { score += 2; details.budget = 2; }

  return { score: Math.min(score, 25), details, max: 25 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 2: Engagement Signals (0-35 pts)
// How engaged is this lead based on actual interactions?
// ═══════════════════════════════════════════════════════════════════
const POSITIVE_DISPOSITIONS = [
  'MEETING_ARRANGED', 'APPOINTMENT_BOOKED', 'INTERESTED',
  'QUALIFIED', 'PROPOSAL_REQUESTED',
];
const NEUTRAL_DISPOSITIONS = [
  'CALLBACK', 'FOLLOW_UP_EMAIL', 'VOICEMAIL_LEFT', 'OTHER',
];
const NEGATIVE_DISPOSITIONS = [
  'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'NOT_INTERESTED', 'GATEKEEPER',
];

function scoreEngagement(calls, communications, tasks) {
  let score = 0;
  const details = {};

  // ── Calls (0-15 pts) ──
  let callScore = 0;
  for (const call of calls) {
    if (POSITIVE_DISPOSITIONS.includes(call.disposition)) {
      callScore += 4; // Strong positive signal
    } else if (NEUTRAL_DISPOSITIONS.includes(call.disposition)) {
      callScore += 1; // Some effort shown
    }
    // Negative dispositions: +0 (penalized separately)
    // DNC: handled in penalties
  }
  callScore = Math.min(callScore, 15);
  details.calls = callScore;
  score += callScore;

  // ── Communications (0-10 pts) ──
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
  // Two-way conversation bonus — both sides engaged
  if (hasInbound && hasOutbound) commScore += 2;
  commScore = Math.min(commScore, 10);
  details.communications = commScore;
  score += commScore;

  // ── Tasks (0-5 pts) ──
  let taskScore = 0;
  const completed = tasks.filter(t => t.status === 'COMPLETED');
  taskScore += Math.min(completed.length * 2, 4);

  // Active follow-up scheduled = agent invested in this lead
  const hasFollowUp = tasks.some(t =>
    (t.status === 'PENDING' || t.status === 'IN_PROGRESS') && t.dueAt
  );
  if (hasFollowUp) taskScore += 1;
  taskScore = Math.min(taskScore, 5);
  details.tasks = taskScore;
  score += taskScore;

  // ── Response ratio bonus (0-5 pts) ──
  // If lead has high ratio of positive to total calls, bonus points
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

  return { score: Math.min(score, 35), details, max: 35 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 3: Source Quality (0-15 pts)
// Where did this lead come from?
// ═══════════════════════════════════════════════════════════════════
const SOURCE_SCORES = {
  REFERRAL: 15,      // Warm intro — highest conversion
  PHONE: 12,         // Direct inquiry — strong intent
  WEBSITE_FORM: 12,  // Active search — high intent
  LIVE_CHAT: 10,     // Real-time engagement
  LANDING_PAGE: 10,  // Campaign-driven interest
  WHATSAPP: 10,      // Direct messaging — personal
  EMAIL: 8,          // Inquiry via email
  GOOGLE_ADS: 7,     // Paid search — intent-based
  FACEBOOK_ADS: 6,   // Social discovery
  TIKTOK_ADS: 6,     // Social discovery
  MANUAL: 4,         // Hand-entered
  API: 4,            // System-generated
  CSV_IMPORT: 3,     // Bulk list — lowest quality
  OTHER: 3,
};

function scoreSource(source) {
  const score = SOURCE_SCORES[source] || 3;
  return { score, details: { source: score }, max: 15 };
}

// ═══════════════════════════════════════════════════════════════════
// PILLAR 4: Recency & Momentum (0-25 pts)
// How fresh is this lead? Is engagement accelerating?
// ═══════════════════════════════════════════════════════════════════
function scoreRecency(lead, activities, calls) {
  let score = 0;
  const details = {};
  const now = new Date();

  // ── Lead age freshness (0-8 pts) ──
  // Newer leads get more attention — natural decay
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
  // Recent activity = active opportunity
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
  // Accelerating engagement = hot lead
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const recentCount = activities.filter(a => new Date(a.createdAt) >= sevenDaysAgo).length;
  const previousCount = activities.filter(a => {
    const d = new Date(a.createdAt);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  }).length;

  let velocity = 0;
  if (recentCount > previousCount && recentCount > 0) velocity = 5; // Accelerating
  else if (recentCount === previousCount && recentCount > 0) velocity = 2; // Stable
  // Declining = 0
  details.engagementVelocity = velocity;
  score += velocity;

  // ── Pipeline progression speed (0-4 pts) ──
  // Fast movers through pipeline stages = high intent
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

  return { score: Math.min(score, 25), details, max: 25 };
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
// CONVERSION PROBABILITY — Multi-factor
// ═══════════════════════════════════════════════════════════════════
const STATUS_PROGRESSION_WEIGHTS = {
  NEW: 0.10,
  CONTACTED: 0.25,
  QUALIFIED: 0.50,
  PROPOSAL_SENT: 0.65,
  NEGOTIATION: 0.75,
  WON: 1.0,
  LOST: 0.0,
};

function calculateConversionProbability(totalScore, engagement, recency, lead) {
  const scoreWeight = totalScore / 100;
  const engagementWeight = engagement.score / engagement.max;
  const recencyWeight = recency.score / recency.max;
  const statusWeight = STATUS_PROGRESSION_WEIGHTS[lead.status] ?? 0.10;

  // Weighted combination:
  // 25% raw score + 25% engagement + 20% recency + 30% pipeline position
  const probability = (
    scoreWeight * 0.25 +
    engagementWeight * 0.25 +
    recencyWeight * 0.20 +
    statusWeight * 0.30
  );

  return Math.round(probability * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SCORING ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Full lead scoring — queries database for all engagement signals.
 * Call this whenever a lead needs rescoring (after calls, status changes, etc.)
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

    // Calculate all 4 pillars
    const profile = scoreProfile(lead);
    const engagement = scoreEngagement(calls, communications, tasks);
    const source = scoreSource(lead.source);
    const recency = scoreRecency(lead, activities, calls);

    // Calculate penalties
    const penalties = calculatePenalties(lead, calls);

    // Combine
    let totalScore = profile.score + engagement.score + source.score + recency.score;

    if (penalties.forceZero) {
      totalScore = 0;
    } else {
      totalScore = Math.max(0, totalScore - penalties.penalty);
    }
    totalScore = Math.min(totalScore, 100);

    // Conversion probability
    const conversionProb = penalties.forceZero
      ? 0
      : calculateConversionProbability(totalScore, engagement, recency, lead);

    return {
      score: totalScore,
      conversionProb,
      breakdown: {
        profile: { score: profile.score, max: profile.max, details: profile.details },
        engagement: { score: engagement.score, max: engagement.max, details: engagement.details },
        source: { score: source.score, max: source.max, details: source.details },
        recency: { score: recency.score, max: recency.max, details: recency.details },
        penalties: penalties.details,
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
