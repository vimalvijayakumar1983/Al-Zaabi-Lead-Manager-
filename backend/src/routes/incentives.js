const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope, resolveDivisionScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const {
  requireIncentiveAdmin,
  requireIncentiveOps,
  requireFinanceApprover,
  requireManualAdjustmentMaker,
  requireAuditor,
  requireAgent,
  isSuperOrAdmin,
  incentiveFlags,
} = require('../middleware/incentivePermissions');
const { previewAttribution } = require('../services/incentives/attributionEngine');
const { simulateEarning } = require('../services/incentives/earningsEngine');
const { processIncentiveEvent, dryRunProcessEvent } = require('../services/incentives/pipeline');
const { writeIncentiveAudit } = require('../services/incentives/auditLog');
const {
  generateStatements,
  approveStatement,
  lockStatement,
  payStatement,
} = require('../services/incentives/statementService');
const schemas = require('../validation/incentiveSchemas');

const router = Router();
router.use(authenticate, orgScope);

function ensureDivision(req, divisionId) {
  const resolved = resolveDivisionScope(req, divisionId);
  if (!resolved) {
    const err = new Error('DIVISION_NOT_ALLOWED');
    err.status = 403;
    throw err;
  }
  return resolved;
}

// ─── Events ──────────────────────────────────────────────────────
router.post('/events', requireIncentiveOps, validate(schemas.ingestEventBody), async (req, res, next) => {
  try {
    const d = req.validated;
    const divisionId = ensureDivision(req, d.divisionId);
    const organizationId = divisionId;

    const existing = await prisma.incentiveEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: d.idempotencyKey } },
    });
    if (existing) {
      return res.status(200).json({ ok: true, deduped: true, event: existing });
    }

    const event = await prisma.incentiveEvent.create({
      data: {
        organizationId,
        divisionId,
        idempotencyKey: d.idempotencyKey,
        eventType: d.eventType,
        occurredAt: new Date(d.occurredAt),
        sourceSystem: d.sourceSystem,
        sourceMetadata: d.sourceMetadata || {},
        payload: d.payload || {},
        leadId: d.leadId || undefined,
        contactId: d.contactId || undefined,
        dealId: d.dealId || undefined,
        orderExternalId: d.orderExternalId || undefined,
        invoiceExternalId: d.invoiceExternalId || undefined,
        amount: d.amount != null ? d.amount : undefined,
        createdById: req.user.id,
      },
    });

    await writeIncentiveAudit({
      organizationId,
      divisionId,
      actorId: req.user.id,
      action: 'EVENT_INGEST',
      modelType: 'IncentiveEvent',
      modelId: event.id,
      after: { eventType: event.eventType, idempotencyKey: event.idempotencyKey },
    });

    res.status(201).json({ ok: true, event });
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/events/bulk', requireIncentiveOps, validate(schemas.bulkEventsBody), async (req, res, next) => {
  try {
    const { events, divisionId: div } = req.validated;
    const divisionId = ensureDivision(req, div);
    const organizationId = divisionId;
    const results = { created: 0, deduped: 0, errors: [] };

    for (const d of events) {
      try {
        const existing = await prisma.incentiveEvent.findUnique({
          where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: d.idempotencyKey } },
        });
        if (existing) {
          results.deduped += 1;
          continue;
        }
        await prisma.incentiveEvent.create({
          data: {
            organizationId,
            divisionId,
            idempotencyKey: d.idempotencyKey,
            eventType: d.eventType,
            occurredAt: new Date(d.occurredAt),
            sourceSystem: d.sourceSystem,
            sourceMetadata: d.sourceMetadata || {},
            payload: d.payload || {},
            leadId: d.leadId || undefined,
            contactId: d.contactId || undefined,
            dealId: d.dealId || undefined,
            orderExternalId: d.orderExternalId || undefined,
            invoiceExternalId: d.invoiceExternalId || undefined,
            amount: d.amount != null ? d.amount : undefined,
            createdById: req.user.id,
          },
        });
        results.created += 1;
      } catch (err) {
        results.errors.push({ idempotencyKey: d.idempotencyKey, message: err.message });
      }
    }

    res.json(results);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.get(
  '/events',
  requireIncentiveOps,
  validateQuery(
    z.object({
      divisionId: z.string().uuid(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      status: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const { divisionId, page = 1, limit = 50, status } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const where = { organizationId: divisionId, divisionId };
      if (status) where.processingStatus = status;
      const [items, total] = await Promise.all([
        prisma.incentiveEvent.findMany({
          where,
          orderBy: { occurredAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.incentiveEvent.count({ where }),
      ]);
      res.json({ items, total, page, limit });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

// ─── Attribution / earnings preview ─────────────────────────────
router.post('/attribution/preview', requireIncentiveOps, validate(schemas.attributionPreviewBody), async (req, res, next) => {
  try {
    const { divisionId, strategy, attributionWindowDays, event } = req.validated;
    ensureDivision(req, divisionId);
    const result = await previewAttribution({
      strategy,
      event: {
        ...event,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
      },
      organizationId: divisionId,
      attributionWindowDays: attributionWindowDays ?? 90,
    });
    res.json(result);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/earnings/simulate', requireIncentiveOps, validate(schemas.earningsSimulateBody), async (req, res, next) => {
  try {
    const { divisionId, eventType, earningsConfig, event } = req.validated;
    ensureDivision(req, divisionId);
    const out = simulateEarning({ earningsConfig, eventType, event });
    res.json(out);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Jobs / processing ───────────────────────────────────────────
router.post('/jobs/process-events', requireIncentiveOps, validate(schemas.jobProcessBody), async (req, res, next) => {
  try {
    const { divisionId, eventIds, dryRun } = req.validated;
    ensureDivision(req, divisionId);
    const summary = { ok: 0, failed: 0, skipped: 0, dryRunResults: [] };
    for (const id of eventIds) {
      const ev = await prisma.incentiveEvent.findFirst({
        where: { id, organizationId: divisionId, divisionId },
      });
      if (!ev) {
        summary.failed += 1;
        continue;
      }
      if (dryRun) {
        const r = await dryRunProcessEvent(id);
        summary.dryRunResults.push({ id, ...r });
        summary.ok += 1;
        continue;
      }
      const r = await processIncentiveEvent(id, req.user.id);
      if (r.skipped) summary.skipped += 1;
      else if (r.ok) summary.ok += 1;
      else summary.failed += 1;
    }
    res.json(summary);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Adjustments ─────────────────────────────────────────────────
router.post('/adjustments', requireManualAdjustmentMaker, validate(schemas.adjustmentCreateBody), async (req, res, next) => {
  try {
    const d = req.validated;
    const divisionId = ensureDivision(req, d.divisionId);
    const adj = await prisma.incentiveAdjustment.create({
      data: {
        organizationId: divisionId,
        divisionId,
        type: d.type,
        targetEarningId: d.targetEarningId || undefined,
        amount: d.amount,
        currency: d.currency || 'USD',
        reason: d.reason,
        cycle: d.cycle || 'NEXT',
        appliesToStatementId: d.appliesToStatementId || undefined,
        createdById: req.user.id,
        workflowStatus: 'PENDING_APPROVAL',
      },
    });
    await writeIncentiveAudit({
      organizationId: divisionId,
      divisionId,
      actorId: req.user.id,
      action: 'ADJUSTMENT_CREATE',
      modelType: 'IncentiveAdjustment',
      modelId: adj.id,
      after: d,
    });
    res.status(201).json(adj);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/adjustments/:id/approve', requireFinanceApprover, async (req, res, next) => {
  try {
    const adj = await prisma.incentiveAdjustment.findUnique({ where: { id: req.params.id } });
    if (!adj) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, adj.divisionId);
    if (adj.workflowStatus !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Invalid workflow status' });
    }
    const updated = await prisma.incentiveAdjustment.update({
      where: { id: adj.id },
      data: {
        workflowStatus: 'APPROVED',
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    });
    await writeIncentiveAudit({
      organizationId: adj.organizationId,
      divisionId: adj.divisionId,
      actorId: req.user.id,
      action: 'ADJUSTMENT_APPROVE',
      modelType: 'IncentiveAdjustment',
      modelId: adj.id,
    });
    res.json(updated);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Statements ──────────────────────────────────────────────────
router.post('/statements/generate', requireFinanceApprover, validate(schemas.statementGenerateBody), async (req, res, next) => {
  try {
    const { divisionId, periodStart, periodEnd } = req.validated;
    ensureDivision(req, divisionId);
    const out = await generateStatements({
      organizationId: divisionId,
      divisionId,
      periodStart,
      periodEnd,
      actorId: req.user.id,
    });
    res.json(out);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.get(
  '/statements',
  requireAgent,
  validateQuery(z.object({ divisionId: z.string().uuid(), userId: z.string().uuid().optional() })),
  async (req, res, next) => {
    try {
      const { divisionId, userId } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const where = { organizationId: divisionId, divisionId };
      if (userId && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN' || req.user.role === 'MANAGER')) {
        where.userId = userId;
      } else {
        where.userId = req.user.id;
      }
      const items = await prisma.incentiveStatement.findMany({
        where,
        orderBy: { periodEnd: 'desc' },
        take: 100,
        include: { lines: { take: 5 } },
      });
      res.json({ items });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

router.get('/statements/:id', requireAgent, async (req, res, next) => {
  try {
    const st = await prisma.incentiveStatement.findUnique({
      where: { id: req.params.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } }, disputes: true },
    });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    if (st.userId !== req.user.id && !['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(st);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/statements/:id/approve', requireFinanceApprover, async (req, res, next) => {
  try {
    const st = await prisma.incentiveStatement.findUnique({ where: { id: req.params.id } });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    const updated = await approveStatement(st.id, req.user.id, st.organizationId, st.divisionId);
    res.json(updated);
  } catch (e) {
    const msg = e.message;
    if (msg === 'NOT_FOUND') return res.status(404).json({ error: 'Not found' });
    if (msg === 'INVALID_STATUS') return res.status(400).json({ error: 'Invalid status for approve' });
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/statements/:id/lock', requireFinanceApprover, async (req, res, next) => {
  try {
    const st = await prisma.incentiveStatement.findUnique({ where: { id: req.params.id } });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    const updated = await lockStatement(st.id, req.user.id, st.organizationId, st.divisionId);
    res.json(updated);
  } catch (e) {
    if (e.message === 'MUST_BE_APPROVED') return res.status(400).json({ error: 'Statement must be approved first' });
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

/** Super-admin or incentives.unlockStatement + finance: break glass unlock (audited). */
router.post('/statements/:id/unlock', requireFinanceApprover, validate(z.object({ reason: z.string().min(5).max(2000) })), async (req, res, next) => {
  try {
    if (!isSuperOrAdmin(req) && !incentiveFlags(req).unlockStatement) {
      return res.status(403).json({ error: 'Statement unlock requires super admin or incentives.unlockStatement' });
    }
    const st = await prisma.incentiveStatement.findUnique({ where: { id: req.params.id } });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    if (st.status !== 'LOCKED') return res.status(400).json({ error: 'Only LOCKED statements can be unlocked' });
    const history = Array.isArray(st.statusHistory) ? [...st.statusHistory] : [];
    history.push({ at: new Date().toISOString(), action: 'UNLOCK', actorId: req.user.id, reason: req.validated.reason });
    const updated = await prisma.incentiveStatement.update({
      where: { id: st.id },
      data: {
        status: 'APPROVED',
        lockedAt: null,
        lockedById: null,
        statusHistory: history,
      },
    });
    await prisma.incentiveStatementLine.updateMany({ where: { statementId: st.id }, data: { locked: false } });
    await writeIncentiveAudit({
      organizationId: st.organizationId,
      divisionId: st.divisionId,
      actorId: req.user.id,
      action: 'STATEMENT_UNLOCK',
      modelType: 'IncentiveStatement',
      modelId: st.id,
      reason: req.validated.reason,
      before: { status: 'LOCKED' },
      after: { status: 'APPROVED' },
    });
    res.json(updated);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/statements/:id/pay', requireFinanceApprover, validate(schemas.statementPayBody), async (req, res, next) => {
  try {
    const st = await prisma.incentiveStatement.findUnique({ where: { id: req.params.id } });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    const updated = await payStatement(st.id, req.user.id, st.organizationId, st.divisionId, req.validated.payoutRef);
    await writeIncentiveAudit({
      organizationId: st.organizationId,
      divisionId: st.divisionId,
      actorId: req.user.id,
      action: 'STATEMENT_PAY',
      modelType: 'IncentiveStatement',
      modelId: st.id,
      after: { payoutRef: req.validated.payoutRef },
    });
    res.json(updated);
  } catch (e) {
    if (e.message === 'MUST_BE_LOCKED') return res.status(400).json({ error: 'Statement must be locked before pay' });
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Disputes ────────────────────────────────────────────────────
router.post('/statements/:id/disputes', requireAgent, validate(schemas.disputeCreateBody), async (req, res, next) => {
  try {
    const st = await prisma.incentiveStatement.findUnique({ where: { id: req.params.id } });
    if (!st) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, st.divisionId);
    if (st.userId !== req.user.id) return res.status(403).json({ error: 'Only payee can dispute' });
    const d = await prisma.incentiveDispute.create({
      data: {
        statementId: st.id,
        raisedById: req.user.id,
        reason: req.validated.reason,
      },
    });
    res.status(201).json(d);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.get(
  '/disputes',
  requireIncentiveOps,
  validateQuery(z.object({ divisionId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { divisionId } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const items = await prisma.incentiveDispute.findMany({
        where: { statement: { organizationId: divisionId, divisionId } },
        include: { statement: { select: { id: true, userId: true, periodStart: true, periodEnd: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json({ items });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

// ─── Exceptions ──────────────────────────────────────────────────
router.get(
  '/exceptions',
  requireIncentiveOps,
  validateQuery(z.object({ divisionId: z.string().uuid(), status: z.string().optional() })),
  async (req, res, next) => {
    try {
      const { divisionId, status } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const where = { organizationId: divisionId, divisionId };
      if (status) where.status = status;
      const items = await prisma.incentiveException.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json({ items });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

router.post('/exceptions/:id/resolve', requireIncentiveOps, validate(schemas.exceptionResolveBody), async (req, res, next) => {
  try {
    const ex = await prisma.incentiveException.findUnique({ where: { id: req.params.id } });
    if (!ex) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, ex.divisionId);
    const updated = await prisma.incentiveException.update({
      where: { id: ex.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: req.user.id,
        resolutionNotes: req.validated.resolutionNotes || null,
      },
    });
    res.json(updated);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Plans / rules (admin) ───────────────────────────────────────
router.get(
  '/plans',
  requireIncentiveAdmin,
  validateQuery(z.object({ divisionId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { divisionId } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const plans = await prisma.incentivePlan.findMany({
        where: { organizationId: divisionId, divisionId },
        include: { ruleSets: { include: { versions: { orderBy: { version: 'desc' }, take: 3 } } } },
      });
      res.json({ plans });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

router.post('/plans', requireIncentiveAdmin, validate(schemas.planCreateBody), async (req, res, next) => {
  try {
    const d = req.validated;
    const divisionId = ensureDivision(req, d.divisionId);
    const plan = await prisma.incentivePlan.create({
      data: {
        organizationId: divisionId,
        divisionId,
        name: d.name,
        description: d.description,
        effectiveFrom: d.effectiveFrom ? new Date(d.effectiveFrom) : null,
        effectiveTo: d.effectiveTo ? new Date(d.effectiveTo) : null,
        currency: d.currency || 'USD',
        status: 'DRAFT',
        createdById: req.user.id,
        updatedById: req.user.id,
      },
    });
    res.status(201).json(plan);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.patch('/plans/:id', requireIncentiveAdmin, async (req, res, next) => {
  try {
    const plan = await prisma.incentivePlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, plan.divisionId);
    const { name, description, status, effectiveFrom, effectiveTo, currency } = req.body;
    const updated = await prisma.incentivePlan.update({
      where: { id: plan.id },
      data: {
        ...(name != null && { name }),
        ...(description !== undefined && { description }),
        ...(status != null && { status }),
        ...(effectiveFrom !== undefined && { effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : null }),
        ...(effectiveTo !== undefined && { effectiveTo: effectiveTo ? new Date(effectiveTo) : null }),
        ...(currency != null && { currency }),
        updatedById: req.user.id,
      },
    });
    res.json(updated);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/plans/:planId/rule-sets', requireIncentiveAdmin, validate(schemas.ruleSetCreateBody), async (req, res, next) => {
  try {
    const plan = await prisma.incentivePlan.findUnique({ where: { id: req.params.planId } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    ensureDivision(req, plan.divisionId);
    const rs = await prisma.incentiveRuleSet.create({
      data: {
        planId: plan.id,
        name: req.validated.name,
        description: req.validated.description,
        status: 'DRAFT',
        createdById: req.user.id,
        updatedById: req.user.id,
      },
    });
    res.status(201).json(rs);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/rule-sets/:ruleSetId/versions', requireIncentiveAdmin, validate(schemas.ruleVersionBody), async (req, res, next) => {
  try {
    const rs = await prisma.incentiveRuleSet.findUnique({ where: { id: req.params.ruleSetId } });
    if (!rs) return res.status(404).json({ error: 'Rule set not found' });
    const plan = await prisma.incentivePlan.findUnique({ where: { id: rs.planId } });
    ensureDivision(req, plan.divisionId);
    const d = req.validated;
    const v = await prisma.incentiveRuleVersion.create({
      data: {
        ruleSetId: rs.id,
        version: d.version,
        status: 'DRAFT',
        effectiveFrom: new Date(d.effectiveFrom),
        effectiveTo: d.effectiveTo ? new Date(d.effectiveTo) : null,
        attributionStrategy: d.attributionStrategy || 'last_valid_owner',
        attributionWindowDays: d.attributionWindowDays ?? 90,
        freezeField: d.freezeField,
        earningsConfig: d.earningsConfig,
        customHookKey: d.customHookKey,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
    });
    res.status(201).json(v);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

router.post('/rule-versions/:id/publish', requireIncentiveAdmin, async (req, res, next) => {
  try {
    const v = await prisma.incentiveRuleVersion.findUnique({
      where: { id: req.params.id },
      include: { ruleSet: { include: { plan: true } } },
    });
    if (!v) return res.status(404).json({ error: 'Not found' });
    ensureDivision(req, v.ruleSet.plan.divisionId);
    await prisma.incentiveRuleVersion.updateMany({
      where: { ruleSetId: v.ruleSetId, status: 'PUBLISHED' },
      data: { status: 'SUPERSEDED' },
    });
    const published = await prisma.incentiveRuleVersion.update({
      where: { id: v.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        publishedById: req.user.id,
      },
    });
    res.json(published);
  } catch (e) {
    if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
    next(e);
  }
});

// ─── Audit (read) ────────────────────────────────────────────────
router.get(
  '/audit',
  requireAuditor,
  validateQuery(
    z.object({
      divisionId: z.string().uuid(),
      limit: z.coerce.number().int().min(1).max(500).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const { divisionId, limit = 100 } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const items = await prisma.incentiveAuditLog.findMany({
        where: { organizationId: divisionId, divisionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      res.json({ items });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

// ─── Report builder presets (guided) ─────────────────────────────
router.get('/report-presets', requireAgent, (_req, res) => {
  res.json({
    presets: [
      { id: 'top_earners_month', label: 'Top earners this month', dataset: 'incentive_earnings', hint: 'Group by user, sum amount, filter current month' },
      { id: 'bookings_vs_conversions', label: 'Bookings vs conversions by agent', dataset: 'incentive_events', hint: 'Filter eventType in appointment_booked, conversion_won; pivot by user from attributions' },
      { id: 'revenue_by_division', label: 'Revenue attributed by division', dataset: 'incentive_attributions', hint: 'Join earnings; sum by divisionId' },
      { id: 'commission_trend_mom', label: 'Commission trend MoM', dataset: 'incentive_statements', hint: 'Group by month of periodEnd, sum totalAmount' },
      { id: 'clawback_impact', label: 'Clawback impact', dataset: 'incentive_adjustments', hint: 'Filter type clawback variants; sum amount' },
      { id: 'disputes_aging', label: 'Pending disputes aging', dataset: 'incentive_disputes', hint: 'status OPEN, bucket by age' },
    ],
  });
});

// ─── Agent dashboard summary ─────────────────────────────────────
router.get(
  '/me/summary',
  requireAgent,
  validateQuery(z.object({ divisionId: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { divisionId } = req.validatedQuery;
      ensureDivision(req, divisionId);
      const [pendingEarnings, statements, openDisputes] = await Promise.all([
        prisma.incentiveEarning.aggregate({
          where: { organizationId: divisionId, divisionId, userId: req.user.id, status: 'POSTED' },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.incentiveStatement.findMany({
          where: { organizationId: divisionId, divisionId, userId: req.user.id },
          orderBy: { periodEnd: 'desc' },
          take: 6,
          select: { id: true, status: true, totalAmount: true, periodStart: true, periodEnd: true, currency: true },
        }),
        prisma.incentiveDispute.count({
          where: { raisedById: req.user.id, status: 'OPEN', statement: { divisionId } },
        }),
      ]);
      res.json({
        postedEarningsSum: pendingEarnings._sum.amount || 0,
        postedEarningsCount: pendingEarnings._count,
        recentStatements: statements,
        openDisputes,
      });
    } catch (e) {
      if (e.status === 403) return res.status(403).json({ error: 'Division not allowed' });
      next(e);
    }
  }
);

module.exports = router;
