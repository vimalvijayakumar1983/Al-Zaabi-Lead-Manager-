const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  // Skip if already seeded
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding database...');

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Al-Zaabi Real Estate',
      plan: 'PROFESSIONAL',
    },
  });

  // Create default pipeline stages
  const stages = await Promise.all([
    prisma.pipelineStage.create({ data: { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true, organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Contacted', order: 1, color: '#3b82f6', organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Qualified', order: 2, color: '#06b6d4', organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Proposal Sent', order: 3, color: '#f59e0b', organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Negotiation', order: 4, color: '#f97316', organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Won', order: 5, color: '#22c55e', isWonStage: true, organizationId: org.id } }),
    prisma.pipelineStage.create({ data: { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true, organizationId: org.id } }),
  ]);

  const passwordHash = await bcrypt.hash('password123', 12);

  // Create users
  const admin = await prisma.user.create({
    data: {
      email: 'admin@alzaabi.ae',
      passwordHash,
      firstName: 'Ahmed',
      lastName: 'Al-Zaabi',
      role: 'ADMIN',
      organizationId: org.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@alzaabi.ae',
      passwordHash,
      firstName: 'Sara',
      lastName: 'Hassan',
      role: 'MANAGER',
      organizationId: org.id,
    },
  });

  const rep1 = await prisma.user.create({
    data: {
      email: 'omar@alzaabi.ae',
      passwordHash,
      firstName: 'Omar',
      lastName: 'Khalid',
      role: 'SALES_REP',
      organizationId: org.id,
    },
  });

  const rep2 = await prisma.user.create({
    data: {
      email: 'fatima@alzaabi.ae',
      passwordHash,
      firstName: 'Fatima',
      lastName: 'Ali',
      role: 'SALES_REP',
      organizationId: org.id,
    },
  });

  // Create tags
  const tags = await Promise.all([
    prisma.tag.create({ data: { name: 'Hot', color: '#ef4444', organizationId: org.id } }),
    prisma.tag.create({ data: { name: 'VIP', color: '#f59e0b', organizationId: org.id } }),
    prisma.tag.create({ data: { name: 'Follow Up', color: '#3b82f6', organizationId: org.id } }),
    prisma.tag.create({ data: { name: 'Luxury', color: '#8b5cf6', organizationId: org.id } }),
  ]);

  // Create sample leads
  const sampleLeads = [
    { firstName: 'Mohammed', lastName: 'Rahman', email: 'mohammed@example.com', phone: '+971501234567', company: 'Gulf Investments', source: 'WEBSITE_FORM', status: 'QUALIFIED', budget: 500000, productInterest: '3BR Villa', location: 'Abu Dhabi', stageId: stages[2].id, assignedToId: rep1.id },
    { firstName: 'Aisha', lastName: 'Khan', email: 'aisha@example.com', phone: '+971502345678', company: 'Khan Trading', source: 'FACEBOOK_ADS', status: 'NEW', budget: 250000, productInterest: '2BR Apartment', location: 'Dubai', stageId: stages[0].id, assignedToId: rep2.id },
    { firstName: 'John', lastName: 'Smith', email: 'john@example.com', phone: '+971503456789', source: 'GOOGLE_ADS', status: 'PROPOSAL_SENT', budget: 1200000, productInterest: 'Penthouse', location: 'Abu Dhabi', stageId: stages[3].id, assignedToId: rep1.id },
    { firstName: 'Priya', lastName: 'Sharma', email: 'priya@example.com', phone: '+971504567890', company: 'Sharma Corp', source: 'REFERRAL', status: 'CONTACTED', budget: 350000, productInterest: 'Studio', location: 'Sharjah', stageId: stages[1].id, assignedToId: rep2.id },
    { firstName: 'Li', lastName: 'Wei', email: 'li.wei@example.com', phone: '+971505678901', company: 'Dragon Holdings', source: 'WHATSAPP', status: 'NEGOTIATION', budget: 2000000, productInterest: 'Commercial Space', location: 'Dubai', stageId: stages[4].id, assignedToId: manager.id },
    { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah@example.com', phone: '+971506789012', source: 'LANDING_PAGE', status: 'WON', budget: 800000, productInterest: 'Townhouse', location: 'Abu Dhabi', stageId: stages[5].id, assignedToId: rep1.id, wonAt: new Date() },
    { firstName: 'Hassan', lastName: 'Ali', email: 'hassan@example.com', phone: '+971507890123', source: 'MANUAL', status: 'LOST', budget: 150000, productInterest: '1BR Apartment', location: 'Ajman', stageId: stages[6].id, assignedToId: rep2.id, lostAt: new Date(), lostReason: 'Budget too low' },
  ];

  for (const leadData of sampleLeads) {
    const lead = await prisma.lead.create({
      data: {
        ...leadData,
        score: Math.floor(Math.random() * 60) + 30,
        conversionProb: Math.random() * 0.8 + 0.1,
        organizationId: org.id,
        createdById: admin.id,
      },
    });

    // Add tags to some leads
    if (leadData.budget >= 1000000) {
      await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tags[3].id } });
      await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tags[1].id } });
    }
    if (leadData.status === 'NEGOTIATION' || leadData.status === 'PROPOSAL_SENT') {
      await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tags[0].id } });
    }

    // Add activities
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: admin.id,
        type: 'STATUS_CHANGE',
        description: `Lead created with status ${leadData.status}`,
      },
    });
  }

  // Create campaigns
  await prisma.campaign.create({
    data: {
      name: 'Q1 Facebook Campaign',
      type: 'FACEBOOK_ADS',
      status: 'ACTIVE',
      budget: 50000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      organizationId: org.id,
    },
  });

  await prisma.campaign.create({
    data: {
      name: 'Google Search - Luxury',
      type: 'GOOGLE_ADS',
      status: 'ACTIVE',
      budget: 30000,
      startDate: new Date('2026-02-01'),
      organizationId: org.id,
    },
  });

  // Create automation rules
  await prisma.automationRule.create({
    data: {
      name: 'Welcome new leads',
      trigger: 'LEAD_CREATED',
      conditions: [],
      actions: [{ type: 'send_whatsapp', config: { message: 'Welcome! Thank you for your interest.' } }],
      organizationId: org.id,
    },
  });

  await prisma.automationRule.create({
    data: {
      name: 'Auto-assign Abu Dhabi Facebook leads',
      trigger: 'LEAD_CREATED',
      conditions: [
        { field: 'source', operator: 'equals', value: 'FACEBOOK_ADS' },
        { field: 'location', operator: 'contains', value: 'Abu Dhabi' },
      ],
      actions: [{ type: 'assign_lead', config: { userId: rep1.id } }],
      organizationId: org.id,
    },
  });

  console.log('Seed complete!');
  console.log('Admin login: admin@alzaabi.ae / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
