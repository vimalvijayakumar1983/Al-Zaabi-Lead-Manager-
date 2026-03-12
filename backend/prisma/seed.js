const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Default pipeline stages (same 7 stages as auth.js register)
const DEFAULT_PIPELINE_STAGES = [
  { name: 'New Lead', order: 0, color: '#6366f1', isDefault: true },
  { name: 'Contacted', order: 1, color: '#3b82f6' },
  { name: 'Qualified', order: 2, color: '#06b6d4' },
  { name: 'Proposal Sent', order: 3, color: '#f59e0b' },
  { name: 'Negotiation', order: 4, color: '#f97316' },
  { name: 'Won', order: 5, color: '#22c55e', isWonStage: true },
  { name: 'Lost', order: 6, color: '#ef4444', isLostStage: true },
];

async function createPipelineStages(orgId) {
  const stages = [];
  for (const stage of DEFAULT_PIPELINE_STAGES) {
    const created = await prisma.pipelineStage.create({
      data: { ...stage, organizationId: orgId },
    });
    stages.push(created);
  }
  return stages;
}

async function main() {
  // Skip if already seeded
  const existingOrg = await prisma.organization.findFirst();
  if (existingOrg) {
    console.log('Database already seeded, skipping.');
    return;
  }

  console.log('Seeding multi-tenant database...');

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const repPasswordHash = await bcrypt.hash('password123', 12);

  // ─── 1. Create Al-Zaabi Group (parent organization) ───────────
  const group = await prisma.organization.create({
    data: {
      name: 'Al-Zaabi Group',
      type: 'GROUP',
      plan: 'ENTERPRISE',
      primaryColor: '#6366f1',
      secondaryColor: '#1e293b',
    },
  });
  console.log('Created group: Al-Zaabi Group');

  // ─── 2. Create 3 divisions ────────────────────────────────────
  const divisionConfigs = [
    {
      name: 'Al-Zaabi Healthcare',
      tradeName: 'AZ Health',
      primaryColor: '#059669',
      secondaryColor: '#064e3b',
      adminEmail: 'admin.healthcare@alzaabi.ae',
      adminFirst: 'Mariam',
      adminLast: 'Al-Zaabi',
      reps: [
        { email: 'hc.rep1@alzaabi.ae', firstName: 'Yousuf', lastName: 'Hassan' },
        { email: 'hc.rep2@alzaabi.ae', firstName: 'Layla', lastName: 'Khalid' },
      ],
      leads: [
        { firstName: 'Khalid', lastName: 'Rahman', email: 'khalid.r@example.com', phone: '+971501001001', company: 'Gulf Medical', source: 'WEBSITE_FORM', status: 'QUALIFIED', budget: 250000, productInterest: 'Medical Equipment', location: 'Abu Dhabi' },
        { firstName: 'Noor', lastName: 'Abbas', email: 'noor.a@example.com', phone: '+971501001002', company: 'Wellness Center', source: 'REFERRAL', status: 'NEW', budget: 80000, productInterest: 'Clinic Setup', location: 'Dubai' },
        { firstName: 'Sana', lastName: 'Malik', email: 'sana.m@example.com', phone: '+971501001003', company: 'Pharma Plus', source: 'GOOGLE_ADS', status: 'PROPOSAL_SENT', budget: 500000, productInterest: 'Pharmacy Franchise', location: 'Sharjah' },
      ],
    },
    {
      name: 'Al-Zaabi Auto Care',
      tradeName: 'AZ Motors',
      primaryColor: '#dc2626',
      secondaryColor: '#450a0a',
      adminEmail: 'admin.autocare@alzaabi.ae',
      adminFirst: 'Rashid',
      adminLast: 'Al-Zaabi',
      reps: [
        { email: 'ac.rep1@alzaabi.ae', firstName: 'Omar', lastName: 'Saeed' },
        { email: 'ac.rep2@alzaabi.ae', firstName: 'Fatima', lastName: 'Ali' },
      ],
      leads: [
        { firstName: 'Ahmed', lastName: 'Qasim', email: 'ahmed.q@example.com', phone: '+971502001001', company: 'Fleet Masters', source: 'FACEBOOK_ADS', status: 'CONTACTED', budget: 150000, productInterest: 'Fleet Maintenance', location: 'Abu Dhabi' },
        { firstName: 'John', lastName: 'Peters', email: 'john.p@example.com', phone: '+971502001002', source: 'MANUAL', status: 'NEGOTIATION', budget: 75000, productInterest: 'Car Detailing', location: 'Dubai' },
        { firstName: 'Priya', lastName: 'Sharma', email: 'priya.s@example.com', phone: '+971502001003', company: 'Rent-A-Car LLC', source: 'GOOGLE_ADS', status: 'WON', budget: 300000, productInterest: 'Service Contract', location: 'Abu Dhabi', wonAt: new Date() },
      ],
    },
    {
      name: 'Al-Zaabi Trading',
      tradeName: 'AZ Trade',
      primaryColor: '#2563eb',
      secondaryColor: '#1e3a5f',
      adminEmail: 'admin.trading@alzaabi.ae',
      adminFirst: 'Sultan',
      adminLast: 'Al-Zaabi',
      reps: [
        { email: 'tr.rep1@alzaabi.ae', firstName: 'Hassan', lastName: 'Jaber' },
        { email: 'tr.rep2@alzaabi.ae', firstName: 'Amina', lastName: 'Yousef' },
      ],
      leads: [
        { firstName: 'Li', lastName: 'Wei', email: 'li.w@example.com', phone: '+971503001001', company: 'Dragon Imports', source: 'WHATSAPP', status: 'QUALIFIED', budget: 1200000, productInterest: 'Bulk Electronics', location: 'Dubai' },
        { firstName: 'Tariq', lastName: 'Mansour', email: 'tariq.m@example.com', phone: '+971503001002', company: 'Mansour & Sons', source: 'REFERRAL', status: 'NEW', budget: 600000, productInterest: 'Construction Materials', location: 'Abu Dhabi' },
        { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.j@example.com', phone: '+971503001003', source: 'LANDING_PAGE', status: 'LOST', budget: 90000, productInterest: 'Office Supplies', location: 'Sharjah', lostAt: new Date(), lostReason: 'Went with competitor' },
      ],
    },
  ];

  // ─── 3. Create SUPER_ADMIN user (belongs to the Group org) ────
  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@alzaabi.ae',
      passwordHash,
      firstName: 'Abdullah',
      lastName: 'Al-Zaabi',
      role: 'SUPER_ADMIN',
      organizationId: group.id,
    },
  });
  console.log('Created SUPER_ADMIN: superadmin@alzaabi.ae');

  // ─── 4. Seed each division ────────────────────────────────────
  for (const divConfig of divisionConfigs) {
    // Create division organization
    const division = await prisma.organization.create({
      data: {
        name: divConfig.name,
        tradeName: divConfig.tradeName,
        type: 'DIVISION',
        parentId: group.id,
        primaryColor: divConfig.primaryColor,
        secondaryColor: divConfig.secondaryColor,
        plan: 'PROFESSIONAL',
      },
    });
    console.log(`Created division: ${divConfig.name}`);

    // Create pipeline stages for the division
    const stages = await createPipelineStages(division.id);

    // Create ADMIN user for this division
    const admin = await prisma.user.create({
      data: {
        email: divConfig.adminEmail,
        passwordHash,
        firstName: divConfig.adminFirst,
        lastName: divConfig.adminLast,
        role: 'ADMIN',
        organizationId: division.id,
      },
    });
    console.log(`  Created ADMIN: ${divConfig.adminEmail}`);

    // Create SALES_REP users for this division
    const reps = [];
    for (const repConfig of divConfig.reps) {
      const rep = await prisma.user.create({
        data: {
          email: repConfig.email,
          passwordHash: repPasswordHash,
          firstName: repConfig.firstName,
          lastName: repConfig.lastName,
          role: 'SALES_REP',
          organizationId: division.id,
        },
      });
      reps.push(rep);
      console.log(`  Created SALES_REP: ${repConfig.email}`);
    }

    // Create tags for this division
    const tags = await Promise.all([
      prisma.tag.create({ data: { name: 'Hot', color: '#ef4444', organizationId: division.id } }),
      prisma.tag.create({ data: { name: 'VIP', color: '#f59e0b', organizationId: division.id } }),
      prisma.tag.create({ data: { name: 'Follow Up', color: '#3b82f6', organizationId: division.id } }),
    ]);

    // Map lead status to pipeline stage index
    const statusToStageIndex = {
      NEW: 0,
      CONTACTED: 1,
      QUALIFIED: 2,
      PROPOSAL_SENT: 3,
      NEGOTIATION: 4,
      WON: 5,
      LOST: 6,
    };

    // Create sample leads for this division
    for (let i = 0; i < divConfig.leads.length; i++) {
      const leadData = divConfig.leads[i];
      const stageIdx = statusToStageIndex[leadData.status] || 0;
      const assignedRep = reps[i % reps.length];

      const lead = await prisma.lead.create({
        data: {
          firstName: leadData.firstName,
          lastName: leadData.lastName,
          email: leadData.email,
          phone: leadData.phone,
          company: leadData.company || null,
          source: leadData.source,
          status: leadData.status,
          budget: leadData.budget,
          productInterest: leadData.productInterest,
          location: leadData.location,
          stageId: stages[stageIdx].id,
          assignedToId: assignedRep.id,
          createdById: admin.id,
          organizationId: division.id,
          score: Math.floor(Math.random() * 60) + 30,
          conversionProb: Math.random() * 0.8 + 0.1,
          wonAt: leadData.wonAt || null,
          lostAt: leadData.lostAt || null,
          lostReason: leadData.lostReason || null,
        },
      });

      // Tag high-budget leads
      if (leadData.budget >= 500000) {
        await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tags[1].id } }); // VIP
      }
      if (leadData.status === 'NEGOTIATION' || leadData.status === 'PROPOSAL_SENT') {
        await prisma.leadTag.create({ data: { leadId: lead.id, tagId: tags[0].id } }); // Hot
      }

      // Add activity
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: admin.id,
          type: 'STATUS_CHANGE',
          description: `Lead created with status ${leadData.status}`,
        },
      });
    }

    // Create a campaign per division
    await prisma.campaign.create({
      data: {
        name: `${divConfig.tradeName} Q1 Campaign`,
        type: 'FACEBOOK_ADS',
        status: 'ACTIVE',
        budget: 25000,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
        organizationId: division.id,
      },
    });
  }

  console.log('\n─── Seed complete! ───');
  console.log('Super Admin login: superadmin@alzaabi.ae / Admin123!');
  console.log('Division Admin logins (all use Admin123!):');
  console.log('  Healthcare: admin.healthcare@alzaabi.ae');
  console.log('  Auto Care:  admin.autocare@alzaabi.ae');
  console.log('  Trading:    admin.trading@alzaabi.ae');
  console.log('Sales Rep password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
