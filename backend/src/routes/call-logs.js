const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logger } = require('../config/logger');
const { rescoreAndPersist } = require('../utils/leadScoring');
const { createNotification, NOTIFICATION_TYPES } = require('../services/notificationService');
const { regenerateLeadSummaryById } = require('../services/aiService');
const {
  BUILTIN_DISPOSITION_SET,
  BUILTIN_DISPOSITION_KEYS,
  loadDispositionStudioForOrg,
  saveDispositionStudioForOrg,
  validateDispositionFields,
  actionMatchesConditions,
  labelForFieldOption,
} = require('../services/dispositionStudio');
const { findStageForStatus } = require('../utils/statusStageMapping');

const router = Router();
router.use(authenticate, orgScope);

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

async function syncPipelineStage(leadId, orgId, newStatus, currentStageId, userId) {
  try {
    const [orgStages, org] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { organizationId: orgId },
        orderBy: { order: 'asc' },
      }),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { settings: true },
      }),
    ]);

    const matchedStage = findStageForStatus({
      targetStatus: newStatus,
      stages: orgStages,
      settings: org?.settings || {},
      divisionId: orgId,
    });

    if (matchedStage && matchedStage.id !== currentStageId) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { stageId: matchedStage.id },
      });

      await prisma.leadActivity.create({
        data: {
          leadId,
          userId,
          type: 'STAGE_CHANGE',
          description: `Pipeline stage synced to "${matchedStage.name}" (status changed to ${newStatus})`,
          metadata: { oldStageId: currentStageId, newStageId: matchedStage.id, trigger: 'status_pipeline_sync' },
        },
      });

      return matchedStage;
    }
    return null;
  } catch (err) {
    logger.warn('Pipeline stage sync failed:', err.message);
    return null;
  }
}

// ─── Ensure disposition_settings table exists ────────────────────
let dispositionSettingsReady = false;
async function ensureDispositionSettings() {
  if (dispositionSettingsReady) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS disposition_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        disposition VARCHAR(50) NOT NULL,
        require_notes BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, disposition)
      )
    `);
    dispositionSettingsReady = true;
  } catch (err) {
    logger.warn('disposition_settings table check:', err.message);
    dispositionSettingsReady = true; // Don't block on error
  }
}

// ─── Disposition labels for display ──────────────────────────────
const DISPOSITION_LABELS = {
  CALLBACK: 'Call Back Requested',
  CALL_LATER: 'Call Later (Scheduled)',
  CALL_AGAIN: 'Call Again (Anytime)',
  WILL_CALL_US_AGAIN: 'Will Call Us Again (Soft Loop)',
  MEETING_ARRANGED: 'Meeting Arranged',
  APPOINTMENT_BOOKED: 'Appointment Booked',
  INTERESTED: 'Interested - Send Info',
  NOT_INTERESTED: 'Not Interested',
  ALREADY_COMPLETED_SERVICES: 'Already Completed Services',
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

const SOFT_ENGAGEMENT_TAG_NAME = 'Awaiting Client Callback';
const EXPECTED_CALLBACK_WINDOW_DAYS = {
  WITHIN_24_HOURS: 1,
  WITHIN_3_DAYS: 3,
  WITHIN_7_DAYS: 7,
  WITHIN_14_DAYS: 14,
};
const EXPECTED_CALLBACK_WINDOW_LABELS = {
  WITHIN_24_HOURS: 'Within 24 hours',
  WITHIN_3_DAYS: 'Within 3 days',
  WITHIN_7_DAYS: 'Within 7 days',
  WITHIN_14_DAYS: 'Within 14 days',
};
const NOT_INTERESTED_REASON_LABELS = {
  HIGH_PRICE: 'Price too high',
  BUDGET_NOT_AVAILABLE: 'Budget not available',
  INSURANCE_NOT_COVERED: 'Insurance/finance not covered',
  NOT_INTERESTED_IN_SERVICE: 'Not interested in service',
  SERVICE_MISMATCH: 'Service does not match need',
  BAD_TIMING: 'Timing not right',
  CHOSE_COMPETITOR: 'Chose competitor',
  NO_LONGER_NEEDED: 'No longer required',
  NOT_DECISION_MAKER: 'Not decision maker',
  OTHER: 'Other',
};
const COMPLETED_SERVICE_LOCATION_LABELS = {
  INSIDE_CENTER: 'Inside Center',
  OUTSIDE_CENTER: 'Outside Center',
};

// Auto-actions by disposition type
const DISPOSITION_AUTO_ACTIONS = {
  CALLBACK: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Call back', priority: 'HIGH' },
  CALL_LATER: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Scheduled call back', priority: 'HIGH' },
  CALL_AGAIN: { taskType: 'FOLLOW_UP_CALL', taskTitle: 'Call again', priority: 'MEDIUM' },
  WILL_CALL_US_AGAIN: { softEngagement: true },
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

function asObject(value) {
  return (typeof value === 'object' && value !== null) ? value : {};
}

function hasValue(value) {
  return !(value === undefined || value === null || (typeof value === 'string' && value.trim() === ''));
}

function parseLooseDateInput(value) {
  if (!hasValue(value)) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  const normalizedLocal = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  let parsed = new Date(normalizedLocal);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Support locale-style values (MM/DD/YYYY hh:mm AM/PM) from non-standard pickers.
  const localeMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2})(?::(\d{2}))?\s*([AP]M)?)?$/i
  );
  if (localeMatch) {
    const month = Number(localeMatch[1]);
    const day = Number(localeMatch[2]);
    const year = Number(localeMatch[3]);
    let hour = Number(localeMatch[4] || 0);
    const minute = Number(localeMatch[5] || 0);
    const meridiem = (localeMatch[6] || '').toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function pickDispositionDateValue(kind, fieldValues, fields = []) {
  const values = asObject(fieldValues);
  const datetimeFields = Array.isArray(fields)
    ? fields.filter((field) => field?.type === 'datetime')
    : [];

  const keyHints = {
    callback: ['callbackDate', 'callbackAt', 'callbackDateTime', 'scheduledCallbackAt', 'followUpAt', 'callback_date'],
    meeting: ['meetingDate', 'meetingAt', 'meetingDateTime', 'scheduledMeetingAt'],
    appointment: ['appointmentDate', 'appointmentAt', 'appointmentDateTime', 'scheduledAppointmentAt'],
  };
  const labelHintRegex = {
    callback: /callback|call\s*later|follow.?up|schedule/i,
    meeting: /meeting|consultation/i,
    appointment: /appointment|booking/i,
  };

  for (const key of keyHints[kind] || []) {
    if (hasValue(values[key])) return values[key];
  }

  const hintedField = datetimeFields.find((field) =>
    labelHintRegex[kind].test(`${field.key || ''} ${field.label || ''}`)
  );
  if (hintedField && hasValue(values[hintedField.key])) {
    return values[hintedField.key];
  }

  const requiredField = datetimeFields.find(
    (field) => field.required === true && hasValue(values[field.key])
  );
  if (requiredField) {
    return values[requiredField.key];
  }

  return null;
}

async function resolveTargetOrgId(req, divisionId) {
  if (divisionId && req.isSuperAdmin && req.orgIds.includes(divisionId)) return divisionId;
  return req.user.organizationId;
}

function pickDispositionDefinition(studio, dispositionKey) {
  if (!Array.isArray(studio)) return null;
  return studio.find((d) => d.key === dispositionKey && d.isActive !== false) || null;
}

async function executeConfiguredActions({
  actions,
  lead,
  actorId,
  callLogId,
  fieldValues,
  defaultAssigneeId,
}) {
  let createdTaskId = null;
  let statusChangedTo = null;
  for (const action of actions) {
    if (!action?.isActive) continue;
    if (!actionMatchesConditions(action, lead, fieldValues)) continue;

    try {
      if (action.type === 'CREATE_TASK') {
        const config = asObject(action.config);
        const dueInHours = Number.isFinite(Number(config.dueInHours)) ? Number(config.dueInHours) : 24;
        const assigneeId = config.assignee === 'LEAD_ASSIGNEE'
          ? (lead.assignedToId || defaultAssigneeId)
          : defaultAssigneeId;
        if (!assigneeId) continue;

        const task = await prisma.task.create({
          data: {
            title: config.title || `Follow up - ${getDisplayName(lead)}`,
            description: config.description || null,
            type: config.taskType || 'FOLLOW_UP_CALL',
            priority: config.priority || 'MEDIUM',
            status: 'PENDING',
            dueAt: new Date(Date.now() + dueInHours * 60 * 60 * 1000),
            leadId: lead.id,
            assigneeId,
            createdById: actorId || assigneeId,
          },
        });
        createdTaskId = createdTaskId || task.id;
      } else if (action.type === 'UPDATE_STATUS') {
        const status = action?.config?.status;
        if (status && status !== lead.status) {
          const previousStatus = lead.status;
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status },
          });
          await prisma.leadActivity.create({
            data: {
              leadId: lead.id,
              userId: actorId,
              type: 'STATUS_CHANGE',
              description: `Status changed from ${previousStatus} to ${status} (disposition action rule)`,
              metadata: { trigger: 'disposition_action', callLogId, oldStatus: previousStatus, newStatus: status },
            },
          });
          await syncPipelineStage(lead.id, lead.organizationId, status, lead.stageId, actorId);
          statusChangedTo = status;
        }
      } else if (action.type === 'ADD_TAG') {
        const tagName = String(action?.config?.tagName || '').trim();
        if (!tagName) continue;
        const tagColor = String(action?.config?.tagColor || '#6366f1');
        const tag = await prisma.tag.upsert({
          where: {
            organizationId_name: {
              organizationId: lead.organizationId,
              name: tagName,
            },
          },
          update: { color: tagColor },
          create: {
            organizationId: lead.organizationId,
            name: tagName,
            color: tagColor,
          },
        });
        await prisma.leadTag.upsert({
          where: {
            leadId_tagId: {
              leadId: lead.id,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            leadId: lead.id,
            tagId: tag.id,
          },
        });
      } else if (action.type === 'NOTIFY_ASSIGNEE') {
        const assigneeId = lead.assignedToId || defaultAssigneeId;
        if (!assigneeId) continue;
        const title = String(action?.config?.title || `Call disposition action triggered`);
        const message = String(action?.config?.message || `A rule-based action was triggered for ${getDisplayName(lead)}.`);
        await createNotification({
          type: NOTIFICATION_TYPES.SYSTEM_ANNOUNCEMENT,
          title,
          message,
          userId: assigneeId,
          actorId: actorId || null,
          entityType: 'lead',
          entityId: lead.id,
          metadata: { callLogId, trigger: 'disposition_action' },
          organizationId: lead.organizationId,
        });
      }
    } catch (actionErr) {
      logger.warn(`Disposition action failed (${action.type}):`, actionErr.message);
    }
  }

  return { createdTaskId, statusChangedTo };
}

const callLogSchema = z.object({
  leadId: z.string().uuid(),
  disposition: z.string().min(1),
  notes: z.string().optional().nullable(),
  duration: z.number().int().min(0).optional().nullable(),
  callbackDate: z.string().datetime({ offset: true }).optional().nullable(),
  meetingDate: z.string().datetime({ offset: true }).optional().nullable(),
  appointmentDate: z.string().datetime({ offset: true }).optional().nullable(),
  expectedCallbackWindow: z.enum(['WITHIN_24_HOURS', 'WITHIN_3_DAYS', 'WITHIN_7_DAYS', 'WITHIN_14_DAYS']).optional().nullable(),
  notInterestedReason: z.enum([
    'HIGH_PRICE', 'BUDGET_NOT_AVAILABLE', 'INSURANCE_NOT_COVERED',
    'NOT_INTERESTED_IN_SERVICE', 'SERVICE_MISMATCH', 'BAD_TIMING',
    'CHOSE_COMPETITOR', 'NO_LONGER_NEEDED', 'NOT_DECISION_MAKER', 'OTHER',
  ]).optional().nullable(),
  notInterestedOtherText: z.string().optional().nullable(),
  completedServiceLocation: z.enum(['INSIDE_CENTER', 'OUTSIDE_CENTER']).optional().nullable(),
  dynamicFieldValues: z.record(z.any()).optional().nullable(),
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

    const studio = await loadDispositionStudioForOrg(lead.organizationId);
    const selectedDefinition = pickDispositionDefinition(studio, data.disposition);
    const isBuiltinDisposition = BUILTIN_DISPOSITION_SET.has(data.disposition);

    if (!selectedDefinition && !isBuiltinDisposition) {
      return res.status(400).json({
        error: `Unknown call outcome "${data.disposition}". Publish it in settings before use.`,
        field: 'disposition',
      });
    }

    const effectiveDefinition = selectedDefinition || {
      key: data.disposition,
      label: DISPOSITION_LABELS[data.disposition] || data.disposition,
      category: 'Other',
      icon: '📝',
      color: '#6b7280',
      requireNotes: data.disposition === 'OTHER',
      fields: [],
      actions: [],
      mapsTo: data.disposition,
    };

    const storedDisposition = BUILTIN_DISPOSITION_SET.has(effectiveDefinition.mapsTo)
      ? effectiveDefinition.mapsTo
      : (isBuiltinDisposition ? data.disposition : 'OTHER');
    const effectiveLabel = effectiveDefinition.label || DISPOSITION_LABELS[storedDisposition] || data.disposition;

    const dynamicFieldValues = asObject(data.dynamicFieldValues);
    const mergedFieldValues = {
      ...dynamicFieldValues,
      ...(data.callbackDate ? { callbackDate: data.callbackDate } : {}),
      ...(data.meetingDate ? { meetingDate: data.meetingDate } : {}),
      ...(data.appointmentDate ? { appointmentDate: data.appointmentDate } : {}),
      ...(data.expectedCallbackWindow ? { expectedCallbackWindow: data.expectedCallbackWindow } : {}),
      ...(data.notInterestedReason ? { notInterestedReason: data.notInterestedReason } : {}),
      ...(data.notInterestedOtherText ? { notInterestedOtherText: data.notInterestedOtherText } : {}),
      ...(data.completedServiceLocation ? { completedServiceLocation: data.completedServiceLocation } : {}),
    };

    const fieldValidation = validateDispositionFields(effectiveDefinition, mergedFieldValues);
    if (!fieldValidation.valid) {
      const firstError = fieldValidation.errors[0];
      return res.status(400).json({
        error: firstError?.message || 'Please complete required disposition fields.',
        field: firstError?.field || 'dynamicFieldValues',
        details: fieldValidation.errors,
      });
    }

    const callbackDateValue = pickDispositionDateValue('callback', mergedFieldValues, effectiveDefinition.fields || []);
    const meetingDateValue = pickDispositionDateValue('meeting', mergedFieldValues, effectiveDefinition.fields || []);
    const appointmentDateValue = pickDispositionDateValue('appointment', mergedFieldValues, effectiveDefinition.fields || []);
    const callbackDateParsed = parseLooseDateInput(callbackDateValue);
    const meetingDateParsed = parseLooseDateInput(meetingDateValue);
    const appointmentDateParsed = parseLooseDateInput(appointmentDateValue);
    const expectedCallbackWindowValue = mergedFieldValues.expectedCallbackWindow || null;
    const notInterestedReasonValue = mergedFieldValues.notInterestedReason || null;
    const notInterestedOtherTextValue = mergedFieldValues.notInterestedOtherText || null;
    const completedServiceLocationValue = mergedFieldValues.completedServiceLocation || null;

    const notesRequired = effectiveDefinition.requireNotes === true;
    if (notesRequired && (!data.notes || !data.notes.trim())) {
      return res.status(400).json({
        error: `Notes are required when call outcome is "${effectiveLabel}". Please describe the outcome.`,
        field: 'notes',
      });
    }

    // Keep strict built-in validations for backward compatibility.
    if (storedDisposition === 'CALL_LATER') {
      if (!callbackDateValue) {
        return res.status(400).json({
          error: 'A specific date and time is required for "Call Later". The client requested a scheduled callback — please enter exactly when to call.',
          field: 'callbackDate',
        });
      }
      const scheduledTime = new Date(callbackDateValue);
      if (scheduledTime <= new Date()) {
        return res.status(400).json({
          error: 'The scheduled callback date/time must be in the future.',
          field: 'callbackDate',
        });
      }
    }
    if (storedDisposition !== 'WILL_CALL_US_AGAIN' && expectedCallbackWindowValue) {
      return res.status(400).json({
        error: 'Expected callback window can only be set for "Will Call Us Again".',
        field: 'expectedCallbackWindow',
      });
    }
    if (storedDisposition === 'NOT_INTERESTED') {
      if (!notInterestedReasonValue) {
        return res.status(400).json({
          error: 'Please select why the lead is not interested.',
          field: 'notInterestedReason',
        });
      }
      if (notInterestedReasonValue === 'OTHER' && (!notInterestedOtherTextValue || !String(notInterestedOtherTextValue).trim())) {
        return res.status(400).json({
          error: 'Please describe the "Other" reason for not interested.',
          field: 'notInterestedOtherText',
        });
      }
    }
    if (storedDisposition !== 'NOT_INTERESTED' && (notInterestedReasonValue || notInterestedOtherTextValue)) {
      return res.status(400).json({
        error: 'Not interested reason can only be used when outcome is "Not Interested".',
        field: 'notInterestedReason',
      });
    }
    if (storedDisposition === 'ALREADY_COMPLETED_SERVICES' && !completedServiceLocationValue) {
      return res.status(400).json({
        error: 'Please select where the service was completed (inside or outside center).',
        field: 'completedServiceLocation',
      });
    }
    if (storedDisposition !== 'ALREADY_COMPLETED_SERVICES' && completedServiceLocationValue) {
      return res.status(400).json({
        error: 'Completion location can only be used when outcome is "Already Completed Services".',
        field: 'completedServiceLocation',
      });
    }

    const autoAction = DISPOSITION_AUTO_ACTIONS[storedDisposition];
    let statusChangedByAction = autoAction?.statusChange || null;
    let followUpTaskId = null;

    // Create follow-up task if applicable
    if (data.createFollowUp && autoAction?.taskType) {
      const dueAt = callbackDateValue || meetingDateValue || appointmentDateValue
        || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // default: tomorrow

      const task = await prisma.task.create({
        data: {
          title: autoAction.taskTitle + ` - ${getDisplayName(lead)}`,
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
          metadata: { taskId: task.id, disposition: storedDisposition, dispositionKey: effectiveDefinition.key },
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
          description: `Status changed from ${oldStatus} to ${autoAction.statusChange} (call disposition: ${effectiveLabel})`,
          metadata: { oldStatus, newStatus: autoAction.statusChange, trigger: 'call_disposition' },
        },
      });

      // Sync pipeline stage to match new status
      await syncPipelineStage(data.leadId, lead.organizationId, autoAction.statusChange, lead.stageId, req.user.id);
    }

    // Mark first response — logging a call counts as attending to the lead
    if (!lead.firstRespondedAt) {
      await prisma.lead.update({
        where: { id: data.leadId },
        data: { firstRespondedAt: new Date(), slaStatus: 'RESPONDED' },
      });
    }

    // Update lead status to CONTACTED if still NEW (and no disposition auto-action already changed it)
    if (lead.status === 'NEW' && !autoAction?.statusChange) {
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

      // Sync pipeline stage to match CONTACTED status
      await syncPipelineStage(data.leadId, lead.organizationId, 'CONTACTED', lead.stageId, req.user.id);
    }

    // Create the call log record
    const callMetadata = {
      dispositionKey: effectiveDefinition.key,
      dispositionLabel: effectiveLabel,
      dispositionCategory: effectiveDefinition.category || null,
      dispositionIcon: effectiveDefinition.icon || null,
      dispositionColor: effectiveDefinition.color || null,
      dispositionFields: fieldValidation.fieldValues || {},
    };

    // Also keep legacy metadata keys for existing analytics and UI widgets.
    if (expectedCallbackWindowValue) {
      callMetadata.expectedCallbackWindow = expectedCallbackWindowValue;
      callMetadata.expectedCallbackWindowLabel = EXPECTED_CALLBACK_WINDOW_LABELS[expectedCallbackWindowValue];
      callMetadata.inactivityGraceDays = EXPECTED_CALLBACK_WINDOW_DAYS[expectedCallbackWindowValue];
    }
    if (storedDisposition === 'WILL_CALL_US_AGAIN') {
      callMetadata.softEngagementLoop = true;
    }
    if (storedDisposition === 'NOT_INTERESTED') {
      callMetadata.notInterestedReason = notInterestedReasonValue;
      callMetadata.notInterestedReasonLabel = NOT_INTERESTED_REASON_LABELS[notInterestedReasonValue] || notInterestedReasonValue;
      if (notInterestedOtherTextValue && String(notInterestedOtherTextValue).trim()) {
        callMetadata.notInterestedOtherText = String(notInterestedOtherTextValue).trim();
      }
    }
    if (storedDisposition === 'ALREADY_COMPLETED_SERVICES') {
      callMetadata.completedServiceLocation = completedServiceLocationValue;
      callMetadata.completedServiceLocationLabel = COMPLETED_SERVICE_LOCATION_LABELS[completedServiceLocationValue] || completedServiceLocationValue;
    }
    for (const field of (effectiveDefinition.fields || [])) {
      const value = fieldValidation.fieldValues[field.key];
      const optionLabel = labelForFieldOption(field, value);
      if (optionLabel) {
        callMetadata[`${field.key}Label`] = optionLabel;
      }
    }

    const callLog = await prisma.callLog.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        disposition: storedDisposition,
        notes: data.notes || null,
        duration: data.duration || null,
        callbackDate: callbackDateValue ? new Date(callbackDateValue) : null,
        meetingDate: meetingDateValue ? new Date(meetingDateValue) : null,
        appointmentDate: appointmentDateValue ? new Date(appointmentDateValue) : null,
        followUpTaskId,
        metadata: callMetadata,
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
        subject: effectiveLabel,
        body: data.notes || `Call logged: ${effectiveLabel}`,
        metadata: {
          callLogId: callLog.id,
          disposition: storedDisposition,
          dispositionKey: effectiveDefinition.key,
          dispositionLabel: effectiveLabel,
          duration: data.duration,
          expectedCallbackWindow: expectedCallbackWindowValue || null,
          notInterestedReason: notInterestedReasonValue || null,
          notInterestedReasonLabel: notInterestedReasonValue
            ? (NOT_INTERESTED_REASON_LABELS[notInterestedReasonValue] || notInterestedReasonValue)
            : null,
          notInterestedOtherText: notInterestedOtherTextValue ? String(notInterestedOtherTextValue).trim() : null,
          completedServiceLocation: completedServiceLocationValue || null,
          completedServiceLocationLabel: completedServiceLocationValue
            ? (COMPLETED_SERVICE_LOCATION_LABELS[completedServiceLocationValue] || completedServiceLocationValue)
            : null,
          dispositionFields: fieldValidation.fieldValues || {},
        },
      },
    });

    // Log call activity
    await prisma.leadActivity.create({
      data: {
        leadId: data.leadId,
        userId: req.user.id,
        type: 'CALL_MADE',
        description: `Call made - Outcome: ${effectiveLabel}${data.notes ? ` | ${data.notes.substring(0, 100)}` : ''}`,
        metadata: {
          callLogId: callLog.id,
          disposition: storedDisposition,
          dispositionKey: effectiveDefinition.key,
          dispositionLabel: effectiveLabel,
          duration: data.duration,
          followUpTaskId,
          expectedCallbackWindow: expectedCallbackWindowValue || null,
          notInterestedReason: notInterestedReasonValue || null,
          notInterestedReasonLabel: notInterestedReasonValue
            ? (NOT_INTERESTED_REASON_LABELS[notInterestedReasonValue] || notInterestedReasonValue)
            : null,
          notInterestedOtherText: notInterestedOtherTextValue ? String(notInterestedOtherTextValue).trim() : null,
          completedServiceLocation: completedServiceLocationValue || null,
          completedServiceLocationLabel: completedServiceLocationValue
            ? (COMPLETED_SERVICE_LOCATION_LABELS[completedServiceLocationValue] || completedServiceLocationValue)
            : null,
          dispositionFields: fieldValidation.fieldValues || {},
        },
      },
    });

    const configuredActions = (effectiveDefinition.actions || []).filter((action) => action?.isActive !== false);
    if (configuredActions.length > 0) {
      const result = await executeConfiguredActions({
        actions: configuredActions,
        lead,
        actorId: req.user.id,
        callLogId: callLog.id,
        fieldValues: fieldValidation.fieldValues || {},
        defaultAssigneeId: req.user.id,
      });

      if (!followUpTaskId && result.createdTaskId) {
        followUpTaskId = result.createdTaskId;
        await prisma.callLog.update({
          where: { id: callLog.id },
          data: { followUpTaskId },
        });
      }
      if (result.statusChangedTo) {
        statusChangedByAction = result.statusChangedTo;
      }
    }

    // ── Auto-flag Do Not Call leads ──────────────────────────────
    if (storedDisposition === 'DO_NOT_CALL') {
      try {
        await prisma.lead.update({
          where: { id: data.leadId },
          data: {
            doNotCall: true,
            doNotCallAt: new Date(),
            doNotCallById: req.user.id,
          },
        });
        await prisma.leadActivity.create({
          data: {
            leadId: data.leadId,
            userId: req.user.id,
            type: 'STATUS_CHANGE',
            description: 'Lead blocked — marked as Do Not Call. Removed from active outreach.',
            metadata: { trigger: 'call_disposition', disposition: 'DO_NOT_CALL', dispositionKey: effectiveDefinition.key },
          },
        });
        logger.info(`Lead ${data.leadId} marked as Do Not Call by user ${req.user.id}`);
      } catch (dncErr) {
        logger.warn('Failed to auto-flag DNC lead:', dncErr.message);
      }
    }

    // ── Soft engagement loop: classify as awaiting client callback ──
    if (storedDisposition === 'WILL_CALL_US_AGAIN') {
      try {
        const tag = await prisma.tag.upsert({
          where: {
            organizationId_name: {
              organizationId: lead.organizationId,
              name: SOFT_ENGAGEMENT_TAG_NAME,
            },
          },
          update: {},
          create: {
            organizationId: lead.organizationId,
            name: SOFT_ENGAGEMENT_TAG_NAME,
            color: '#6366f1',
          },
        });

        await prisma.leadTag.upsert({
          where: {
            leadId_tagId: {
              leadId: data.leadId,
              tagId: tag.id,
            },
          },
          update: {},
          create: {
            leadId: data.leadId,
            tagId: tag.id,
          },
        });

        await prisma.leadActivity.create({
          data: {
            leadId: data.leadId,
            userId: req.user.id,
            type: 'CUSTOM',
            description: `Soft engagement enabled: "${SOFT_ENGAGEMENT_TAG_NAME}"${expectedCallbackWindowValue ? ` (${EXPECTED_CALLBACK_WINDOW_LABELS[expectedCallbackWindowValue]})` : ''}`,
            metadata: {
              trigger: 'call_disposition',
              disposition: 'WILL_CALL_US_AGAIN',
              dispositionKey: effectiveDefinition.key,
              expectedCallbackWindow: expectedCallbackWindowValue || null,
            },
          },
        });
      } catch (softErr) {
        logger.warn('Failed to apply soft engagement loop tagging:', softErr.message);
      }
    }

    // Rescore lead after call — engagement signals changed
    let newScore = null;
    try {
      const scoreResult = await rescoreAndPersist(data.leadId);
      newScore = scoreResult.score;
    } catch (scoreErr) {
      logger.warn('Post-call rescore failed:', scoreErr.message);
    }

    res.status(201).json({
      callLog,
      followUpTaskId,
      autoActions: {
        statusChanged: statusChangedByAction,
        taskCreated: !!followUpTaskId,
      },
      newScore,
    });
    regenerateLeadSummaryById(data.leadId).catch(() => {});
  } catch (err) {
    next(err);
  }
});

// ─── Get Disposition Options ─────────────────────────────────────
router.get('/dispositions', async (req, res, next) => {
  try {
    const { leadId, divisionId } = req.query;
    let organizationId = await resolveTargetOrgId(req, divisionId);
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: leadId, organizationId: { in: req.orgIds } },
        select: { organizationId: true },
      });
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      organizationId = lead.organizationId;
    }

    const studio = await loadDispositionStudioForOrg(organizationId);
    const dispositions = studio
      .filter((d) => d.isActive !== false)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      .map((d) => {
        const legacyAuto = DISPOSITION_AUTO_ACTIONS[d.mapsTo];
        const hasConfiguredTaskAction = (d.actions || []).some((action) => action.isActive !== false && action.type === 'CREATE_TASK');
        const statusAction = (d.actions || []).find((action) => action.isActive !== false && action.type === 'UPDATE_STATUS');
        return {
          value: d.key,
          label: d.label,
          group: d.category || 'Other',
          icon: d.icon || '📝',
          color: d.color || '#6b7280',
          description: d.description || '',
          mapsTo: d.mapsTo,
          requireNotes: d.requireNotes === true,
          fields: d.fields || [],
          actions: d.actions || [],
          hasFollowUp: hasConfiguredTaskAction || !!legacyAuto?.taskType,
          autoStatus: statusAction?.config?.status || legacyAuto?.statusChange || null,
        };
      });

    res.json(dispositions);
  } catch (err) {
    next(err);
  }
});

// ─── Read full Disposition Studio config ─────────────────────────
router.get('/dispositions/studio', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgId = await resolveTargetOrgId(req, divisionId);
    const dispositions = await loadDispositionStudioForOrg(orgId);
    res.json({ divisionId: orgId, dispositions });
  } catch (err) {
    next(err);
  }
});

// ─── Save Disposition Studio config (Admin only) ─────────────────
router.put('/dispositions/studio', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { divisionId, dispositions } = req.body || {};
    if (!Array.isArray(dispositions)) {
      return res.status(400).json({ error: 'dispositions must be an array' });
    }
    const orgId = await resolveTargetOrgId(req, divisionId);
    const saved = await saveDispositionStudioForOrg(orgId, dispositions, req.user.id);
    res.json({ divisionId: orgId, dispositions: saved });
  } catch (err) {
    next(err);
  }
});

// ─── Compatibility: Settings summary for note requirement ─────────
router.get('/dispositions/settings', async (req, res, next) => {
  try {
    const { divisionId } = req.query;
    const orgId = await resolveTargetOrgId(req, divisionId);
    const dispositions = await loadDispositionStudioForOrg(orgId);
    res.json(
      dispositions
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map((d) => ({
          disposition: d.key,
          label: d.label,
          requireNotes: d.requireNotes === true,
          isActive: d.isActive !== false,
          mapsTo: d.mapsTo,
        }))
    );
  } catch (err) {
    next(err);
  }
});

// ─── Compatibility: update note requirement only ──────────────────
router.put('/dispositions/settings', async (req, res, next) => {
  try {
    if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { settings, divisionId } = req.body || {};
    if (!Array.isArray(settings)) {
      return res.status(400).json({ error: 'settings must be an array of { disposition, requireNotes }' });
    }

    const orgId = await resolveTargetOrgId(req, divisionId);
    const existing = await loadDispositionStudioForOrg(orgId);
    const patchMap = new Map(settings.map((item) => [item.disposition, item]));
    const updated = existing.map((d) => {
      const patch = patchMap.get(d.key);
      if (!patch) return d;
      return { ...d, requireNotes: patch.requireNotes === true };
    });

    const saved = await saveDispositionStudioForOrg(orgId, updated, req.user.id);
    res.json(saved.map((d) => ({ disposition: d.key, label: d.label, requireNotes: d.requireNotes === true })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
