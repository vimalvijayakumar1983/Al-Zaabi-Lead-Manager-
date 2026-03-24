const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { getFieldCatalog, runReportPreview } = require('../services/reportBuilderEngine');

const router = Router();
router.use(authenticate, orgScope);

const datasetEnum = z.enum(['leads', 'tasks', 'call_logs', 'contacts', 'deals', 'campaigns', 'campaign_assignments', 'lead_activities', 'pipelines']);
const visibilityEnum = z.enum(['everyone', 'private', 'specific_users', 'specific_roles']);

const reportFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.any().optional(),
  valueTo: z.any().optional(),
});

const reportMeasureSchema = z.object({
  key: z.string().optional(),
  agg: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']),
  field: z.string().optional(),
  label: z.string().optional(),
});

const calculatedFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().optional(),
  formula: z.string().min(1),
  scope: z.enum(['row', 'aggregate']).optional(),
});

const reportConfigSchema = z.object({
  dimensions: z.array(z.string()).optional(),
  measures: z.array(reportMeasureSchema).optional(),
  filters: z.array(reportFilterSchema).optional(),
  calculatedFields: z.array(calculatedFieldSchema).optional(),
  timeGrain: z.enum(['day', 'week', 'month', 'quarter']).optional(),
  visualization: z.enum(['table', 'bar', 'line', 'pie', 'kpi', 'pivot', 'funnel', 'cohort']).optional(),
  mode: z.enum(['latest', 'any']).optional(),
  sort: z.object({
    field: z.string(),
    direction: z.enum(['asc', 'desc']).optional(),
  }).optional(),
  rawSort: z.object({
    field: z.enum(['createdAt', 'updatedAt', 'dueAt', 'closeDate', 'lastContactedAt', 'startDate', 'endDate', 'order', 'assignedAt', 'expiresAt', 'discussedAt', 'redeemedAt']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
  }).optional(),
  options: z.record(z.any()).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  rawLimit: z.coerce.number().int().min(100).max(5000).optional(),
}).default({});

const listQuerySchema = z.object({
  divisionId: z.string().uuid().optional(),
  dataset: datasetEnum.optional(),
});

const createDefinitionSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(600).optional().nullable(),
  dataset: datasetEnum,
  config: reportConfigSchema,
  visibility: visibilityEnum.optional(),
  visibleToUsers: z.array(z.string()).optional(),
  visibleToRoles: z.array(z.string()).optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

const updateDefinitionSchema = createDefinitionSchema.partial();

const previewSchema = z.object({
  dataset: datasetEnum,
  config: reportConfigSchema,
  divisionId: z.string().uuid().optional().nullable(),
});

function canManageReport(report, req) {
  if (!report) return false;
  if (report.createdById === req.user.id) return true;
  return req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';
}

function buildVisibilityWhere(req) {
  return {
    OR: [
      { visibility: 'everyone' },
      { createdById: req.user.id },
      { visibility: 'specific_users', visibleToUsers: { has: req.user.id } },
      { visibility: 'specific_roles', visibleToRoles: { has: req.user.role } },
    ],
  };
}

router.get('/catalog', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const { divisionId, dataset = 'leads' } = req.validatedQuery;
    const fields = await getFieldCatalog(req, dataset, divisionId || null);
    res.json({
      dataset,
      fields,
      supportedVisualizations: ['table', 'bar', 'line', 'pie', 'kpi', 'pivot', 'funnel', 'cohort'],
      supportedOperators: ['eq', 'neq', 'contains', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'is_null', 'is_not_null'],
      supportedAggregations: ['count', 'count_distinct', 'sum', 'avg', 'min', 'max'],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/definitions', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const { divisionId, dataset } = req.validatedQuery;
    const where = {
      organizationId: req.user.organizationId,
      ...(divisionId ? { OR: [{ divisionId }, { divisionId: null }] } : {}),
      ...(dataset ? { dataset } : {}),
      AND: [buildVisibilityWhere(req)],
    };

    const definitions = await prisma.reportDefinition.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    res.json(definitions);
  } catch (err) {
    next(err);
  }
});

router.post('/definitions', validate(createDefinitionSchema), async (req, res, next) => {
  try {
    const payload = req.validated;
    const created = await prisma.reportDefinition.create({
      data: {
        name: payload.name.trim(),
        description: payload.description || null,
        dataset: payload.dataset,
        config: payload.config || {},
        visibility: payload.visibility || 'everyone',
        visibleToUsers: payload.visibleToUsers || [],
        visibleToRoles: payload.visibleToRoles || [],
        organizationId: req.user.organizationId,
        divisionId: payload.divisionId || null,
        createdById: req.user.id,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/definitions/:id', validate(updateDefinitionSchema), async (req, res, next) => {
  try {
    const existing = await prisma.reportDefinition.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.organizationId !== req.user.organizationId) {
      return res.status(404).json({ error: 'Report definition not found' });
    }
    if (!canManageReport(existing, req)) {
      return res.status(403).json({ error: 'Only creator or admin can edit this report' });
    }

    const payload = req.validated;
    const updated = await prisma.reportDefinition.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined ? { description: payload.description || null } : {}),
        ...(payload.dataset !== undefined ? { dataset: payload.dataset } : {}),
        ...(payload.config !== undefined ? { config: payload.config || {} } : {}),
        ...(payload.visibility !== undefined ? { visibility: payload.visibility } : {}),
        ...(payload.visibleToUsers !== undefined ? { visibleToUsers: payload.visibleToUsers } : {}),
        ...(payload.visibleToRoles !== undefined ? { visibleToRoles: payload.visibleToRoles } : {}),
        ...(payload.divisionId !== undefined ? { divisionId: payload.divisionId || null } : {}),
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/definitions/:id', async (req, res, next) => {
  try {
    const existing = await prisma.reportDefinition.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.organizationId !== req.user.organizationId) {
      return res.status(404).json({ error: 'Report definition not found' });
    }
    if (!canManageReport(existing, req)) {
      return res.status(403).json({ error: 'Only creator or admin can delete this report' });
    }
    await prisma.reportDefinition.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/preview', validate(previewSchema), async (req, res, next) => {
  try {
    const result = await runReportPreview(req, req.validated);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/run/:id', async (req, res, next) => {
  try {
    const report = await prisma.reportDefinition.findUnique({ where: { id: req.params.id } });
    if (!report || report.organizationId !== req.user.organizationId) {
      return res.status(404).json({ error: 'Report definition not found' });
    }
    const canAccess = report.visibility === 'everyone'
      || report.createdById === req.user.id
      || (report.visibility === 'specific_users' && report.visibleToUsers.includes(req.user.id))
      || (report.visibility === 'specific_roles' && report.visibleToRoles.includes(req.user.role))
      || req.user.role === 'ADMIN'
      || req.user.role === 'SUPER_ADMIN';
    if (!canAccess) {
      return res.status(403).json({ error: 'You do not have access to this report' });
    }

    const payload = {
      dataset: report.dataset,
      config: report.config || {},
      divisionId: report.divisionId || null,
    };
    const result = await runReportPreview(req, payload);
    res.json({
      report: {
        id: report.id,
        name: report.name,
        description: report.description,
        dataset: report.dataset,
      },
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
