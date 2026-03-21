const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');

const router = Router();
router.use(authenticate, orgScope);

// ─── Helpers ─────────────────────────────────────────────────────

// ─── Display name helper (deduplication) ─────────────────────────
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown';
  if (!ln) return fn;
  if (!fn) return ln;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

function getOrgFilter(req, divisionId) {
  if (divisionId && req.isSuperAdmin) return divisionId;
  return { in: req.orgIds };
}

/**
 * Build base where clause for leads, scoped by role.
 * SALES_REP/VIEWER only see leads assigned to them.
 */
function getLeadWhere(req, divisionId, extra = {}) {
  const where = { organizationId: getOrgFilter(req, divisionId), isArchived: false, ...extra };
  if (req.isRestrictedRole) where.assignedToId = req.user.id;
  return where;
}

/**
 * Build base where clause for tasks, scoped by role.
 */
function getTaskWhere(req, divisionId, extra = {}) {
  const where = { ...extra };
  if (req.isRestrictedRole) {
    where.assigneeId = req.user.id;
  } else {
    where.assignee = { organizationId: getOrgFilter(req, divisionId) };
  }
  return where;
}

function getPeriodDates(period = '30d') {
  const now = new Date();
  const days = { '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365 }[period] || 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  return { now, start, prevStart, prevEnd: new Date(start), days };
}

function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

const NOT_INTERESTED_REASON_LABELS = {
  HIGH_PRICE: 'Price too high',
  BUDGET_NOT_AVAILABLE: 'Budget not available',
  INSURANCE_NOT_COVERED: 'Insurance/finance not covered',
  NOT_INTERESTED_IN_SERVICE: 'Not interested in service',
  SERVICE_MISMATCH: 'Service does not match need',
  BAD_TIMING: 'Timing not right',
  CHOSE_COMPETITOR: 'Chose competitor',
  NO_LONGER_NEEDED: 'No longer required',
  NOT_DECISION_MAKER: 'Not decision maker',
  OTHER: 'Other',
  UNSPECIFIED: 'Unspecified',
};
const COMPLETED_SERVICE_LOCATION_LABELS = {
  INSIDE_CENTER: 'Inside Center',
  OUTSIDE_CENTER: 'Outside Center',
  UNSPECIFIED: 'Unspecified',
};

// ─── Dashboard Overview ──────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);

    const leadWhere = getLeadWhere(req, divisionId);
    const taskWhere = getTaskWhere(req, divisionId, { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { gte: new Date() } });

    const [
      totalLeads, newLeads, qualifiedLeads, wonLeads, lostLeads,
      leadsByStatus, leadsBySource, recentLeads, upcomingTasks, pipelineValue,
    ] = await Promise.all([
      prisma.lead.count({ where: leadWhere }),
      prisma.lead.count({ where: { ...leadWhere, status: 'NEW' } }),
      prisma.lead.count({ where: { ...leadWhere, status: 'QUALIFIED' } }),
      prisma.lead.count({ where: { ...leadWhere, status: 'WON' } }),
      prisma.lead.count({ where: { ...leadWhere, status: 'LOST' } }),
      prisma.lead.groupBy({ by: ['status'], where: leadWhere, _count: { status: true } }),
      prisma.lead.groupBy({ by: ['source'], where: leadWhere, _count: { source: true } }),
      prisma.lead.findMany({
        where: leadWhere,
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, firstName: true, lastName: true, email: true, source: true, status: true, score: true, createdAt: true, assignedTo: { select: { firstName: true, lastName: true } } },
      }),
      prisma.task.findMany({
        where: taskWhere,
        orderBy: { dueAt: 'asc' }, take: 5,
        select: { id: true, title: true, type: true, priority: true, dueAt: true, lead: { select: { firstName: true, lastName: true } } },
      }),
      prisma.lead.aggregate({
        where: { ...leadWhere, status: { notIn: ['LOST'] }, budget: { not: null } },
        _sum: { budget: true },
      }),
    ]);

    const conversionRate = totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 10000) / 100 : 0;
    res.json({
      overview: { totalLeads, newLeads, qualifiedLeads, wonLeads, lostLeads, conversionRate, pipelineValue: pipelineValue._sum.budget || 0 },
      leadsByStatus: leadsByStatus.map(s => ({ status: s.status, count: s._count.status || s._count._all || s._count })),
      leadsBySource: leadsBySource.map(s => ({ source: s.source, count: s._count.source || s._count._all || s._count })),
      recentLeads,
      upcomingTasks,
    });
  } catch (err) { next(err); }
});

// ─── Overview with Period Comparison ─────────────────────────────
router.get('/overview', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start, prevStart, prevEnd } = getPeriodDates(period);
    const now = new Date();

    const lw = getLeadWhere(req, divisionId);
    const actWhere = req.isRestrictedRole ? { lead: { assignedToId: req.user.id } } : { lead: { organizationId: orgFilter } };
    const tw = getTaskWhere(req, divisionId, { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } });

    const [
      curNew, prevNew,
      curWon, prevWon,
      curLost, prevLost,
      totalLeads, totalWon,
      curPipeAgg, prevPipeAgg,
      wonRevenueAgg,
      curActivities, prevActivities,
      overdueTasks,
    ] = await Promise.all([
      prisma.lead.count({ where: { ...lw, createdAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: lw }),
      prisma.lead.count({ where: { ...lw, status: 'WON' } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null } }, _sum: { budget: true } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null }, createdAt: { gte: prevStart, lt: prevEnd } }, _sum: { budget: true } }),
      prisma.lead.aggregate({ where: { ...lw, status: 'WON', budget: { not: null } }, _sum: { budget: true }, _avg: { budget: true }, _count: true }),
      prisma.leadActivity.count({ where: { ...actWhere, createdAt: { gte: start } } }),
      prisma.leadActivity.count({ where: { ...actWhere, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.task.count({ where: tw }),
    ]);

    const curConvRate = curNew > 0 ? Math.round((curWon / curNew) * 10000) / 100 : 0;
    const prevConvRate = prevNew > 0 ? Math.round((prevWon / prevNew) * 10000) / 100 : 0;
    const curPipe = Number(curPipeAgg._sum.budget || 0);
    const prevPipe = Number(prevPipeAgg._sum.budget || 0);
    const wonRevenue = Number(wonRevenueAgg._sum.budget || 0);
    const avgDealSize = wonRevenueAgg._count > 0 ? Math.round(wonRevenue / wonRevenueAgg._count) : 0;

    res.json({
      newLeads: { value: curNew, change: pctChange(curNew, prevNew) },
      wonLeads: { value: curWon, change: pctChange(curWon, prevWon) },
      lostLeads: { value: curLost, change: pctChange(curLost, prevLost) },
      totalLeads: { value: totalLeads },
      pipelineValue: { value: curPipe, change: pctChange(curPipe, prevPipe) },
      conversionRate: { value: curConvRate, change: pctChange(curConvRate, prevConvRate) },
      wonRevenue: { value: wonRevenue },
      avgDealSize: { value: avgDealSize },
      totalWon: { value: totalWon },
      activities: { value: curActivities, change: pctChange(curActivities, prevActivities) },
      overdueTasks: { value: overdueTasks },
    });
  } catch (err) { next(err); }
});

// ─── Conversion Funnel (enhanced with values & conversion rates) ──
router.get('/funnel', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);

    const leadFilter = { isArchived: false };
    if (req.isRestrictedRole) leadFilter.assignedToId = req.user.id;

    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId: orgFilter },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { leads: { where: leadFilter } } },
        leads: { select: { budget: true }, where: { ...leadFilter, budget: { not: null } } },
      },
    });

    // Aggregate stages by name across orgs (Super Admin sees multiple divisions)
    const aggregated = new Map();
    for (const s of stages) {
      const key = s.name;
      if (aggregated.has(key)) {
        const existing = aggregated.get(key);
        existing.count += s._count.leads;
        existing.value += s.leads.reduce((sum, l) => sum + Number(l.budget || 0), 0);
        existing.stageIds.push(s.id);
        if (s.order < existing.order) { existing.order = s.order; existing.color = s.color; }
      } else {
        aggregated.set(key, {
          name: s.name,
          color: s.color,
          order: s.order,
          count: s._count.leads,
          value: s.leads.reduce((sum, l) => sum + Number(l.budget || 0), 0),
          stageIds: [s.id],
          conversionFromPrev: 100,
        });
      }
    }

    const result = Array.from(aggregated.values()).sort((a, b) => a.order - b.order);

    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1].count;
      result[i].conversionFromPrev = prev > 0 ? Math.round((result[i].count / prev) * 100) : 0;
    }

    res.json(result);
  } catch (err) { next(err); }
});

// ─── Salesperson Performance (enhanced) ──────────────────────────
router.get('/team-performance', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);

    const userWhere = { organizationId: orgFilter, isActive: true };
    if (req.isRestrictedRole) userWhere.id = req.user.id;

    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, firstName: true, lastName: true, role: true, _count: { select: { assignedLeads: true } } },
    });

    const now = new Date();
    const enriched = await Promise.all(users.map(async u => {
      const [won, lost, active, revenueAgg, completedTasks, pendingTasks, overdueTasks] = await Promise.all([
        prisma.lead.count({ where: { assignedToId: u.id, status: 'WON' } }),
        prisma.lead.count({ where: { assignedToId: u.id, status: 'LOST' } }),
        prisma.lead.count({ where: { assignedToId: u.id, status: { notIn: ['WON', 'LOST'] }, isArchived: false } }),
        prisma.lead.aggregate({ where: { assignedToId: u.id, status: 'WON', budget: { not: null } }, _sum: { budget: true } }),
        prisma.task.count({ where: { assigneeId: u.id, status: 'COMPLETED' } }),
        prisma.task.count({ where: { assigneeId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] } } }),
        prisma.task.count({ where: { assigneeId: u.id, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } } }),
      ]);

      const total = u._count.assignedLeads;
      const wonRevenue = Number(revenueAgg._sum.budget || 0);
      return {
        id: u.id,
        name: getDisplayName(u),
        role: u.role,
        totalLeads: total,
        wonLeads: won,
        lostLeads: lost,
        activeLeads: active,
        conversionRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
        wonRevenue,
        avgDealSize: won > 0 ? Math.round(wonRevenue / won) : 0,
        completedTasks,
        pendingTasks,
        overdueTasks,
        taskCompletionRate: (completedTasks + pendingTasks) > 0
          ? Math.round((completedTasks / (completedTasks + pendingTasks)) * 100)
          : 0,
      };
    }));

    enriched.sort((a, b) => b.wonRevenue - a.wonRevenue || b.conversionRate - a.conversionRate);
    res.json(enriched);
  } catch (err) { next(err); }
});

// ─── Lead Trends (with period support) ───────────────────────────
router.get('/trends', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start } = getPeriodDates(period);

    const trendsWhere = getLeadWhere(req, divisionId, { createdAt: { gte: start } });
    delete trendsWhere.isArchived; // include all for trend analysis

    const leads = await prisma.lead.findMany({
      where: trendsWhere,
      select: { createdAt: true, status: true, budget: true },
    });

    const byDate = {};
    for (const lead of leads) {
      const date = lead.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { date, total: 0, won: 0, lost: 0, value: 0 };
      byDate[date].total++;
      if (lead.status === 'WON') {
        byDate[date].won++;
        byDate[date].value += Number(lead.budget || 0);
      }
      if (lead.status === 'LOST') byDate[date].lost++;
    }

    res.json(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)));
  } catch (err) { next(err); }
});

// ─── Source Performance ───────────────────────────────────────────
router.get('/source-performance', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start } = getPeriodDates(period);

    const srcWhere = getLeadWhere(req, divisionId);

    const sources = await prisma.lead.groupBy({
      by: ['source'],
      where: srcWhere,
      _count: true,
    });

    const enriched = await Promise.all(sources.map(async s => {
      const [won, lost, revenueAgg, recentCount] = await Promise.all([
        prisma.lead.count({ where: { ...srcWhere, source: s.source, status: 'WON' } }),
        prisma.lead.count({ where: { ...srcWhere, source: s.source, status: 'LOST' } }),
        prisma.lead.aggregate({
          where: { ...srcWhere, source: s.source, status: 'WON', budget: { not: null } },
          _sum: { budget: true }, _avg: { budget: true },
        }),
        prisma.lead.count({ where: { ...srcWhere, source: s.source, createdAt: { gte: start } } }),
      ]);

      const total = s._count;
      const wonRevenue = Number(revenueAgg._sum.budget || 0);
      return {
        source: s.source,
        total,
        won,
        lost,
        inProgress: total - won - lost,
        conversionRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
        wonRevenue,
        avgDealSize: Math.round(Number(revenueAgg._avg.budget || 0)),
        recentCount,
      };
    }));

    enriched.sort((a, b) => b.total - a.total);
    res.json(enriched);
  } catch (err) { next(err); }
});

// ─── Campaign Performance ─────────────────────────────────────────
router.get('/campaign-performance', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);

    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: orgFilter },
      select: { id: true, name: true, type: true, status: true, budget: true, startDate: true, endDate: true },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(campaigns.map(async c => {
      const campLeadWhere = getLeadWhere(req, divisionId, { campaign: c.name });
      delete campLeadWhere.isArchived; // count all campaign leads

      const [leadsCount, wonLeads, revenueAgg] = await Promise.all([
        prisma.lead.count({ where: campLeadWhere }),
        prisma.lead.count({ where: { ...campLeadWhere, status: 'WON' } }),
        prisma.lead.aggregate({
          where: { ...campLeadWhere, status: 'WON', budget: { not: null } },
          _sum: { budget: true },
        }),
      ]);

      const spend = Number(c.budget || 0);
      const revenue = Number(revenueAgg._sum.budget || 0);
      const cpl = leadsCount > 0 && spend > 0 ? Math.round((spend / leadsCount) * 100) / 100 : 0;
      const roi = spend > 0 ? Math.round(((revenue - spend) / spend) * 100) : 0;

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        budget: spend,
        leadsCount,
        wonLeads,
        conversionRate: leadsCount > 0 ? Math.round((wonLeads / leadsCount) * 10000) / 100 : 0,
        wonRevenue: revenue,
        cpl,
        roi,
        startDate: c.startDate,
        endDate: c.endDate,
      };
    }));

    res.json(enriched);
  } catch (err) { next(err); }
});

// ─── Activity Analytics ───────────────────────────────────────────
router.get('/activities', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start } = getPeriodDates(period);

    const actLeadWhere = req.isRestrictedRole ? { lead: { assignedToId: req.user.id } } : { lead: { organizationId: orgFilter } };
    const actTaskWhere = req.isRestrictedRole ? { assigneeId: req.user.id } : { assignee: { organizationId: orgFilter } };
    const commWhere = req.isRestrictedRole ? { lead: { assignedToId: req.user.id } } : { lead: { organizationId: orgFilter } };

    const [byType, allActivities, taskStats, communicationStats] = await Promise.all([
      prisma.leadActivity.groupBy({
        by: ['type'],
        where: { ...actLeadWhere, createdAt: { gte: start } },
        _count: true,
        orderBy: { _count: { type: 'desc' } },
      }),
      prisma.leadActivity.findMany({
        where: { ...actLeadWhere, createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: actTaskWhere,
        _count: true,
      }),
      prisma.communication.groupBy({
        by: ['channel'],
        where: { ...commWhere, createdAt: { gte: start } },
        _count: true,
      }),
    ]);

    // Activity heatmap by date
    const heatmap = {};
    for (const a of allActivities) {
      const date = a.createdAt.toISOString().split('T')[0];
      heatmap[date] = (heatmap[date] || 0) + 1;
    }

    res.json({
      byType: byType.map(t => ({ type: t.type, count: t._count })),
      heatmap: Object.entries(heatmap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      taskStats: taskStats.map(t => ({ status: t.status, count: t._count })),
      communicationStats: communicationStats.map(c => ({ channel: c.channel, count: c._count })),
      totalActivities: allActivities.length,
    });
  } catch (err) { next(err); }
});

// ─── Not Interested Reason Analytics ──────────────────────────────
router.get('/not-interested-reasons', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start } = getPeriodDates(period);

    const callWhere = req.isRestrictedRole
      ? {
          createdAt: { gte: start },
          disposition: 'NOT_INTERESTED',
          lead: { assignedToId: req.user.id, isArchived: false },
        }
      : {
          createdAt: { gte: start },
          disposition: 'NOT_INTERESTED',
          lead: { organizationId: orgFilter, isArchived: false },
        };

    const callLogs = await prisma.callLog.findMany({
      where: callWhere,
      select: {
        metadata: true,
        lead: { select: { source: true } },
      },
    });

    const reasonCounts = {};
    const sourceCounts = {};
    let captured = 0;

    for (const log of callLogs) {
      const md = (typeof log.metadata === 'object' && log.metadata !== null) ? log.metadata : {};
      const reasonKey = md.notInterestedReason;
      const normalizedReason = NOT_INTERESTED_REASON_LABELS[reasonKey] ? reasonKey : 'UNSPECIFIED';
      reasonCounts[normalizedReason] = (reasonCounts[normalizedReason] || 0) + 1;
      if (normalizedReason !== 'UNSPECIFIED') captured++;

      const source = log.lead?.source || 'UNKNOWN';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }

    const totalNotInterested = callLogs.length;
    const reasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({
        reason,
        label: NOT_INTERESTED_REASON_LABELS[reason] || reason,
        count,
        percent: totalNotInterested > 0 ? Math.round((count / totalNotInterested) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const bySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalNotInterested,
      captureRate: totalNotInterested > 0 ? Math.round((captured / totalNotInterested) * 10000) / 100 : 0,
      reasons,
      bySource,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Already Completed Services Location Analytics ─────────────────
router.get('/completed-services-locations', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start } = getPeriodDates(period);

    const callWhere = req.isRestrictedRole
      ? {
          createdAt: { gte: start },
          disposition: 'ALREADY_COMPLETED_SERVICES',
          lead: { assignedToId: req.user.id, isArchived: false },
        }
      : {
          createdAt: { gte: start },
          disposition: 'ALREADY_COMPLETED_SERVICES',
          lead: { organizationId: orgFilter, isArchived: false },
        };

    const callLogs = await prisma.callLog.findMany({
      where: callWhere,
      select: {
        metadata: true,
        lead: { select: { source: true } },
      },
    });

    const locationCounts = {};
    const sourceCounts = {};
    let captured = 0;

    for (const log of callLogs) {
      const md = (typeof log.metadata === 'object' && log.metadata !== null) ? log.metadata : {};
      const locationKey = md.completedServiceLocation;
      const normalizedLocation = COMPLETED_SERVICE_LOCATION_LABELS[locationKey] ? locationKey : 'UNSPECIFIED';
      locationCounts[normalizedLocation] = (locationCounts[normalizedLocation] || 0) + 1;
      if (normalizedLocation !== 'UNSPECIFIED') captured++;

      const source = log.lead?.source || 'UNKNOWN';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }

    const totalCompletedServices = callLogs.length;
    const locations = Object.entries(locationCounts)
      .map(([location, count]) => ({
        location,
        label: COMPLETED_SERVICE_LOCATION_LABELS[location] || location,
        count,
        percent: totalCompletedServices > 0 ? Math.round((count / totalCompletedServices) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const bySource = Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalCompletedServices,
      captureRate: totalCompletedServices > 0 ? Math.round((captured / totalCompletedServices) * 10000) / 100 : 0,
      locations,
      bySource,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Lead Score Distribution ──────────────────────────────────────
router.get('/score-distribution', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);

    const scoreWhere = getLeadWhere(req, divisionId);

    const leads = await prisma.lead.findMany({
      where: scoreWhere,
      select: { score: true, status: true },
    });

    const buckets = [
      { label: '0–20', min: 0, max: 20, total: 0, won: 0 },
      { label: '21–40', min: 21, max: 40, total: 0, won: 0 },
      { label: '41–60', min: 41, max: 60, total: 0, won: 0 },
      { label: '61–80', min: 61, max: 80, total: 0, won: 0 },
      { label: '81–100', min: 81, max: 100, total: 0, won: 0 },
    ];

    for (const l of leads) {
      const b = buckets.find(b => l.score >= b.min && l.score <= b.max);
      if (b) { b.total++; if (l.status === 'WON') b.won++; }
    }

    res.json(buckets.map(b => ({
      label: b.label,
      total: b.total,
      won: b.won,
      conversionRate: b.total > 0 ? Math.round((b.won / b.total) * 100) : 0,
    })));
  } catch (err) { next(err); }
});

// ─── Consolidated Dashboard (world-class) ────────────────────────
router.get('/dashboard-full', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const { start, prevStart, prevEnd, days } = getPeriodDates(period);
    const now = new Date();

    const lw = getLeadWhere(req, divisionId);
    const actWhere = req.isRestrictedRole ? { lead: { assignedToId: req.user.id } } : { lead: { organizationId: orgFilter } };

    // ── Parallel fetch everything ──
    const [
      // KPI counts
      totalLeads, curNew, prevNew, curWon, prevWon, curLost, prevLost,
      curPipeAgg, prevPipeAgg, wonRevenueAgg,
      // Breakdowns
      leadsByStatus, leadsBySource,
      // Recent + tasks
      recentLeads, upcomingTasks, overdueTasks,
      // Trends
      trendLeads,
      // Activities
      curActivities, prevActivities,
      recentActivities,
      // Pipeline stages
      stages,
      // Score distribution
      scoreLeads,
      // SLA stats
      slaAtRisk, slaBreached,
    ] = await Promise.all([
      prisma.lead.count({ where: lw }),
      prisma.lead.count({ where: { ...lw, createdAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: { gte: start } } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null } }, _sum: { budget: true } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null }, createdAt: { gte: prevStart, lt: prevEnd } }, _sum: { budget: true } }),
      prisma.lead.aggregate({ where: { ...lw, status: 'WON', budget: { not: null } }, _sum: { budget: true }, _avg: { budget: true }, _count: true }),

      prisma.lead.groupBy({ by: ['status'], where: lw, _count: { status: true } }),
      prisma.lead.groupBy({ by: ['source'], where: lw, _count: { source: true } }),

      prisma.lead.findMany({
        where: lw, orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, firstName: true, lastName: true, email: true, company: true, source: true, status: true, score: true, budget: true, createdAt: true, assignedTo: { select: { firstName: true, lastName: true, avatar: true } } },
      }),
      prisma.task.findMany({
        where: getTaskWhere(req, divisionId, { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { gte: now } }),
        orderBy: { dueAt: 'asc' }, take: 6,
        select: { id: true, title: true, type: true, priority: true, status: true, dueAt: true, lead: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.task.count({ where: getTaskWhere(req, divisionId, { status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } }) }),

      prisma.lead.findMany({
        where: { ...lw, createdAt: { gte: start } },
        select: { createdAt: true, status: true, budget: true },
      }),

      prisma.leadActivity.count({ where: { ...actWhere, createdAt: { gte: start } } }),
      prisma.leadActivity.count({ where: { ...actWhere, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.leadActivity.findMany({
        where: { ...actWhere, createdAt: { gte: start } },
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, type: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } }, lead: { select: { id: true, firstName: true, lastName: true } } },
      }),

      prisma.pipelineStage.findMany({
        where: { organizationId: orgFilter },
        orderBy: { order: 'asc' },
        include: {
          _count: { select: { leads: { where: { isArchived: false } } } },
          leads: { select: { budget: true }, where: { isArchived: false, budget: { not: null } } },
        },
      }),

      prisma.lead.findMany({
        where: lw,
        select: { score: true, status: true },
      }),

      prisma.lead.count({ where: { ...lw, slaStatus: 'AT_RISK' } }).catch(() => 0),
      prisma.lead.count({ where: { ...lw, slaStatus: 'BREACHED' } }).catch(() => 0),
    ]);

    // ── Reachability Ratio (call logs) ──
    const callLogOrgWhere = req.isRestrictedRole
      ? { userId: req.user.id }
      : { lead: { organizationId: orgFilter, isArchived: false } };
    const periodCallWhere = { ...callLogOrgWhere, createdAt: { gte: start } };

    const NOT_REACHED_DISPOSITIONS = ['NO_ANSWER', 'BUSY', 'VOICEMAIL_LEFT', 'WRONG_NUMBER', 'GATEKEEPER'];

    const [totalCalls, notReachedCalls] = await Promise.all([
      prisma.callLog.count({ where: periodCallWhere }),
      prisma.callLog.count({ where: { ...periodCallWhere, disposition: { in: NOT_REACHED_DISPOSITIONS } } }),
    ]);

    const reachedCalls = totalCalls - notReachedCalls;
    const reachabilityRatio = totalCalls > 0 ? Math.round((reachedCalls / totalCalls) * 10000) / 100 : 0;

    // ── Fetch team users separately (avoids spread/destructuring issues) ──
    let teamUsers = [];
    if (!req.isRestrictedRole) {
      teamUsers = await prisma.user.findMany({
        where: { organizationId: orgFilter, isActive: true },
        select: { id: true, firstName: true, lastName: true, avatar: true, role: true, _count: { select: { assignedLeads: true } } },
      });
    }

    // ── Process KPIs ──
    const curPipe = Number(curPipeAgg._sum.budget || 0);
    const prevPipe = Number(prevPipeAgg._sum.budget || 0);
    const wonRevenue = Number(wonRevenueAgg._sum.budget || 0);
    const avgDealSize = wonRevenueAgg._count > 0 ? Math.round(wonRevenue / wonRevenueAgg._count) : 0;

    // ── Process trends ──
    const trendMap = {};
    for (const lead of trendLeads) {
      const date = lead.createdAt.toISOString().split('T')[0];
      if (!trendMap[date]) trendMap[date] = { date, total: 0, won: 0, lost: 0, value: 0 };
      trendMap[date].total++;
      if (lead.status === 'WON') { trendMap[date].won++; trendMap[date].value += Number(lead.budget || 0); }
      if (lead.status === 'LOST') trendMap[date].lost++;
    }
    const trends = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    // ── Process funnel (aggregate by name to avoid duplicates across divisions) ──
    const funnelMap = new Map();
    for (const s of stages) {
      const key = s.name;
      if (funnelMap.has(key)) {
        const existing = funnelMap.get(key);
        existing.count += s._count.leads;
        existing.value += s.leads.reduce((sum, l) => sum + Number(l.budget || 0), 0);
        if (s.order < existing.order) { existing.order = s.order; existing.color = s.color; }
      } else {
        funnelMap.set(key, {
          name: s.name, color: s.color, order: s.order,
          count: s._count.leads,
          value: s.leads.reduce((sum, l) => sum + Number(l.budget || 0), 0),
          isWonStage: s.isWonStage, isLostStage: s.isLostStage,
        });
      }
    }
    const funnel = Array.from(funnelMap.values()).sort((a, b) => a.order - b.order);
    for (let i = 1; i < funnel.length; i++) {
      funnel[i].conversionFromPrev = funnel[i - 1].count > 0 ? Math.round((funnel[i].count / funnel[i - 1].count) * 100) : 0;
    }
    if (funnel.length > 0) funnel[0].conversionFromPrev = 100;

    // ── Process score distribution ──
    const scoreBuckets = [
      { label: '0-20', min: 0, max: 20, total: 0, won: 0 },
      { label: '21-40', min: 21, max: 40, total: 0, won: 0 },
      { label: '41-60', min: 41, max: 60, total: 0, won: 0 },
      { label: '61-80', min: 61, max: 80, total: 0, won: 0 },
      { label: '81-100', min: 81, max: 100, total: 0, won: 0 },
    ];
    for (const l of scoreLeads) {
      const b = scoreBuckets.find(b => l.score >= b.min && l.score <= b.max);
      if (b) { b.total++; if (l.status === 'WON') b.won++; }
    }

    // ── Process team leaderboard ──
    let teamLeaderboard = [];
    if (!req.isRestrictedRole && teamUsers.length > 0) {
      const enriched = await Promise.all(teamUsers.slice(0, 10).map(async u => {
        const [won, revenue] = await Promise.all([
          prisma.lead.count({ where: { assignedToId: u.id, status: 'WON' } }),
          prisma.lead.aggregate({ where: { assignedToId: u.id, status: 'WON', budget: { not: null } }, _sum: { budget: true } }),
        ]);
        return {
          id: u.id, name: getDisplayName(u), avatar: u.avatar, role: u.role,
          totalLeads: u._count.assignedLeads, wonLeads: won,
          wonRevenue: Number(revenue._sum.budget || 0),
          conversionRate: u._count.assignedLeads > 0 ? Math.round((won / u._count.assignedLeads) * 10000) / 100 : 0,
        };
      }));
      teamLeaderboard = enriched.sort((a, b) => b.wonRevenue - a.wonRevenue || b.conversionRate - a.conversionRate).slice(0, 5);
    }

    // ── Division breakdown for SUPER_ADMIN ──
    let divisionBreakdown = [];
    if (req.isSuperAdmin && !divisionId) {
      const orgIds = req.orgIds;
      if (orgIds && orgIds.length > 0) {
        const divisions = await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, tradeName: true },
        });
        divisionBreakdown = await Promise.all(divisions.map(async d => {
          const [total, newL, won, pipeAgg] = await Promise.all([
            prisma.lead.count({ where: { organizationId: d.id, isArchived: false } }),
            prisma.lead.count({ where: { organizationId: d.id, isArchived: false, status: 'NEW' } }),
            prisma.lead.count({ where: { organizationId: d.id, status: 'WON' } }),
            prisma.lead.aggregate({ where: { organizationId: d.id, status: { notIn: ['LOST'] }, budget: { not: null } }, _sum: { budget: true } }),
          ]);
          return {
            divisionId: d.id, divisionName: d.tradeName || d.name,
            totalLeads: total, newLeads: newL, wonLeads: won,
            conversionRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
            pipelineValue: Number(pipeAgg._sum.budget || 0),
          };
        }));
      }
    }

    const totalWon = await prisma.lead.count({ where: { ...lw, status: 'WON' } });

    res.json({
      kpis: {
        totalLeads, newLeads: curNew, newLeadsChange: pctChange(curNew, prevNew),
        wonLeads: curWon, wonLeadsChange: pctChange(curWon, prevWon),
        lostLeads: curLost, lostLeadsChange: pctChange(curLost, prevLost),
        pipelineValue: curPipe, pipelineValueChange: pctChange(curPipe, prevPipe),
        conversionRate: totalLeads > 0 ? Math.round((totalWon / totalLeads) * 10000) / 100 : 0,
        conversionRateChange: pctChange(curWon, prevWon),
        wonRevenue, avgDealSize, totalWon,
        activities: curActivities, activitiesChange: pctChange(curActivities, prevActivities),
        overdueTasks,
        slaAtRisk: slaAtRisk || 0,
        slaBreached: slaBreached || 0,
        reachabilityRatio,
        totalCalls,
        reachedCalls,
        notReachedCalls,
      },
      leadsByStatus: leadsByStatus.map(s => ({ status: s.status, count: s._count.status || s._count._all || s._count })),
      leadsBySource: leadsBySource.map(s => ({ source: s.source, count: s._count.source || s._count._all || s._count })).sort((a, b) => b.count - a.count),
      recentLeads,
      upcomingTasks,
      trends,
      funnel,
      scoreDistribution: scoreBuckets.map(b => ({ label: b.label, total: b.total, won: b.won, conversionRate: b.total > 0 ? Math.round((b.won / b.total) * 100) : 0 })),
      teamLeaderboard,
      recentActivities,
      divisionBreakdown,
    });
  } catch (err) { next(err); }
});

// ─── Division Comparison (SUPER_ADMIN) ────────────────────────────
router.get('/division-comparison', async (req, res, next) => {
  try {
    if (!req.isSuperAdmin) return res.status(403).json({ error: 'Forbidden' });
    const orgIds = req.orgIds;
    if (!orgIds || orgIds.length === 0) return res.json([]);

    const divisions = await prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true, tradeName: true },
    });

    const enriched = await Promise.all(divisions.map(async d => {
      const [total, won, lost, pipeAgg, userCount] = await Promise.all([
        prisma.lead.count({ where: { organizationId: d.id, isArchived: false } }),
        prisma.lead.count({ where: { organizationId: d.id, status: 'WON' } }),
        prisma.lead.count({ where: { organizationId: d.id, status: 'LOST' } }),
        prisma.lead.aggregate({ where: { organizationId: d.id, status: { notIn: ['LOST'] }, budget: { not: null } }, _sum: { budget: true } }),
        prisma.user.count({ where: { organizationId: d.id, isActive: true } }),
      ]);

      return {
        id: d.id,
        name: d.tradeName || d.name,
        total,
        won,
        lost,
        active: total - won - lost,
        conversionRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
        pipelineValue: Number(pipeAgg._sum.budget || 0),
        userCount,
        leadsPerUser: userCount > 0 ? Math.round(total / userCount) : 0,
      };
    }));

    enriched.sort((a, b) => b.total - a.total);
    res.json(enriched);
  } catch (err) { next(err); }
});

module.exports = router;
