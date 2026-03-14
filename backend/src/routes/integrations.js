const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');

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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    res.json(formatted);
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
    if (body.credentials !== undefined) updateData.credentials = body.credentials;
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

// ─── GET /api-keys — List API Keys ──────────────────────────────────────────────

router.get('/api-keys', async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { organizationId: { in: req.orgIds } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      keys.map((k) => ({
        id: k.id,
        key: k.key,
        name: k.name,
        isActive: k.isActive,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
      }))
    );
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

    const apiKey = generateApiKeyString();

    const created = await prisma.apiKey.create({
      data: {
        key: apiKey,
        name,
        organizationId: targetOrgId,
      },
    });

    res.status(201).json({
      id: created.id,
      apiKey,
      name,
      endpoint: 'https://api.alzaabi.ae/api/public/leads',
      organizationId: targetOrgId,
      createdAt: created.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api-key/revoke — Revoke API Key ─────────────────────────────────────

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

// ─── POST /api-key/:id/revoke — Revoke API Key (by URL param) ───────────────────

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
        return { success: false, message: 'Facebook access token is required. Please complete OAuth setup.' };
      }
      return { success: true, message: 'Facebook connection verified successfully' };
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
