const { Router } = require('express');
const { z } = require('zod');
const { prisma } = require('../config/database');
const { authenticate, authorize, orgScope } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = Router();
router.use(authenticate, orgScope);

const automationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  trigger: z.enum([
    'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_STAGE_CHANGED',
    'LEAD_ASSIGNED', 'LEAD_SCORE_CHANGED', 'LEAD_INACTIVE',
    'LEAD_SLA_WARNING', 'LEAD_SLA_BREACHED', 'LEAD_SLA_ESCALATED',
    'TASK_DUE', 'TASK_OVERDUE',
  ]),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'gt', 'lt', 'in']),
    value: z.unknown(),
  })),
  actions: z.array(z.object({
    type: z.enum([
      'send_email', 'send_whatsapp', 'assign_lead', 'change_status',
      'change_stage', 'add_tag', 'create_task', 'notify_user', 'webhook',
      'reassign_lead_round_robin', 'update_sla_status',
    ]),
    config: z.record(z.unknown()),
  })),
  isActive: z.boolean().optional(),
  divisionId: z.string().uuid().optional().nullable(),
});

// ─── Templates ──────────────────────────────────────────────────
const AUTOMATION_TEMPLATES = [
  // ── Assignment Templates ──────────────────────────────────────
  {
    id: 'auto-assign-new',
    name: 'Auto-Assign New Leads',
    description: 'Automatically assign new leads to a team member using round-robin',
    category: 'assignment',
    tags: ['round-robin', 'distribution', 'new leads'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'assign_lead', config: { method: 'round_robin' } }],
  },
  {
    id: 'assign-by-source',
    name: 'Route Leads by Source',
    description: 'Assign leads from specific sources (e.g. Facebook Ads) to a designated team member',
    category: 'assignment',
    tags: ['routing', 'source', 'facebook', 'ads'],
    trigger: 'LEAD_CREATED',
    conditions: [{ field: 'source', operator: 'in', value: ['FACEBOOK_ADS', 'GOOGLE_ADS', 'TIKTOK_ADS'] }],
    actions: [{ type: 'assign_lead', config: { method: 'round_robin' } }],
  },
  {
    id: 'assign-high-value',
    name: 'Route High-Value Leads to Senior Reps',
    description: 'Automatically assign leads with budget above a threshold to senior sales reps',
    category: 'assignment',
    tags: ['high-value', 'budget', 'senior', 'priority'],
    trigger: 'LEAD_CREATED',
    conditions: [{ field: 'budget', operator: 'gt', value: 100000 }],
    actions: [
      { type: 'assign_lead', config: { method: 'round_robin' } },
      { type: 'notify_user', config: { message: 'High-value lead assigned — budget exceeds threshold.' } },
    ],
  },
  {
    id: 'reassign-on-stage',
    name: 'Reassign on Stage Progression',
    description: 'Reassign lead to a closer when it moves to the negotiation stage',
    category: 'assignment',
    tags: ['reassign', 'negotiation', 'closer', 'handoff'],
    trigger: 'LEAD_STAGE_CHANGED',
    conditions: [],
    actions: [{ type: 'assign_lead', config: { method: 'round_robin' } }],
  },

  // ── Communication Templates ───────────────────────────────────
  {
    id: 'welcome-email',
    name: 'Send Welcome Email',
    description: 'Send a welcome email when a new lead is created',
    category: 'communication',
    tags: ['welcome', 'onboarding', 'email', 'new lead'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'send_email', config: { subject: 'Welcome!', template: 'welcome' } }],
  },
  {
    id: 'stage-change-whatsapp',
    name: 'WhatsApp on Stage Change',
    description: 'Send a WhatsApp message when a lead moves to proposal stage',
    category: 'communication',
    tags: ['whatsapp', 'proposal', 'stage', 'messaging'],
    trigger: 'LEAD_STAGE_CHANGED',
    conditions: [],
    actions: [{ type: 'send_whatsapp', config: { message: 'Your proposal is ready!' } }],
  },
  {
    id: 'qualification-email',
    name: 'Qualification Confirmation Email',
    description: 'Send a personalized email when a lead is qualified',
    category: 'communication',
    tags: ['qualified', 'email', 'confirmation', 'nurture'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'QUALIFIED' }],
    actions: [{ type: 'send_email', config: { subject: 'Thank you for your interest!', body: 'Dear {{firstName}}, we appreciate your interest and a team member will be in touch shortly with more details.' } }],
  },
  {
    id: 'proposal-sent-email',
    name: 'Proposal Sent Notification',
    description: 'Email the lead when a proposal has been sent, with a follow-up task for the rep',
    category: 'communication',
    tags: ['proposal', 'email', 'follow-up', 'sent'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'PROPOSAL_SENT' }],
    actions: [
      { type: 'send_email', config: { subject: 'Your Proposal from Al-Zaabi Group', body: 'Dear {{firstName}}, please find your proposal attached. Feel free to reach out with any questions.' } },
      { type: 'create_task', config: { title: 'Follow up on proposal', taskType: 'FOLLOW_UP_CALL', dueInHours: 72 } },
    ],
  },
  {
    id: 'won-congratulations-email',
    name: 'Won Deal Congratulations Email',
    description: 'Send a congratulations email to the client when a deal is marked as won',
    category: 'communication',
    tags: ['won', 'congratulations', 'email', 'deal'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'WON' }],
    actions: [{ type: 'send_email', config: { subject: 'Welcome aboard!', body: 'Dear {{firstName}}, congratulations! We are thrilled to have you onboard and look forward to a successful partnership.' } }],
  },
  {
    id: 'lost-feedback-email',
    name: 'Lost Deal Feedback Request',
    description: 'Send a feedback request email when a deal is lost to understand the reason',
    category: 'communication',
    tags: ['lost', 'feedback', 'email', 'improvement'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'LOST' }],
    actions: [{ type: 'send_email', config: { subject: 'We value your feedback', body: 'Dear {{firstName}}, we are sorry we could not meet your needs this time. Your feedback would help us improve — please let us know how we can do better.' } }],
  },
  {
    id: 'whatsapp-welcome',
    name: 'WhatsApp Welcome Message',
    description: 'Send a WhatsApp welcome message to new leads from WhatsApp source',
    category: 'communication',
    tags: ['whatsapp', 'welcome', 'instant', 'new lead'],
    trigger: 'LEAD_CREATED',
    conditions: [{ field: 'source', operator: 'equals', value: 'WHATSAPP' }],
    actions: [{ type: 'send_whatsapp', config: { message: 'Hello {{firstName}}! Thank you for reaching out to Al-Zaabi Group. A member of our team will be with you shortly.' } }],
  },

  // ── Notification Templates ────────────────────────────────────
  {
    id: 'hot-lead-notify',
    name: 'Hot Lead Alert',
    description: 'Notify the team when a lead score exceeds 80',
    category: 'notification',
    tags: ['hot lead', 'score', 'alert', 'high priority'],
    trigger: 'LEAD_SCORE_CHANGED',
    conditions: [{ field: 'score', operator: 'gt', value: 80 }],
    actions: [{ type: 'notify_user', config: { message: 'Hot lead detected! Score above 80.' } }],
  },
  {
    id: 'new-lead-alert',
    name: 'New Lead Alert',
    description: 'Instantly notify the assigned team when a new lead arrives',
    category: 'notification',
    tags: ['new lead', 'alert', 'instant', 'team'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'notify_user', config: { message: 'New lead received: {{firstName}} {{lastName}} from {{source}}.' } }],
  },
  {
    id: 'sla-breach-alert',
    name: 'SLA Response Time Alert',
    description: 'Alert when a lead has not been contacted within the expected response time',
    category: 'notification',
    tags: ['sla', 'response time', 'breach', 'overdue'],
    trigger: 'LEAD_INACTIVE',
    conditions: [],
    actions: [{ type: 'notify_user', config: { message: 'SLA alert: Lead {{firstName}} {{lastName}} has not been contacted — action required.' } }],
  },
  {
    id: 'task-overdue-alert',
    name: 'Task Overdue Escalation',
    description: 'Alert the manager when a task is overdue and needs escalation',
    category: 'notification',
    tags: ['overdue', 'task', 'escalation', 'manager'],
    trigger: 'TASK_OVERDUE',
    conditions: [],
    actions: [{ type: 'notify_user', config: { message: 'Escalation: A task is overdue and requires immediate attention.' } }],
  },
  {
    id: 'lead-assigned-notify',
    name: 'Lead Assignment Notification',
    description: 'Notify the sales rep immediately when a lead is assigned to them',
    category: 'notification',
    tags: ['assigned', 'notification', 'sales rep'],
    trigger: 'LEAD_ASSIGNED',
    conditions: [],
    actions: [{ type: 'notify_user', config: { message: 'A new lead has been assigned to you: {{firstName}} {{lastName}}.' } }],
  },
  {
    id: 'negotiation-alert',
    name: 'Negotiation Stage Alert',
    description: 'Alert the sales manager when a lead enters the negotiation stage',
    category: 'notification',
    tags: ['negotiation', 'stage', 'manager', 'deal'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'NEGOTIATION' }],
    actions: [{ type: 'notify_user', config: { message: 'Deal entering negotiation stage: {{firstName}} {{lastName}}. Manager review recommended.' } }],
  },

  // ── Task Templates ────────────────────────────────────────────
  {
    id: 'follow-up-task',
    name: 'Create Follow-Up Task',
    description: 'Create a follow-up task when a lead is contacted',
    category: 'task',
    tags: ['follow-up', 'contacted', 'call', 'task'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'CONTACTED' }],
    actions: [{ type: 'create_task', config: { title: 'Follow up with {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 48 } }],
  },
  {
    id: 'inactive-reminder',
    name: 'Inactive Lead Reminder',
    description: 'Create a task when a lead has been inactive for too long',
    category: 'task',
    tags: ['inactive', 'reminder', 're-engage', 'follow-up'],
    trigger: 'LEAD_INACTIVE',
    conditions: [],
    actions: [
      { type: 'create_task', config: { title: 'Re-engage inactive lead', taskType: 'FOLLOW_UP_CALL', dueInHours: 24, priority: 'HIGH' } },
      { type: 'notify_user', config: { message: 'Lead has gone inactive — follow up needed.' } },
    ],
  },
  {
    id: 'new-lead-call-task',
    name: 'Schedule Initial Call',
    description: 'Create a call task within 2 hours when a new lead is created',
    category: 'task',
    tags: ['initial call', 'new lead', 'speed-to-lead', 'quick response'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'create_task', config: { title: 'Initial call with {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 2, priority: 'HIGH' } }],
  },
  {
    id: 'demo-task-qualified',
    name: 'Schedule Demo for Qualified Leads',
    description: 'Create a demo task when a lead is marked as qualified',
    category: 'task',
    tags: ['demo', 'qualified', 'meeting', 'presentation'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'QUALIFIED' }],
    actions: [{ type: 'create_task', config: { title: 'Schedule demo for {{firstName}}', taskType: 'DEMO', dueInHours: 72, priority: 'MEDIUM' } }],
  },
  {
    id: 'proposal-prep-task',
    name: 'Prepare Proposal Task',
    description: 'Create a proposal preparation task when a lead moves to proposal stage',
    category: 'task',
    tags: ['proposal', 'preparation', 'document', 'deadline'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'PROPOSAL_SENT' }],
    actions: [{ type: 'create_task', config: { title: 'Prepare proposal for {{firstName}}', taskType: 'PROPOSAL', dueInHours: 48, priority: 'HIGH' } }],
  },
  {
    id: 'task-due-reminder',
    name: 'Task Due Reminder',
    description: 'Send a reminder notification when a task reaches its due date',
    category: 'task',
    tags: ['reminder', 'due date', 'task', 'alert'],
    trigger: 'TASK_DUE',
    conditions: [],
    actions: [{ type: 'notify_user', config: { message: 'Reminder: A task is due today and needs your attention.' } }],
  },
  {
    id: 'lost-lead-re-engage',
    name: 'Re-Engage Lost Leads',
    description: 'Create a follow-up task to re-engage leads that were lost, after a cooling-off period',
    category: 'task',
    tags: ['lost', 're-engage', 'follow-up', 'win-back'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'LOST' }],
    actions: [
      { type: 'create_task', config: { title: 'Re-engage lost lead: {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 720, priority: 'LOW' } },
      { type: 'add_tag', config: { tagName: 'Lost - Pending Re-engagement' } },
    ],
  },

  // ── Organization Templates ────────────────────────────────────
  {
    id: 'won-deal-tag',
    name: 'Tag Won Deals',
    description: 'Automatically tag leads when they are marked as won',
    category: 'organization',
    tags: ['won', 'tag', 'closed', 'deal'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'WON' }],
    actions: [{ type: 'add_tag', config: { tagName: 'Closed Won' } }],
  },
  {
    id: 'lost-deal-tag',
    name: 'Tag Lost Deals',
    description: 'Automatically tag leads when they are marked as lost',
    category: 'organization',
    tags: ['lost', 'tag', 'closed', 'deal'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'LOST' }],
    actions: [{ type: 'add_tag', config: { tagName: 'Closed Lost' } }],
  },
  {
    id: 'tag-by-source',
    name: 'Auto-Tag by Lead Source',
    description: 'Tag leads based on their source channel for better segmentation',
    category: 'organization',
    tags: ['source', 'tag', 'segmentation', 'channel'],
    trigger: 'LEAD_CREATED',
    conditions: [{ field: 'source', operator: 'equals', value: 'FACEBOOK_ADS' }],
    actions: [{ type: 'add_tag', config: { tagName: 'Facebook Lead' } }],
  },
  {
    id: 'hot-lead-tag',
    name: 'Tag Hot Leads',
    description: 'Automatically tag leads with high scores as hot leads',
    category: 'organization',
    tags: ['hot lead', 'score', 'tag', 'priority'],
    trigger: 'LEAD_SCORE_CHANGED',
    conditions: [{ field: 'score', operator: 'gt', value: 80 }],
    actions: [{ type: 'add_tag', config: { tagName: 'Hot Lead' } }],
  },
  {
    id: 'status-change-tracking',
    name: 'Track Status Changes',
    description: 'Tag leads each time their status changes for audit purposes',
    category: 'organization',
    tags: ['status', 'tracking', 'audit', 'tag'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [],
    actions: [{ type: 'add_tag', config: { tagName: 'Status Updated' } }],
  },

  // ── SLA Automation Templates ─────────────────────────────────
  {
    id: 'sla-warning-notify',
    name: 'SLA Warning — Notify Assigned Rep',
    description: 'Send an in-app notification to the assigned rep when a lead is approaching SLA breach',
    category: 'sla',
    tags: ['sla', 'warning', 'at-risk', 'notification', 'response time'],
    trigger: 'LEAD_SLA_WARNING',
    conditions: [],
    actions: [
      { type: 'notify_user', config: { message: 'SLA Warning: {{firstName}} {{lastName}} has been waiting and is approaching SLA breach. Please respond urgently.' } },
    ],
  },
  {
    id: 'sla-warning-email',
    name: 'SLA Warning — Email Rep',
    description: 'Email the assigned rep when a lead is approaching SLA breach',
    category: 'sla',
    tags: ['sla', 'warning', 'email', 'at-risk'],
    trigger: 'LEAD_SLA_WARNING',
    conditions: [],
    actions: [
      { type: 'send_email', config: { recipientType: 'assigned_user', subject: 'SLA Warning: {{firstName}} {{lastName}} needs attention', body: 'Lead {{firstName}} {{lastName}} from {{company}} is approaching SLA breach. Please respond as soon as possible to avoid escalation.' } },
    ],
  },
  {
    id: 'sla-breach-remind',
    name: 'SLA Breach — Remind & Create Task',
    description: 'When SLA is breached, notify the rep and create an urgent follow-up task',
    category: 'sla',
    tags: ['sla', 'breach', 'reminder', 'task', 'urgent'],
    trigger: 'LEAD_SLA_BREACHED',
    conditions: [],
    actions: [
      { type: 'notify_user', config: { message: 'URGENT: SLA breached for {{firstName}} {{lastName}}. Immediate response required!' } },
      { type: 'create_task', config: { title: 'URGENT: Respond to {{firstName}} {{lastName}} — SLA breached', taskType: 'FOLLOW_UP_CALL', dueInHours: 1, priority: 'URGENT' } },
    ],
  },
  {
    id: 'sla-breach-email-rep',
    name: 'SLA Breach — Email Assigned Rep',
    description: 'Send an email reminder to the assigned rep when a lead breaches SLA',
    category: 'sla',
    tags: ['sla', 'breach', 'email', 'reminder'],
    trigger: 'LEAD_SLA_BREACHED',
    conditions: [],
    actions: [
      { type: 'send_email', config: { recipientType: 'assigned_user', subject: 'SLA Breached: {{firstName}} {{lastName}}', body: 'Lead {{firstName}} {{lastName}} from {{company}} has breached SLA. This lead has been unattended beyond the allowed response time. Please respond immediately to prevent further escalation.' } },
    ],
  },
  {
    id: 'sla-breach-tag',
    name: 'SLA Breach — Tag Lead',
    description: 'Tag leads that breach SLA for tracking and reporting',
    category: 'sla',
    tags: ['sla', 'breach', 'tag', 'tracking'],
    trigger: 'LEAD_SLA_BREACHED',
    conditions: [],
    actions: [
      { type: 'add_tag', config: { tagName: 'SLA Breached' } },
    ],
  },
  {
    id: 'sla-escalation-notify-manager',
    name: 'SLA Escalation — Notify Manager',
    description: 'Notify managers and the assigned rep when a lead is escalated due to extended SLA breach',
    category: 'sla',
    tags: ['sla', 'escalation', 'manager', 'notification'],
    trigger: 'LEAD_SLA_ESCALATED',
    conditions: [],
    actions: [
      { type: 'notify_user', config: { message: 'ESCALATION: {{firstName}} {{lastName}} has been unattended for an extended period. Manager review required immediately.' } },
      { type: 'send_email', config: { recipientType: 'assigned_user', subject: 'ESCALATION: {{firstName}} {{lastName}} — Manager Notified', body: 'This lead has been escalated to management due to extended SLA breach. Please respond immediately.' } },
    ],
  },
  {
    id: 'sla-escalation-reassign',
    name: 'SLA Escalation — Auto-Reassign Lead',
    description: 'Automatically reassign the lead to another available rep when SLA escalation is triggered',
    category: 'sla',
    tags: ['sla', 'escalation', 'reassign', 'round-robin', 'auto'],
    trigger: 'LEAD_SLA_ESCALATED',
    conditions: [],
    actions: [
      { type: 'reassign_lead_round_robin', config: {} },
      { type: 'notify_user', config: { message: 'Lead {{firstName}} {{lastName}} was auto-reassigned due to SLA escalation.' } },
    ],
  },
  {
    id: 'sla-full-workflow',
    name: 'Complete SLA Escalation Workflow',
    description: 'Full SLA escalation: notify rep, email manager, create urgent task, tag lead, and fire webhook',
    category: 'sla',
    tags: ['sla', 'complete', 'workflow', 'multi-action', 'escalation'],
    trigger: 'LEAD_SLA_BREACHED',
    conditions: [],
    actions: [
      { type: 'notify_user', config: { message: 'SLA BREACH: {{firstName}} {{lastName}} requires immediate attention!' } },
      { type: 'create_task', config: { title: 'SLA Breach: Call {{firstName}} {{lastName}} NOW', taskType: 'FOLLOW_UP_CALL', dueInHours: 1, priority: 'URGENT' } },
      { type: 'add_tag', config: { tagName: 'SLA Breached' } },
      { type: 'send_email', config: { recipientType: 'assigned_user', subject: 'Action Required: SLA Breach for {{firstName}} {{lastName}}', body: 'Lead {{firstName}} {{lastName}} from {{company}} has breached SLA. An urgent follow-up task has been created. Please respond immediately.' } },
    ],
  },
  {
    id: 'sla-escalation-reassign-notify',
    name: 'SLA Final Escalation — Reassign & Notify All',
    description: 'Last resort: reassign lead to next available rep and notify everyone involved',
    category: 'sla',
    tags: ['sla', 'final', 'reassign', 'notify', 'last-resort'],
    trigger: 'LEAD_SLA_ESCALATED',
    conditions: [],
    actions: [
      { type: 'reassign_lead_round_robin', config: {} },
      { type: 'add_tag', config: { tagName: 'SLA Auto-Reassigned' } },
      { type: 'create_task', config: { title: 'Priority: Respond to reassigned lead {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 1, priority: 'URGENT' } },
      { type: 'notify_user', config: { message: 'Lead {{firstName}} {{lastName}} has been auto-reassigned to you due to SLA escalation. Please respond immediately.' } },
    ],
  },

  // ── Integration Templates ─────────────────────────────────────
  {
    id: 'webhook-lead-created',
    name: 'Webhook on New Lead',
    description: 'Fire a webhook to an external system when a lead is created',
    category: 'integration',
    tags: ['webhook', 'external', 'api', 'new lead'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: '', method: 'POST' } }],
  },
  {
    id: 'webhook-won-deal',
    name: 'Webhook on Won Deal',
    description: 'Notify external systems (ERP, accounting) when a deal is closed won',
    category: 'integration',
    tags: ['webhook', 'won', 'erp', 'accounting', 'sync'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'WON' }],
    actions: [{ type: 'webhook', config: { url: '', method: 'POST' } }],
  },
  {
    id: 'webhook-stage-change',
    name: 'Webhook on Pipeline Stage Change',
    description: 'Fire a webhook when a lead progresses through pipeline stages',
    category: 'integration',
    tags: ['webhook', 'pipeline', 'stage', 'sync'],
    trigger: 'LEAD_STAGE_CHANGED',
    conditions: [],
    actions: [{ type: 'webhook', config: { url: '', method: 'POST' } }],
  },
  {
    id: 'webhook-score-threshold',
    name: 'Webhook on High Lead Score',
    description: 'Notify external marketing platforms when a lead score crosses a threshold',
    category: 'integration',
    tags: ['webhook', 'score', 'marketing', 'threshold'],
    trigger: 'LEAD_SCORE_CHANGED',
    conditions: [{ field: 'score', operator: 'gt', value: 70 }],
    actions: [{ type: 'webhook', config: { url: '', method: 'POST' } }],
  },

  // ── Multi-Action Workflow Templates ───────────────────────────
  {
    id: 'full-onboarding-workflow',
    name: 'Full New Lead Onboarding',
    description: 'Complete onboarding: assign lead, send welcome email, create initial call task, and notify team',
    category: 'workflow',
    tags: ['onboarding', 'complete', 'multi-action', 'new lead'],
    trigger: 'LEAD_CREATED',
    conditions: [],
    actions: [
      { type: 'assign_lead', config: { method: 'round_robin' } },
      { type: 'send_email', config: { subject: 'Welcome to Al-Zaabi Group!', template: 'welcome' } },
      { type: 'create_task', config: { title: 'Initial call with {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 2, priority: 'HIGH' } },
      { type: 'notify_user', config: { message: 'New lead onboarded: {{firstName}} {{lastName}}' } },
    ],
  },
  {
    id: 'deal-won-workflow',
    name: 'Deal Won Complete Workflow',
    description: 'When a deal is won: tag it, email the client, notify the team, and fire a webhook',
    category: 'workflow',
    tags: ['won', 'complete', 'multi-action', 'celebration'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'WON' }],
    actions: [
      { type: 'add_tag', config: { tagName: 'Closed Won' } },
      { type: 'send_email', config: { subject: 'Welcome aboard!', body: 'Dear {{firstName}}, congratulations on joining Al-Zaabi Group. We look forward to working with you!' } },
      { type: 'notify_user', config: { message: 'Deal WON! {{firstName}} {{lastName}} has been closed successfully.' } },
      { type: 'webhook', config: { url: '', method: 'POST' } },
    ],
  },
  {
    id: 'deal-lost-workflow',
    name: 'Deal Lost Complete Workflow',
    description: 'When a deal is lost: tag it, send feedback email, create re-engagement task',
    category: 'workflow',
    tags: ['lost', 'complete', 'multi-action', 'feedback', 'win-back'],
    trigger: 'LEAD_STATUS_CHANGED',
    conditions: [{ field: 'status', operator: 'equals', value: 'LOST' }],
    actions: [
      { type: 'add_tag', config: { tagName: 'Closed Lost' } },
      { type: 'send_email', config: { subject: 'We value your feedback', body: 'Dear {{firstName}}, we are sorry we could not meet your needs. Your feedback helps us improve.' } },
      { type: 'create_task', config: { title: 'Re-engage lost lead: {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 720, priority: 'LOW' } },
    ],
  },
  {
    id: 'high-value-lead-workflow',
    name: 'High-Value Lead Priority Workflow',
    description: 'Full priority handling for high-value leads: assign, tag, notify, create urgent task',
    category: 'workflow',
    tags: ['high-value', 'priority', 'vip', 'multi-action'],
    trigger: 'LEAD_CREATED',
    conditions: [{ field: 'budget', operator: 'gt', value: 100000 }],
    actions: [
      { type: 'assign_lead', config: { method: 'round_robin' } },
      { type: 'add_tag', config: { tagName: 'VIP Lead' } },
      { type: 'create_task', config: { title: 'Priority call with VIP lead {{firstName}}', taskType: 'FOLLOW_UP_CALL', dueInHours: 1, priority: 'URGENT' } },
      { type: 'notify_user', config: { message: 'VIP lead alert! {{firstName}} {{lastName}} — high-value opportunity.' } },
    ],
  },
];

// ─── Get Templates (with search, category filter, and division context) ──
router.get('/templates', async (req, res) => {
  const { search, category, trigger: triggerFilter } = req.query;
  let results = [...AUTOMATION_TEMPLATES];

  // Also load any custom (saved) templates from the database
  try {
    const customTemplates = await prisma.automationRule.findMany({
      where: {
        organizationId: { in: req.orgIds },
        isTemplate: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const ct of customTemplates) {
      results.push({
        id: `custom-${ct.id}`,
        name: ct.name,
        description: ct.description || '',
        category: 'custom',
        tags: ['custom', 'saved'],
        trigger: ct.trigger,
        conditions: ct.conditions || [],
        actions: ct.actions || [],
        isCustom: true,
        divisionId: ct.organizationId,
      });
    }
  } catch {
    // isTemplate column may not exist yet — return built-in templates only
  }

  // Filter by category
  if (category && category !== 'all') {
    results = results.filter(t => t.category === category);
  }

  // Filter by trigger type
  if (triggerFilter) {
    results = results.filter(t => t.trigger === triggerFilter);
  }

  // Search across name, description, tags
  if (search) {
    const q = search.toLowerCase();
    results = results.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.tags && t.tags.some(tag => tag.toLowerCase().includes(q)))
    );
  }

  res.json(results);
});

// ─── Save Automation as Template ────────────────────────────────
router.post('/:id/save-as-template', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const { id, createdAt, updatedAt, executionCount, lastExecutedAt, ...data } = existing;
    const template = await prisma.automationRule.create({
      data: {
        ...data,
        name: req.body.name || `${data.name} (Template)`,
        description: req.body.description || data.description,
        isActive: false,
        isTemplate: true,
        executionCount: 0,
      },
    });
    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
});

// ─── Global Automation Stats (must be before /:id) ──────────────
router.get('/stats/overview', async (req, res, next) => {
  try {
    const orgFilter = { organizationId: { in: req.orgIds } };

    const [totalRules, activeRules] = await Promise.all([
      prisma.automationRule.count({ where: orgFilter }),
      prisma.automationRule.count({ where: { ...orgFilter, isActive: true } }),
    ]);

    // AutomationLog queries — gracefully handle if table doesn't exist yet
    let totalExecutions = 0;
    let recentLogs = [];
    let dailyLogs = [];
    try {
      [totalExecutions, recentLogs] = await Promise.all([
        prisma.automationLog.count({
          where: { rule: { organizationId: { in: req.orgIds } } },
        }),
        prisma.automationLog.findMany({
          where: { rule: { organizationId: { in: req.orgIds } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { rule: { select: { name: true } } },
        }),
      ]);

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);
      dailyLogs = await prisma.automationLog.groupBy({
        by: ['status'],
        where: {
          rule: { organizationId: { in: req.orgIds } },
          createdAt: { gte: sevenDaysAgo },
        },
        _count: true,
      });
    } catch {
      // AutomationLog table may not exist yet — return zeros
    }

    const successRate = totalExecutions > 0
      ? ((dailyLogs.find(d => d.status === 'success')?._count || 0) /
         dailyLogs.reduce((sum, d) => sum + d._count, 0) * 100).toFixed(1)
      : '0';

    res.json({
      totalRules,
      activeRules,
      totalExecutions,
      successRate: parseFloat(successRate),
      recentActivity: recentLogs,
      dailyBreakdown: dailyLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ─── List Automations ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    let rules;
    try {
      rules = await prisma.automationRule.findMany({
        where: { organizationId: { in: req.orgIds } },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { logs: true } } },
      });
    } catch {
      // Fallback if logs relation not available yet
      rules = await prisma.automationRule.findMany({
        where: { organizationId: { in: req.orgIds } },
        orderBy: { createdAt: 'desc' },
      });
    }
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

// ─── Get Single Automation with Stats ────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    let rule;
    try {
      rule = await prisma.automationRule.findFirst({
        where: { id: req.params.id, organizationId: { in: req.orgIds } },
        include: { _count: { select: { logs: true } } },
      });
    } catch {
      rule = await prisma.automationRule.findFirst({
        where: { id: req.params.id, organizationId: { in: req.orgIds } },
      });
    }
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    // Get recent execution stats (graceful fallback)
    let successCount = 0, failedCount = 0, recentLogs = [];
    try {
      [successCount, failedCount, recentLogs] = await Promise.all([
        prisma.automationLog.count({ where: { ruleId: rule.id, status: 'success' } }),
        prisma.automationLog.count({ where: { ruleId: rule.id, status: 'failed' } }),
        prisma.automationLog.findMany({
          where: { ruleId: rule.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
    } catch {
      // AutomationLog table may not exist yet
    }

    res.json({
      ...rule,
      stats: { successCount, failedCount, totalLogs: rule._count?.logs || 0 },
      recentLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Automation Logs ─────────────────────────────────────────
router.get('/:id/logs', async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status;

    const where = { ruleId: req.params.id };
    if (status) where.status = status;

    let logs = [], total = 0;
    try {
      [logs, total] = await Promise.all([
        prisma.automationLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.automationLog.count({ where }),
      ]);
    } catch {
      // AutomationLog table may not exist yet
    }

    res.json({
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Create Automation ───────────────────────────────────────────
router.post('/', authorize('ADMIN', 'MANAGER'), validate(automationSchema), async (req, res, next) => {
  try {
    const { divisionId, ...data } = req.validated;
    const targetOrgId = (req.isSuperAdmin && divisionId) ? divisionId : req.orgId;

    const rule = await prisma.automationRule.create({
      data: { ...data, organizationId: targetOrgId },
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Duplicate Automation ────────────────────────────────────────
router.post('/:id/duplicate', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const { id, createdAt, updatedAt, executionCount, lastExecutedAt, ...data } = existing;
    const duplicate = await prisma.automationRule.create({
      data: {
        ...data,
        name: `${data.name} (Copy)`,
        isActive: false,
        executionCount: 0,
      },
    });
    res.status(201).json(duplicate);
  } catch (err) {
    next(err);
  }
});

// ─── Update Automation ───────────────────────────────────────────
router.put('/:id', authorize('ADMIN', 'MANAGER'), validate(automationSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const { divisionId, ...data } = req.validated;
    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data,
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Toggle Automation ───────────────────────────────────────────
router.post('/:id/toggle', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// ─── Delete Automation ───────────────────────────────────────────
router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.automationRule.findFirst({
      where: { id: req.params.id, organizationId: { in: req.orgIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Rule not found' });

    await prisma.automationRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Automation deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
