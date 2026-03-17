const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sendText, sendTemplate } = require('../services/whatsappService');
const { sendEmail } = require('../services/emailService');
const { logger } = require('../config/logger');

const router = Router();
router.use(authenticate, orgScope);

const communicationSchema = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS', 'PHONE', 'CHAT']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ─── List WhatsApp conversations (leads with ≥1 WHATSAPP message) ─
router.get('/whatsapp-conversations', async (req, res, next) => {
  try {
    const comms = await prisma.communication.findMany({
      where: {
        channel: 'WHATSAPP',
        lead: { organizationId: req.orgId },
      },
      select: {
        id: true,
        body: true,
        direction: true,
        createdAt: true,
        leadId: true,
        lead: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const byLead = new Map();
    for (const c of comms) {
      if (!byLead.has(c.leadId)) {
        byLead.set(c.leadId, {
          lead: c.lead,
          lastMessage: { body: c.body, createdAt: c.createdAt, direction: c.direction },
        });
      }
    }
    const list = Array.from(byLead.values()).sort(
      (a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt)
    );
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// ─── List Communications for a Lead ──────────────────────────────
router.get('/lead/:leadId', async (req, res, next) => {
  try {
    const communications = await prisma.communication.findMany({
      where: {
        leadId: req.params.leadId,
        lead: { organizationId: { in: req.orgIds } },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(communications);
  } catch (err) {
    next(err);
  }
});

// ─── Log Communication ───────────────────────────────────────────
router.post('/', validate(communicationSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const communication = await prisma.communication.create({
      data: { ...data, userId: req.user.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Log activity
    const activityType = `${data.channel}_${data.direction === 'OUTBOUND' ? 'SENT' : 'RECEIVED'}`;
    const validTypes = [
      'EMAIL_SENT', 'EMAIL_RECEIVED', 'WHATSAPP_SENT', 'WHATSAPP_RECEIVED',
      'CALL_MADE', 'CALL_RECEIVED',
    ];

    await prisma.leadActivity.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        type: validTypes.includes(activityType) ? activityType : 'CUSTOM',
        description: `${data.channel} ${data.direction.toLowerCase()}: ${data.subject || data.body.substring(0, 100)}`,
      },
    });

    res.status(201).json(communication);
  } catch (err) {
    next(err);
  }
});

// ─── Send Email ──────────────────────────────────────────────────
router.post('/send-email', validate(z.object({
  leadId: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
})), async (req, res, next) => {
  try {
    const { leadId, to, subject, body } = req.validated;

    // Verify lead belongs to accessible orgs
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Send via SMTP
    const emailResult = await sendEmail({
      to,
      subject,
      html: body,
      organizationId: lead.organizationId,
    });

    if (!emailResult.success) {
      logger.warn(`Email send failed for lead ${leadId}: ${emailResult.error}`);
    }

    const communication = await prisma.communication.create({
      data: {
        leadId,
        userId: req.user.id,
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        subject,
        body,
        metadata: { to },
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.id,
        type: 'EMAIL_SENT',
        description: `Email sent: ${subject}`,
      },
    });

    res.status(201).json(communication);
  } catch (err) {
    next(err);
  }
});

// ─── Send WhatsApp ──────────────────────────────────────────────
router.post('/send-whatsapp', validate(z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1).max(4096),
})), async (req, res, next) => {
  try {
    const { leadId, body } = req.validated;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: req.orgId },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const phone = lead.phone?.replace(/\D/g, '');
    if (!phone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    // Save communication first so it always appears in chat; then send via API
    const communication = await prisma.communication.create({
      data: {
        leadId,
        userId: req.user.id,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        body,
        metadata: { to: lead.phone },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.id,
        type: 'WHATSAPP_SENT',
        description: `WhatsApp sent: ${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`,
      },
    });

    try {
      await sendText(phone, body, req.orgId);
    } catch (sendErr) {
      await prisma.communication.update({
        where: { id: communication.id },
        data: { metadata: { ...(communication.metadata || {}), sendError: sendErr.message } },
      }).catch(() => {});
      throw sendErr;
    }

    res.status(201).json(communication);
  } catch (err) {
    next(err);
  }
});

// ─── Send WhatsApp template (e.g. hello_world) to open 24h window ─
router.post('/send-whatsapp-template', validate(z.object({
  leadId: z.string().uuid(),
  templateName: z.string().optional(),
  languageCode: z.string().optional(),
})), async (req, res, next) => {
  try {
    const { leadId, templateName = 'hello_world', languageCode = 'en_US' } = req.validated;

    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: req.orgId },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const phone = lead.phone?.replace(/\D/g, '');
    if (!phone) {
      return res.status(400).json({ error: 'Lead has no phone number' });
    }

    await sendTemplate(phone, templateName, languageCode, req.orgId);

    const communication = await prisma.communication.create({
      data: {
        leadId,
        userId: req.user.id,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        body: `[Template: ${templateName}]`,
        metadata: { to: lead.phone, template: templateName },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        userId: req.user.id,
        type: 'WHATSAPP_SENT',
        description: `WhatsApp template sent: ${templateName}`,
      },
    });

    res.status(201).json(communication);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
