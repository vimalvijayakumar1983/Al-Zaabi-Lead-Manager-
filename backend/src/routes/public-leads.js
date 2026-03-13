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

    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { key: apiKeyValue, isActive: true },
      include: {
        organization: { select: { name: true } },
      },
    });

    if (!apiKeyRecord) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    const organizationId = apiKeyRecord.organizationId;

    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

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

    const logIntegration = await prisma.integration.findFirst({
      where: { platform: 'website', organizationId, status: 'connected' },
    });

    if (logIntegration) {
      try {
        await prisma.integrationLog.create({
          data: {
            integrationId: logIntegration.id,
            action: 'public_lead_created',
            payload: {
              source: leadSource,
              apiKeyId: apiKeyRecord.id,
              origin: req.headers.origin || req.headers.referer || 'unknown',
            },
            status: 'success',
            leadId: lead.id,
          },
        });
      } catch (logErr) {
        console.error('Failed to log public lead creation:', logErr.message);
      }
    }

    res.status(201).json({
      id: lead.id,
      message: 'Lead created successfully',
      organization: apiKeyRecord.organization.name,
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
