const { Router } = require('express');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { broadcastDataChange } = require('../websocket/server');

// ─── Multer config for attachments ─────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, '../../uploads/inbox');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    // Allow images, documents, audio, video
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/zip', 'application/x-rar-compressed',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

const router = Router();
router.use(authenticate, orgScope);

// ─── Channel metadata helpers ─────────────────────────────────────

const PLATFORM_MAP = {
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', icon: 'whatsapp' },
  EMAIL: { label: 'Email', color: '#EA4335', icon: 'email' },
  SMS: { label: 'SMS', color: '#6366f1', icon: 'sms' },
  PHONE: { label: 'Phone', color: '#06b6d4', icon: 'phone' },
  CHAT: { label: 'Live Chat', color: '#3b82f6', icon: 'chat' },
  // Sub-platforms stored in metadata.platform
  FACEBOOK: { label: 'Facebook', color: '#1877F2', icon: 'facebook' },
  INSTAGRAM: { label: 'Instagram', color: '#E4405F', icon: 'instagram' },
  GOOGLE: { label: 'Google', color: '#4285F4', icon: 'google' },
  WEBCHAT: { label: 'Website Chat', color: '#8b5cf6', icon: 'webchat' },
};

function resolvePlatform(comm) {
  if (comm.channel === 'CHAT' && comm.metadata?.platform) {
    return comm.metadata.platform.toUpperCase();
  }
  return comm.channel;
}

// ─── List Conversations (grouped by lead) ─────────────────────────

router.get('/conversations', async (req, res, next) => {
  try {
    const { channel, search, status, page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Find leads that have communications
    const where = {
      organizationId: { in: req.orgIds },
      isArchived: false,
      communications: { some: {} },
    };

    if (channel && channel !== 'ALL') {
      if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(channel)) {
        where.communications = {
          some: { channel: 'CHAT', metadata: { path: ['platform'], equals: channel.toLowerCase() } },
        };
      } else {
        where.communications = { some: { channel } };
      }
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          company: true,
          status: true,
          score: true,
          source: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          communications: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              channel: true,
              direction: true,
              subject: true,
              body: true,
              metadata: true,
              createdAt: true,
            },
          },
          _count: { select: { communications: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.lead.count({ where }),
    ]);

    // Enrich with last message info and unread count
    const conversations = leads.map(lead => {
      const lastMsg = lead.communications[0] || null;
      const platform = lastMsg ? resolvePlatform(lastMsg) : 'UNKNOWN';
      return {
        leadId: lead.id,
        contactName: `${lead.firstName} ${lead.lastName}`.trim(),
        contactEmail: lead.email,
        contactPhone: lead.phone,
        company: lead.company,
        leadStatus: lead.status,
        leadScore: lead.score,
        source: lead.source,
        assignedTo: lead.assignedTo,
        messageCount: lead._count.communications,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          body: lastMsg.body?.substring(0, 120),
          direction: lastMsg.direction,
          channel: lastMsg.channel,
          platform,
          platformInfo: PLATFORM_MAP[platform] || PLATFORM_MAP.CHAT,
          createdAt: lastMsg.createdAt,
        } : null,
      };
    });

    res.json({
      conversations,
      pagination: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (err) { next(err); }
});

// ─── Get Messages for a Lead (thread view) ─────────────────────────

router.get('/conversations/:leadId/messages', async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { channel, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Verify lead belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
      select: {
        id: true, firstName: true, lastName: true, email: true, phone: true,
        company: true, status: true, score: true, source: true, jobTitle: true,
        createdAt: true, budget: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        stage: { select: { id: true, name: true, color: true } },
      },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const msgWhere = { leadId };
    if (channel && channel !== 'ALL') {
      if (['FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'WEBCHAT'].includes(channel)) {
        msgWhere.channel = 'CHAT';
        msgWhere.metadata = { path: ['platform'], equals: channel.toLowerCase() };
      } else {
        msgWhere.channel = channel;
      }
    }

    const [messages, total] = await Promise.all([
      prisma.communication.findMany({
        where: msgWhere,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
      prisma.communication.count({ where: msgWhere }),
    ]);

    // Enrich messages with platform info
    const enriched = messages.map(m => ({
      ...m,
      platform: resolvePlatform(m),
      platformInfo: PLATFORM_MAP[resolvePlatform(m)] || PLATFORM_MAP.CHAT,
    }));

    res.json({
      lead,
      messages: enriched,
      pagination: { total, page: parseInt(page), limit: take, totalPages: Math.ceil(total / take) },
    });
  } catch (err) { next(err); }
});

// ─── Send Message (outbound) ───────────────────────────────────────

const sendSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'PHONE', 'CHAT']),
  body: z.string().min(1),
  subject: z.string().optional().nullable(),
  platform: z.string().optional(), // facebook, instagram, google, webchat
  metadata: z.record(z.unknown()).optional(),
});

router.post('/send', validate(sendSchema), async (req, res, next) => {
  try {
    const { leadId, channel, body, subject, platform, metadata = {} } = req.validated;

    // Verify lead
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Store platform in metadata for CHAT channels
    const msgMetadata = { ...metadata };
    if (platform) msgMetadata.platform = platform.toLowerCase();

    // Create communication record
    const communication = await prisma.communication.create({
      data: {
        leadId,
        channel,
        direction: 'OUTBOUND',
        body,
        subject,
        metadata: msgMetadata,
        userId: req.user.id,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create activity log
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.id,
        type: channel === 'EMAIL' ? 'EMAIL_SENT' :
              channel === 'WHATSAPP' ? 'WHATSAPP_SENT' :
              channel === 'PHONE' ? 'CALL_MADE' : 'CUSTOM',
        description: `Sent ${platform || channel.toLowerCase()} message`,
        metadata: { channel, platform, messageId: communication.id },
      },
    });

    // Update lead's updatedAt for conversation ordering
    await prisma.lead.update({
      where: { id: leadId },
      data: { updatedAt: new Date() },
    });

    // TODO: Dispatch to actual channel APIs (WhatsApp Business API, Facebook Graph API, etc.)
    // This is where platform-specific sending logic would go:
    // - WHATSAPP: Call WhatsApp Business API
    // - FACEBOOK: Call Facebook Messenger Send API
    // - INSTAGRAM: Call Instagram Messaging API
    // - EMAIL: Call email service (SendGrid, etc.)
    // - GOOGLE: Call Google Business Messages API

    const enriched = {
      ...communication,
      platform: resolvePlatform(communication),
      platformInfo: PLATFORM_MAP[resolvePlatform(communication)] || PLATFORM_MAP.CHAT,
    };

    res.status(201).json(enriched);

    broadcastDataChange(lead.organizationId, 'communication', 'created', req.user.id, { entityId: leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Upload Attachments ─────────────────────────────────────────────

router.post('/upload', upload.array('files', 10), async (req, res, next) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const attachments = files.map(f => ({
      filename: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      url: `/uploads/inbox/${f.filename}`,
    }));

    res.json({ attachments });
  } catch (err) { next(err); }
});

// ─── Send Message with Attachments ──────────────────────────────────

router.post('/send-with-attachments', upload.array('files', 10), async (req, res, next) => {
  try {
    const { leadId, channel, body, subject, platform } = req.body;
    const files = req.files || [];

    if (!leadId || !channel) {
      return res.status(400).json({ error: 'leadId and channel are required' });
    }

    // Verify lead
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Build attachment metadata
    const attachmentData = files.map(f => ({
      filename: f.originalname,
      storedName: f.filename,
      mimeType: f.mimetype,
      size: f.size,
      url: `/uploads/inbox/${f.filename}`,
    }));

    const msgMetadata = {};
    if (platform) msgMetadata.platform = platform.toLowerCase();
    if (attachmentData.length > 0) msgMetadata.attachments = attachmentData;

    // Create communication record
    const communication = await prisma.communication.create({
      data: {
        leadId,
        channel,
        direction: 'OUTBOUND',
        body: body || (files.length > 0 ? `[${files.length} attachment${files.length > 1 ? 's' : ''}]` : ''),
        subject: subject || null,
        metadata: msgMetadata,
        userId: req.user.id,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create Attachment records linked to lead
    for (const att of attachmentData) {
      await prisma.attachment.create({
        data: {
          leadId,
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
          url: att.url,
        },
      });
    }

    // Activity log
    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.id,
        type: files.length > 0 ? 'ATTACHMENT_ADDED' : (
          channel === 'EMAIL' ? 'EMAIL_SENT' :
          channel === 'WHATSAPP' ? 'WHATSAPP_SENT' :
          channel === 'PHONE' ? 'CALL_MADE' : 'CUSTOM'
        ),
        description: files.length > 0
          ? `Sent ${files.length} attachment${files.length > 1 ? 's' : ''} via ${platform || channel.toLowerCase()}`
          : `Sent ${platform || channel.toLowerCase()} message`,
        metadata: { channel, platform, messageId: communication.id, attachmentCount: files.length },
      },
    });

    // Update lead timestamp
    await prisma.lead.update({
      where: { id: leadId },
      data: { updatedAt: new Date() },
    });

    const enriched = {
      ...communication,
      platform: resolvePlatform(communication),
      platformInfo: PLATFORM_MAP[resolvePlatform(communication)] || PLATFORM_MAP.CHAT,
    };

    res.status(201).json(enriched);

    broadcastDataChange(lead.organizationId, 'communication', 'created', req.user.id, { entityId: leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Get Attachments for a Lead ─────────────────────────────────────

router.get('/conversations/:leadId/attachments', async (req, res, next) => {
  try {
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const attachments = await prisma.attachment.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(attachments);
  } catch (err) { next(err); }
});

// ─── Inbox Stats ───────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const orgFilter = { in: req.orgIds };

    const [totalConversations, byChannel, recentInbound, totalMessages] = await Promise.all([
      prisma.lead.count({
        where: { organizationId: orgFilter, isArchived: false, communications: { some: {} } },
      }),
      prisma.communication.groupBy({
        by: ['channel'],
        where: { lead: { organizationId: orgFilter } },
        _count: true,
      }),
      prisma.communication.count({
        where: {
          lead: { organizationId: orgFilter },
          direction: 'INBOUND',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.communication.count({
        where: { lead: { organizationId: orgFilter } },
      }),
    ]);

    res.json({
      totalConversations,
      totalMessages,
      recentInbound,
      byChannel: byChannel.map(c => ({
        channel: c.channel,
        count: c._count,
        ...PLATFORM_MAP[c.channel],
      })),
    });
  } catch (err) { next(err); }
});

// ─── Update Conversation Status (lead status) ──────────────────────

const statusUpdateSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST']),
});

// Map lead status to pipeline stage name for auto-sync
const STATUS_TO_STAGE_NAME = {
  NEW: 'New Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_SENT: 'Proposal Sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

router.patch('/conversations/:leadId/status', async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status value', details: parsed.error.errors });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const updateData = { status: parsed.data.status };

    // Auto-sync pipeline stage to match the new status
    const stageName = STATUS_TO_STAGE_NAME[parsed.data.status];
    if (stageName) {
      const matchingStage = await prisma.pipelineStage.findFirst({
        where: { organizationId: lead.organizationId, name: { equals: stageName, mode: 'insensitive' } },
      });
      if (matchingStage) {
        updateData.stageId = matchingStage.id;
      }
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      select: { id: true, status: true, stage: { select: { id: true, name: true, color: true } } },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── Internal Notes ─────────────────────────────────────────────────

const noteSchema = z.object({
  body: z.string().min(1, 'Note body is required'),
});

router.post('/conversations/:leadId/notes', async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const parsed = noteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Note body is required', details: parsed.error.errors });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const note = await prisma.leadNote.create({
      data: {
        leadId,
        userId: req.user.id,
        content: parsed.data.body,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json(note);

    broadcastDataChange(lead.organizationId, 'note', 'created', req.user.id, { entityId: leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Get Notes for a Conversation ───────────────────────────────────

router.get('/conversations/:leadId/notes', async (req, res, next) => {
  try {
    const { leadId } = req.params;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const notes = await prisma.leadNote.findMany({
      where: { leadId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notes);
  } catch (err) { next(err); }
});

// ─── Edit Message ────────────────────────────────────────────────────

router.patch('/messages/:messageId', validate(z.object({
  body: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const message = await prisma.communication.findUnique({
      where: { id: messageId },
      include: { lead: { select: { organizationId: true } } },
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.lead.organizationId && !req.orgIds.includes(message.lead.organizationId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Only the sender can edit their own outbound messages
    if (message.direction !== 'OUTBOUND' || message.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own sent messages' });
    }
    if (message.isDeleted) {
      return res.status(400).json({ error: 'Cannot edit a deleted message' });
    }

    const updated = await prisma.communication.update({
      where: { id: messageId },
      data: { body: req.validated.body, isEdited: true },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    res.json(updated);

    broadcastDataChange(message.lead.organizationId, 'communication', 'updated', req.user.id, { entityId: message.leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Delete Message (soft delete) ────────────────────────────────────

router.delete('/messages/:messageId', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const message = await prisma.communication.findUnique({
      where: { id: messageId },
      include: { lead: { select: { organizationId: true } } },
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.lead.organizationId && !req.orgIds.includes(message.lead.organizationId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Only the sender can delete their own outbound messages
    if (message.direction !== 'OUTBOUND' || message.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own sent messages' });
    }

    await prisma.communication.update({
      where: { id: messageId },
      data: { isDeleted: true, body: '' },
    });

    res.json({ message: 'Message deleted' });

    broadcastDataChange(message.lead.organizationId, 'communication', 'updated', req.user.id, { entityId: message.leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Canned Responses ───────────────────────────────────────────────

const CANNED_RESPONSES = [
  { id: '1', title: 'Greeting', body: 'Hello! Thank you for reaching out. How can I help you today?', category: 'general' },
  { id: '2', title: 'Follow Up', body: 'Hi! Just following up on our previous conversation. Is there anything else I can help you with?', category: 'follow-up' },
  { id: '3', title: 'Thank You', body: 'Thank you for your interest! I\'ll get back to you shortly with more details.', category: 'general' },
  { id: '4', title: 'Pricing Request', body: 'Thank you for your inquiry about pricing. Let me prepare a customized quote for you. Could you share more details about your requirements?', category: 'sales' },
  { id: '5', title: 'Meeting Request', body: 'I\'d love to schedule a call to discuss this further. What times work best for you this week?', category: 'meeting' },
  { id: '6', title: 'Apology', body: 'I apologize for the inconvenience. Let me look into this for you right away and get back to you with a resolution.', category: 'support' },
  { id: '7', title: 'Product Demo', body: 'I\'d be happy to arrange a product demonstration for you. Our team can walk you through all the features. When would be a convenient time?', category: 'sales' },
  { id: '8', title: 'Out of Office', body: 'Thank you for your message. I\'m currently out of the office and will respond as soon as I return. For urgent matters, please contact our support team.', category: 'general' },
];

router.get('/canned-responses', (_req, res) => {
  res.json(CANNED_RESPONSES);
});

module.exports = router;
