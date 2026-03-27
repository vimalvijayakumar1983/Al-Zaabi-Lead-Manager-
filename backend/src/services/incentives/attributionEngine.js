const { prisma } = require('../../config/database');

/**
 * @param {object} params
 * @param {'last_valid_owner'|'first_touch'|'weighted_split'|'custom_rule_hook'} strategy
 * @param {object} event - { leadId, contactId, dealId, payload, occurredAt }
 * @param {string} organizationId
 * @param {number} attributionWindowDays
 */
async function computeAttribution({ strategy, event, organizationId, attributionWindowDays }) {
  const explain = { strategy, steps: [] };

  if (strategy === 'weighted_split') {
    const split = event.payload?.split || event.payload?.weights;
    if (!Array.isArray(split) || split.length === 0) {
      explain.steps.push({ code: 'MISSING_SPLIT', message: 'payload.split[] required for weighted_split' });
      return { attributions: [], explain };
    }
    const totalW = split.reduce((s, x) => s + Number(x.weight || x.w || 0), 0);
    if (totalW <= 0) {
      explain.steps.push({ code: 'INVALID_WEIGHTS', message: 'Sum of weights must be > 0' });
      return { attributions: [], explain };
    }
    const attributions = split.map((x) => {
      const userId = x.userId || x.user_id;
      const w = Number(x.weight || x.w || 0) / totalW;
      return {
        userId,
        weight: w,
        explain: { ...explain, steps: [...explain.steps, { userId, normalizedWeight: w }] },
      };
    });
    explain.steps.push({ code: 'OK', message: 'Weighted split applied' });
    return { attributions, explain };
  }

  if (strategy === 'custom_rule_hook') {
    explain.steps.push({
      code: 'CUSTOM_HOOK',
      message: 'custom_rule_hook requires external processor; use exceptions queue or implement hook',
    });
    return { attributions: [], explain };
  }

  if (!event.leadId) {
    explain.steps.push({ code: 'NO_LEAD', message: 'Lead ID required for this attribution strategy' });
    return { attributions: [], explain };
  }

  const lead = await prisma.lead.findFirst({
    where: { id: event.leadId, organizationId },
    select: {
      id: true,
      assignedToId: true,
      createdById: true,
      createdAt: true,
    },
  });

  if (!lead) {
    explain.steps.push({ code: 'LEAD_NOT_FOUND', message: 'Lead not in organization scope' });
    return { attributions: [], explain };
  }

  if (strategy === 'first_touch') {
    const userId = lead.createdById || lead.assignedToId;
    if (!userId) {
      explain.steps.push({ code: 'MISSING_OWNER', message: 'No createdBy or assignee on lead' });
      return { attributions: [], explain };
    }
    explain.steps.push({ code: 'FIRST_TOUCH', userId, source: lead.createdById ? 'createdBy' : 'assignedTo' });
    return {
      attributions: [{ userId, weight: 1, explain: { ...explain } }],
      explain,
    };
  }

  // last_valid_owner (default)
  if (!lead.assignedToId) {
    explain.steps.push({ code: 'MISSING_ASSIGNEE', message: 'Lead has no assigned owner' });
    return { attributions: [], explain };
  }

  const windowMs = (attributionWindowDays || 90) * 86400000;
  if (event.occurredAt && lead.createdAt) {
    const oc = new Date(event.occurredAt).getTime();
    const created = new Date(lead.createdAt).getTime();
    if (oc - created > windowMs) {
      explain.steps.push({
        code: 'OUTSIDE_ATTRIBUTION_WINDOW',
        message: 'Event falls outside attribution window vs lead creation',
        attributionWindowDays,
      });
      return { attributions: [], explain };
    }
  }

  explain.steps.push({
    code: 'LAST_VALID_OWNER',
    userId: lead.assignedToId,
    leadId: lead.id,
  });
  return {
    attributions: [{ userId: lead.assignedToId, weight: 1, explain: { ...explain } }],
    explain,
  };
}

/**
 * Pure preview for API without persistence
 */
async function previewAttribution(input) {
  return computeAttribution(input);
}

module.exports = { computeAttribution, previewAttribution };
