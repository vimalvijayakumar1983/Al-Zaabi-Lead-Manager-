const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');

const router = Router();

// ─── Validation Schema ──────────────────────────────────────────────────────────

const publicLeadSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  source: z.string().max(50).optional(),
  campaign: z.string().max(200).optional().nullable(),
  budget: z
    .number()
    .min(0, 'Budget must be non-negative (AED)')
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── CORS Preflight ─────────────────────────────────────────────────────────────

router.options('/leads', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

// ─── POST /leads — Public Lead Submission ───────────────────────────────────────

router.post('/leads', async (req, res, next) => {
  try {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    const apiKeyValue =
      req.headers['x-api-key'] ||
      req.query.api_key ||
      req.headers.authorization?.replace('Bearer ', '');

    if (!apiKeyValue) {
      return res.status(401).json({
        error: 'API key is required. Provide it via X-API-Key header or api_key query parameter.',
      });
    }

    const apiKeyRows = await prisma.$queryRawUnsafe(
      `SELECT ak.id, ak.key, ak.organization_id, o.name AS organization_name
       FROM api_keys ak
       JOIN organizations o ON o.id = ak.organization_id
       WHERE ak.key = $1 AND ak.is_active = true
       LIMIT 1`,
      apiKeyValue
    );

    if (apiKeyRows.length === 0) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    const apiKeyRecord = apiKeyRows[0];
    const organizationId = apiKeyRecord.organization_id;

    await prisma.$executeRawUnsafe(
      `UPDATE api_keys SET last_used_at = $1 WHERE id = $2`,
      new Date(),
      apiKeyRecord.id
    );

    const parsed = publicLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const data = parsed.data;

    const sourceMap = {
      website: 'WEBSITE_FORM',
      landing_page: 'LANDING_PAGE',
      facebook: 'FACEBOOK_ADS',
      google: 'GOOGLE_ADS',
      whatsapp: 'WHATSAPP',
      email: 'EMAIL',
      referral: 'REFERRAL',
      api: 'API',
    };

    const leadSource =
      sourceMap[(data.source || '').toLowerCase()] || 'API';

    const leadData = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      source: leadSource,
      status: 'NEW',
      campaign: data.campaign || null,
      budget: data.budget != null ? data.budget : null,
      organizationId,
    };

    const lead = await prisma.lead.create({ data: leadData });

    const logIntegration = await prisma.$queryRawUnsafe(
      `SELECT id FROM integrations WHERE platform = 'website' AND organization_id = $1 AND status = 'connected' LIMIT 1`,
      organizationId
    );

    if (logIntegration.length > 0) {
      try {
        const { v4: uuidv4 } = require('uuid');
        const logId = uuidv4();
        await prisma.$executeRawUnsafe(
          `INSERT INTO integration_logs (id, integration_id, action, payload, status, lead_id, created_at)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
          logId,
          logIntegration[0].id,
          'public_lead_created',
          JSON.stringify({
            source: leadSource,
            apiKeyId: apiKeyRecord.id,
            origin: req.headers.origin || req.headers.referer || 'unknown',
          }),
          'success',
          lead.id,
          new Date()
        );
      } catch (logErr) {
        console.error('Failed to log public lead creation:', logErr.message);
      }
    }

    res.status(201).json({
      id: lead.id,
      message: 'Lead created successfully',
      organization: apiKeyRecord.organization_name,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /health — Health Check for Public API ──────────────────────────────────

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Al Zaabi CRM Public Lead API',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
