const { logger } = require('../config/logger');

/**
 * AI Service - generates lead summaries, suggestions, and scores
 * Uses OpenAI-compatible API (can be swapped for Claude/local LLM)
 */

/**
 * Generate AI summary for a lead based on their activity and communications
 */
const generateLeadSummary = async (lead, activities, communications) => {
  try {
    const context = buildLeadContext(lead, activities, communications);

    // In production, call LLM API:
    // const response = await callLLM(prompt);

    // For now, generate a structured summary
    const summary = [];
    summary.push(`${lead.firstName} ${lead.lastName}`);
    if (lead.company) summary.push(`from ${lead.company}`);
    if (lead.productInterest) summary.push(`interested in ${lead.productInterest}`);
    if (lead.budget) summary.push(`with a budget of $${lead.budget}`);
    summary.push(`(Score: ${lead.score}/100)`);

    if (communications.length > 0) {
      summary.push(`| ${communications.length} communications logged`);
    }
    if (activities.length > 0) {
      summary.push(`| ${activities.length} activities tracked`);
    }

    return summary.join(' ');
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

module.exports = { generateLeadSummary, suggestNextAction };
