const { prisma } = require('../../config/database');
const { computeAttribution } = require('./attributionEngine');
const { computeEarningAmount } = require('./earningsEngine');
const { writeIncentiveAudit } = require('./auditLog');

async function findActivePlanAndRuleVersion(organizationId, divisionId, occurredAt) {
  const at = new Date(occurredAt);
  const plan = await prisma.incentivePlan.findFirst({
    where: {
      organizationId,
      divisionId,
      status: 'ACTIVE',
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] }],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      ruleSets: {
        where: { status: 'ACTIVE' },
        include: {
          versions: {
            where: { status: 'PUBLISHED' },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        take: 1,
      },
    },
  });
  if (!plan?.ruleSets?.[0]?.versions?.[0]) return { plan: null, ruleVersion: null };
  return { plan, ruleVersion: plan.ruleSets[0].versions[0] };
}

/**
 * Normalize → attribute → earn (idempotent per event: skip if attributions exist)
 */
async function processIncentiveEvent(eventId, actorId) {
  const event = await prisma.incentiveEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: 'Event not found' };

  const existingAttr = await prisma.incentiveAttribution.count({ where: { eventId } });
  if (existingAttr > 0) {
    return { ok: true, skipped: true, reason: 'already_processed' };
  }

  await prisma.incentiveEvent.update({
    where: { id: eventId },
    data: { processingStatus: 'NORMALIZED', normalizedAt: new Date() },
  });

  const { plan, ruleVersion } = await findActivePlanAndRuleVersion(
    event.organizationId,
    event.divisionId,
    event.occurredAt
  );

  if (!plan || !ruleVersion) {
    await prisma.incentiveException.create({
      data: {
        organizationId: event.organizationId,
        divisionId: event.divisionId,
        eventId: event.id,
        reasonCode: 'NO_ACTIVE_PLAN',
        message: 'No active incentive plan or published rule version for event date',
        remediationHint: 'Activate a plan with a published rule version covering this date',
      },
    });
    await prisma.incentiveEvent.update({
      where: { id: eventId },
      data: { processingStatus: 'FAILED', failureReason: 'NO_ACTIVE_PLAN' },
    });
    return { ok: false, error: 'NO_ACTIVE_PLAN' };
  }

  const { attributions, explain } = await computeAttribution({
    strategy: ruleVersion.attributionStrategy,
    event: {
      leadId: event.leadId,
      contactId: event.contactId,
      dealId: event.dealId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    },
    organizationId: event.organizationId,
    attributionWindowDays: ruleVersion.attributionWindowDays,
  });

  if (!attributions.length) {
    await prisma.incentiveException.create({
      data: {
        organizationId: event.organizationId,
        divisionId: event.divisionId,
        eventId: event.id,
        reasonCode: 'ATTRIBUTION_EMPTY',
        message: 'No payee could be attributed',
        remediationHint: JSON.stringify(explain),
      },
    });
    await prisma.incentiveEvent.update({
      where: { id: eventId },
      data: { processingStatus: 'FAILED', failureReason: 'ATTRIBUTION_EMPTY' },
    });
    return { ok: false, error: 'ATTRIBUTION_EMPTY', explain };
  }

  const earningsConfig = ruleVersion.earningsConfig || {};
  const { amount, trace } = computeEarningAmount({
    earningsConfig,
    eventType: event.eventType,
    event,
  });

  const created = [];
  for (const row of attributions) {
    const share = amount * Number(row.weight);
    const attr = await prisma.incentiveAttribution.create({
      data: {
        eventId: event.id,
        organizationId: event.organizationId,
        divisionId: event.divisionId,
        userId: row.userId,
        weight: row.weight,
        strategy: ruleVersion.attributionStrategy,
        explain: { ...explain, row: row.explain },
      },
    });
    const earn = await prisma.incentiveEarning.create({
      data: {
        eventId: event.id,
        attributionId: attr.id,
        ruleVersionId: ruleVersion.id,
        organizationId: event.organizationId,
        divisionId: event.divisionId,
        userId: row.userId,
        amount: share,
        currency: plan.currency,
        trace: { ...trace, weight: row.weight, share },
        status: 'POSTED',
      },
    });
    created.push({ attributionId: attr.id, earningId: earn.id });
  }

  await prisma.incentiveEvent.update({
    where: { id: eventId },
    data: { processingStatus: 'EARNED' },
  });

  if (actorId) {
    await writeIncentiveAudit({
      organizationId: event.organizationId,
      divisionId: event.divisionId,
      actorId,
      action: 'PROCESS_EVENT',
      modelType: 'IncentiveEvent',
      modelId: event.id,
      after: { earnings: created },
    });
  }

  return { ok: true, earnings: created };
}

async function dryRunProcessEvent(eventId) {
  const event = await prisma.incentiveEvent.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: 'Event not found' };
  const { plan, ruleVersion } = await findActivePlanAndRuleVersion(
    event.organizationId,
    event.divisionId,
    event.occurredAt
  );
  if (!plan || !ruleVersion) return { ok: false, error: 'NO_ACTIVE_PLAN' };
  const { attributions, explain } = await computeAttribution({
    strategy: ruleVersion.attributionStrategy,
    event: {
      leadId: event.leadId,
      contactId: event.contactId,
      dealId: event.dealId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    },
    organizationId: event.organizationId,
    attributionWindowDays: ruleVersion.attributionWindowDays,
  });
  const { amount, trace } = computeEarningAmount({
    earningsConfig: ruleVersion.earningsConfig || {},
    eventType: event.eventType,
    event,
  });
  return {
    ok: true,
    planId: plan.id,
    ruleVersionId: ruleVersion.id,
    attributions,
    explain,
    totalEarningPreview: amount,
    earningTrace: trace,
  };
}

module.exports = {
  processIncentiveEvent,
  dryRunProcessEvent,
  findActivePlanAndRuleVersion,
};
