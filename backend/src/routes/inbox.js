const { Router } = require('express');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { prisma } = require('../config/database');
const { logger } = require('../config/logger');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');
const { broadcastDataChange } = require('../websocket/server');
const { PLATFORM_MAP, resolvePlatform, enrichCommunicationForClient } = require('../utils/inboxCommunication');
const { emitCommunicationChange } = require('../utils/inboxRealtimeEmit');
const { regenerateLeadSummaryById } = require('../services/aiService');
const { sendText: sendWhatsAppText, sendMedia: sendWhatsAppMedia, uploadMedia: uploadWhatsAppMedia } = require('../services/whatsappService');
const {
  isAttachmentObjectStorageEnabled,
  uploadInboxAttachmentBuffer,
  getInboxAttachmentReadUrl,
} = require('../services/attachmentStorage');
const { canonicalPhoneDigitsForWhatsApp } = require('../utils/phoneWhatsApp');
const { findStageForStatus } = require('../utils/statusStageMapping');

// ─── Display name helper (deduplication) ─────────────────────────
function getDisplayName(obj) {
  const fn = (obj?.firstName || '').trim();
  const ln = (obj?.lastName || '').trim();
  if (!fn && !ln) return 'Unknown';
  if (!ln) return fn;
  if (!fn) return ln;
  if (fn.toLowerCase() === ln.toLowerCase()) return fn;
  if (fn.toLowerCase().includes(ln.toLowerCase())) return fn;
  if (ln.toLowerCase().includes(fn.toLowerCase())) return ln;
  return `${fn} ${ln}`;
}

// ─── Multer config for attachments (memory storage for serverless) ──

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (base64 inflates size)
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

function refreshLeadAISummaryAsync(leadId) {
  if (!leadId) return;
  regenerateLeadSummaryById(leadId).catch(() => {});
}

function resolveWhatsAppMediaType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

async function resolveAttachmentBinary(attachment) {
  if (!attachment) return null;
  if (attachment.data) {
    const base64Match = String(attachment.data).match(/^data:([^;]+);base64,(.+)$/);
    if (base64Match) {
      return {
        buffer: Buffer.from(base64Match[2], 'base64'),
        mimeType: base64Match[1] || attachment.mimeType || 'application/octet-stream',
        filename: attachment.filename,
      };
    }
  }
  if (attachment.storageKey) {
    const signed = await getInboxAttachmentReadUrl(attachment.storageKey);
    if (!signed) return null;
    const resp = await fetch(signed);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return {
      buffer: buf,
      mimeType: attachment.mimeType || resp.headers.get('content-type') || 'application/octet-stream',
      filename: attachment.filename,
    };
  }
  const filePath = path.join(__dirname, '../../uploads/inbox', path.basename(attachment.filename || ''));
  if (fs.existsSync(filePath)) {
    return {
      buffer: fs.readFileSync(filePath),
      mimeType: attachment.mimeType || 'application/octet-stream',
      filename: attachment.filename,
    };
  }
  return null;
}

// ─── Serve Attachment File from DB (public — UUID acts as access token) ──

router.get('/attachments/file/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const attachment = await prisma.attachment.findFirst({
      where: { id },
      select: { id: true, filename: true, mimeType: true, data: true, size: true, storageKey: true },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    if (attachment.storageKey) {
      const signed = await getInboxAttachmentReadUrl(attachment.storageKey);
      if (signed) return res.redirect(302, signed);
      return res.status(502).json({ error: 'Attachment storage temporarily unavailable' });
    }

    // If we have base64 data stored, serve it
    if (attachment.data) {
      // data is stored as "data:<mimeType>;base64,<base64data>"
      const base64Match = attachment.data.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        const mimeType = base64Match[1];
        const buffer = Buffer.from(base64Match[2], 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(buffer);
      }
    }

    // Fallback: try to serve from filesystem (legacy uploads)
    const filePath = path.join(__dirname, '../../uploads/inbox', path.basename(attachment.filename));
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(filePath);
    }

    return res.status(404).json({ error: 'Attachment file not found' });
  } catch (err) { next(err); }
});

// All routes below require authentication
router.use(authenticate, orgScope);

/**
 * Inbox org scope — align with GET /leads: SUPER_ADMIN may pass ?divisionId= to scope to one division
 * (required when that division is not under req.orgIds, e.g. parentId=null misconfiguration).
 */
function buildInboxOrgFilter(req, divisionIdRaw) {
  const divisionId = divisionIdRaw && String(divisionIdRaw).trim();
  if (divisionId) {
    if (req.isSuperAdmin) {
      return divisionId;
    }
    if (req.orgIds.includes(divisionId)) {
      return divisionId;
    }
  }
  return { in: req.orgIds };
}

/** Lead visible in inbox: org-scoped, or any org if SUPER_ADMIN (matches leads list + orphan divisions). */
async function findInboxLead(req, leadId) {
  let lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId: { in: req.orgIds } },
  });
  if (!lead && req.isSuperAdmin) {
    lead = await prisma.lead.findFirst({ where: { id: leadId } });
  }
  return lead;
}

// ─── List Conversations (grouped by lead) ─────────────────────────

router.get('/conversations', async (req, res, next) => {
  try {
    const { channel, search, status, page = '1', limit = '30', divisionId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const orgFilter = buildInboxOrgFilter(req, divisionId);

    // Find leads that have communications
    const where = {
      organizationId: orgFilter,
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
        contactName: getDisplayName(lead),
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
          metadata: lastMsg.metadata || {},
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
    const { channel, page = '1', limit = '50', divisionId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const orgFilter = buildInboxOrgFilter(req, divisionId);
    const divisionScoped = Boolean(divisionId && String(divisionId).trim());

    const leadSelect = {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      company: true, status: true, score: true, source: true, jobTitle: true,
      createdAt: true, budget: true, organizationId: true,
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true, color: true } },
    };

    // Verify lead belongs to org (or scoped division for SUPER_ADMIN)
    let lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: orgFilter },
      select: leadSelect,
    });
    // SUPER_ADMIN without explicit divisionId: same as findInboxLead (orphan / out-of-tree orgs)
    if (!lead && req.isSuperAdmin && !divisionScoped) {
      lead = await prisma.lead.findFirst({ where: { id: leadId }, select: leadSelect });
    }
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

    // Fetch newest-first so page 1 = latest messages; then reverse for chronological display
    const [rawMessages, total] = await Promise.all([
      prisma.communication.findMany({
        where: msgWhere,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.communication.count({ where: msgWhere }),
    ]);
    const messages = rawMessages.reverse();

    const enriched = await Promise.all(messages.map((m) => enrichCommunicationForClient(m, leadId)));

    const pageNum = parseInt(page, 10) || 1;
    const totalPages = Math.ceil(total / take) || 1;
    res.json({
      lead,
      messages: enriched,
      pagination: {
        total,
        page: pageNum,
        limit: take,
        totalPages,
        hasMore: pageNum < totalPages,
      },
    });

    // Auto-mark unread inbound messages as read when viewed
    prisma.communication.updateMany({
      where: { leadId, isRead: false, direction: 'INBOUND' },
      data: { isRead: true, readAt: new Date() },
    }).then((result) => {
      if (result.count > 0) {
        broadcastDataChange(lead.organizationId, 'communication', 'updated', null, { entityId: leadId }).catch(() => {});
      }
    }).catch(() => {});
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

    const lead = await findInboxLead(req, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Store platform in metadata for CHAT channels
    const msgMetadata = { ...metadata };
    if (platform) msgMetadata.platform = platform.toLowerCase();

    // Create communication record (outbound messages are always read)
    const communication = await prisma.communication.create({
      data: {
        leadId,
        channel,
        direction: 'OUTBOUND',
        body,
        subject,
        metadata: msgMetadata,
        userId: req.user.id,
        isRead: true,
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

    // Dispatch to WhatsApp when channel is WHATSAPP
    if (channel === 'WHATSAPP') {
      const phone = canonicalPhoneDigitsForWhatsApp(lead.phone?.replace(/\D/g, '') || '');
      if (!phone) {
        await prisma.communication.update({
          where: { id: communication.id },
          data: { metadata: { ...(communication.metadata || {}), sendError: 'Lead has no phone number' } },
        }).catch(() => {});
        return res.status(400).json({ error: 'Lead has no phone number' });
      }
      try {
        const sendResult = await sendWhatsAppText(phone, body, lead.organizationId);
        const waMessageId = sendResult?.messageId || null;
        if (waMessageId) {
          const now = new Date();
          await prisma.communication.update({
            where: { id: communication.id },
            data: {
              metadata: {
                ...(communication.metadata || {}),
                waMessageId,
                waStatus: 'SENT',
                waStatusUpdatedAt: now.toISOString(),
              },
            },
          }).catch(() => {});
          communication.metadata = {
            ...(communication.metadata || {}),
            waMessageId,
            waStatus: 'SENT',
            waStatusUpdatedAt: now.toISOString(),
          };
        }
        const rawDigits = lead.phone?.replace(/\D/g, '') || '';
        if (rawDigits && rawDigits !== phone) {
          await prisma.lead.update({ where: { id: leadId }, data: { phone: `+${phone}` } }).catch(() => {});
        }
      } catch (sendErr) {
        // WhatsApp / Meta token can expire (e.g. "Session has expired").
        // Do not propagate Meta's 401 back to the frontend as an app-auth failure.
        // Instead, mark the message as failed and keep the inbox request successful.
        const now = new Date();
        const nextMeta = {
          ...(communication.metadata || {}),
          sendError: sendErr?.message || String(sendErr),
          waStatus: 'FAILED',
          waStatusUpdatedAt: now.toISOString(),
        };

        await prisma.communication.update({
          where: { id: communication.id },
          data: { metadata: nextMeta },
        }).catch(() => {});

        // Ensure the API response includes the failure status without re-fetching.
        communication.metadata = nextMeta;

        logger.error('WhatsApp send failed (non-fatal for inbox UI)', {
          leadId,
          communicationId: communication.id,
          error: sendErr?.message || String(sendErr),
        });
      }
    }

    const enriched = await enrichCommunicationForClient(communication, leadId);

    res.status(201).json(enriched);
    refreshLeadAISummaryAsync(leadId);

    emitCommunicationChange(lead.organizationId, 'created', req.user.id, leadId, enriched);
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
      mimeType: f.mimetype,
      size: f.size,
      data: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
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

    const lead = await findInboxLead(req, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const useS3 = isAttachmentObjectStorageEnabled();
    const orgId = lead.organizationId;

    const msgMetadata = {};
    if (platform) msgMetadata.platform = platform.toLowerCase();
    if (files.length > 0) {
      msgMetadata.attachments = files.map((f) => ({
        filename: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
      }));
    }

    // Create communication record (outbound messages are always read)
    const communication = await prisma.communication.create({
      data: {
        leadId,
        channel,
        direction: 'OUTBOUND',
        body: body || (files.length > 0 ? `[${files.length} attachment${files.length > 1 ? 's' : ''}]` : ''),
        subject: subject || null,
        metadata: msgMetadata,
        userId: req.user.id,
        isRead: true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const savedAttachments = [];
    for (const f of files) {
      const base64 = `data:${f.mimetype};base64,${f.buffer.toString('base64')}`;
      const record = await prisma.attachment.create({
        data: {
          leadId,
          filename: f.originalname,
          mimeType: f.mimetype,
          size: f.size,
          url: '',
          data: useS3 ? null : base64,
          storageKey: null,
        },
      });
      const url = `/inbox/attachments/file/${record.id}`;
      let storageKey = null;
      if (useS3) {
        try {
          storageKey = await uploadInboxAttachmentBuffer({
            buffer: f.buffer,
            mimeType: f.mimetype,
            organizationId: orgId,
            leadId,
            attachmentId: record.id,
            filename: f.originalname,
          });
        } catch (s3Err) {
          logger.error('Inbox attachment S3 upload failed; using database blob', { err: s3Err.message });
          await prisma.attachment.update({
            where: { id: record.id },
            data: { data: base64 },
          });
        }
      }
      await prisma.attachment.update({
        where: { id: record.id },
        data: storageKey ? { url, storageKey } : { url },
      });
      savedAttachments.push({
        filename: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        url,
        id: record.id,
        buffer: f.buffer,
      });
    }

    // Update communication metadata with persistent URLs
    let finalMetadata = msgMetadata;
    if (savedAttachments.length > 0) {
      finalMetadata = {
        ...msgMetadata,
        attachments: savedAttachments.map(a => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          url: a.url,
        })),
      };
      await prisma.communication.update({
        where: { id: communication.id },
        data: { metadata: finalMetadata },
      });
      communication.metadata = finalMetadata;
    }

    // ─── Send via WhatsApp API if channel is WHATSAPP ───────────
    if (channel === 'WHATSAPP' && lead.phone) {
      const phone = canonicalPhoneDigitsForWhatsApp(lead.phone?.replace(/\D/g, '') || '');
      if (phone) {
        const waMessageIds = [];
        let lastWaSendErr = null;
        // Send each attachment as a separate WhatsApp media message
        for (const att of savedAttachments) {
          try {
            const waMediaType = att.mimeType.startsWith('image/') ? 'image'
              : att.mimeType.startsWith('video/') ? 'video'
              : att.mimeType.startsWith('audio/') ? 'audio'
              : 'document';
            const buf = Buffer.isBuffer(att.buffer)
              ? att.buffer
              : Buffer.from(String(att.data || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
            const { mediaId } = await uploadWhatsAppMedia(buf, att.mimeType, att.filename, lead.organizationId);
            const caption = (savedAttachments.length === 1 && body) ? body : undefined;
            const mediaSendResult = await sendWhatsAppMedia(phone, waMediaType, mediaId, caption, att.filename, lead.organizationId);
            if (mediaSendResult?.messageId) {
              waMessageIds.push(mediaSendResult.messageId);
            }
          } catch (waErr) {
            logger.error('WhatsApp media send failed for attachment', { err: waErr.message, filename: att.filename });
            lastWaSendErr = waErr;
          }
        }
        // If there's a text body and either no attachments or multiple attachments (caption only sent with single), send text separately
        if (body && (savedAttachments.length !== 1)) {
          try {
            const textSendResult = await sendWhatsAppText(phone, body, lead.organizationId);
            if (textSendResult?.messageId) {
              waMessageIds.push(textSendResult.messageId);
            }
          } catch (waErr) {
            logger.error('WhatsApp text send failed', { err: waErr.message });
            lastWaSendErr = waErr;
          }
        }
        if (waMessageIds.length > 0) {
          const now = new Date();
          const lastWaMessageId = waMessageIds[waMessageIds.length - 1] || null;
          const nextMeta = {
            ...(communication.metadata || {}),
            waMessageIds,
            ...(lastWaMessageId ? { waMessageId: lastWaMessageId } : {}),
            waStatus: 'SENT',
            waStatusUpdatedAt: now.toISOString(),
          };
          await prisma.communication.update({
            where: { id: communication.id },
            data: { metadata: nextMeta },
          }).catch(() => {});
          communication.metadata = nextMeta;
        } else {
          // If WhatsApp send failed (e.g. token/session expired), mark the row as FAILED
          // so the UI doesn't show "delivered" ticks.
          const now = new Date();
          const nextMeta = {
            ...(communication.metadata || {}),
            sendError: lastWaSendErr?.message || 'WhatsApp send failed (no messageId returned)',
            waStatus: 'FAILED',
            waStatusUpdatedAt: now.toISOString(),
          };
          await prisma.communication.update({
            where: { id: communication.id },
            data: { metadata: nextMeta },
          }).catch(() => {});
          communication.metadata = nextMeta;
        }
        // Normalize lead phone if needed
        const rawDigits = lead.phone?.replace(/\D/g, '') || '';
        if (rawDigits && rawDigits !== phone) {
          await prisma.lead.update({ where: { id: leadId }, data: { phone: `+${phone}` } }).catch(() => {});
        }
      }
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

    const enriched = await enrichCommunicationForClient(communication, leadId);

    res.status(201).json(enriched);
    refreshLeadAISummaryAsync(leadId);

    emitCommunicationChange(lead.organizationId, 'created', req.user.id, leadId, enriched);
  } catch (err) { next(err); }
});

// ─── Retry failed WhatsApp outbound message ─────────────────────────
router.post('/messages/:messageId/retry-whatsapp', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const communication = await prisma.communication.findUnique({
      where: { id: messageId },
      include: {
        lead: { select: { id: true, phone: true, organizationId: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!communication || !communication.lead || communication.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (communication.lead.organizationId !== req.user.organizationId) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (communication.channel !== 'WHATSAPP' || communication.direction !== 'OUTBOUND') {
      return res.status(400).json({ error: 'Only outbound WhatsApp messages can be retried' });
    }

    const phone = canonicalPhoneDigitsForWhatsApp(communication.lead.phone?.replace(/\D/g, '') || '');
    if (!phone) {
      const now = new Date();
      const nextMeta = {
        ...(communication.metadata || {}),
        waStatus: 'FAILED',
        sendError: 'Lead has no phone number',
        waStatusUpdatedAt: now.toISOString(),
      };
      await prisma.communication.update({
        where: { id: communication.id },
        data: { metadata: nextMeta },
      }).catch(() => {});
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    const now = new Date();
    let nextMeta = { ...(communication.metadata || {}) };
    const attachmentRows = Array.isArray(nextMeta?.attachments) ? nextMeta.attachments : [];
    try {
      const waMessageIds = [];
      let lastSendErr = null;

      if (attachmentRows.length > 0) {
        for (const att of attachmentRows) {
          const attId = att?.id;
          if (!attId) continue;
          const attachment = await prisma.attachment.findFirst({
            where: { id: attId, leadId: communication.leadId },
            select: { id: true, filename: true, mimeType: true, data: true, storageKey: true },
          });
          if (!attachment) continue;
          try {
            const resolvedFile = await resolveAttachmentBinary(attachment);
            if (!resolvedFile?.buffer) continue;
            const waMediaType = resolveWhatsAppMediaType(resolvedFile.mimeType);
            const { mediaId } = await uploadWhatsAppMedia(
              resolvedFile.buffer,
              resolvedFile.mimeType,
              resolvedFile.filename,
              communication.lead.organizationId
            );
            const caption =
              attachmentRows.length === 1 && communication.body ? communication.body : undefined;
            const mediaSendResult = await sendWhatsAppMedia(
              phone,
              waMediaType,
              mediaId,
              caption,
              resolvedFile.filename,
              communication.lead.organizationId
            );
            if (mediaSendResult?.messageId) {
              waMessageIds.push(mediaSendResult.messageId);
            }
          } catch (attErr) {
            lastSendErr = attErr;
            logger.error('WhatsApp retry failed for attachment', {
              communicationId: communication.id,
              attachmentId: attId,
              error: attErr?.message || String(attErr),
            });
          }
        }
      }

      if (communication.body && attachmentRows.length !== 1) {
        try {
          const sendResult = await sendWhatsAppText(phone, communication.body || '', communication.lead.organizationId);
          if (sendResult?.messageId) {
            waMessageIds.push(sendResult.messageId);
          }
        } catch (textErr) {
          lastSendErr = textErr;
          logger.error('WhatsApp retry failed for text', {
            communicationId: communication.id,
            error: textErr?.message || String(textErr),
          });
        }
      }

      const waMessageId = waMessageIds.length > 0 ? waMessageIds[waMessageIds.length - 1] : null;
      nextMeta = {
        ...nextMeta,
        ...(waMessageIds.length > 0 ? { waMessageIds } : {}),
        ...(waMessageId ? { waMessageId } : {}),
        waStatus: waMessageIds.length > 0 ? 'SENT' : 'FAILED',
        waStatusUpdatedAt: now.toISOString(),
        sendError: waMessageIds.length > 0 ? null : (lastSendErr?.message || 'WhatsApp retry failed'),
      };
    } catch (sendErr) {
      nextMeta = {
        ...nextMeta,
        waStatus: 'FAILED',
        waStatusUpdatedAt: now.toISOString(),
        sendError: sendErr?.message || String(sendErr),
      };
      logger.error('WhatsApp retry failed', {
        communicationId: communication.id,
        leadId: communication.leadId,
        error: sendErr?.message || String(sendErr),
      });
    }

    const updated = await prisma.communication.update({
      where: { id: communication.id },
      data: { metadata: nextMeta },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const enriched = await enrichCommunicationForClient(updated, communication.leadId);
    emitCommunicationChange(communication.lead.organizationId, 'updated', req.user.id, communication.leadId, enriched);
    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// ─── Get Attachments for a Lead ─────────────────────────────────────

router.get('/conversations/:leadId/attachments', async (req, res, next) => {
  try {
    const { leadId } = req.params;

    const lead = await findInboxLead(req, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const attachments = await prisma.attachment.findMany({
      where: { leadId },
      select: { id: true, filename: true, mimeType: true, size: true, url: true, createdAt: true, leadId: true },
      orderBy: { createdAt: 'desc' },
    });

    // Ensure URLs point to the serve endpoint
    const mapped = attachments.map(a => ({
      ...a,
      url: a.url || `/inbox/attachments/file/${a.id}`,
    }));

    res.json(mapped);
  } catch (err) { next(err); }
});

// ─── Mark Conversation as Read ──────────────────────────────────────

router.post('/conversations/:leadId/read', async (req, res, next) => {
  try {
    const { leadId } = req.params;

    const lead = await findInboxLead(req, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Mark all unread inbound messages for this lead as read
    const result = await prisma.communication.updateMany({
      where: { leadId, isRead: false, direction: 'INBOUND' },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ success: true, markedCount: result.count });

    // Pass null as actorId so the current user also receives the update
    // (their lead list needs to refresh channel unread counts)
    broadcastDataChange(lead.organizationId, 'communication', 'updated', null, { entityId: leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Inbox Stats ───────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgFilter = buildInboxOrgFilter(req, divisionId);

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

router.patch('/conversations/:leadId/status', async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const parsed = statusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status value', details: parsed.error.errors });
    }

    const lead = await findInboxLead(req, leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const updateData = { status: parsed.data.status };

    // Auto-sync pipeline stage using manual mapping (if configured) + fallback.
    const [orgStages, org] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { organizationId: lead.organizationId },
        orderBy: { order: 'asc' },
      }),
      prisma.organization.findUnique({
        where: { id: lead.organizationId },
        select: { settings: true },
      }),
    ]);
    const matchingStage = findStageForStatus({
      targetStatus: parsed.data.status,
      stages: orgStages,
      settings: org?.settings || {},
      divisionId: lead.organizationId,
    });
    if (matchingStage) {
      updateData.stageId = matchingStage.id;
    }

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      select: { id: true, status: true, stage: { select: { id: true, name: true, color: true } } },
    });

    res.json(updated);
    refreshLeadAISummaryAsync(leadId);
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

    const lead = await findInboxLead(req, leadId);
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
    refreshLeadAISummaryAsync(leadId);

    broadcastDataChange(lead.organizationId, 'note', 'created', req.user.id, { entityId: leadId }).catch(() => {});
  } catch (err) { next(err); }
});

// ─── Get Notes for a Conversation ───────────────────────────────────

router.get('/conversations/:leadId/notes', async (req, res, next) => {
  try {
    const { leadId } = req.params;

    const lead = await findInboxLead(req, leadId);
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
    if (!req.isSuperAdmin && message.lead.organizationId && !req.orgIds.includes(message.lead.organizationId)) {
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

    const enriched = await enrichCommunicationForClient(updated, message.leadId);
    res.json(enriched);
    refreshLeadAISummaryAsync(message.leadId);

    emitCommunicationChange(message.lead.organizationId, 'updated', req.user.id, message.leadId, enriched);
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
    if (!req.isSuperAdmin && message.lead.organizationId && !req.orgIds.includes(message.lead.organizationId)) {
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

    const afterDelete = await prisma.communication.findUnique({
      where: { id: messageId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const enriched = afterDelete ? await enrichCommunicationForClient(afterDelete, message.leadId) : null;

    res.json({ message: 'Message deleted', communication: enriched });
    refreshLeadAISummaryAsync(message.leadId);

    if (enriched) {
      emitCommunicationChange(message.lead.organizationId, 'updated', req.user.id, message.leadId, enriched);
    }
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
