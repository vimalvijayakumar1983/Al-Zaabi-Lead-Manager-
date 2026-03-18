const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logger } = require('../config/logger');

const router = Router();
router.use(authenticate, orgScope);

// ─── Disposition labels for display ──────────────────────────────
const DISPOSITION_LABELS = {
  CALLBACK: 'Call Back Requested',
  MEETING_ARRANGED: 'Meeting Arranged',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  INTERESTED: 'Interested - Send Info',
  NOT_INTERESTED: 'Not Interested',
  NO_ANSWER: 'No Answer',
  VOICEMAIL_LEFT: 'Voicemail Left',
  WRONG_NUMBER: 'Wrong Number',
  BUSY: 'Line Busy',
  GATEKEEPER: 'Reached Gatekeeper',
  FOLLOW_UP_EMAIL: 'Follow-up Email Requested',
  QUALIFIED: 'Lead Qualified',
  PROPOSAL_REQUESTED: 'Proposal Requested',
  DO_NOT_CALL: 'Do Not Call',
  OTHER: 'Other',
};

// Auto-actions by disposition type
const DISPOSITION_AUTO_ACTIONS = {
  CALLBACK: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Call back', priority: 'HIGH' },
  MEETING_ARRANGED: { taskType: 'MEETING', taskTitle: 'Scheduled meeting', priority: 'HIGH', statusChange: 'QUALIFIED' },
  APPOINTMENT_BOOKED: { taskType: 'MEETING', taskTitle: 'Appointment', priority: 'HIGH', statusChange: 'QUALIFIED' },
  INTERESTED: { taskType: 'EMAIL', taskTitle: 'Send information to interested lead', priority: 'MEDIUM' },
  NO_ANSWER: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Retry call - no answer', priority: 'MEDIUM' },
  VOICEMAIL_LEFT: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Follow up after voicemail', priority: 'MEDIUM' },
  BUSY: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Retry call - was busy', priority: 'MEDIUM' },
  GATEKEEPER: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Call back - get past gatekeeper', priority: 'MEDIUM' },
  FOLLOW_UP_EMAIL: { taskType: 'EMAIL', taskTitle: 'Send follow-up email as requested', priority: 'HIGH' },
  QUALIFIED: { statusChange: 'QUALIFIED' },
  PROPOSAL_REQUESTED: { taskType: 'PROPOSAL', taskTitle: 'Prepare and send proposal', priority: 'HIGH', statusChange: 'PROPOSAL_SENT' },
};

const callLogSchema = z.object({
  leadId: z.string().uuid(),
  disposition: z.enum([
    'CALLBACK', 'MEETING_ARRANGED', 'APPOINTMENT_BOOKED', 'INTERESTED',
    'NOT_INTERESTED', 'NO_ANSWER', 'VOICEMAIL_LEFT', 'WRONG_NUMBER',
    'BUSY', 'GATEKEEPER', 'FOLLOW_UP_EMAIL', 'QUALIFIED',
    'PROPOSAL_REQUESTED', 'DO_NOT_CALL', 'OTHER',
  ]),
  notes: z.string().optional().nullable(),
  duration: z.number().int().min(0).optional().nullable(),
  callbackDate: z.string().datetime({ offset: true }).optional().nullable(),
  meetingDate: z.string().datetime({ offset: true }).optional().nullable(),
  appointmentDate: z.string().datetime({ offset: true }).optional().nullable(),
  createFollowUp: z.boolean().optional().default(true),
});

// ─── List Call Logs for a Lead ───────────────────────────────────
router.get('/lead/:leadId', async (req, res, next) => {
  try {
    const callLogs = await prisma.callLog.findMany({
      where: {
        leadId: req.params.leadId,
        lead: { organizationId: { in: req.orgIds } },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(callLogs);
  } catch (err) {
    next(err);
  }
});

// ─── Log a Call with Disposition ─────────────────────────────────
router.post('/', validate(callLogSchema), async (req, res, next) => {
  try {
    const data = req.validated;

    // Verify lead belongs to org
    const lead = await prisma.lead.findFirst({
      where: { id: data.leadId, organizationId: { in: req.orgIds } },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const autoAction = DISPOSITION_AUTO_ACTIONS[data.disposition];
    let followUpTaskId = null;

    // Create follow-up task if applicable
    if (data.createFollowUp && autoAction?.taskType) {
      const dueAt = data.callbackDate || data.meetingDate || data.appointmentDate
        || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default: tomorrow

      const task = await prisma.task.create({
        data: {
          title: autoAction.taskTitle + ` - ${lead.firstName} ${lead.lastName}`,
          description: data.notes || null,
          type: autoAction.taskType,
          priority: autoAction.priority || 'MEDIUM',
          status: 'PENDING',
          dueAt: new Date(dueAt),
          leadId: data.leadId,
          assigneeId: req.user.id,
          createdById: req.user.id,
        },
      });
      followUpTaskId = task.id;

      // Log task activity
      await prisma.leadActivity.create({
        data: {
          leadId: data.leadId,
          userId: req.user.id,
          type: 'TASK_CREATED',
          description: `Auto-created task: ${task.title}`,
          metadata: { taskId: task.id, disposition: data.disposition },
        },
      });
    }

    // Auto-update lead status if disposition warrants it
    if (autoAction?.statusChange && lead.status !== 'WON' && lead.status !== 'LOST') {
      const oldStatus = lead.status;
      await prisma.lead.update({
        where: { id: data.leadId },
        data: { status: autoAction.statusChange },
      });

      await prisma.leadActivity.create({
        data: {
          leadId: data.leadId,
          userId: req.user.id,
          type: 'STATUS_CHANGE',
          description: `Status changed from ${oldStatus} to ${autoAction.statusChange} (call disposition: ${DISPOSITION_LABELS[data.disposition]})`,
          metadata: { oldStatus, newStatus: autoAction.statusChange, trigger: 'call_disposition' },
        },
      });
    }

    // Mark first response — logging a call counts as attending to the lead
    if (!lead.firstRespondedAt) {
      await prisma.lead.update({
        where: { id: data.leadId },
        data: { firstRespondedAt: new Date(), slaStatus: 'RESPONDED' },
      });
    }

    // Update lead status to CONTACTED if still NEW
    if (lead.status === 'NEW') {
      await prisma.lead.update({
        where: { id: data.leadId },
        data: { status: 'CONTACTED' },
      });

      await prisma.leadActivity.create({
        data: {
          leadId: data.leadId,
          userId: req.user.id,
          type: 'STATUS_CHANGE',
          description: 'Status changed from NEW to CONTACTED (call logged)',
          metadata: { oldStatus: 'NEW', newStatus: 'CONTACTED', trigger: 'call_log' },
        },
      });
    }

    // Create the call log record
    const callLog = await prisma.callLog.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        disposition: data.disposition,
        notes: data.notes || null,
        duration: data.duration || null,
        callbackDate: data.callbackDate ? new Date(data.callbackDate) : null,
        meetingDate: data.meetingDate ? new Date(data.meetingDate) : null,
        appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : null,
        followUpTaskId,
        metadata: {},
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Also log as a communication (PHONE OUTBOUND)
    await prisma.communication.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        channel: 'PHONE',
        direction: 'OUTBOUND',
        subject: DISPOSITION_LABELS[data.disposition],
        body: data.notes || `Call logged: ${DISPOSITION_LABELS[data.disposition]}`,
        metadata: {
          callLogId: callLog.id,
          disposition: data.disposition,
          duration: data.duration,
        },
      },
    });

    // Log call activity
    await prisma.leadActivity.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        type: 'CALL_MADE',
        description: `Call made - Outcome: ${DISPOSITION_LABELS[data.disposition]}${data.notes ? ` | ${data.notes.substring(0, 100)}` : ''}`,
        metadata: {
          callLogId: callLog.id,
          disposition: data.disposition,
          duration: data.duration,
          followUpTaskId,
        },
      },
    });

    res.status(201).json({
      callLog,
      followUpTaskId,
      autoActions: {
        statusChanged: autoAction?.statusChange || null,
        taskCreated: !!followUpTaskId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Disposition Options ─────────────────────────────────────
router.get('/dispositions', (_req, res) => {
  const dispositions = Object.entries(DISPOSITION_LABELS).map(([value, label]) => ({
    value,
    label,
    hasFollowUp: !!DISPOSITION_AUTO_ACTIONS[value]?.taskType,
    autoStatus: DISPOSITION_AUTO_ACTIONS[value]?.statusChange || null,
  }));
  res.json(dispositions);
});

module.exports = router;
