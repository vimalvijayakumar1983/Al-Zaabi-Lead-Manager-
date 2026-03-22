const { Router } = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { paginate, paginatedResponse, paginationSchema } = require('../utils/pagination');

const router = Router();

// ─── Validation Schemas ────────────────────────────────────────────────────────

const createWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z.array(z.string().min(1)).min(1, 'At least one event is required'),
  organizationId: z.string().uuid().optional(),
});

const listWebhooksQuerySchema = paginationSchema.extend({
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

// ─── Authenticated Endpoints ────────────────────────────────────────────────────

router.get('/', authenticate, validateQuery(listWebhooksQuerySchema), async (req, res, next) => {
  try {
    const where = { organizationId: { in: req.orgIds } };

    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive;
    }

    const { skip, take } = paginate(req.query);

    const [webhooks, total] = await Promise.all([
      prisma.webhook.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          url: true,
          events: true,
          isActive: true,
          createdAt: true,
          organizationId: true,
        },
      }),
      prisma.webhook.count({ where }),
    ]);

    res.json(paginatedResponse(webhooks, total, req.query));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, validate(createWebhookSchema), async (req, res, next) => {
  try {
    const { url, events, organizationId } = req.body;

    const targetOrgId = organizationId || req.orgId;
    if (!req.orgIds.includes(targetOrgId)) {
      return res.status(403).json({ error: 'Access denied to specified organization' });
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        url,
        events,
        secret,
        isActive: true,
        organizationId: targetOrgId,
      },
    });

    res.status(201).json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      secret: webhook.secret,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      organizationId: webhook.organizationId,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.webhook.findFirst({
      where: { id, organizationId: { in: req.orgIds } },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    await prisma.webhook.delete({ where: { id } });

    res.json({ message: 'Webhook deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Generic Incoming Webhook ───────────────────────────────────────────────────

router.post('/incoming/:secret', async (req, res, next) => {
  try {
    const { secret } = req.params;

    const webhook = await prisma.webhook.findFirst({
      where: { secret, isActive: true },
    });

    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found or inactive' });
    }

    const payload = req.body;

    if (payload.firstName || payload.first_name) {
      const leadData = {
        firstName: payload.firstName || payload.first_name || 'Unknown',
        lastName: payload.lastName || payload.last_name || 'Unknown',
        email: payload.email || null,
        phone: payload.phone || payload.phoneNumber || null,
        company: payload.company || null,
        source: 'API',
        status: 'NEW',
        campaign: payload.campaign || null,
        budget: payload.budget ? parseFloat(payload.budget) : null,
        organizationId: webhook.organizationId,
      };

      const lead = await prisma.lead.create({ data: leadData });

      return res.status(201).json({
        received: true,
        leadId: lead.id,
        message: 'Lead created from webhook',
      });
    }

    res.json({ received: true, message: 'Webhook payload received' });
  } catch (err) {
    next(err);
  }
});

// ─── Facebook Lead Ads Webhook ──────────────────────────────────────────────────

router.get('/incoming/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }

  res.status(403).json({ error: 'Verification failed' });
});

router.post('/incoming/facebook', async (req, res, next) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const body = req.body;

    const integrations = await prisma.integration.findMany({
      where: { platform: 'facebook', status: 'connected' },
      take: 50,
    });

    if (signature && integrations.length > 0) {
      const isValid = integrations.some((integration) => {
        const appSecret = integration.credentials?.appSecret;
        if (!appSecret) return false;
        const rawBody = JSON.stringify(body);
        const expectedSig =
          'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
        return crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSig)
        );
      });

      if (!isValid) {
        return res.status(403).json({ error: 'Invalid Facebook signature' });
      }
    }

    const results = [];

    if (body.object === 'page' && body.entry) {
      for (const entry of body.entry) {
        if (!entry.changes) continue;

        for (const change of entry.changes) {
          if (change.field !== 'leadgen') continue;

          const leadData = change.value;
          const pageId = entry.id;

          const matchingIntegration = integrations.find(
            (i) => i.config?.pageId === pageId
          );

          const orgId = matchingIntegration
            ? matchingIntegration.organizationId
            : integrations[0]?.organizationId;

          if (!orgId) continue;

          const parsedLead = parseFacebookLeadFields(leadData);

          let campaign = null;
          if (matchingIntegration?.campaignId) {
            const campaignRows = await prisma.campaign.findFirst({
              where: { id: matchingIntegration.campaignId },
              select: { name: true },
            });
            campaign = campaignRows?.name || null;
          }

          const lead = await prisma.lead.create({
            data: {
              firstName: parsedLead.firstName || 'Facebook',
              lastName: parsedLead.lastName || 'Lead',
              email: parsedLead.email || null,
              phone: parsedLead.phone || null,
              company: parsedLead.company || null,
              source: 'FACEBOOK_ADS',
              status: 'NEW',
              campaign,
              organizationId: orgId,
            },
          });

          await logIncomingWebhook(
            matchingIntegration?.id,
            'facebook_lead_received',
            { leadgenId: leadData.leadgen_id, pageId },
            'success',
            lead.id
          );

          results.push({ leadId: lead.id, source: 'FACEBOOK_ADS' });
        }
      }
    }

    res.json({ received: true, leadsCreated: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ─── Google Ads Webhook ─────────────────────────────────────────────────────────

router.post('/incoming/google', async (req, res, next) => {
  try {
    const body = req.body;

    const integrations = await prisma.integration.findMany({
      where: { platform: 'google', status: 'connected' },
      take: 50,
    });

    const results = [];

    const leadFormData = body.lead_form_data || body.leadFormData || body;
    const submissions = Array.isArray(leadFormData) ? leadFormData : [leadFormData];

    for (const submission of submissions) {
      const parsedLead = parseGoogleLeadFields(submission);

      const campaignName = submission.campaign_name || submission.campaignName || null;

      let orgId = null;
      if (campaignName) {
        const matchingIntegration = integrations.find(
          (i) => i.config?.campaignName === campaignName
        );
        orgId = matchingIntegration?.organizationId;
      }

      if (!orgId && integrations.length > 0) {
        orgId = integrations[0].organizationId;
      }

      if (!orgId) continue;

      const lead = await prisma.lead.create({
        data: {
          firstName: parsedLead.firstName || 'Google',
          lastName: parsedLead.lastName || 'Lead',
          email: parsedLead.email || null,
          phone: parsedLead.phone || null,
          company: parsedLead.company || null,
          source: 'GOOGLE_ADS',
          status: 'NEW',
          campaign: campaignName,
          organizationId: orgId,
        },
      });

      const matchedIntegration = integrations.find(
        (i) => i.organizationId === orgId
      );

      await logIncomingWebhook(
        matchedIntegration?.id,
        'google_lead_received',
        { googleLeadId: submission.lead_id || submission.id },
        'success',
        lead.id
      );

      results.push({ leadId: lead.id, source: 'GOOGLE_ADS' });
    }

    res.json({ received: true, leadsCreated: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ─── TikTok Lead Ads Webhook ────────────────────────────────────────────────────

router.post('/incoming/tiktok', async (req, res, next) => {
  try {
    const body = req.body;

    const integrations = await prisma.integration.findMany({
      where: { platform: 'tiktok', status: 'connected' },
      take: 50,
    });

    const results = [];

    const leads = body.leads || (body.data ? [body.data] : [body]);

    for (const tiktokLead of leads) {
      const parsedLead = parseTikTokLeadFields(tiktokLead);

      const orgId = integrations.length > 0
        ? integrations[0].organizationId
        : null;

      if (!orgId) continue;

      const lead = await prisma.lead.create({
        data: {
          firstName: parsedLead.firstName || 'TikTok',
          lastName: parsedLead.lastName || 'Lead',
          email: parsedLead.email || null,
          phone: parsedLead.phone || null,
          company: parsedLead.company || null,
          source: 'TIKTOK_ADS',
          status: 'NEW',
          campaign: tiktokLead.campaign_name || null,
          organizationId: orgId,
        },
      });

      const matchedIntegration = integrations.find(
        (i) => i.organizationId === orgId
      );

      await logIncomingWebhook(
        matchedIntegration?.id,
        'tiktok_lead_received',
        { tiktokLeadId: tiktokLead.lead_id || tiktokLead.id },
        'success',
        lead.id
      );

      results.push({ leadId: lead.id, source: 'TIKTOK' });
    }

    res.json({ received: true, leadsCreated: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ─── WhatsApp Business Webhook ──────────────────────────────────────────────────

router.get('/incoming/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }

  res.status(403).json({ error: 'Verification failed' });
});

router.post('/incoming/whatsapp', async (req, res, next) => {
  try {
    const body = req.body;

    const integrations = await prisma.integration.findMany({
      where: { platform: 'whatsapp', status: 'connected' },
      take: 50,
    });

    const results = [];

    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        const changes = entry.changes || [];

        for (const change of changes) {
          if (change.field !== 'messages') continue;

          const messages = change.value?.messages || [];
          const contacts = change.value?.contacts || [];
          const phoneNumberId = change.value?.metadata?.phone_number_id;

          const matchingIntegration = integrations.find(
            (i) => i.config?.phoneNumberId === phoneNumberId
          );

          const orgId = matchingIntegration
            ? matchingIntegration.organizationId
            : integrations[0]?.organizationId;

          if (!orgId) continue;

          for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            const contact = contacts[i] || contacts[0];
            const senderPhone = message.from;
            const senderName = contact?.profile?.name || '';

            const existingLead = await prisma.lead.findFirst({
              where: {
                phone: senderPhone,
                organizationId: orgId,
              },
            });

            if (existingLead) {
              await logIncomingWebhook(
                matchingIntegration?.id,
                'whatsapp_message_received',
                {
                  messageId: message.id,
                  from: senderPhone,
                  type: message.type,
                  existingLeadId: existingLead.id,
                },
                'success',
                existingLead.id
              );

              results.push({
                leadId: existingLead.id,
                source: 'WHATSAPP',
                action: 'updated',
              });
              continue;
            }

            const nameParts = senderName.split(' ');
            const firstName = nameParts[0] || 'WhatsApp';
            const lastName = nameParts.slice(1).join(' ') || 'Lead';

            const lead = await prisma.lead.create({
              data: {
                firstName,
                lastName,
                phone: senderPhone,
                source: 'WHATSAPP',
                status: 'NEW',
                organizationId: orgId,
              },
            });

            await logIncomingWebhook(
              matchingIntegration?.id,
              'whatsapp_lead_created',
              {
                messageId: message.id,
                from: senderPhone,
                type: message.type,
              },
              'success',
              lead.id
            );

            results.push({ leadId: lead.id, source: 'WHATSAPP', action: 'created' });
          }
        }
      }
    }

    res.json({ received: true, leadsProcessed: results.length, results });
  } catch (err) {
    next(err);
  }
});

// ─── Helper Functions ───────────────────────────────────────────────────────────

function parseFacebookLeadFields(leadData) {
  const fields = {};
  const fieldData = leadData.field_data || leadData.fieldData || [];

  for (const field of fieldData) {
    const name = (field.name || '').toLowerCase();
    const value = Array.isArray(field.values) ? field.values[0] : field.value;

    if (name.includes('first_name') || name === 'first name' || name === 'firstname') {
      fields.firstName = value;
    } else if (name.includes('last_name') || name === 'last name' || name === 'lastname') {
      fields.lastName = value;
    } else if (name.includes('full_name') || name === 'full name' || name === 'fullname') {
      const parts = (value || '').split(' ');
      fields.firstName = parts[0];
      fields.lastName = parts.slice(1).join(' ') || '';
    } else if (name.includes('email')) {
      fields.email = value;
    } else if (name.includes('phone') || name.includes('mobile') || name.includes('tel')) {
      fields.phone = value;
    } else if (name.includes('company') || name.includes('organization') || name.includes('business')) {
      fields.company = value;
    }
  }

  return fields;
}

function parseGoogleLeadFields(submission) {
  const fields = {};

  const columnData = submission.user_column_data || submission.userColumnData || [];
  for (const col of columnData) {
    const name = (col.column_id || col.columnId || col.name || '').toLowerCase();
    const value = col.string_value || col.stringValue || col.value;

    if (name.includes('first_name') || name === 'first_name') {
      fields.firstName = value;
    } else if (name.includes('last_name') || name === 'last_name') {
      fields.lastName = value;
    } else if (name.includes('full_name') || name === 'full_name') {
      const parts = (value || '').split(' ');
      fields.firstName = parts[0];
      fields.lastName = parts.slice(1).join(' ') || '';
    } else if (name.includes('email')) {
      fields.email = value;
    } else if (name.includes('phone') || name.includes('mobile')) {
      fields.phone = value;
    } else if (name.includes('company') || name.includes('business')) {
      fields.company = value;
    }
  }

  if (!fields.firstName && submission.first_name) fields.firstName = submission.first_name;
  if (!fields.lastName && submission.last_name) fields.lastName = submission.last_name;
  if (!fields.email && submission.email) fields.email = submission.email;
  if (!fields.phone && submission.phone) fields.phone = submission.phone;

  return fields;
}

function parseTikTokLeadFields(tiktokLead) {
  const fields = {};

  const fieldList = tiktokLead.field_list || tiktokLead.fields || [];
  for (const field of fieldList) {
    const name = (field.field_name || field.name || '').toLowerCase();
    const value = field.field_value || field.value;

    if (name.includes('first_name') || name === 'firstname') {
      fields.firstName = value;
    } else if (name.includes('last_name') || name === 'lastname') {
      fields.lastName = value;
    } else if (name.includes('name') && !fields.firstName) {
      const parts = (value || '').split(' ');
      fields.firstName = parts[0];
      fields.lastName = parts.slice(1).join(' ') || '';
    } else if (name.includes('email')) {
      fields.email = value;
    } else if (name.includes('phone') || name.includes('mobile')) {
      fields.phone = value;
    } else if (name.includes('company') || name.includes('business')) {
      fields.company = value;
    }
  }

  if (!fields.firstName && tiktokLead.name) {
    const parts = tiktokLead.name.split(' ');
    fields.firstName = parts[0];
    fields.lastName = parts.slice(1).join(' ') || '';
  }

  return fields;
}

async function logIncomingWebhook(integrationId, action, payload, status, leadId) {
  try {
    if (!integrationId) return;
    await prisma.integrationLog.create({
      data: {
        integrationId,
        action,
        payload: payload || {},
        status: status || 'success',
        leadId: leadId || null,
      },
    });
  } catch (err) {
    console.error('Failed to log incoming webhook:', err.message);
  }
}

module.exports = router;
