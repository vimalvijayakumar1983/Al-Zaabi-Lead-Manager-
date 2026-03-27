const { z } = require('zod');

const incentiveEventTypes = z.enum([
  'outreach_made',
  'appointment_booked',
  'visit_checked_in',
  'conversion_won',
  'invoice_posted',
  'refund_issued',
  'cancellation',
  'renewal',
  'custom_event',
]);

const ingestEventBody = z.object({
  divisionId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  eventType: incentiveEventTypes,
  occurredAt: z.string().datetime().or(z.coerce.date()),
  sourceSystem: z.string().max(100).optional(),
  sourceMetadata: z.record(z.unknown()).optional(),
  payload: z.record(z.unknown()).optional(),
  leadId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  dealId: z.string().uuid().optional().nullable(),
  orderExternalId: z.string().max(200).optional().nullable(),
  invoiceExternalId: z.string().max(200).optional().nullable(),
  amount: z.number().optional().nullable(),
});

const bulkEventsBody = z.object({
  divisionId: z.string().uuid(),
  events: z.array(ingestEventBody.omit({ divisionId: true })).min(1).max(500),
});

const attributionPreviewBody = z.object({
  divisionId: z.string().uuid(),
  strategy: z.enum(['last_valid_owner', 'first_touch', 'weighted_split', 'custom_rule_hook']),
  attributionWindowDays: z.number().int().min(1).max(3650).optional(),
  event: z.object({
    leadId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    dealId: z.string().uuid().optional().nullable(),
    occurredAt: z.string().datetime().optional(),
    payload: z.record(z.unknown()).optional(),
  }),
});

const earningsSimulateBody = z.object({
  divisionId: z.string().uuid(),
  eventType: incentiveEventTypes,
  earningsConfig: z.record(z.unknown()),
  event: z.object({
    amount: z.number().optional().nullable(),
    payload: z.record(z.unknown()).optional(),
  }),
});

const adjustmentCreateBody = z.object({
  divisionId: z.string().uuid(),
  type: z.enum([
    'FULL_CLAWBACK',
    'PARTIAL_CLAWBACK',
    'SAME_CYCLE_REVERSAL',
    'NEXT_CYCLE_ADJUSTMENT',
    'MANUAL',
  ]),
  targetEarningId: z.string().uuid().optional().nullable(),
  amount: z.number(),
  currency: z.string().max(8).optional(),
  reason: z.string().min(3).max(2000),
  cycle: z.enum(['SAME', 'NEXT']).optional(),
  appliesToStatementId: z.string().uuid().optional().nullable(),
});

const statementGenerateBody = z.object({
  divisionId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

const statementPayBody = z.object({
  payoutRef: z.string().min(1).max(200),
});

const disputeCreateBody = z.object({
  reason: z.string().min(3).max(2000),
});

const planCreateBody = z.object({
  divisionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  currency: z.string().max(8).optional(),
});

const ruleSetCreateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const ruleVersionBody = z.object({
  version: z.number().int().min(1),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional().nullable(),
  attributionStrategy: z
    .enum(['last_valid_owner', 'first_touch', 'weighted_split', 'custom_rule_hook'])
    .optional(),
  attributionWindowDays: z.number().int().min(1).max(3650).optional(),
  freezeField: z.string().max(100).optional().nullable(),
  earningsConfig: z.record(z.unknown()),
  customHookKey: z.string().max(200).optional().nullable(),
});

const jobProcessBody = z.object({
  divisionId: z.string().uuid(),
  eventIds: z.array(z.string().uuid()).min(1).max(200),
  dryRun: z.boolean().optional(),
});

const exceptionResolveBody = z.object({
  resolutionNotes: z.string().max(2000).optional(),
});

module.exports = {
  ingestEventBody,
  bulkEventsBody,
  attributionPreviewBody,
  earningsSimulateBody,
  adjustmentCreateBody,
  statementGenerateBody,
  statementPayBody,
  disputeCreateBody,
  planCreateBody,
  ruleSetCreateBody,
  ruleVersionBody,
  jobProcessBody,
  exceptionResolveBody,
};
