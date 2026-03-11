const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');

const router = Router();
router.use(authenticate, orgScope);

// ─── Dashboard Overview ──────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const orgId = req.orgId;

    const [
      totalLeads,
      newLeads,
      wonLeads,
      lostLeads,
      leadsByStatus,
      leadsBySource,
      recentLeads,
      upcomingTasks,
      pipelineValue,
    ] = await Promise.all([
      prisma.lead.count({ where: { organizationId: orgId, isArchived: false } }),
      prisma.lead.count({ where: { organizationId: orgId, status: 'NEW', isArchived: false } }),
      prisma.lead.count({ where: { organizationId: orgId, status: 'WON', isArchived: false } }),
      prisma.lead.count({ where: { organizationId: orgId, status: 'LOST', isArchived: false } }),

      prisma.lead.groupBy({
        by: ['status'],
        where: { organizationId: orgId, isArchived: false },
        _count: true,
      }),

      prisma.lead.groupBy({
        by: ['source'],
        where: { organizationId: orgId, isArchived: false },
        _count: true,
      }),

      prisma.lead.findMany({
        where: { organizationId: orgId, isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, firstName: true, lastName: true, email: true,
          source: true, status: true, score: true, createdAt: true,
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.task.findMany({
        where: {
          assignee: { organizationId: orgId },
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueAt: { gte: new Date() },
        },
        orderBy: { dueAt: 'asc' },
        take: 5,
        select: {
          id: true, title: true, type: true, priority: true, dueAt: true,
          lead: { select: { firstName: true, lastName: true } },
        },
      }),

      prisma.lead.aggregate({
        where: {
          organizationId: orgId,
          isArchived: false,
          status: { notIn: ['LOST'] },
          budget: { not: null },
        },
        _sum: { budget: true },
      }),
    ]);

    const conversionRate = totalLeads > 0
      ? Math.round((wonLeads / totalLeads) * 10000) / 100
      : 0;

    res.json({
      overview: {
        totalLeads,
        newLeads,
        wonLeads,
        lostLeads,
        conversionRate,
        pipelineValue: pipelineValue._sum.budget || 0,
      },
      leadsByStatus: leadsByStatus.map((s) => ({ status: s.status, count: s._count })),
      leadsBySource: leadsBySource.map((s) => ({ source: s.source, count: s._count })),
      recentLeads,
      upcomingTasks,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Conversion Funnel ───────────────────────────────────────────
router.get('/funnel', async (req, res, next) => {
  try {
    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: req.orgId },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { leads: true } },
      },
    });

    res.json(stages.map((s) => ({
      name: s.name,
      color: s.color,
      count: s._count.leads,
    })));
  } catch (err) {
    next(err);
  }
});

// ─── Salesperson Performance ─────────────────────────────────────
router.get('/team-performance', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { organizationId: req.orgId, isActive: true },
      select: {
        id: true, firstName: true, lastName: true, role: true,
        _count: { select: { assignedLeads: true } },
      },
    });

    const enriched = await Promise.all(
      users.map(async (u) => {
        const won = await prisma.lead.count({
          where: { assignedToId: u.id, status: 'WON' },
        });
        const total = u._count.assignedLeads;
        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          role: u.role,
          totalLeads: total,
          wonLeads: won,
          conversionRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ─── Lead Trends (last 30 days) ─────────────────────────────────
router.get('/trends', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const leads = await prisma.lead.findMany({
      where: {
        organizationId: req.orgId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true, status: true },
    });

    // Group by date
    const byDate = {};
    for (const lead of leads) {
      const date = lead.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { date, total: 0, won: 0, lost: 0 };
      byDate[date].total++;
      if (lead.status === 'WON') byDate[date].won++;
      if (lead.status === 'LOST') byDate[date].lost++;
    }

    res.json(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
