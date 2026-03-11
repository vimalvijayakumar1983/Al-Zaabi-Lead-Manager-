const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

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

// ─── List Communications for a Lead ──────────────────────────────
router.get('/lead/:leadId', async (req, res, next) => {
  try {
    const communications = await prisma.communication.findMany({
      where: {
        leadId: req.params.leadId,
        lead: { organizationId: req.orgId },
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
      where: { id: data.leadId, organizationId: req.orgId },
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

    // In production, send via SMTP/Nodemailer
    // For now, log the communication
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

module.exports = router;
