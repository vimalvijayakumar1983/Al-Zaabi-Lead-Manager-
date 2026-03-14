const { Router } = require('express');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { notifyUser, broadcastDataChange } = require('../websocket/server');
const { autoAssign } = require('../services/leadAssignment');
const { createNotification, notifyOrgAdmins, NOTIFICATION_TYPES } = require('../services/notificationService');
const { executeAutomations } = require('../services/automationEngine');
const { calculateLeadScore, predictConversion } = require('../utils/leadScoring');

const router = Router();

// ─── Source mapping from platform to valid LeadSource enum ──────────
const PLATFORM_SOURCE_MAP = {
  whatsapp: 'WHATSAPP',
  facebook: 'FACEBOOK_ADS',
  instagram: 'FACEBOOK_ADS',
  google: 'GOOGLE_ADS',
  webchat: 'LIVE_CHAT',
  email: 'EMAIL',
  sms: 'PHONE',
  phone: 'PHONE',
};

// ─── Helper: find or create lead from inbound message ──────────────
async function findOrCreateLead(organizationId, { phone, email, name, source, platform }) {
  // Try to match existing lead by phone or email
  const where = { organizationId };
  const orConditions = [];
  if (phone) orConditions.push({ phone });
  if (email) orConditions.push({ email });

  if (orConditions.length > 0) {
    const existing = await prisma.lead.findFirst({
      where: { ...where, OR: orConditions },
    });
    if (existing) return existing;
  }

  // Parse name
  const parts = (name || 'Unknown').split(' ');
  const firstName = parts[0] || 'Unknown';
  const lastName = parts.slice(1).join(' ') || '';

  // Get default pipeline stage
  const defaultStage = await prisma.pipelineStage.findFirst({
    where: { organizationId },
    orderBy: { order: 'asc' },
  });

  // Resolve source from platform
  const resolvedSource = PLATFORM_SOURCE_MAP[platform?.toLowerCase()] || source || 'OTHER';

  // Build lead data
  const leadData = {
    organizationId,
    firstName,
    lastName,
    phone: phone || null,
    email: email || null,
    source: resolvedSource,
    status: 'NEW',
    stageId: defaultStage?.id || undefined,
  };

  // Calculate lead score
  try {
    leadData.score = calculateLeadScore(leadData);
    leadData.conversionProb = predictConversion(leadData.score, 'NEW');
  } catch {
    leadData.score = 10;
  }

  // Auto-assign based on allocation rules
  try {
    const orgSettings = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const rules = orgSettings?.settings?.allocationRules;
    if (rules?.autoAssignOnCreate !== false) {
      if (rules?.sourceRules?.length > 0 && resolvedSource) {
        const sourceRule = rules.sourceRules.find(r => r.source === resolvedSource);
        if (sourceRule?.assignToId) {
          leadData.assignedToId = sourceRule.assignToId;
        }
      }
      if (!leadData.assignedToId) {
        const assigneeId = await autoAssign(organizationId, leadData);
        if (assigneeId) leadData.assignedToId = assigneeId;
      }
    }
  } catch (err) {
    logger.warn('Auto-assign error (non-critical):', err.message);
  }

  // Create new lead
  const lead = await prisma.lead.create({
    data: leadData,
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Log lead creation activity
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'CUSTOM',
      description: `Lead auto-created from inbound ${platform || 'message'} DM`,
      metadata: { platform, source: resolvedSource, autoCreated: true },
    },
  });

  logger.info(`Auto-created lead ${lead.id} from ${platform} DM for org ${organizationId}${lead.assignedToId ? ` (assigned to ${lead.assignedToId})` : ''}`);

  // Fire-and-forget: notifications, automations, broadcast
  if (lead.assignedToId) {
    notifyUser(lead.assignedToId, {
      type: 'lead_assigned',
      lead: { id: lead.id, firstName: lead.firstName, lastName: lead.lastName },
    });
    createNotification({
      type: NOTIFICATION_TYPES.LEAD_ASSIGNED,
      title: 'New Lead Assigned',
      message: `New lead ${lead.firstName} ${lead.lastName} from ${resolvedSource} has been assigned to you`,
      userId: lead.assignedToId,
      entityType: 'lead',
      entityId: lead.id,
      organizationId,
    }).catch(() => {});
  }

  notifyOrgAdmins(organizationId, {
    type: NOTIFICATION_TYPES.LEAD_CREATED,
    title: 'New Inbound Lead',
    message: `New lead ${lead.firstName} ${lead.lastName} from ${platform || 'inbound'} channel`,
    entityType: 'lead',
    entityId: lead.id,
  }).catch(() => {});

  executeAutomations('LEAD_CREATED', { organizationId, lead }).catch(() => {});
  broadcastDataChange(organizationId, 'lead', 'created', null, { entityId: lead.id }).catch(() => {});

  return lead;
}

// ─── Helper: store inbound communication ────────────────────────────
async function storeInboundMessage(leadId, { channel, body, subject, platform, metadata = {} }) {
  const msgMetadata = { ...metadata };
  if (platform) msgMetadata.platform = platform.toLowerCase();

  const communication = await prisma.communication.create({
    data: {
      leadId,
      channel,
      direction: 'INBOUND',
      body,
      subject: subject || null,
      metadata: msgMetadata,
    },
  });

  // Create activity log
  await prisma.leadActivity.create({
    data: {
      leadId,
      type: channel === 'EMAIL' ? 'EMAIL_RECEIVED' :
            channel === 'WHATSAPP' ? 'WHATSAPP_RECEIVED' :
            channel === 'PHONE' ? 'CALL_RECEIVED' : 'CUSTOM',
      description: `Received ${platform || channel.toLowerCase()} message`,
      metadata: { channel, platform, messageId: communication.id },
    },
  });

  // Touch lead for conversation ordering
  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { updatedAt: new Date() },
  });

  // Broadcast real-time update so open lead detail pages refresh
  broadcastDataChange(lead.organizationId, 'communication', 'created', null, { entityId: leadId }).catch(() => {});

  return communication;
}

// ─── WhatsApp Webhook ───────────────────────────────────────────────
// WhatsApp Business API sends webhooks here
router.post('/whatsapp/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const payload = req.body;

    // WhatsApp Cloud API format
    const entry = payload?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages || [];

    for (const msg of messages) {
      const senderPhone = msg.from; // e.g. "971501234567"
      const senderName = value?.contacts?.[0]?.profile?.name || 'WhatsApp User';
      const body = msg.text?.body || msg.caption || '[Media message]';

      const lead = await findOrCreateLead(organizationId, {
        phone: senderPhone,
        name: senderName,
        platform: 'whatsapp',
      });

      await storeInboundMessage(lead.id, {
        channel: 'WHATSAPP',
        body,
        platform: 'whatsapp',
        metadata: {
          waMessageId: msg.id,
          waTimestamp: msg.timestamp,
          messageType: msg.type,
        },
      });
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error('WhatsApp webhook error:', err);
    res.status(200).json({ status: 'error' }); // Always 200 to prevent retries
  }
});

// WhatsApp verification (GET)
router.get('/whatsapp/:organizationId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // In production, verify token against stored org webhook secret
  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Facebook Messenger Webhook ─────────────────────────────────────
router.post('/facebook/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const payload = req.body;

    const entries = payload?.entry || [];
    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (!event.message) continue; // Skip delivery receipts, etc.

        const senderId = event.sender?.id;
        const body = event.message.text || '[Attachment]';

        const lead = await findOrCreateLead(organizationId, {
          phone: null,
          name: `FB User ${senderId?.slice(-4) || ''}`,
          platform: 'facebook',
        });

        await storeInboundMessage(lead.id, {
          channel: 'CHAT',
          body,
          platform: 'facebook',
          metadata: {
            fbSenderId: senderId,
            fbMessageId: event.message.mid,
            fbTimestamp: event.timestamp,
          },
        });
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error('Facebook webhook error:', err);
    res.status(200).json({ status: 'error' });
  }
});

// Facebook verification (GET)
router.get('/facebook/:organizationId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Instagram Webhook ──────────────────────────────────────────────
router.post('/instagram/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const payload = req.body;

    const entries = payload?.entry || [];
    for (const entry of entries) {
      const messaging = entry.messaging || [];
      for (const event of messaging) {
        if (!event.message) continue;

        const senderId = event.sender?.id;
        const body = event.message.text || '[Media]';

        const lead = await findOrCreateLead(organizationId, {
          phone: null,
          name: `IG User ${senderId?.slice(-4) || ''}`,
          platform: 'instagram',
        });

        await storeInboundMessage(lead.id, {
          channel: 'CHAT',
          body,
          platform: 'instagram',
          metadata: {
            igSenderId: senderId,
            igMessageId: event.message.mid,
            igTimestamp: event.timestamp,
          },
        });
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error('Instagram webhook error:', err);
    res.status(200).json({ status: 'error' });
  }
});

// Instagram verification (GET)
router.get('/instagram/:organizationId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ─── Google Business Messages Webhook ───────────────────────────────
router.post('/google/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const payload = req.body;

    const message = payload?.message;
    if (!message?.text) {
      return res.status(200).json({ status: 'ok' });
    }

    const senderId = payload?.conversationId || payload?.sender?.displayName;
    const senderName = payload?.context?.userInfo?.displayName || `Google User`;

    const lead = await findOrCreateLead(organizationId, {
      phone: null,
      name: senderName,
      platform: 'google',
    });

    await storeInboundMessage(lead.id, {
      channel: 'CHAT',
      body: message.text,
      platform: 'google',
      metadata: {
        googleConversationId: payload?.conversationId,
        googleMessageId: message?.messageId,
      },
    });

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    logger.error('Google webhook error:', err);
    res.status(200).json({ status: 'error' });
  }
});

// ─── Website Chat Webhook ───────────────────────────────────────────
// CORS preflight for embedded website chat widgets (external domains)
router.options('/webchat/:organizationId', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(204);
});

// For embedded website chat widgets
router.post('/webchat/:organizationId', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  try {
    const { organizationId } = req.params;
    const { name, email, phone, message, sessionId, divisionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    // If a divisionId is provided, validate it belongs to this organization
    let targetOrgId = organizationId;
    if (divisionId) {
      const division = await prisma.organization.findFirst({
        where: { id: divisionId, parentId: organizationId },
      });
      if (division) {
        targetOrgId = divisionId;
      } else {
        logger.warn(`Widget divisionId ${divisionId} not found under org ${organizationId}, using root org`);
      }
    }

    const lead = await findOrCreateLead(targetOrgId, {
      phone: phone || null,
      email: email || null,
      name: name || 'Website Visitor',
      platform: 'webchat',
    });

    await storeInboundMessage(lead.id, {
      channel: 'CHAT',
      body: message,
      platform: 'webchat',
      metadata: {
        sessionId,
        visitorEmail: email,
        visitorName: name,
        divisionId: targetOrgId !== organizationId ? targetOrgId : undefined,
      },
    });

    res.status(200).json({ status: 'ok', leadId: lead.id });
  } catch (err) {
    logger.error('Webchat webhook error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Email Inbound Webhook ──────────────────────────────────────────
// For services like SendGrid Inbound Parse, Mailgun, etc.
router.post('/email/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { from, fromName, subject, body, html } = req.body;

    if (!from) {
      return res.status(400).json({ error: 'Sender email is required' });
    }

    const lead = await findOrCreateLead(organizationId, {
      email: from,
      name: fromName || from.split('@')[0],
      platform: 'email',
    });

    await storeInboundMessage(lead.id, {
      channel: 'EMAIL',
      body: body || html || '',
      subject,
      platform: 'email',
      metadata: {
        senderEmail: from,
        senderName: fromName,
        hasHtml: !!html,
      },
    });

    res.status(200).json({ status: 'ok', leadId: lead.id });
  } catch (err) {
    logger.error('Email webhook error:', err);
    res.status(200).json({ status: 'error' });
  }
});

module.exports = router;
