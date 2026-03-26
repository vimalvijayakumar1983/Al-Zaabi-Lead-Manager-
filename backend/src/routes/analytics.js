const { Router } = require('express');
const { prisma } = require('../config/database');
const { authenticate, orgScope, resolveDivisionScope } = require('../middleware/auth');

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
  const scoped = resolveDivisionScope(req, divisionId);
  if (scoped) return scoped;
  return { in: req.orgIds };
}

function normalizeId(value) {
  const raw = String(value || '').trim();
  return raw ? raw : null;
}

async function resolveTeamMemberForScope(req, divisionId, requestedTeamMemberId) {
  const scopedId = normalizeId(requestedTeamMemberId);
  if (!scopedId) return null;
  if (req.isRestrictedRole) return req.user.id;

  const where = {
    id: scopedId,
    isActive: true,
  };
  const scopedDiv = resolveDivisionScope(req, divisionId);
  if (scopedDiv) {
    where.organizationId = scopedDiv;
  } else {
    where.organizationId = { in: req.orgIds };
  }

  const user = await prisma.user.findFirst({
    where,
    select: { id: true },
  });
  return user?.id || null;
}

/**
 * Build base where clause for leads, scoped by role.
 * SALES_REP/VIEWER only see leads assigned to them.
 */
function getLeadWhere(req, divisionId, extra = {}) {
  // Match default leads list: hide archived and Do-Not-Call unless callers override via `extra`
  const where = {
    organizationId: getOrgFilter(req, divisionId),
    isArchived: false,
    doNotCall: false,
    ...extra,
  };
  if (req.isRestrictedRole) where.assignedToId = req.user.id;
  return where;
}

function buildPeriodFilter(period, dateRange) {
  if (dateRange?.from || dateRange?.to) {
    const dateFilter = {};
    if (dateRange.from) {
      const from = new Date(dateRange.from);
      if (!Number.isNaN(from.getTime())) dateFilter.gte = from;
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to);
      if (!Number.isNaN(to.getTime())) {
        // Include entire end day
        to.setHours(23, 59, 59, 999);
        dateFilter.lte = to;
      }
    }
    if (dateFilter.gte && dateFilter.lte) {
      const currentStart = dateFilter.gte;
      const currentEnd = dateFilter.lte;
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      const prevEndExclusive = new Date(currentStart.getTime());
      const prevStart = new Date(currentStart.getTime() - durationMs);
      const days = Math.max(1, Math.ceil(durationMs / 86400000));
      return {
        start: currentStart,
        dateFilter: { gte: currentStart, lte: currentEnd },
        isCustom: true,
        prevStart,
        prevEnd: prevEndExclusive,
        days,
      };
    }
    if (dateFilter.gte || dateFilter.lte) {
      const pd = getPeriodDates(period);
      return {
        start: dateFilter.gte || new Date(0),
        dateFilter,
        isCustom: true,
        prevStart: pd.prevStart,
        prevEnd: pd.prevEnd,
        days: pd.days,
      };
    }
  }

  const pd = getPeriodDates(period);
  return {
    start: pd.start,
    dateFilter: { gte: pd.start },
    isCustom: false,
    prevStart: pd.prevStart,
    prevEnd: pd.prevEnd,
    days: pd.days,
  };
}

/**
 * Build base where clause for tasks, scoped by role.
 */
function getTaskWhere(req, divisionId, extra = {}) {
  const where = { ...extra };
  if (req.isRestrictedRole) {
    where.assigneeId = req.user.id;
  } else {
    // Include tasks by assignee org OR linked lead org to avoid undercounting
    // historical/cross-division records in reporting.
    where.OR = [
      { assignee: { organizationId: getOrgFilter(req, divisionId) } },
      { lead: { organizationId: getOrgFilter(req, divisionId) } },
    ];
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

const CALL_DISPOSITION_LABELS = {
  CALLBACK: 'Call Back Requested',
  CALL_LATER: 'Call Later',
  CALL_AGAIN: 'Call Again',
  WILL_CALL_US_AGAIN: 'Will Call Us Again',
  MEETING_ARRANGED: 'Meeting Arranged',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not Interested',
  ALREADY_COMPLETED_SERVICES: 'Already Completed Services',
  NO_ANSWER: 'No Answer',
  VOICEMAIL_LEFT: 'Voicemail Left',
  WRONG_NUMBER: 'Wrong Number',
  BUSY: 'Busy',
  GATEKEEPER: 'Gatekeeper',
  FOLLOW_UP_EMAIL: 'Follow-up Email',
  QUALIFIED: 'Qualified',
  PROPOSAL_REQUESTED: 'Proposal Requested',
  DO_NOT_CALL: 'Do Not Call',
  OTHER: 'Other',
};

const NOT_REACHED_DISPOSITIONS = ['NO_ANSWER', 'BUSY', 'VOICEMAIL_LEFT', 'WRONG_NUMBER', 'GATEKEEPER'];
const ACTIVE_PIPELINE_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION'];
const PIPELINE_STATUS_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeProbability(rawProb, status) {
  if (typeof rawProb === 'number' && Number.isFinite(rawProb)) {
    const normalized = rawProb > 1 ? rawProb / 100 : rawProb;
    return Math.min(1, Math.max(0, normalized));
  }
  const defaults = {
    NEW: 0.1,
    CONTACTED: 0.25,
    QUALIFIED: 0.5,
    PROPOSAL_SENT: 0.7,
    NEGOTIATION: 0.85,
    WON: 1,
    LOST: 0,
  };
  return defaults[status] ?? 0.25;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

function getMonthlyCohortKey(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function extractMonthlyTargetFromSettings(settings) {
  const data = parseMetadata(settings);
  const candidates = [
    data?.reportTargets?.monthlyRevenueTarget,
    data?.reporting?.monthlyRevenueTarget,
    data?.targets?.monthlyRevenueTarget,
    data?.targets?.monthlyRevenue,
    data?.salesTargets?.monthlyRevenueTarget,
  ];
  for (const candidate of candidates) {
    const numeric = toNumber(candidate, NaN);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return 0;
}

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

// ─── Task & SLA Report (Phase A) ─────────────────────────────────
router.get('/task-sla-report', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const { start } = getPeriodDates(period);
    const now = new Date();

    const taskScope = getTaskWhere(req, divisionId);
    const leadScope = getLeadWhere(req, divisionId);

    const [
      openTasks,
      overdueTasks,
      completedInPeriod,
      createdInPeriod,
      taskStatus,
      taskPriority,
      taskType,
      slaStatus,
      breachedLeads,
      completedDurationRows,
      respondedLeads,
      overdueOwnerRows,
    ] = await Promise.all([
      prisma.task.count({
        where: { ...taskScope, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
      prisma.task.count({
        where: { ...taskScope, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } },
      }),
      prisma.task.count({
        where: { ...taskScope, status: 'COMPLETED', completedAt: { gte: start } },
      }),
      prisma.task.count({
        where: { ...taskScope, createdAt: { gte: start } },
      }),
      prisma.task.groupBy({ by: ['status'], where: taskScope, _count: { _all: true } }),
      prisma.task.groupBy({ by: ['priority'], where: taskScope, _count: { _all: true } }),
      prisma.task.groupBy({ by: ['type'], where: taskScope, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ['slaStatus'], where: leadScope, _count: { _all: true } }).catch(() => []),
      prisma.lead.findMany({
        where: { ...leadScope, slaStatus: { in: ['BREACHED', 'ESCALATED'] } },
        select: { createdAt: true },
      }).catch(() => []),
      prisma.task.findMany({
        where: {
          ...taskScope,
          status: 'COMPLETED',
          completedAt: { not: null, gte: start },
        },
        select: { createdAt: true, completedAt: true },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, createdAt: { gte: start }, firstRespondedAt: { not: null } },
        select: { createdAt: true, firstRespondedAt: true },
      }).catch(() => []),
      prisma.task.findMany({
        where: { ...taskScope, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } },
        select: {
          assigneeId: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    const completionRate = createdInPeriod > 0
      ? Math.round((completedInPeriod / createdInPeriod) * 10000) / 100
      : 0;

    const avgCompletionHours = completedDurationRows.length > 0
      ? Math.round(
        (
          completedDurationRows.reduce((sum, row) => {
            const startTs = new Date(row.createdAt).getTime();
            const endTs = row.completedAt ? new Date(row.completedAt).getTime() : startTs;
            return sum + Math.max(0, endTs - startTs);
          }, 0) / completedDurationRows.length
        ) / (1000 * 60 * 60)
      )
      : 0;

    const avgFirstResponseHours = respondedLeads.length > 0
      ? Math.round(
        (
          respondedLeads.reduce((sum, row) => {
            const startTs = new Date(row.createdAt).getTime();
            const endTs = row.firstRespondedAt ? new Date(row.firstRespondedAt).getTime() : startTs;
            return sum + Math.max(0, endTs - startTs);
          }, 0) / respondedLeads.length
        ) / (1000 * 60 * 60)
      )
      : 0;

    const breachedAgingBuckets = [
      { bucket: '0-1 days', count: 0 },
      { bucket: '2-3 days', count: 0 },
      { bucket: '4-7 days', count: 0 },
      { bucket: '8+ days', count: 0 },
    ];
    for (const lead of breachedLeads) {
      const ageDays = Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      if (ageDays <= 1) breachedAgingBuckets[0].count += 1;
      else if (ageDays <= 3) breachedAgingBuckets[1].count += 1;
      else if (ageDays <= 7) breachedAgingBuckets[2].count += 1;
      else breachedAgingBuckets[3].count += 1;
    }

    const ownerMap = new Map();
    for (const row of overdueOwnerRows) {
      const key = row.assigneeId || 'unassigned';
      if (!ownerMap.has(key)) {
        ownerMap.set(key, {
          assigneeId: row.assigneeId || null,
          assigneeName: row.assignee
            ? getDisplayName(row.assignee)
            : 'Unassigned',
          overdueCount: 0,
        });
      }
      ownerMap.get(key).overdueCount += 1;
    }

    res.json({
      summary: {
        openTasks,
        overdueTasks,
        completedInPeriod,
        createdInPeriod,
        completionRate,
        avgCompletionHours,
        avgFirstResponseHours,
      },
      taskBreakdown: {
        byStatus: taskStatus.map((r) => ({ status: r.status, count: r._count._all || 0 })),
        byPriority: taskPriority.map((r) => ({ priority: r.priority, count: r._count._all || 0 })),
        byType: taskType.map((r) => ({ type: r.type, count: r._count._all || 0 })),
      },
      slaBreakdown: {
        byStatus: slaStatus.map((r) => ({ status: r.slaStatus, count: r._count._all || 0 })),
        breachedAgingBuckets,
      },
      overdueByOwner: Array.from(ownerMap.values()).sort((a, b) => b.overdueCount - a.overdueCount).slice(0, 12),
    });
  } catch (err) { next(err); }
});

// ─── Call Disposition Report (Phase A) ───────────────────────────
router.get('/call-disposition-report', async (req, res, next) => {
  try {
    const { divisionId, period = '30d', mode = 'any' } = req.query;
    const normalizedMode = String(mode).toLowerCase() === 'latest' ? 'latest' : 'any';
    const { start } = getPeriodDates(period);
    const orgFilter = getOrgFilter(req, divisionId);
    const scopedBaseWhere = req.isRestrictedRole
      ? { userId: req.user.id }
      : { lead: { organizationId: orgFilter } };

    const buildReport = async (where, meta = {}, reportMode = 'any') => {
      const isLatestMode = reportMode === 'latest';
      let totalCalls = 0;
      let notReachedCalls = 0;
      let dispositionRows = [];
      let uniqueLeadsTouched = 0;
      let avgDurationSeconds = 0;
      let notInterestedRows = [];
      let completedRows = [];
      let willCallRows = [];

      if (isLatestMode) {
        const latestCalls = await prisma.callLog.findMany({
          where,
          orderBy: [{ leadId: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
          distinct: ['leadId'],
          select: {
            leadId: true,
            disposition: true,
            duration: true,
            metadata: true,
          },
        });

        totalCalls = latestCalls.length;
        uniqueLeadsTouched = latestCalls.length;
        notReachedCalls = latestCalls.filter((row) => NOT_REACHED_DISPOSITIONS.includes(row.disposition)).length;

        const dispMap = new Map();
        let durationTotal = 0;
        let durationCount = 0;
        for (const row of latestCalls) {
          dispMap.set(row.disposition, (dispMap.get(row.disposition) || 0) + 1);
          const dur = Number(row.duration);
          if (Number.isFinite(dur) && dur > 0) {
            durationTotal += dur;
            durationCount += 1;
          }
        }
        avgDurationSeconds = durationCount > 0 ? Math.round(durationTotal / durationCount) : 0;
        dispositionRows = Array.from(dispMap.entries()).map(([disposition, count]) => ({
          disposition,
          _count: { _all: count },
        }));

        notInterestedRows = latestCalls
          .filter((row) => row.disposition === 'NOT_INTERESTED')
          .map((row) => ({ metadata: row.metadata, notes: null }));
        completedRows = latestCalls
          .filter((row) => row.disposition === 'ALREADY_COMPLETED_SERVICES')
          .map((row) => ({ metadata: row.metadata }));
        willCallRows = latestCalls
          .filter((row) => row.disposition === 'WILL_CALL_US_AGAIN')
          .map((row) => ({ metadata: row.metadata }));
      } else {
        const [countAll, countNotReached, groupedDisposition, uniqueLeadRows, durationAgg, niRows, compRows, wcRows] = await Promise.all([
          prisma.callLog.count({ where }),
          prisma.callLog.count({ where: { ...where, disposition: { in: NOT_REACHED_DISPOSITIONS } } }),
          prisma.callLog.groupBy({ by: ['disposition'], where, _count: { _all: true } }),
          prisma.callLog.findMany({ where, select: { leadId: true }, distinct: ['leadId'] }),
          prisma.callLog.aggregate({ where, _avg: { duration: true } }),
          prisma.callLog.findMany({
            where: { ...where, disposition: 'NOT_INTERESTED' },
            select: { metadata: true, notes: true },
          }),
          prisma.callLog.findMany({
            where: { ...where, disposition: 'ALREADY_COMPLETED_SERVICES' },
            select: { metadata: true },
          }),
          prisma.callLog.findMany({
            where: { ...where, disposition: 'WILL_CALL_US_AGAIN' },
            select: { metadata: true },
          }),
        ]);
        totalCalls = countAll;
        notReachedCalls = countNotReached;
        dispositionRows = groupedDisposition;
        uniqueLeadsTouched = uniqueLeadRows.length;
        avgDurationSeconds = Math.round(Number(durationAgg._avg.duration || 0));
        notInterestedRows = niRows;
        completedRows = compRows;
        willCallRows = wcRows;
      }

      const reachedCalls = Math.max(0, totalCalls - notReachedCalls);
      const reachabilityRatio = totalCalls > 0 ? Math.round((reachedCalls / totalCalls) * 10000) / 100 : 0;

      const byDisposition = dispositionRows
        .map((row) => {
          const count = row._count._all || 0;
          return {
            disposition: row.disposition,
            label: CALL_DISPOSITION_LABELS[row.disposition] || row.disposition?.replace(/_/g, ' ') || 'Unknown',
            count,
            percent: totalCalls > 0 ? Math.round((count / totalCalls) * 10000) / 100 : 0,
          };
        })
        .sort((a, b) => b.count - a.count);

      const reasonMap = new Map();
      for (const row of notInterestedRows) {
        const metadata = parseMetadata(row.metadata);
        const extractedReason =
          metadata?.notInterestedReasonLabel ||
          metadata?.notInterestedReason ||
          metadata?.reasonLabel ||
          metadata?.reason ||
          null;
        const reason = String(extractedReason || 'Unspecified').trim() || 'Unspecified';
        reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
      }
      const notInterestedTotal = notInterestedRows.length;
      const notInterestedReasons = Array.from(reasonMap.entries())
        .map(([reason, count]) => ({
          reason,
          count,
          percent: notInterestedTotal > 0 ? Math.round((count / notInterestedTotal) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const completedLocationMap = new Map();
      for (const row of completedRows) {
        const metadata = parseMetadata(row.metadata);
        const label =
          metadata?.completedServiceLocationLabel ||
          metadata?.completedServiceLocation ||
          'Unspecified';
        const location = String(label).trim() || 'Unspecified';
        completedLocationMap.set(location, (completedLocationMap.get(location) || 0) + 1);
      }
      const completedTotal = completedRows.length;
      const completedServiceLocations = Array.from(completedLocationMap.entries())
        .map(([location, count]) => ({
          location,
          count,
          percent: completedTotal > 0 ? Math.round((count / completedTotal) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const callbackWindowMap = new Map();
      for (const row of willCallRows) {
        const metadata = parseMetadata(row.metadata);
        const label =
          metadata?.expectedCallbackWindowLabel ||
          metadata?.expectedCallbackWindow ||
          'Unspecified';
        const window = String(label).trim() || 'Unspecified';
        callbackWindowMap.set(window, (callbackWindowMap.get(window) || 0) + 1);
      }
      const willCallTotal = willCallRows.length;
      const expectedCallbackWindows = Array.from(callbackWindowMap.entries())
        .map(([window, count]) => ({
          window,
          count,
          percent: willCallTotal > 0 ? Math.round((count / willCallTotal) * 10000) / 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        summary: {
          totalCalls,
          uniqueLeadsTouched,
          reachedCalls,
          notReachedCalls,
          reachabilityRatio,
          avgDurationSeconds,
        },
        byDisposition,
        notInterested: {
          total: notInterestedTotal,
          reasons: notInterestedReasons,
        },
        alreadyCompletedServices: {
          total: completedTotal,
          locations: completedServiceLocations,
        },
        willCallAgain: {
          total: willCallTotal,
          expectedCallbackWindows,
        },
        meta: { ...meta, mode: reportMode },
      };
    };

    const periodWhere = { ...scopedBaseWhere, createdAt: { gte: start } };
    const periodReport = await buildReport(periodWhere, { periodFallback: false }, normalizedMode);
    if (periodReport.summary.totalCalls > 0) {
      return res.json(periodReport);
    }

    // If period is empty, return all-time scoped report instead of blank zeros.
    const fallbackReport = await buildReport(
      scopedBaseWhere,
      { periodFallback: true, fallbackReason: 'NO_CALLS_IN_SELECTED_PERIOD' },
      normalizedMode
    );
    return res.json(fallbackReport);
  } catch (err) { next(err); }
});

// ─── Pipeline Forecast & Health Report (Phase B) ─────────────────
router.get('/pipeline-forecast-report', async (req, res, next) => {
  try {
    const { divisionId, period = '30d' } = req.query;
    const { now, start, prevStart, prevEnd } = getPeriodDates(period);
    const leadScope = getLeadWhere(req, divisionId);

    const [activeLeads, curActive, prevActive, wonPeriodCount, prevWonCount, lostPeriodCount, wonPeriodRows] = await Promise.all([
      prisma.lead.findMany({
        where: { ...leadScope, status: { in: ACTIVE_PIPELINE_STATUSES } },
        select: {
          id: true,
          status: true,
          budget: true,
          conversionProb: true,
          createdAt: true,
          updatedAt: true,
          stageId: true,
          stage: { select: { id: true, name: true, color: true, order: true } },
          assignedToId: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.count({
        where: { ...leadScope, status: { in: ACTIVE_PIPELINE_STATUSES }, createdAt: { gte: start } },
      }),
      prisma.lead.count({
        where: { ...leadScope, status: { in: ACTIVE_PIPELINE_STATUSES }, createdAt: { gte: prevStart, lt: prevEnd } },
      }),
      prisma.lead.count({
        where: { ...leadScope, status: 'WON', updatedAt: { gte: start } },
      }),
      prisma.lead.count({
        where: { ...leadScope, status: 'WON', updatedAt: { gte: prevStart, lt: prevEnd } },
      }),
      prisma.lead.count({
        where: { ...leadScope, status: 'LOST', updatedAt: { gte: start } },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, status: 'WON', updatedAt: { gte: start } },
        select: { budget: true, createdAt: true, wonAt: true, updatedAt: true },
      }),
    ]);

    const staleThresholdDays = 14;
    const stageMap = new Map();
    const ageBuckets = [
      { bucket: '0-7 days', count: 0, pipelineValue: 0, weightedValue: 0 },
      { bucket: '8-14 days', count: 0, pipelineValue: 0, weightedValue: 0 },
      { bucket: '15-30 days', count: 0, pipelineValue: 0, weightedValue: 0 },
      { bucket: '31+ days', count: 0, pipelineValue: 0, weightedValue: 0 },
    ];
    const ownerMap = new Map();

    let activePipelineValue = 0;
    let weightedPipelineValue = 0;
    let staleActiveLeads = 0;

    for (const lead of activeLeads) {
      const budget = Number(lead.budget || 0);
      const probability = normalizeProbability(lead.conversionProb, lead.status);
      const weighted = budget * probability;
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      );
      const staleDays = Math.max(
        0,
        Math.floor((now.getTime() - new Date(lead.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
      );

      activePipelineValue += budget;
      weightedPipelineValue += weighted;
      if (staleDays > staleThresholdDays) staleActiveLeads += 1;

      const stageLabel = lead.stage?.name || lead.status.replace(/_/g, ' ');
      const stageKey = stageLabel.trim().toLowerCase();
      if (!stageMap.has(stageKey)) {
        stageMap.set(stageKey, {
          stage: stageLabel,
          color: lead.stage?.color || '#6366f1',
          order: lead.stage?.order ?? 9999,
          count: 0,
          pipelineValue: 0,
          weightedValue: 0,
          totalProbability: 0,
          totalAgeDays: 0,
          stageIds: new Set(),
          statusHints: new Set(),
        });
      }
      const stageRow = stageMap.get(stageKey);
      stageRow.count += 1;
      stageRow.pipelineValue += budget;
      stageRow.weightedValue += weighted;
      stageRow.totalProbability += probability;
      stageRow.totalAgeDays += ageDays;
      if (lead.stageId) stageRow.stageIds.add(lead.stageId);
      if (lead.status) stageRow.statusHints.add(lead.status);

      if (ageDays <= 7) {
        ageBuckets[0].count += 1;
        ageBuckets[0].pipelineValue += budget;
        ageBuckets[0].weightedValue += weighted;
      } else if (ageDays <= 14) {
        ageBuckets[1].count += 1;
        ageBuckets[1].pipelineValue += budget;
        ageBuckets[1].weightedValue += weighted;
      } else if (ageDays <= 30) {
        ageBuckets[2].count += 1;
        ageBuckets[2].pipelineValue += budget;
        ageBuckets[2].weightedValue += weighted;
      } else {
        ageBuckets[3].count += 1;
        ageBuckets[3].pipelineValue += budget;
        ageBuckets[3].weightedValue += weighted;
      }

      const ownerKey = lead.assignedToId || 'unassigned';
      if (!ownerMap.has(ownerKey)) {
        ownerMap.set(ownerKey, {
          assigneeId: lead.assignedToId || null,
          assigneeName: lead.assignedTo ? getDisplayName(lead.assignedTo) : 'Unassigned',
          count: 0,
          pipelineValue: 0,
          weightedValue: 0,
        });
      }
      const ownerRow = ownerMap.get(ownerKey);
      ownerRow.count += 1;
      ownerRow.pipelineValue += budget;
      ownerRow.weightedValue += weighted;
    }

    const stageForecast = Array.from(stageMap.values())
      .map((row) => ({
        stage: row.stage,
        color: row.color,
        count: row.count,
        pipelineValue: Math.round(row.pipelineValue),
        weightedValue: Math.round(row.weightedValue),
        avgProbability: row.count > 0 ? Math.round((row.totalProbability / row.count) * 10000) / 100 : 0,
        avgAgeDays: row.count > 0 ? Math.round(row.totalAgeDays / row.count) : 0,
        stageIds: Array.from(row.stageIds),
        statusHints: Array.from(row.statusHints),
      }))
      .sort((a, b) => a.avgAgeDays - b.avgAgeDays || b.weightedValue - a.weightedValue);

    const ownerForecast = Array.from(ownerMap.values())
      .map((row) => ({
        ...row,
        pipelineValue: Math.round(row.pipelineValue),
        weightedValue: Math.round(row.weightedValue),
      }))
      .sort((a, b) => b.weightedValue - a.weightedValue)
      .slice(0, 15);

    const wonRevenueInPeriod = Math.round(
      wonPeriodRows.reduce((sum, row) => sum + Number(row.budget || 0), 0)
    );
    const avgSalesCycleDays = wonPeriodRows.length > 0
      ? Math.round(
        wonPeriodRows.reduce((sum, row) => {
          const endDate = row.wonAt || row.updatedAt || row.createdAt;
          const days = Math.max(
            0,
            (new Date(endDate).getTime() - new Date(row.createdAt).getTime()) / (24 * 60 * 60 * 1000)
          );
          return sum + days;
        }, 0) / wonPeriodRows.length
      )
      : 0;

    const closedInPeriod = wonPeriodCount + lostPeriodCount;
    const winRate = closedInPeriod > 0 ? Math.round((wonPeriodCount / closedInPeriod) * 10000) / 100 : 0;

    res.json({
      summary: {
        activeLeads: activeLeads.length,
        activePipelineValue: Math.round(activePipelineValue),
        weightedPipelineValue: Math.round(weightedPipelineValue),
        forecastCoverageRatio: activePipelineValue > 0
          ? Math.round((weightedPipelineValue / activePipelineValue) * 10000) / 100
          : 0,
        wonRevenueInPeriod,
        avgSalesCycleDays,
        staleActiveLeads,
        staleThresholdDays,
        winRate,
      },
      momentum: {
        activeLeadsCurrent: curActive,
        activeLeadsPrevious: prevActive,
        activeLeadsGrowth: pctChange(curActive, prevActive),
        wonCurrent: wonPeriodCount,
        wonPrevious: prevWonCount,
        wonGrowth: pctChange(wonPeriodCount, prevWonCount),
      },
      stageForecast,
      ageBuckets: ageBuckets.map((bucket) => ({
        ...bucket,
        pipelineValue: Math.round(bucket.pipelineValue),
        weightedValue: Math.round(bucket.weightedValue),
      })),
      ownerForecast,
    });
  } catch (err) { next(err); }
});

// ─── World-Class Phase 1 Reports ──────────────────────────────────
router.get('/phase1-report', async (req, res, next) => {
  try {
    const { divisionId, period = '30d', targetRevenue } = req.query;
    const { now, start, prevStart, prevEnd, days } = getPeriodDates(period);
    const leadScope = getLeadWhere(req, divisionId);
    const orgFilter = getOrgFilter(req, divisionId);

    const [organizations, activeLeads, periodLeads, wonInPeriodRows, wonInPrevPeriodRows] = await Promise.all([
      prisma.organization.findMany({
        where: { id: orgFilter },
        select: { id: true, name: true, tradeName: true, settings: true },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, status: { in: ACTIVE_PIPELINE_STATUSES } },
        select: {
          id: true,
          status: true,
          source: true,
          budget: true,
          conversionProb: true,
          createdAt: true,
          updatedAt: true,
          stageId: true,
          stage: { select: { id: true, name: true, order: true, color: true } },
          assignedToId: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, createdAt: { gte: start } },
        select: {
          id: true,
          status: true,
          source: true,
          budget: true,
          conversionProb: true,
          createdAt: true,
          updatedAt: true,
          wonAt: true,
          firstRespondedAt: true,
          slaStatus: true,
          stageId: true,
          stage: { select: { id: true, name: true, order: true, color: true } },
          assignedToId: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, status: 'WON', updatedAt: { gte: start } },
        select: { id: true, budget: true },
      }),
      prisma.lead.findMany({
        where: { ...leadScope, status: 'WON', updatedAt: { gte: prevStart, lt: prevEnd } },
        select: { id: true, budget: true },
      }),
    ]);

    // Revenue Forecast vs Target
    const targetFromQuery = toNumber(targetRevenue, NaN);
    const configuredMonthlyTarget = Number.isFinite(targetFromQuery) && targetFromQuery > 0
      ? targetFromQuery
      : organizations.reduce((sum, org) => sum + extractMonthlyTargetFromSettings(org.settings), 0);
    const targetRevenueInPeriod = configuredMonthlyTarget > 0
      ? Math.round(configuredMonthlyTarget * (days / 30))
      : 0;

    let activePipelineValue = 0;
    let expectedRevenue = 0;
    let commitRevenue = 0;
    let bestCaseRevenue = 0;

    const stageVelocityMap = new Map();
    for (const lead of activeLeads) {
      const budget = Number(lead.budget || 0);
      const probability = normalizeProbability(lead.conversionProb, lead.status);
      const weighted = budget * probability;
      const ageDays = Math.max(
        0,
        Math.floor((now.getTime() - new Date(lead.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      );
      const staleDays = Math.max(
        0,
        Math.floor((now.getTime() - new Date(lead.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
      );

      activePipelineValue += budget;
      expectedRevenue += weighted;
      if (probability >= 0.75) commitRevenue += budget;
      if (probability >= 0.5) bestCaseRevenue += budget;

      const stageLabel = lead.stage?.name || lead.status.replace(/_/g, ' ');
      const stageKey = stageLabel.trim().toLowerCase();
      if (!stageVelocityMap.has(stageKey)) {
        stageVelocityMap.set(stageKey, {
          stage: stageLabel,
          order: Number.isFinite(lead.stage?.order) ? lead.stage.order : PIPELINE_STATUS_ORDER.indexOf(lead.status),
          color: lead.stage?.color || '#6366f1',
          count: 0,
          pipelineValue: 0,
          weightedValue: 0,
          totalProbability: 0,
          ageDaysList: [],
          staleCount: 0,
          stageIds: new Set(),
          statusHints: new Set(),
        });
      }
      const row = stageVelocityMap.get(stageKey);
      row.count += 1;
      row.pipelineValue += budget;
      row.weightedValue += weighted;
      row.totalProbability += probability;
      row.ageDaysList.push(ageDays);
      if (staleDays > 14) row.staleCount += 1;
      if (lead.stageId) row.stageIds.add(lead.stageId);
      if (lead.status) row.statusHints.add(lead.status);
    }

    const attainmentPct = targetRevenueInPeriod > 0
      ? Math.round((expectedRevenue / targetRevenueInPeriod) * 10000) / 100
      : 0;
    const gapToTarget = targetRevenueInPeriod > 0
      ? Math.max(0, Math.round(targetRevenueInPeriod - expectedRevenue))
      : 0;
    const wonRevenueCurrent = Math.round(wonInPeriodRows.reduce((sum, row) => sum + Number(row.budget || 0), 0));
    const wonRevenuePrevious = Math.round(wonInPrevPeriodRows.reduce((sum, row) => sum + Number(row.budget || 0), 0));

    const revenueForecast = {
      summary: {
        targetRevenue: targetRevenueInPeriod,
        expectedRevenue: Math.round(expectedRevenue),
        commitRevenue: Math.round(commitRevenue),
        bestCaseRevenue: Math.round(bestCaseRevenue),
        activePipelineValue: Math.round(activePipelineValue),
        weightedCoverageRatio: activePipelineValue > 0
          ? Math.round((expectedRevenue / activePipelineValue) * 10000) / 100
          : 0,
        attainmentPct,
        gapToTarget,
      },
      trend: {
        wonRevenueCurrent,
        wonRevenuePrevious,
        wonRevenueGrowth: pctChange(wonRevenueCurrent, wonRevenuePrevious),
      },
      targetMeta: {
        targetSource: Number.isFinite(targetFromQuery) && targetFromQuery > 0 ? 'query' : 'organization_settings',
        monthlyTargetConfigured: Math.round(configuredMonthlyTarget),
      },
    };

    // Cohort Conversion (monthly cohorts)
    const qualifiedStatuses = new Set(['QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON']);
    const cohortMap = new Map();
    for (const lead of periodLeads) {
      const cohort = getMonthlyCohortKey(lead.createdAt);
      if (!cohortMap.has(cohort)) {
        cohortMap.set(cohort, {
          cohort,
          created: 0,
          contacted: 0,
          qualified: 0,
          won: 0,
          lost: 0,
          cycleDays: [],
        });
      }
      const row = cohortMap.get(cohort);
      row.created += 1;
      if (lead.status !== 'NEW') row.contacted += 1;
      if (qualifiedStatuses.has(lead.status)) row.qualified += 1;
      if (lead.status === 'WON') {
        row.won += 1;
        const wonAt = lead.wonAt || lead.updatedAt;
        const daysToWin = Math.max(
          0,
          (new Date(wonAt).getTime() - new Date(lead.createdAt).getTime()) / (24 * 60 * 60 * 1000)
        );
        row.cycleDays.push(daysToWin);
      }
      if (lead.status === 'LOST') row.lost += 1;
    }

    const cohorts = Array.from(cohortMap.values())
      .sort((a, b) => a.cohort.localeCompare(b.cohort))
      .map((row) => ({
        cohort: row.cohort,
        created: row.created,
        contactedRate: row.created > 0 ? Math.round((row.contacted / row.created) * 10000) / 100 : 0,
        qualifiedRate: row.created > 0 ? Math.round((row.qualified / row.created) * 10000) / 100 : 0,
        wonRate: row.created > 0 ? Math.round((row.won / row.created) * 10000) / 100 : 0,
        lostRate: row.created > 0 ? Math.round((row.lost / row.created) * 10000) / 100 : 0,
        avgSalesCycleDays: row.cycleDays.length > 0
          ? Math.round(row.cycleDays.reduce((sum, value) => sum + value, 0) / row.cycleDays.length)
          : 0,
      }));

    const cohortConversion = {
      granularity: 'monthly',
      cohorts,
      summary: {
        totalLeads: periodLeads.length,
        cohorts: cohorts.length,
      },
    };

    // Pipeline Velocity
    const velocityStages = Array.from(stageVelocityMap.values())
      .map((row) => ({
        stage: row.stage,
        color: row.color,
        count: row.count,
        pipelineValue: Math.round(row.pipelineValue),
        weightedValue: Math.round(row.weightedValue),
        avgProbability: row.count > 0 ? Math.round((row.totalProbability / row.count) * 10000) / 100 : 0,
        medianAgeDays: median(row.ageDaysList),
        avgAgeDays: row.count > 0
          ? Math.round(row.ageDaysList.reduce((sum, value) => sum + value, 0) / row.count)
          : 0,
        staleRate: row.count > 0 ? Math.round((row.staleCount / row.count) * 10000) / 100 : 0,
        stageIds: Array.from(row.stageIds),
        statusHints: Array.from(row.statusHints),
        order: Number.isFinite(row.order) && row.order >= 0 ? row.order : 999,
      }))
      .sort((a, b) => a.order - b.order || b.pipelineValue - a.pipelineValue);

    for (let i = 0; i < velocityStages.length; i += 1) {
      if (i === 0) {
        velocityStages[i].conversionFromPrev = 100;
      } else {
        const prev = velocityStages[i - 1].count;
        velocityStages[i].conversionFromPrev = prev > 0
          ? Math.round((velocityStages[i].count / prev) * 10000) / 100
          : 0;
      }
      delete velocityStages[i].order;
    }

    const bottlenecks = velocityStages
      .filter((row) => row.medianAgeDays >= 14 || row.staleRate >= 35 || row.conversionFromPrev <= 35)
      .slice(0, 5)
      .map((row) => ({
        stage: row.stage,
        medianAgeDays: row.medianAgeDays,
        staleRate: row.staleRate,
        conversionFromPrev: row.conversionFromPrev,
        reason: row.medianAgeDays >= 14
          ? 'High median lead age'
          : row.staleRate >= 35
            ? 'High stale lead rate'
            : 'Low stage conversion',
      }));

    const pipelineVelocity = {
      summary: {
        activeLeads: activeLeads.length,
        avgStageMedianAgeDays: velocityStages.length > 0
          ? Math.round(velocityStages.reduce((sum, row) => sum + row.medianAgeDays, 0) / velocityStages.length)
          : 0,
        staleActiveLeadRate: activeLeads.length > 0
          ? Math.round((velocityStages.reduce((sum, row) => sum + Math.round((row.staleRate / 100) * row.count), 0) / activeLeads.length) * 10000) / 100
          : 0,
      },
      stages: velocityStages,
      bottlenecks,
    };

    // SLA Root Cause
    const breachedSet = new Set(['BREACHED', 'ESCALATED']);
    const breachedPeriodLeads = periodLeads.filter((lead) => breachedSet.has(lead.slaStatus));
    const breachedLeadIds = new Set(breachedPeriodLeads.map((lead) => lead.id));

    const responseDelayBuckets = [
      { bucket: '0-15 min', count: 0 },
      { bucket: '16-60 min', count: 0 },
      { bucket: '1-4 hours', count: 0 },
      { bucket: '4-24 hours', count: 0 },
      { bucket: '24+ hours', count: 0 },
    ];
    let totalFirstResponseMs = 0;
    let firstResponseSamples = 0;
    for (const lead of periodLeads) {
      if (!lead.firstRespondedAt) continue;
      const delayMs = Math.max(0, new Date(lead.firstRespondedAt).getTime() - new Date(lead.createdAt).getTime());
      const delayMinutes = delayMs / (1000 * 60);
      totalFirstResponseMs += delayMs;
      firstResponseSamples += 1;

      if (delayMinutes <= 15) responseDelayBuckets[0].count += 1;
      else if (delayMinutes <= 60) responseDelayBuckets[1].count += 1;
      else if (delayMinutes <= 240) responseDelayBuckets[2].count += 1;
      else if (delayMinutes <= 1440) responseDelayBuckets[3].count += 1;
      else responseDelayBuckets[4].count += 1;
    }

    const sourceMap = new Map();
    const stageMap = new Map();
    const ownerMap = new Map();
    for (const lead of periodLeads) {
      const breached = breachedLeadIds.has(lead.id);

      const sourceKey = lead.source || 'UNKNOWN';
      if (!sourceMap.has(sourceKey)) sourceMap.set(sourceKey, { source: sourceKey, total: 0, breached: 0 });
      const sourceRow = sourceMap.get(sourceKey);
      sourceRow.total += 1;
      if (breached) sourceRow.breached += 1;

      const stageLabel = lead.stage?.name || lead.status.replace(/_/g, ' ');
      const stageKey = stageLabel.trim().toLowerCase();
      if (!stageMap.has(stageKey)) {
        stageMap.set(stageKey, {
          stage: stageLabel,
          total: 0,
          breached: 0,
          stageIds: new Set(),
          statusHints: new Set(),
        });
      }
      const stageRow = stageMap.get(stageKey);
      stageRow.total += 1;
      if (breached) stageRow.breached += 1;
      if (lead.stageId) stageRow.stageIds.add(lead.stageId);
      if (lead.status) stageRow.statusHints.add(lead.status);

      const ownerKey = lead.assignedToId || 'unassigned';
      if (!ownerMap.has(ownerKey)) {
        ownerMap.set(ownerKey, {
          assigneeId: lead.assignedToId || null,
          assigneeName: lead.assignedTo ? getDisplayName(lead.assignedTo) : 'Unassigned',
          total: 0,
          breached: 0,
        });
      }
      const ownerRow = ownerMap.get(ownerKey);
      ownerRow.total += 1;
      if (breached) ownerRow.breached += 1;
    }

    const bySource = Array.from(sourceMap.values())
      .map((row) => ({
        source: row.source,
        total: row.total,
        breached: row.breached,
        breachRate: row.total > 0 ? Math.round((row.breached / row.total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.breachRate - a.breachRate || b.breached - a.breached);

    const byStage = Array.from(stageMap.values())
      .map((row) => ({
        stage: row.stage,
        total: row.total,
        breached: row.breached,
        breachRate: row.total > 0 ? Math.round((row.breached / row.total) * 10000) / 100 : 0,
        stageIds: Array.from(row.stageIds),
        statusHints: Array.from(row.statusHints),
      }))
      .sort((a, b) => b.breachRate - a.breachRate || b.breached - a.breached);

    const byOwner = Array.from(ownerMap.values())
      .map((row) => ({
        ...row,
        breachRate: row.total > 0 ? Math.round((row.breached / row.total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.breachRate - a.breachRate || b.breached - a.breached)
      .slice(0, 15);

    const topDrivers = [];
    const addDriver = (label, row) => {
      if (!row || row.total < 3 || row.breachRate <= 0) return;
      topDrivers.push({
        driver: label,
        item: row.source || row.stage || row.assigneeName || 'Unknown',
        breachRate: row.breachRate,
        breached: row.breached,
        total: row.total,
      });
    };
    addDriver('Source', bySource[0]);
    addDriver('Stage', byStage[0]);
    addDriver('Owner', byOwner[0]);

    const slaRootCause = {
      summary: {
        periodLeads: periodLeads.length,
        breachedLeads: breachedPeriodLeads.length,
        breachRate: periodLeads.length > 0
          ? Math.round((breachedPeriodLeads.length / periodLeads.length) * 10000) / 100
          : 0,
        avgFirstResponseHours: firstResponseSamples > 0
          ? Math.round((totalFirstResponseMs / firstResponseSamples) / (1000 * 60 * 60) * 100) / 100
          : 0,
      },
      responseDelayBuckets,
      bySource,
      byStage,
      byOwner,
      topDrivers,
    };

    return res.json({
      revenueForecast,
      cohortConversion,
      pipelineVelocity,
      slaRootCause,
    });
  } catch (err) { next(err); }
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
    const { divisionId, period = '30d', teamMemberId, from, to } = req.query;
    const orgFilter = getOrgFilter(req, divisionId);
    const now = new Date();
    const scopedTeamMemberId = await resolveTeamMemberForScope(req, divisionId, teamMemberId);

    const customDate = buildPeriodFilter(period, {
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
    });
    const { prevStart, prevEnd, days } = customDate;

    const lw = getLeadWhere(req, divisionId);
    if (scopedTeamMemberId && !req.isRestrictedRole) {
      lw.assignedToId = scopedTeamMemberId;
    }
    const lwInPeriod = { ...lw, createdAt: customDate.dateFilter };
    const actWhere = req.isRestrictedRole ? { lead: { assignedToId: req.user.id } } : { lead: { organizationId: orgFilter } };
    if (scopedTeamMemberId && !req.isRestrictedRole) {
      actWhere.lead = { ...(actWhere.lead || {}), assignedToId: scopedTeamMemberId };
    }

    const taskScopeWithTeam = getTaskWhere(req, divisionId);
    if (scopedTeamMemberId && !req.isRestrictedRole) {
      taskScopeWithTeam.assigneeId = scopedTeamMemberId;
      delete taskScopeWithTeam.OR;
    }

    // ── Parallel fetch everything ──
    const [
      // KPI counts
      totalLeads, prevTotalLeads, curNew, prevNew, curWon, prevWon, curLost, prevLost,
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
      prisma.lead.count({ where: lwInPeriod }),
      prisma.lead.count({ where: { ...lw, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lwInPeriod, status: 'NEW' } }),
      prisma.lead.count({ where: { ...lw, status: 'NEW', createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: customDate.dateFilter } }),
      prisma.lead.count({ where: { ...lw, status: 'WON', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: customDate.dateFilter } }),
      prisma.lead.count({ where: { ...lw, status: 'LOST', updatedAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null } }, _sum: { budget: true } }),
      prisma.lead.aggregate({ where: { ...lw, status: { notIn: ['LOST'] }, budget: { not: null }, createdAt: { gte: prevStart, lt: prevEnd } }, _sum: { budget: true } }),
      prisma.lead.aggregate({
        where: { ...lw, status: 'WON', budget: { not: null }, updatedAt: customDate.dateFilter },
        _sum: { budget: true },
        _avg: { budget: true },
        _count: true,
      }),

      prisma.lead.groupBy({ by: ['status'], where: lwInPeriod, _count: { status: true } }),
      prisma.lead.groupBy({ by: ['source'], where: lwInPeriod, _count: { source: true } }),

      prisma.lead.findMany({
        where: lwInPeriod, orderBy: { createdAt: 'desc' }, take: 8,
        select: { id: true, firstName: true, lastName: true, email: true, company: true, source: true, status: true, score: true, budget: true, createdAt: true, assignedTo: { select: { firstName: true, lastName: true, avatar: true } } },
      }),
      prisma.task.findMany({
        where: { ...taskScopeWithTeam, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { gte: now } },
        orderBy: { dueAt: 'asc' }, take: 6,
        select: { id: true, title: true, type: true, priority: true, status: true, dueAt: true, lead: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.task.count({ where: { ...taskScopeWithTeam, status: { in: ['PENDING', 'IN_PROGRESS'] }, dueAt: { lt: now } } }),

      prisma.lead.findMany({
        where: { ...lw, createdAt: customDate.dateFilter },
        select: { createdAt: true, status: true, budget: true },
      }),

      prisma.leadActivity.count({ where: { ...actWhere, createdAt: customDate.dateFilter } }),
      prisma.leadActivity.count({ where: { ...actWhere, createdAt: { gte: prevStart, lt: prevEnd } } }),
      prisma.leadActivity.findMany({
        where: { ...actWhere, createdAt: customDate.dateFilter },
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, type: true, description: true, createdAt: true, user: { select: { firstName: true, lastName: true } }, lead: { select: { id: true, firstName: true, lastName: true } } },
      }),

      prisma.pipelineStage.findMany({
        where: { organizationId: orgFilter },
        orderBy: { order: 'asc' },
        include: {
          _count: {
            select: {
              leads: {
                where: {
                  isArchived: false,
                  doNotCall: false,
                  ...(scopedTeamMemberId && !req.isRestrictedRole ? { assignedToId: scopedTeamMemberId } : {}),
                },
              },
            },
          },
          leads: {
            select: { budget: true },
            where: {
              isArchived: false,
              doNotCall: false,
              budget: { not: null },
              ...(scopedTeamMemberId && !req.isRestrictedRole ? { assignedToId: scopedTeamMemberId } : {}),
            },
          },
        },
      }),

      prisma.lead.findMany({
        where: lwInPeriod,
        select: { score: true, status: true },
      }),

      prisma.lead.count({ where: { ...lw, slaStatus: 'AT_RISK' } }).catch(() => 0),
      prisma.lead.count({ where: { ...lw, slaStatus: 'BREACHED' } }).catch(() => 0),
    ]);

    // ── Reachability Ratio (call logs) ──
    const callLogOrgWhere = req.isRestrictedRole
      ? { userId: req.user.id }
      : { lead: { organizationId: orgFilter, isArchived: false } };
    if (scopedTeamMemberId && !req.isRestrictedRole) {
      callLogOrgWhere.userId = scopedTeamMemberId;
      delete callLogOrgWhere.lead;
    }
    const periodCallWhere = { ...callLogOrgWhere, createdAt: customDate.dateFilter };

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
        where: {
          organizationId: orgFilter,
          isActive: true,
          ...(scopedTeamMemberId ? { id: scopedTeamMemberId } : {}),
        },
        select: { id: true, firstName: true, lastName: true, avatar: true, role: true },
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

    // ── Process team leaderboard (same division / team scope as lw — not global org) ──
    let teamLeaderboard = [];
    if (!req.isRestrictedRole && teamUsers.length > 0) {
      const enriched = await Promise.all(teamUsers.slice(0, 10).map(async u => {
        const base = { ...lw, assignedToId: u.id };
        const [totalScoped, won, revenue] = await Promise.all([
          prisma.lead.count({ where: base }),
          prisma.lead.count({ where: { ...base, status: 'WON' } }),
          prisma.lead.aggregate({ where: { ...base, status: 'WON', budget: { not: null } }, _sum: { budget: true } }),
        ]);
        return {
          id: u.id, name: getDisplayName(u), avatar: u.avatar, role: u.role,
          totalLeads: totalScoped,
          wonLeads: won,
          wonRevenue: Number(revenue._sum.budget || 0),
          conversionRate: totalScoped > 0 ? Math.round((won / totalScoped) * 10000) / 100 : 0,
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

    const closedInPeriod = curWon + curLost;
    const conversionRate = closedInPeriod > 0
      ? Math.round((curWon / closedInPeriod) * 10000) / 100
      : 0;

    res.json({
      periodDays: days,
      kpis: {
        totalLeads,
        totalLeadsChange: pctChange(totalLeads, prevTotalLeads),
        newLeads: curNew, newLeadsChange: pctChange(curNew, prevNew),
        wonLeads: curWon, wonLeadsChange: pctChange(curWon, prevWon),
        lostLeads: curLost, lostLeadsChange: pctChange(curLost, prevLost),
        pipelineValue: curPipe, pipelineValueChange: pctChange(curPipe, prevPipe),
        conversionRate,
        conversionRateChange: pctChange(curWon, prevWon),
        wonRevenue, avgDealSize, totalWon: curWon,
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
