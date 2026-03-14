const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { getNextAssignee } = require('../services/leadAssignment');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { createNotification, notifyOrgAdmins, NOTIFICATION_TYPES } = require('../services/notificationService');
const { executeAutomations } = require('../services/automationEngine');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');

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

    // Auto-assign using org's configured allocation rules
    try {
      const orgSettings = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });
      const rules = orgSettings?.settings?.allocationRules;
      if (rules?.autoAssignOnCreate !== false) {
        const assigneeId = await getNextAssignee(organizationId, leadData);
        if (assigneeId) leadData.assignedToId = assigneeId;
      }
    } catch (autoAssignErr) {
      console.error('Public lead auto-assign error (non-critical):', autoAssignErr.message);
    }

    // Calculate lead score
    const score = calculateLeadScore(leadData);
    const conversionProb = predictConversion(score, 'NEW');
    leadData.score = score;
    leadData.conversionProb = conversionProb;

    // Get default pipeline stage
    try {
      const defaultStage = await prisma.pipelineStage.findFirst({
        where: { organizationId, isDefault: true },
      });
      if (defaultStage) leadData.stageId = defaultStage.id;
    } catch {
      // non-critical
    }

    const lead = await prisma.lead.create({
      data: leadData,
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create activity log
    try {
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'STATUS_CHANGE',
          description: `Lead created via public API (${leadSource})`,
        },
      });
    } catch {
      // non-critical
    }

    // Integration log
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

    // ── Fire-and-forget: notifications, automations, broadcast ──

    // Notify assigned user via WebSocket
    if (lead.assignedToId) {
      notifyUser(lead.assignedToId, {
        type: 'lead_assigned',
        lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
      });

      createNotification({
        type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: 'New Lead Assigned',
        message: `New lead ${lead.firstName} ${lead.lastName} from ${leadSource} has been assigned to you`,
        userId: lead.assignedToId,
        entityType: 'lead',
        entityId: lead.id,
        organizationId,
      }).catch(() => {});
    }

    // Notify org admins
    notifyOrgAdmins(organizationId, {
      type: NOTIFICATION_TYPES.LEAD_CREATED,
      title: 'New Public Lead',
      message: `New lead ${lead.firstName} ${lead.lastName} submitted via ${leadSource}`,
      entityType: 'lead',
      entityId: lead.id,
    }).catch(() => {});

    // Fire automation rules
    executeAutomations('LEAD_CREATED', { organizationId, lead }).catch(() => {});

    // Broadcast to all org users for real-time UI updates
    broadcastDataChange(organizationId, 'lead', 'created', null, { entityId: lead.id }).catch(() => {});
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
