/**
 * Demo seed for Universal Incentive Engine (run after migrations).
 * Usage: INCENTIVE_DIVISION_ID=<uuid> node prisma/seed-incentives-demo.js
 * Or: node prisma/seed-incentives-demo.js  (uses first two DIVISION orgs)
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEMO_EARNINGS = {
  roundingScale: 2,
  eventTypes: {
    outreach_made: { type: 'fixed', amount: 25 },
    appointment_booked: { type: 'fixed', amount: 75 },
    conversion_won: { type: 'percent', percent: 1.5, baseField: 'amount' },
    invoice_posted: { type: 'tiered_percent', baseField: 'amount', tiers: [{ upTo: 10000, percent: 1 }, { upTo: null, percent: 2 }] },
  },
};

async function main() {
  let divisions = [];
  if (process.env.INCENTIVE_DIVISION_ID) {
    const one = await prisma.organization.findUnique({ where: { id: process.env.INCENTIVE_DIVISION_ID } });
    if (one) divisions = [one];
  } else {
    divisions = await prisma.organization.findMany({
      where: { type: 'DIVISION' },
      take: 2,
      orderBy: { name: 'asc' },
    });
  }

  if (divisions.length === 0) {
    console.error('No division organizations found. Set INCENTIVE_DIVISION_ID or seed multi-tenant data first.');
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  });
  const actorId = admin?.id || (await prisma.user.findFirst()).id;
  if (!actorId) {
    console.error('No user found to attribute createdBy.');
    process.exit(1);
  }

  for (const div of divisions) {
    const orgId = div.id;
    const existing = await prisma.incentivePlan.findFirst({
      where: { organizationId: orgId, divisionId: orgId, name: 'Demo Universal Plan' },
    });
    if (existing) {
      console.log(`Skip division ${div.name} — demo plan exists.`);
      continue;
    }

    const plan = await prisma.incentivePlan.create({
      data: {
        organizationId: orgId,
        divisionId: orgId,
        name: 'Demo Universal Plan',
        description: 'Seeded plan for sandbox / QA',
        status: 'ACTIVE',
        effectiveFrom: new Date('2020-01-01'),
        currency: 'USD',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const ruleSet = await prisma.incentiveRuleSet.create({
      data: {
        planId: plan.id,
        name: 'Default rules',
        status: 'ACTIVE',
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await prisma.incentiveRuleVersion.create({
      data: {
        ruleSetId: ruleSet.id,
        version: 1,
        status: 'PUBLISHED',
        effectiveFrom: new Date('2020-01-01'),
        attributionStrategy: 'last_valid_owner',
        attributionWindowDays: 365,
        earningsConfig: DEMO_EARNINGS,
        publishedAt: new Date(),
        publishedById: actorId,
        createdById: actorId,
        updatedById: actorId,
      },
    });

    console.log(`Created demo incentive plan for division: ${div.name} (${orgId})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
