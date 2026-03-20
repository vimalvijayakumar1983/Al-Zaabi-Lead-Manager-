const { prisma } = require('../config/database');

const STUDIO_SETTINGS_KEY = 'callDispositionStudioV2';

const BUILTIN_DISPOSITION_KEYS = [
  'CALLBACK',
  'CALL_LATER',
  'CALL_AGAIN',
  'WILL_CALL_US_AGAIN',
  'MEETING_ARRANGED',
  'APPOINTMENT_BOOKED',
  'INTERESTED',
  'NOT_INTERESTED',
  'ALREADY_COMPLETED_SERVICES',
  'NO_ANSWER',
  'VOICEMAIL_LEFT',
  'WRONG_NUMBER',
  'BUSY',
  'GATEKEEPER',
  'FOLLOW_UP_EMAIL',
  'QUALIFIED',
  'PROPOSAL_REQUESTED',
  'DO_NOT_CALL',
  'OTHER',
];

const BUILTIN_DISPOSITION_SET = new Set(BUILTIN_DISPOSITION_KEYS);

function defaultDispositions() {
  return [
    { key: 'CALL_LATER', label: 'Call Later (Scheduled)', category: 'Follow-up', icon: '🕐', color: '#f59e0b', isActive: true, sortOrder: 10, mapsTo: 'CALL_LATER', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: true, validation: { futureOnly: true } }], actions: [] },
    { key: 'CALL_AGAIN', label: 'Call Again (Anytime)', category: 'Follow-up', icon: '🔄', color: '#3b82f6', isActive: true, sortOrder: 20, mapsTo: 'CALL_AGAIN', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
    { key: 'WILL_CALL_US_AGAIN', label: 'Will Call Us Again', category: 'Follow-up', icon: '🤝', color: '#6366f1', isActive: true, sortOrder: 30, mapsTo: 'WILL_CALL_US_AGAIN', requireNotes: false, fields: [{ key: 'expectedCallbackWindow', label: 'Expected Callback Window', type: 'select', required: false, options: [{ value: 'WITHIN_24_HOURS', label: 'Within 24 hours' }, { value: 'WITHIN_3_DAYS', label: 'Within 3 days' }, { value: 'WITHIN_7_DAYS', label: 'Within 7 days' }, { value: 'WITHIN_14_DAYS', label: 'Within 14 days' }] }], actions: [] },
    { key: 'MEETING_ARRANGED', label: 'Meeting Arranged', category: 'Positive', icon: '📅', color: '#10b981', isActive: true, sortOrder: 40, mapsTo: 'MEETING_ARRANGED', requireNotes: false, fields: [{ key: 'meetingDate', label: 'Meeting Date & Time', type: 'datetime', required: true }], actions: [] },
    { key: 'APPOINTMENT_BOOKED', label: 'Appointment Booked', category: 'Positive', icon: '✅', color: '#10b981', isActive: true, sortOrder: 50, mapsTo: 'APPOINTMENT_BOOKED', requireNotes: false, fields: [{ key: 'appointmentDate', label: 'Appointment Date & Time', type: 'datetime', required: true }], actions: [] },
    { key: 'INTERESTED', label: 'Interested - Send Info', category: 'Positive', icon: '👍', color: '#16a34a', isActive: true, sortOrder: 60, mapsTo: 'INTERESTED', requireNotes: false, fields: [], actions: [] },
    { key: 'QUALIFIED', label: 'Lead Qualified', category: 'Positive', icon: '⭐', color: '#22c55e', isActive: true, sortOrder: 70, mapsTo: 'QUALIFIED', requireNotes: false, fields: [], actions: [] },
    { key: 'PROPOSAL_REQUESTED', label: 'Proposal Requested', category: 'Positive', icon: '📋', color: '#a855f7', isActive: true, sortOrder: 80, mapsTo: 'PROPOSAL_REQUESTED', requireNotes: false, fields: [], actions: [] },
    { key: 'FOLLOW_UP_EMAIL', label: 'Follow-up Email Requested', category: 'Follow-up', icon: '📧', color: '#2563eb', isActive: true, sortOrder: 90, mapsTo: 'FOLLOW_UP_EMAIL', requireNotes: false, fields: [], actions: [] },
    { key: 'NO_ANSWER', label: 'No Answer', category: 'Retry', icon: '📵', color: '#f59e0b', isActive: true, sortOrder: 100, mapsTo: 'NO_ANSWER', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
    { key: 'VOICEMAIL_LEFT', label: 'Voicemail Left', category: 'Retry', icon: '📨', color: '#f59e0b', isActive: true, sortOrder: 110, mapsTo: 'VOICEMAIL_LEFT', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
    { key: 'BUSY', label: 'Line Busy', category: 'Retry', icon: '📞', color: '#f59e0b', isActive: true, sortOrder: 120, mapsTo: 'BUSY', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
    { key: 'GATEKEEPER', label: 'Reached Gatekeeper', category: 'Retry', icon: '🚧', color: '#f59e0b', isActive: true, sortOrder: 130, mapsTo: 'GATEKEEPER', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
    { key: 'NOT_INTERESTED', label: 'Not Interested', category: 'Closed', icon: '👎', color: '#ef4444', isActive: true, sortOrder: 140, mapsTo: 'NOT_INTERESTED', requireNotes: false, fields: [{ key: 'notInterestedReason', label: 'Reason for Not Interested', type: 'select', required: true, options: [{ value: 'HIGH_PRICE', label: 'Price too high' }, { value: 'BUDGET_NOT_AVAILABLE', label: 'Budget not available' }, { value: 'INSURANCE_NOT_COVERED', label: 'Insurance/finance not covered' }, { value: 'NOT_INTERESTED_IN_SERVICE', label: 'Not interested in service' }, { value: 'SERVICE_MISMATCH', label: 'Service does not match need' }, { value: 'BAD_TIMING', label: 'Timing not right' }, { value: 'CHOSE_COMPETITOR', label: 'Chose competitor' }, { value: 'NO_LONGER_NEEDED', label: 'No longer required' }, { value: 'NOT_DECISION_MAKER', label: 'Not decision maker' }, { value: 'OTHER', label: 'Other' }] }, { key: 'notInterestedOtherText', label: 'Specify Other Reason', type: 'text', required: true, showWhen: { fieldKey: 'notInterestedReason', equals: 'OTHER' } }], actions: [] },
    { key: 'ALREADY_COMPLETED_SERVICES', label: 'Already Completed Services', category: 'Closed', icon: '🏁', color: '#10b981', isActive: true, sortOrder: 150, mapsTo: 'ALREADY_COMPLETED_SERVICES', requireNotes: false, fields: [{ key: 'completedServiceLocation', label: 'Service Completed Where?', type: 'select', required: true, options: [{ value: 'INSIDE_CENTER', label: 'Inside Center' }, { value: 'OUTSIDE_CENTER', label: 'Outside Center' }] }], actions: [] },
    { key: 'WRONG_NUMBER', label: 'Wrong Number', category: 'Closed', icon: '❌', color: '#ef4444', isActive: true, sortOrder: 160, mapsTo: 'WRONG_NUMBER', requireNotes: false, fields: [], actions: [] },
    { key: 'DO_NOT_CALL', label: 'Do Not Call', category: 'Closed', icon: '🚫', color: '#dc2626', isActive: true, sortOrder: 170, mapsTo: 'DO_NOT_CALL', requireNotes: false, fields: [], actions: [] },
    { key: 'OTHER', label: 'Other', category: 'Other', icon: '📝', color: '#6b7280', isActive: true, sortOrder: 180, mapsTo: 'OTHER', requireNotes: true, fields: [], actions: [] },
    { key: 'CALLBACK', label: 'Call Back Requested', category: 'Follow-up', icon: '☎️', color: '#f59e0b', isActive: false, sortOrder: 999, mapsTo: 'CALLBACK', requireNotes: false, fields: [{ key: 'callbackDate', label: 'Callback Date & Time', type: 'datetime', required: false }], actions: [] },
  ];
}

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function sanitizeField(field, index) {
  const key = sanitizeString(field?.key || `field_${index + 1}`).replace(/\s+/g, '_');
  const type = ['text', 'textarea', 'number', 'select', 'datetime', 'boolean'].includes(field?.type) ? field.type : 'text';
  const options = Array.isArray(field?.options)
    ? field.options
        .map((o) => ({ value: sanitizeString(o?.value), label: sanitizeString(o?.label || o?.value) }))
        .filter((o) => o.value)
    : [];

  const showWhen = field?.showWhen && typeof field.showWhen === 'object'
    ? {
        fieldKey: sanitizeString(field.showWhen.fieldKey),
        equals: field.showWhen.equals,
      }
    : null;

  const validation = field?.validation && typeof field.validation === 'object'
    ? {
        min: typeof field.validation.min === 'number' ? field.validation.min : undefined,
        max: typeof field.validation.max === 'number' ? field.validation.max : undefined,
        minLength: typeof field.validation.minLength === 'number' ? field.validation.minLength : undefined,
        maxLength: typeof field.validation.maxLength === 'number' ? field.validation.maxLength : undefined,
        futureOnly: field.validation.futureOnly === true,
      }
    : {};

  return {
    key,
    label: sanitizeString(field?.label || key),
    type,
    required: field?.required === true,
    placeholder: sanitizeString(field?.placeholder || ''),
    options,
    showWhen,
    validation,
  };
}

function sanitizeAction(action) {
  const allowedTypes = ['CREATE_TASK', 'UPDATE_STATUS', 'ADD_TAG', 'NOTIFY_ASSIGNEE'];
  const type = allowedTypes.includes(action?.type) ? action.type : 'CREATE_TASK';
  const conditions = action?.conditions && typeof action.conditions === 'object' ? action.conditions : {};
  const config = action?.config && typeof action.config === 'object' ? action.config : {};
  return {
    type,
    isActive: action?.isActive !== false,
    conditions,
    config,
  };
}

function sanitizeDisposition(disposition, index) {
  const rawKey = sanitizeString(disposition?.key || `CUSTOM_${index + 1}`);
  const key = rawKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const mapsToCandidate = sanitizeString(disposition?.mapsTo || (BUILTIN_DISPOSITION_SET.has(key) ? key : 'OTHER')).toUpperCase();
  const mapsTo = BUILTIN_DISPOSITION_SET.has(mapsToCandidate) ? mapsToCandidate : 'OTHER';
  const fields = Array.isArray(disposition?.fields) ? disposition.fields.map(sanitizeField).filter((f) => !!f.key) : [];
  const actions = Array.isArray(disposition?.actions) ? disposition.actions.map(sanitizeAction) : [];

  return {
    key,
    label: sanitizeString(disposition?.label || key.replace(/_/g, ' ')),
    description: sanitizeString(disposition?.description || ''),
    category: sanitizeString(disposition?.category || 'Other'),
    icon: sanitizeString(disposition?.icon || '📝'),
    color: sanitizeString(disposition?.color || '#6b7280'),
    isActive: disposition?.isActive !== false,
    sortOrder: Number.isFinite(Number(disposition?.sortOrder)) ? Number(disposition.sortOrder) : (index + 1) * 10,
    mapsTo,
    requireNotes: disposition?.requireNotes === true,
    builtIn: BUILTIN_DISPOSITION_SET.has(key),
    fields,
    actions,
  };
}

function sanitizeStudioDispositions(dispositions) {
  const source = Array.isArray(dispositions) && dispositions.length > 0 ? dispositions : defaultDispositions();
  const normalized = source.map(sanitizeDisposition);
  const deduped = [];
  const seen = new Set();
  for (const disposition of normalized.sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (seen.has(disposition.key)) continue;
    seen.add(disposition.key);
    deduped.push(disposition);
  }
  return deduped;
}

async function loadDispositionStudioForOrg(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = (typeof org?.settings === 'object' && org?.settings !== null) ? org.settings : {};
  const stored = settings[STUDIO_SETTINGS_KEY]?.dispositions;
  return sanitizeStudioDispositions(stored);
}

async function saveDispositionStudioForOrg(organizationId, dispositions, userId) {
  const normalized = sanitizeStudioDispositions(dispositions);
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = (typeof org?.settings === 'object' && org?.settings !== null) ? org.settings : {};
  settings[STUDIO_SETTINGS_KEY] = {
    dispositions: normalized,
    updatedAt: new Date().toISOString(),
    updatedBy: userId || null,
  };
  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings },
  });
  return normalized;
}

function isFieldVisible(field, values) {
  if (!field?.showWhen || !field.showWhen.fieldKey) return true;
  return values?.[field.showWhen.fieldKey] === field.showWhen.equals;
}

function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function validateDispositionFields(definition, values) {
  const errors = [];
  const fieldMap = {};
  const source = (values && typeof values === 'object') ? values : {};

  for (const field of (definition?.fields || [])) {
    if (!isFieldVisible(field, source)) continue;
    const value = source[field.key];
    fieldMap[field.key] = value;
    if (field.required && isEmptyValue(value)) {
      errors.push({ field: field.key, message: `${field.label} is required.` });
      continue;
    }
    if (isEmptyValue(value)) continue;

    if (field.type === 'number') {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push({ field: field.key, message: `${field.label} must be a valid number.` });
        continue;
      }
      if (typeof field.validation?.min === 'number' && num < field.validation.min) {
        errors.push({ field: field.key, message: `${field.label} must be at least ${field.validation.min}.` });
      }
      if (typeof field.validation?.max === 'number' && num > field.validation.max) {
        errors.push({ field: field.key, message: `${field.label} must be at most ${field.validation.max}.` });
      }
    }

    if (field.type === 'select') {
      const optionValues = new Set((field.options || []).map((option) => option.value));
      if (optionValues.size > 0 && !optionValues.has(String(value))) {
        errors.push({ field: field.key, message: `${field.label} has an invalid option selected.` });
      }
    }

    if (field.type === 'datetime') {
      const dt = new Date(String(value));
      if (Number.isNaN(dt.getTime())) {
        errors.push({ field: field.key, message: `${field.label} must be a valid date and time.` });
        continue;
      }
      if (field.validation?.futureOnly === true && dt <= new Date()) {
        errors.push({ field: field.key, message: `${field.label} must be in the future.` });
      }
    }

    if (typeof value === 'string') {
      if (typeof field.validation?.minLength === 'number' && value.trim().length < field.validation.minLength) {
        errors.push({ field: field.key, message: `${field.label} must be at least ${field.validation.minLength} characters.` });
      }
      if (typeof field.validation?.maxLength === 'number' && value.trim().length > field.validation.maxLength) {
        errors.push({ field: field.key, message: `${field.label} must be at most ${field.validation.maxLength} characters.` });
      }
    }
  }

  return { valid: errors.length === 0, errors, fieldValues: fieldMap };
}

function actionMatchesConditions(action, lead, fieldValues) {
  const conditions = action?.conditions || {};
  if (Array.isArray(conditions.leadStatusIn) && conditions.leadStatusIn.length > 0) {
    if (!conditions.leadStatusIn.includes(lead.status)) return false;
  }
  if (Array.isArray(conditions.leadSourceIn) && conditions.leadSourceIn.length > 0) {
    if (!conditions.leadSourceIn.includes(lead.source)) return false;
  }
  if (typeof conditions.minScore === 'number' && Number(lead.score || 0) < conditions.minScore) return false;
  if (typeof conditions.maxScore === 'number' && Number(lead.score || 0) > conditions.maxScore) return false;
  if (conditions.fieldEquals && typeof conditions.fieldEquals === 'object') {
    for (const [key, expected] of Object.entries(conditions.fieldEquals)) {
      if (fieldValues?.[key] !== expected) return false;
    }
  }
  return true;
}

function labelForFieldOption(field, value) {
  if (isEmptyValue(value)) return null;
  if (field?.type === 'select') {
    const option = (field.options || []).find((item) => item.value === value);
    return option?.label || null;
  }
  return null;
}

module.exports = {
  BUILTIN_DISPOSITION_KEYS,
  BUILTIN_DISPOSITION_SET,
  STUDIO_SETTINGS_KEY,
  defaultDispositions,
  sanitizeStudioDispositions,
  loadDispositionStudioForOrg,
  saveDispositionStudioForOrg,
  validateDispositionFields,
  actionMatchesConditions,
  labelForFieldOption,
};
