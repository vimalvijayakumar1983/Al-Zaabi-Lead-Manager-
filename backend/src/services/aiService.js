const { logger } = require('../config/logger');

/**
 * AI Service - generates lead summaries, suggestions, and scores
 * Uses OpenAI-compatible API (can be swapped for Claude/local LLM)
 */

function toSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getDisplayName(lead) {
  const fn = (lead?.firstName || '').trim();
  const ln = (lead?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown lead';
  if (!ln || fn.toLowerCase() === ln.toLowerCase()) return fn || ln;
  return `${fn} ${ln}`.trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function summarizeRelativeTime(timestamp) {
  if (!timestamp) return 'No recent activity';
  const date = new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function mapPriority(score, staleDays, overdueTasks) {
  if (overdueTasks > 0 || staleDays >= 4) return 'URGENT';
  if (score >= 70 || staleDays >= 2) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Generate AI summary for a lead based on their activity and communications
 */
const generateLeadSummary = async (lead, activities, communications) => {
  try {
    const insights = generateLeadSummaryInsights(lead, {
      activities,
      communications,
      tasks: [],
      notes: [],
      callLogs: [],
    });
    return insights.summary;
  } catch (err) {
    logger.error('AI summary generation failed:', err);
    return null;
  }
};

/**
 * Suggest next action for a lead
 */
const suggestNextAction = (lead, lastActivity) => {
  const suggestions = [];

  if (lead.status === 'NEW' && !lastActivity) {
    suggestions.push({
      action: 'Call this lead within 2 hours to increase conversion probability.',
      priority: 'HIGH',
      type: 'FOLLOW_UP_CALL',
    });
  }

  if (lead.status === 'CONTACTED' && lead.score >= 50) {
    suggestions.push({
      action: 'Schedule a demo to move this qualified lead forward.',
      priority: 'MEDIUM',
      type: 'DEMO',
    });
  }

  if (lead.status === 'PROPOSAL_SENT') {
    suggestions.push({
      action: 'Follow up on the proposal. Ask if they have questions.',
      priority: 'HIGH',
      type: 'FOLLOW_UP_CALL',
    });
  }

  if (lead.status === 'NEGOTIATION') {
    suggestions.push({
      action: 'Offer a time-limited discount to close this deal.',
      priority: 'URGENT',
      type: 'EMAIL',
    });
  }

  if (lastActivity) {
    const daysSinceActivity = Math.floor(
      (Date.now() - new Date(lastActivity.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceActivity >= 3 && lead.status !== 'WON' && lead.status !== 'LOST') {
      suggestions.push({
        action: `No activity for ${daysSinceActivity} days. Re-engage this lead immediately.`,
        priority: 'URGENT',
        type: 'FOLLOW_UP_CALL',
      });
    }
  }

  if (!lead.email && !lead.phone) {
    suggestions.push({
      action: 'Missing contact info. Try to obtain email or phone number.',
      priority: 'MEDIUM',
      type: 'OTHER',
    });
  }

  return suggestions.length > 0 ? suggestions : [{
    action: 'Continue nurturing this lead with regular check-ins.',
    priority: 'LOW',
    type: 'EMAIL',
  }];
};

function generateLeadSummaryInsights(lead, { activities = [], communications = [], tasks = [], notes = [], callLogs = [] } = {}) {
  const safeActivities = toSafeArray(activities);
  const safeCommunications = toSafeArray(communications);
  const safeTasks = toSafeArray(tasks);
  const safeNotes = toSafeArray(notes);
  const safeCallLogs = toSafeArray(callLogs);

  const now = Date.now();
  const score = Number(lead?.score || 0);
  const conversionProb = Number(lead?.conversionProb || 0);
  const status = lead?.status || 'NEW';

  const openTasks = safeTasks.filter((task) => ['PENDING', 'IN_PROGRESS'].includes(task.status)).length;
  const overdueTasks = safeTasks.filter(
    (task) => ['PENDING', 'IN_PROGRESS'].includes(task.status) && task.dueAt && new Date(task.dueAt).getTime() < now
  ).length;

  const inboundComms = safeCommunications.filter((c) => c.direction === 'INBOUND').length;
  const outboundComms = safeCommunications.filter((c) => c.direction === 'OUTBOUND').length;
  const recentCallOutcomes = safeCallLogs.slice(0, 6).map((log) => log.disposition).filter(Boolean);
  const hasWillCallAgain = recentCallOutcomes.includes('WILL_CALL_US_AGAIN');
  const hasNotInterested = recentCallOutcomes.includes('NOT_INTERESTED');

  const latestTimestamps = [
    ...safeActivities.map((a) => a.createdAt),
    ...safeCommunications.map((c) => c.createdAt),
    ...safeNotes.map((n) => n.createdAt),
    ...safeCallLogs.map((c) => c.createdAt),
    ...safeTasks.map((t) => t.updatedAt || t.createdAt),
  ]
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  const lastTouchTs = latestTimestamps.length > 0 ? Math.max(...latestTimestamps) : null;
  const staleDays = lastTouchTs ? Math.floor((now - lastTouchTs) / (24 * 60 * 60 * 1000)) : 999;

  const risks = [];
  if (overdueTasks > 0) risks.push(`${overdueTasks} overdue follow-up task${overdueTasks === 1 ? '' : 's'}.`);
  if (staleDays >= 3 && staleDays < 999) risks.push(`No meaningful activity in ${staleDays} day${staleDays === 1 ? '' : 's'}.`);
  if (hasNotInterested) risks.push('Recent call outcomes include "Not Interested".');
  if (status === 'NEGOTIATION' && staleDays >= 2) risks.push('Negotiation is active but follow-up pace has slowed.');
  if (conversionProb < 0.25 && ['QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION'].includes(status)) {
    risks.push('Low conversion probability for the current stage.');
  }

  const opportunities = [];
  if (score >= 70) opportunities.push('High lead score indicates strong conversion potential.');
  if (conversionProb >= 0.6) opportunities.push('Conversion probability is healthy for this pipeline position.');
  if (inboundComms >= outboundComms && inboundComms > 0) opportunities.push('Prospect engagement is active with inbound communication.');
  if (hasWillCallAgain) opportunities.push('"Will Call Us Again" signal suggests warm re-engagement potential.');
  if (status === 'QUALIFIED' || status === 'PROPOSAL_SENT') opportunities.push('Lead is in a conversion-ready stage.');

  const recommendedActions = [];
  const priority = mapPriority(score, staleDays, overdueTasks);
  if (overdueTasks > 0) {
    recommendedActions.push({
      title: 'Resolve overdue tasks first',
      reason: 'Clearing overdue commitments restores SLA confidence and momentum.',
      priority: 'URGENT',
    });
  }
  if (staleDays >= 2 && staleDays < 999) {
    recommendedActions.push({
      title: 'Run immediate re-engagement touchpoint',
      reason: `Last activity was ${staleDays} day${staleDays === 1 ? '' : 's'} ago.`,
      priority: priority === 'URGENT' ? 'HIGH' : priority,
    });
  }
  if (score >= 70 || conversionProb >= 0.55) {
    recommendedActions.push({
      title: 'Push for commitment milestone',
      reason: 'Lead quality and intent signals support a conversion-focused follow-up.',
      priority: 'HIGH',
    });
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push({
      title: 'Continue structured nurture cadence',
      reason: 'Maintain regular follow-ups while collecting additional qualification signals.',
      priority: 'MEDIUM',
    });
  }

  const highlights = [
    `Stage: ${lead?.stage?.name || status.replace(/_/g, ' ')}`,
    `Score: ${score}/100`,
    `Conversion: ${Math.round(conversionProb * 100)}%`,
    `Tasks open: ${openTasks}`,
    `Inbound vs outbound comms: ${inboundComms}:${outboundComms}`,
    `Last touch: ${summarizeRelativeTime(lastTouchTs)}`,
  ];

  const confidenceBase = 52 + Math.min(18, safeActivities.length) + Math.min(14, safeCommunications.length) + Math.min(10, safeCallLogs.length);
  const confidence = clamp(confidenceBase - Math.min(12, Math.max(0, staleDays - 1) * 2), 42, 96);

  const leadName = getDisplayName(lead);
  const summarySentences = [];
  summarySentences.push(
    `${leadName} is currently in ${lead?.stage?.name || status.replace(/_/g, ' ').toLowerCase()} with a score of ${score}/100 and ${Math.round(
      conversionProb * 100
    )}% conversion probability.`
  );
  if (staleDays < 999) {
    summarySentences.push(`Most recent activity was ${summarizeRelativeTime(lastTouchTs)}.`);
  } else {
    summarySentences.push('There is limited recent activity history for this lead.');
  }
  if (overdueTasks > 0) {
    summarySentences.push(`There ${overdueTasks === 1 ? 'is' : 'are'} ${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'} that should be addressed first.`);
  } else if (score >= 70 || conversionProb >= 0.55) {
    summarySentences.push('Signals indicate this lead can be advanced with a timely commitment-focused follow-up.');
  } else {
    summarySentences.push('Maintain consistent follow-up cadence and gather stronger qualification signals.');
  }

  return {
    summary: summarySentences.join(' '),
    highlights,
    risks,
    opportunities,
    recommendedActions: recommendedActions.slice(0, 3),
    confidence,
    generatedAt: new Date().toISOString(),
    signals: {
      score,
      conversionProb,
      status,
      openTasks,
      overdueTasks,
      staleDays: staleDays < 999 ? staleDays : null,
      communications: safeCommunications.length,
      calls: safeCallLogs.length,
      notes: safeNotes.length,
      hasWillCallAgain,
      hasNotInterested,
    },
  };
}

/**
 * Build context string for LLM prompts
 */
const buildLeadContext = (lead, activities, communications) => {
  return {
    lead: {
      name: `${lead.firstName} ${lead.lastName}`,
      company: lead.company,
      status: lead.status,
      source: lead.source,
      score: lead.score,
      budget: lead.budget,
      productInterest: lead.productInterest,
    },
    recentActivities: activities.slice(0, 10).map((a) => ({
      type: a.type,
      description: a.description,
      date: a.createdAt,
    })),
    recentCommunications: communications.slice(0, 5).map((c) => ({
      channel: c.channel,
      direction: c.direction,
      subject: c.subject,
      date: c.createdAt,
    })),
  };
};

module.exports = { generateLeadSummary, suggestNextAction, generateLeadSummaryInsights };
