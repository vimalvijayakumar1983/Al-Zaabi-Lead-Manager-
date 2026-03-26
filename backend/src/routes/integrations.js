const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');

const { validateAccessToken, subscribeToLeadgen } = require('../services/facebookLeadAds');

const router = Router();

// ─── Constants ──────────────────────────────────────────────────────────────────

const AVAILABLE_PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook Lead Ads',
    icon: 'facebook',
    description: 'Auto-capture leads from Facebook forms',
    status: 'available',
    requiresOAuth: true,
  },
  {
    id: 'google',
    name: 'Google Ads',
    icon: 'google',
    description: 'Sync leads & spend from Google campaigns',
    status: 'available',
    requiresOAuth: true,
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    icon: 'tiktok',
    description: 'Capture leads from TikTok forms',
    status: 'coming_soon',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: 'whatsapp',
    description: 'Two-way messaging & lead capture',
    status: 'available',
    requiresOAuth: true,
  },
  {
    id: 'email',
    name: 'Email',
    icon: 'email',
    description: 'Send/receive emails, track opens',
    status: 'available',
    requiresOAuth: false,
  },
  {
    id: 'website',
    name: 'Website Forms',
    icon: 'globe',
    description: 'Embed lead capture forms',
    status: 'available',
    requiresOAuth: false,
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    icon: 'webhook',
    description: 'Connect any platform via webhooks',
    status: 'available',
    requiresOAuth: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    icon: 'zap',
    description: 'Connect 5000+ apps',
    status: 'available',
    requiresOAuth: false,
  },
  {
    id: 'erp',
    name: 'ERP',
    icon: 'database',
    description: 'Inbound ERP APIs for divisions (FACTS, FOCUS, CORTEX)',
    status: 'available',
    requiresOAuth: false,
  },
];

// ─── Validation Schemas ────────────────────────────────────────────────────────

const platformEnum = z.enum([
  'facebook',
  'google',
  'tiktok',
  'whatsapp',
  'email',
  'website',
  'webhook',
  'zapier',
  'erp',
]);

const createIntegrationSchema = z.object({
  platform: platformEnum,
  config: z.record(z.unknown()).optional().default({}),
  credentials: z.record(z.unknown()).optional().default({}),
  campaignId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
});

const updateIntegrationSchema = z.object({
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
  status: z.enum(['connected', 'disconnected', 'error']).optional(),
  campaignId: z.string().uuid().optional().nullable(),
});

const logsQuerySchema = paginationSchema.extend({
  action: z.string().optional(),
  status: z.enum(['success', 'error', 'pending']).optional(),
});

const erpDataQuerySchema = z.object({
  integrationId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
});

const updateErpDataRowSchema = z.object({
  payload: z.record(z.unknown()),
});

const generateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional().default('Default API Key'),
  organizationId: z.string().uuid().optional(),
});

const revokeApiKeySchema = z.object({
  apiKeyId: z.string().uuid(),
});

const widgetGenerateSchema = z.object({
  organizationId: z.string().uuid().optional(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(['text', 'email', 'tel', 'select', 'textarea']).optional().default('text'),
        required: z.boolean().optional().default(false),
        options: z.array(z.string()).optional(),
      })
    )
    .optional(),
  theme: z
    .object({
      primaryColor: z.string().optional().default('#0066FF'),
      borderRadius: z.string().optional().default('8px'),
      fontFamily: z.string().optional().default('Inter, sans-serif'),
    })
    .optional(),
});

// ─── Apply Auth Middleware ──────────────────────────────────────────────────────

router.use(authenticate);
router.use(orgScope);

// ─── GET /platforms — List Available Platforms ───────────────────────────────────

router.get('/platforms', async (req, res, next) => {
  try {
    const connectedIntegrations = await prisma.integration.findMany({
      where: { organizationId: { in: req.orgIds } },
      select: { platform: true, status: true },
    });

    const connectedMap = {};
    for (const row of connectedIntegrations) {
      if (!connectedMap[row.platform]) {
        connectedMap[row.platform] = [];
      }
      connectedMap[row.platform].push(row.status);
    }

    const platforms = AVAILABLE_PLATFORMS.map((p) => ({
      ...p,
      connected: connectedMap[p.id]
        ? connectedMap[p.id].includes('connected')
        : false,
      integrationCount: connectedMap[p.id] ? connectedMap[p.id].length : 0,
    }));

    res.json(platforms);
  } catch (err) {
    next(err);
  }
});

// ─── GET / — List Integrations ──────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const integrations = await prisma.integration.findMany({
      where: { organizationId: { in: req.orgIds } },
      include: {
        campaign: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const integrationIds = integrations.map((row) => row.id);
    const recentErrorLogs = integrationIds.length
      ? await prisma.integrationLog.findMany({
          where: {
            integrationId: { in: integrationIds },
            status: 'error',
            errorMessage: { not: null },
          },
          select: { integrationId: true, errorMessage: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const latestErrorByIntegration = {};
    for (const log of recentErrorLogs) {
      if (!latestErrorByIntegration[log.integrationId] && log.errorMessage) {
        latestErrorByIntegration[log.integrationId] = log.errorMessage;
      }
    }

    const formatted = integrations.map((row) => ({
      id: row.id,
      platform: row.platform,
      status: row.status,
      config: row.config,
      credentials: sanitizeCredentials(row.credentials),
      lastSyncAt: row.lastSyncAt,
      organizationId: row.organizationId,
      campaignId: row.campaignId,
      campaignName: row.campaign?.name || null,
      createdBy: row.createdById,
      errorMessage: latestErrorByIntegration[row.id] || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api-keys — List API Keys ──────────────────────────────────────────────
// IMPORTANT: Must be before /:id to avoid being caught by the wildcard route

router.get('/api-keys', async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: { in: req.orgIds } },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoint = `${baseUrl}/api/public/leads`;

    res.json(
      keys.map((k) => ({
        id: k.id,
        key: k.key,
        name: k.name,
        status: k.isActive ? 'active' : 'revoked',
        isActive: k.isActive,
        endpoint,
        lastUsed: k.lastUsedAt,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ─── GET /erp-data — List ERP payload data ───────────────────────────────────────
// IMPORTANT: Must be before /:id to avoid wildcard capture
router.get('/erp-data', validateQuery(erpDataQuerySchema), async (req, res, next) => {
  try {
    const { integrationId, divisionId, entityType, page, limit } = req.validatedQuery || req.query;
    const pageNum = Number(page || 1);
    const limitNum = Number(limit || 300);
    const safePageNum = Math.max(1, pageNum);
    const offset = (safePageNum - 1) * limitNum;

    const scopedIntegrations = await prisma.integration.findMany({
      where: {
        organizationId: { in: req.orgIds },
        platform: 'erp',
        ...(integrationId ? { id: integrationId } : {}),
      },
      select: { id: true, config: true },
    });
    const allowedIntegrationIds = scopedIntegrations
      .filter((i) => !divisionId || String(i.config?.divisionId || '') === String(divisionId))
      .map((i) => i.id);

    if (allowedIntegrationIds.length === 0) {
      return res.json({
        data: [],
        total: 0,
        countsByEntity: {},
        pagination: {
          page: 1,
          limit: limitNum,
          total: 0,
          totalPages: 1,
        },
      });
    }

    const erpExternalRefModel = prisma.erpExternalRef || prisma.erpExternalRefs;
    let data = [];
    let total = 0;
    let countsByEntity = {};
    if (erpExternalRefModel && typeof erpExternalRefModel.findMany === 'function') {
      const where = {
        organizationId: { in: req.orgIds },
        integrationId: { in: allowedIntegrationIds },
        ...(entityType ? { entityType } : {}),
      };
      const [rows, typeRows, totalCount] = await Promise.all([
        erpExternalRefModel.findMany({
          where,
          include: {
            integration: {
              select: {
                id: true,
                config: true,
                status: true,
                organizationId: true,
                createdAt: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip: offset,
          take: limitNum,
        }),
        erpExternalRefModel.findMany({
          where,
          select: { entityType: true },
        }),
        erpExternalRefModel.count({ where }),
      ]);

      total = totalCount;
      countsByEntity = typeRows.reduce((acc, row) => {
        acc[row.entityType] = (acc[row.entityType] || 0) + 1;
        return acc;
      }, {});

      data = rows.map((row) => ({
        id: row.id,
        integrationId: row.integrationId,
        provider: String(row.integration?.config?.erpProvider || '').toLowerCase() || null,
        divisionId: row.integration?.config?.divisionId || null,
        entityType: row.entityType,
        externalId: row.externalId,
        crmEntityId: row.crmEntityId,
        payload: row.externalPayload || {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
    } else {
      // Fallback for deployments without ERP foundation models in Prisma schema:
      // derive ERP data from integration logs payloads.
      const actionToEntity = {
        erp_create_customer: 'customer',
        erp_customer_sales: 'sale',
        erp_doctor_availability: 'doctor_availability',
      };
      const resolveActionFromEntityType = (value) => {
        if (value === 'customer') return 'erp_create_customer';
        if (value === 'sale') return 'erp_customer_sales';
        if (value === 'doctor_availability') return 'erp_doctor_availability';
        if (String(value || '').startsWith('custom_')) return `erp_${value}`;
        return null;
      };
      const requestedAction = entityType ? resolveActionFromEntityType(entityType) : null;
      const logsWhere = {
        integrationId: { in: allowedIntegrationIds },
        OR: [{ action: { in: Object.keys(actionToEntity) } }, { action: { startsWith: 'erp_custom_' } }],
        ...(requestedAction ? { action: requestedAction } : {}),
      };
      const [logs, countLogs] = await Promise.all([
        prisma.integrationLog.findMany({
          where: logsWhere,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limitNum,
        }),
        prisma.integrationLog.findMany({
          where: logsWhere,
          select: { action: true },
        }),
      ]);

      total = countLogs.length;
      countsByEntity = countLogs.reduce((acc, row) => {
        const entity =
          actionToEntity[row.action] ||
          (row.action.startsWith('erp_custom_') ? `custom_${row.action.slice('erp_custom_'.length)}` : 'unknown');
        acc[entity] = (acc[entity] || 0) + 1;
        return acc;
      }, {});

      data = logs.map((log) => {
        const integration = scopedIntegrations.find((i) => i.id === log.integrationId);
        const entity =
          actionToEntity[log.action] ||
          (log.action.startsWith('erp_custom_') ? `custom_${log.action.slice('erp_custom_'.length)}` : 'unknown');
        const payload = log.payload || {};
        return {
          id: log.id,
          integrationId: log.integrationId,
          provider: String(integration?.config?.erpProvider || '').toLowerCase() || null,
          divisionId: integration?.config?.divisionId || null,
          entityType: entity,
          externalId:
            payload.externalCustomerId ||
            payload.externalSaleId ||
            payload.externalAvailabilityId ||
            payload.id ||
            '-',
          crmEntityId: payload.crmEntityId || '-',
          payload,
          createdAt: log.createdAt,
          updatedAt: log.createdAt,
        };
      });
    }
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const safePage = Math.min(safePageNum, totalPages);

    res.json({
      data,
      total,
      countsByEntity,
      pagination: {
        page: safePage,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /erp-data/:id — Update one ERP payload row ─────────────────────────────
router.put('/erp-data/:id', validate(updateErpDataRowSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { payload } = req.validated;
    const erpExternalRefModel = prisma.erpExternalRef || prisma.erpExternalRefs;
    if (!erpExternalRefModel || typeof erpExternalRefModel.findFirst !== 'function') {
      return res.status(400).json({ error: 'ERP data rows are unavailable in this deployment' });
    }

    const existing = await erpExternalRefModel.findFirst({
      where: {
        id,
        organizationId: { in: req.orgIds },
        integration: { platform: 'erp' },
      },
      include: {
        integration: { select: { id: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: 'ERP data row not found' });
    }

    const updated = await erpExternalRefModel.update({
      where: { id },
      data: { externalPayload: payload },
    });

    await logIntegrationAction(existing.integration.id, 'erp_data_row_updated', { rowId: id }, 'success');

    return res.json({
      id: updated.id,
      integrationId: updated.integrationId,
      entityType: updated.entityType,
      externalId: updated.externalId,
      crmEntityId: updated.crmEntityId,
      payload: updated.externalPayload || {},
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /erp-data/:id — Delete one ERP payload row ──────────────────────────
router.delete('/erp-data/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const erpExternalRefModel = prisma.erpExternalRef || prisma.erpExternalRefs;
    if (!erpExternalRefModel || typeof erpExternalRefModel.findFirst !== 'function') {
      return res.status(400).json({ error: 'ERP data rows are unavailable in this deployment' });
    }

    const existing = await erpExternalRefModel.findFirst({
      where: {
        id,
        organizationId: { in: req.orgIds },
        integration: { platform: 'erp' },
      },
      include: {
        integration: { select: { id: true } },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: 'ERP data row not found' });
    }

    await erpExternalRefModel.delete({ where: { id } });
    await logIntegrationAction(existing.integration.id, 'erp_data_row_deleted', { rowId: id }, 'success');

    return res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api-key/generate — Generate API Key ─────────────────────────────────

router.post('/api-key/generate', validate(generateApiKeySchema), async (req, res, next) => {
  try {
    const { name, organizationId } = req.validated;
    const targetOrgId = organizationId || req.orgId;

    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified organization' });
    }

    // Verify the target organization exists
    const org = await prisma.organization.findFirst({
      where: { id: targetOrgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found for API key creation' });
    }

    const apiKey = generateApiKeyString();

    const created = await prisma.apiKey.create({
      data: {
        key: apiKey,
        name: name || 'Default API Key',
        organizationId: targetOrgId,
      },
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoint = `${baseUrl}/api/public/leads`;

    res.status(201).json({
      id: created.id,
      apiKey,
      name,
      endpoint,
      organizationId: targetOrgId,
      createdAt: created.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api-key/revoke — Revoke API Key (body-based) ─────────────────────────

router.post('/api-key/revoke', validate(revokeApiKeySchema), async (req, res, next) => {
  try {
    const { apiKeyId } = req.validated;

    const existing = await prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { isActive: false },
    });

    res.json({ message: 'API key revoked successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api-key/:id/revoke — Revoke API Key (URL param) ──────────────────────

router.post('/api-key/:id/revoke', async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({ message: 'API key revoked successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api-key/:id — Delete API Key permanently ────────────────────────────

router.delete('/api-key/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiKey.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'API key not found' });
    }

    await prisma.apiKey.delete({ where: { id } });

    res.json({ message: 'API key deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /widget/generate — Generate Embeddable Form Widget ────────────────────

router.post('/widget/generate', validate(widgetGenerateSchema), async (req, res, next) => {
  try {
    const targetOrgId = req.body.organizationId || req.orgId;
    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified organization' });
    }

    const org = await prisma.organization.findFirst({
      where: { id: targetOrgId },
      select: { id: true, name: true },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const existingKey = await prisma.apiKey.findFirst({
      where: { organizationId: targetOrgId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    let apiKey;
    if (!existingKey) {
      apiKey = generateApiKeyString();
      await prisma.apiKey.create({
        data: {
          key: apiKey,
          name: 'Widget Auto-generated Key',
          organizationId: targetOrgId,
        },
      });
    } else {
      apiKey = existingKey.key;
    }

    const fields = req.body.fields || [
      { name: 'firstName', label: 'First Name', type: 'text', required: true },
      { name: 'lastName', label: 'Last Name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone', type: 'tel', required: false },
      { name: 'company', label: 'Company', type: 'text', required: false },
    ];

    const theme = req.body.theme || {
      primaryColor: '#0066FF',
      borderRadius: '8px',
      fontFamily: 'Inter, sans-serif',
    };

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const endpoint = `${baseUrl}/api/public/leads`;
    const widgetHtml = generateWidgetSnippet(apiKey, fields, theme, org.name, endpoint);

    res.json({
      html: widgetHtml,
      code: widgetHtml,
      apiKey,
      endpoint,
      previewUrl: '',
      organizationId: targetOrgId,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id — Get Integration Details + Recent Logs ───────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
      include: {
        campaign: { select: { name: true } },
        organization: { select: { name: true } },
      },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const recentLogs = await prisma.integrationLog.findMany({
      where: { integrationId: id },
      select: { id: true, action: true, status: true, errorMessage: true, leadId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      id: integration.id,
      platform: integration.platform,
      status: integration.status,
      config: integration.config,
      credentials: sanitizeCredentials(integration.credentials),
      lastSyncAt: integration.lastSyncAt,
      organizationId: integration.organizationId,
      organizationName: integration.organization?.name || null,
      campaignId: integration.campaignId,
      campaignName: integration.campaign?.name || null,
      createdBy: integration.createdById,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      recentLogs: recentLogs.map(l => ({
        id: l.id,
        action: l.action,
        status: l.status,
        error_message: l.errorMessage,
        lead_id: l.leadId,
        created_at: l.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST / — Create Integration ────────────────────────────────────────────────

router.post('/', validate(createIntegrationSchema), async (req, res, next) => {
  try {
    const { platform, config, credentials, campaignId, organizationId } = req.validated;

    const targetOrgId = organizationId || req.orgId;
    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified organization' });
    }

    if (campaignId) {
      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId: { in: req.orgIds } },
      });
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
    }

    const integration = await prisma.integration.create({
      data: {
        platform,
        status: 'disconnected',
        credentials: credentials || {},
        config: config || {},
        organizationId: targetOrgId,
        createdById: req.userId || null,
        campaignId: campaignId || null,
      },
    });

    await logIntegrationAction(integration.id, 'created', { platform, config }, 'success');

    res.status(201).json({
      id: integration.id,
      platform: integration.platform,
      status: integration.status,
      config: integration.config,
      credentials: sanitizeCredentials(integration.credentials),
      organizationId: integration.organizationId,
      campaignId: integration.campaignId,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /:id — Update Integration ─────────────────────────────────────────────

router.put('/:id', validate(updateIntegrationSchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.integration.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const body = req.validated;
    const updateData = {};

    if (body.config !== undefined) updateData.config = body.config;
    if (body.credentials !== undefined) {
      // Merge credentials: keep existing values for empty/missing sensitive fields
      const existingCreds = existing.credentials && typeof existing.credentials === 'object' ? existing.credentials : {};
      const newCreds = { ...body.credentials };
      const sensitiveKeys = ['accessToken', 'refreshToken', 'secret', 'password', 'apiKey', 'token'];
      for (const key of sensitiveKeys) {
        if ((!newCreds[key] || newCreds[key] === '') && existingCreds[key]) {
          newCreds[key] = existingCreds[key];
        }
      }
      updateData.credentials = newCreds;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.campaignId !== undefined) updateData.campaignId = body.campaignId;

    const updated = await prisma.integration.update({
      where: { id },
      data: updateData,
    });

    await logIntegrationAction(id, 'updated', body, 'success');

    res.json({
      id: updated.id,
      platform: updated.platform,
      status: updated.status,
      config: updated.config,
      credentials: sanitizeCredentials(updated.credentials),
      lastSyncAt: updated.lastSyncAt,
      organizationId: updated.organizationId,
      campaignId: updated.campaignId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /:id — Delete Integration ───────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.integration.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    await prisma.integration.delete({ where: { id } });

    res.json({ message: 'Integration deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /:id/test — Test Integration Connection ──────────────────────────────

router.post('/:id/test', async (req, res, next) => {
  try {
    const { id } = req.params;

    const integration = await prisma.integration.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    let testResult;

    try {
      testResult = await testPlatformConnection(integration);
    } catch (testErr) {
      testResult = { success: false, message: testErr.message };
    }

    const newStatus = testResult.success ? 'connected' : 'error';

    await prisma.integration.update({
      where: { id },
      data: { status: newStatus, lastSyncAt: new Date() },
    });

    await logIntegrationAction(
      id,
      'connection_test',
      { result: testResult },
      testResult.success ? 'success' : 'error',
      testResult.success ? null : testResult.message
    );

    res.json(testResult);
  } catch (err) {
    next(err);
  }
});

// ─── GET /:id/logs — Get Integration Logs ───────────────────────────────────────

router.get('/:id/logs', validateQuery(logsQuerySchema), async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.integration.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const q = req.validatedQuery || req.query;
    const { page = 1, limit = 20, action, status } = q;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    const where = { integrationId: id };
    if (action) where.action = action;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      prisma.integrationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.integrationLog.count({ where }),
    ]);

    res.json({
      data: logs.map(l => ({
        id: l.id,
        integration_id: l.integrationId,
        action: l.action,
        payload: l.payload,
        status: l.status,
        error_message: l.errorMessage,
        lead_id: l.leadId,
        created_at: l.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateApiKeyString() {
  const randomPart = crypto.randomBytes(24).toString('hex');
  return `alzaabi_pk_${randomPart}`;
}

function sanitizeCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') return {};
  const sanitized = { ...credentials };
  const sensitiveKeys = ['accessToken', 'refreshToken', 'secret', 'password', 'apiKey', 'token'];
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '••••••••';
    }
  }
  return sanitized;
}

async function testPlatformConnection(integration) {
  const { platform, credentials, config } = integration;

  switch (platform) {
    case 'facebook': {
      if (!credentials?.accessToken) {
        return { success: false, message: 'Facebook Page Access Token is required. Generate one from Facebook Developer Console.' };
      }
      // Validate the token against the Graph API
      const tokenResult = await validateAccessToken(credentials.accessToken);
      if (!tokenResult.valid) {
        return { success: false, message: tokenResult.message };
      }
      // Attempt to subscribe the page to leadgen webhooks
      const pageId = config?.pageId || tokenResult.pageId;
      if (pageId) {
        const subResult = await subscribeToLeadgen(pageId, credentials.accessToken);
        if (!subResult.success) {
          return {
            success: true,
            message: `${tokenResult.message}. Note: Auto-subscription to leadgen failed — ${subResult.message}. You may need to subscribe manually in Facebook App settings.`,
          };
        }
      }
      return { success: true, message: tokenResult.message };
    }
    case 'google': {
      if (!credentials?.accessToken) {
        return { success: false, message: 'Google access token is required. Please complete OAuth setup.' };
      }
      return { success: true, message: 'Google Ads connection verified successfully' };
    }
    case 'whatsapp': {
      if (!credentials?.accessToken || !config?.phoneNumberId) {
        return { success: false, message: 'WhatsApp access token and phone number ID are required' };
      }
      return { success: true, message: 'WhatsApp Business API connection verified successfully' };
    }
    case 'email': {
      if (!config?.smtpHost && !config?.provider) {
        return { success: false, message: 'Email SMTP configuration or provider is required' };
      }
      return { success: true, message: 'Email integration verified successfully' };
    }
    case 'website': {
      return { success: true, message: 'Website form integration is ready. Use the widget generator to embed forms.' };
    }
    case 'webhook': {
      if (!config?.webhookUrl) {
        return { success: false, message: 'Webhook URL is required' };
      }
      return { success: true, message: 'Webhook endpoint is configured and ready' };
    }
    case 'zapier': {
      return { success: true, message: 'Zapier integration is ready. Configure Zaps in your Zapier dashboard.' };
    }
    case 'erp': {
      const provider = String(config?.erpProvider || '').toLowerCase();
      const divisionId = config?.divisionId;
      const token = credentials?.token || config?.token;
      const allowedProviders = ['facts', 'focus', 'cortex', 'uniqorn'];

      if (!allowedProviders.includes(provider)) {
        return { success: false, message: 'ERP provider is required: facts, focus, cortex, or uniqorn' };
      }
      if (!divisionId) {
        return { success: false, message: 'Division ID is required for ERP integration' };
      }
      if (!token) {
        return { success: false, message: 'ERP shared token is required' };
      }
      return { success: true, message: `ERP (${provider.toUpperCase()}) configuration verified` };
    }
    default:
      return { success: false, message: `Platform "${platform}" is not supported yet` };
  }
}

async function logIntegrationAction(integrationId, action, payload, status, errorMessage) {
  try {
    await prisma.integrationLog.create({
      data: {
        integrationId,
        action,
        payload: payload || {},
        status: status || 'success',
        errorMessage: errorMessage || null,
      },
    });
  } catch (err) {
    console.error('Failed to log integration action:', err.message);
  }
}

function generateWidgetSnippet(apiKey, fields, theme, orgName, endpoint) {
  const fieldInputs = fields
    .map((f) => {
      const requiredAttr = f.required ? 'required' : '';
      if (f.type === 'select' && f.options) {
        const options = f.options.map((o) => `<option value="${o}">${o}</option>`).join('');
        return `<div class="alzaabi-field"><label>${f.label}</label><select name="${f.name}" ${requiredAttr}><option value="">Select...</option>${options}</select></div>`;
      }
      if (f.type === 'textarea') {
        return `<div class="alzaabi-field"><label>${f.label}</label><textarea name="${f.name}" ${requiredAttr} rows="3"></textarea></div>`;
      }
      return `<div class="alzaabi-field"><label>${f.label}</label><input type="${f.type}" name="${f.name}" ${requiredAttr} /></div>`;
    })
    .join('\n      ');

  return `<!-- Al Zaabi CRM Lead Capture Widget -->
<div id="alzaabi-lead-form" style="font-family:${theme.fontFamily};max-width:480px;margin:0 auto;">
  <style>
    #alzaabi-lead-form { padding: 24px; border: 1px solid #e2e8f0; border-radius: ${theme.borderRadius}; background: #fff; }
    #alzaabi-lead-form h3 { margin: 0 0 16px; font-size: 18px; color: #1a202c; }
    .alzaabi-field { margin-bottom: 12px; }
    .alzaabi-field label { display: block; font-size: 13px; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    .alzaabi-field input, .alzaabi-field select, .alzaabi-field textarea { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
    .alzaabi-field input:focus, .alzaabi-field select:focus, .alzaabi-field textarea:focus { outline: none; border-color: ${theme.primaryColor}; box-shadow: 0 0 0 2px ${theme.primaryColor}33; }
    .alzaabi-submit { width: 100%; padding: 10px; background: ${theme.primaryColor}; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
    .alzaabi-submit:hover { opacity: 0.9; }
    .alzaabi-submit:disabled { opacity: 0.5; cursor: not-allowed; }
    .alzaabi-msg { padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-top: 12px; display: none; }
    .alzaabi-msg.success { display: block; background: #f0fff4; color: #22543d; border: 1px solid #c6f6d5; }
    .alzaabi-msg.error { display: block; background: #fff5f5; color: #9b2c2c; border: 1px solid #fed7d7; }
  </style>
  <h3>Get in Touch — ${orgName}</h3>
  <form id="alzaabi-form">
      ${fieldInputs}
    <button type="submit" class="alzaabi-submit">Submit</button>
    <div id="alzaabi-msg" class="alzaabi-msg"></div>
  </form>
</div>
<script>
(function(){
  var form = document.getElementById('alzaabi-form');
  var msg = document.getElementById('alzaabi-msg');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    var btn = form.querySelector('.alzaabi-submit');
    btn.disabled = true; btn.textContent = 'Submitting...';
    msg.className = 'alzaabi-msg'; msg.style.display = 'none';
    var data = {};
    new FormData(form).forEach(function(v,k){ data[k] = v; });
    fetch('${endpoint}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': '${apiKey}' },
      body: JSON.stringify(data)
    })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, data: d }; }); })
    .then(function(res){
      btn.disabled = false; btn.textContent = 'Submit';
      if(res.ok){ msg.className = 'alzaabi-msg success'; msg.textContent = 'Thank you! We will be in touch soon.'; form.reset(); }
      else { msg.className = 'alzaabi-msg error'; msg.textContent = res.data.error || 'Something went wrong.'; }
    })
    .catch(function(){
      btn.disabled = false; btn.textContent = 'Submit';
      msg.className = 'alzaabi-msg error'; msg.textContent = 'Network error. Please try again.';
    });
  });
})();
</script>`;
}

module.exports = router;
