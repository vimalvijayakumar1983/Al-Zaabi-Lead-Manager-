// ─── Organization ────────────────────────────────────────────────

// ─── Division Memberships ──────────────────────────────────────
export interface DivisionMembership {
  id: string;
  userId: string;
  divisionId: string;
  role: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  division?: {
    id: string;
    name: string;
    tradeName?: string;
    logo?: string;
    primaryColor: string;
    type: string;
  };
}

export interface Organization {
  id: string;
  name: string;
  tradeName?: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  type: 'GROUP' | 'DIVISION';
  plan?: string;
  parentId?: string;
  children?: Organization[];
  _count?: { users: number; leads: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface DivisionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'VIEWER';
  avatar?: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  leadsCount?: number;
  tasksCount?: number;
  wonLeads?: number;
  _count?: { assignedLeads: number; tasks: number };
}

export interface DivisionStats {
  totalLeads: number;
  totalPipelineValue: number;
  conversionRate: number;
  avgLeadValue: number;
  leadsByStage: { stage: string; count: number; value: number; color: string }[];
  topPerformers: { id: string; name: string; wonLeads: number; totalValue: number }[];
  recentLeads: { id: string; name: string; company?: string; value: number; status: string; createdAt: string }[];
}

// ─── User & Auth ─────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'VIEWER';
  avatar?: string;
  phone?: string;
  organizationId: string;
  organizationName?: string;
  organization?: Organization;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { assignedLeads: number; tasks: number };
}

export interface AuthResponse {
  token: string;
  user: User;
  divisions?: Organization[];
}

// ─── Lead ────────────────────────────────────────────────────────
export type LeadSource =
  | 'WEBSITE_FORM' | 'LIVE_CHAT' | 'LANDING_PAGE' | 'WHATSAPP' | 'FACEBOOK_ADS'
  | 'GOOGLE_ADS' | 'TIKTOK_ADS' | 'MANUAL' | 'CSV_IMPORT' | 'API'
  | 'REFERRAL' | 'EMAIL' | 'PHONE' | 'OTHER';

export type LeadStatus =
  | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT'
  | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  budget?: number;
  productInterest?: string;
  location?: string;
  campaign?: string;
  website?: string;
  customData?: Record<string, unknown>;
  lostReason?: string;
  aiSummary?: string;
  conversionProb?: number;
  stageId?: string;
  stageOrder: number;
  assignedToId?: string;
  assignedTo?: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatar'>;
  stage?: PipelineStage;
  tags?: { tag: Tag }[];
  activities?: LeadActivity[];
  notes?: LeadNote[];
  tasks?: Task[];
  communications?: Communication[];
  attachments?: Attachment[];
  _count?: { activities: number; tasks: number; communications: number };
  channelCounts?: Record<string, number>;
  unreadChannelCounts?: Record<string, number>;
  unreadCommunications?: number;
  lastInboundMessage?: { channel: string; body: string; createdAt: string } | null;
  organizationId?: string;
  organization?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// ─── Pipeline ────────────────────────────────────────────────────
export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  isDefault: boolean;
  isWonStage: boolean;
  isLostStage: boolean;
  organizationId?: string;
  leads?: Lead[];
  _count?: { leads: number };
}

// ─── Activity ────────────────────────────────────────────────────
export interface LeadActivity {
  id: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

// ─── Notes ───────────────────────────────────────────────────────
export interface LeadNote {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

// ─── Tasks ───────────────────────────────────────────────────────
export type TaskType = 'FOLLOW_UP_CALL' | 'MEETING' | 'EMAIL' | 'WHATSAPP' | 'DEMO' | 'PROPOSAL' | 'OTHER';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: Priority;
  status: TaskStatus;
  dueAt: string;
  completedAt?: string;
  isRecurring: boolean;
  leadId?: string;
  lead?: Pick<Lead, 'id' | 'firstName' | 'lastName'>;
  assigneeId?: string;
  assignee?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Communication ───────────────────────────────────────────────
export interface Communication {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'PHONE' | 'CHAT';
  direction: 'INBOUND' | 'OUTBOUND';
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

// ─── Call Log ────────────────────────────────────────────────────
export type CallDisposition =
  | 'CALLBACK' | 'MEETING_ARRANGED' | 'APPOINTMENT_BOOKED' | 'INTERESTED'
  | 'NOT_INTERESTED' | 'NO_ANSWER' | 'VOICEMAIL_LEFT' | 'WRONG_NUMBER'
  | 'BUSY' | 'GATEKEEPER' | 'FOLLOW_UP_EMAIL' | 'QUALIFIED'
  | 'PROPOSAL_REQUESTED' | 'DO_NOT_CALL' | 'OTHER';

export interface CallLog {
  id: string;
  disposition: CallDisposition;
  notes?: string;
  duration?: number;
  callbackDate?: string;
  meetingDate?: string;
  appointmentDate?: string;
  followUpTaskId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

export interface CallLogResponse {
  callLog: CallLog;
  followUpTaskId: string | null;
  autoActions: {
    statusChanged: string | null;
    taskCreated: boolean;
  };
}

export interface DispositionOption {
  value: CallDisposition;
  label: string;
  hasFollowUp: boolean;
  autoStatus: string | null;
}

// ─── Tag ─────────────────────────────────────────────────────────
export interface Tag {
  id: string;
  name: string;
  color: string;
}

// ─── Attachment ──────────────────────────────────────────────────
export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

// ─── Custom Field ───────────────────────────────────────────────
export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN' | 'URL' | 'EMAIL' | 'PHONE' | 'TEXTAREA' | 'CURRENCY';

export interface CustomField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  options?: string[];
  isRequired: boolean;
  order: number;
  showInList: boolean;
  showInDetail: boolean;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  divisionId?: string | null;
}

export interface BuiltInField {
  key: string;
  label: string;
  type: string;
  locked?: boolean;
  category: string;
  showInList: boolean;
  showInDetail: boolean;
  order: number;
  isBuiltIn: true;
}

export interface FieldConfigResponse {
  builtInFields: BuiltInField[];
  customFields: CustomField[];
}

// ─── Campaign (UPDATED - replaces existing Campaign interface) ────────────────

export type CampaignType =
  | 'FACEBOOK_ADS'
  | 'GOOGLE_ADS'
  | 'EMAIL'
  | 'WHATSAPP'
  | 'LANDING_PAGE'
  | 'REFERRAL'
  | 'TIKTOK_ADS'
  | 'WEBSITE_FORM'
  | 'OTHER';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  budget?: number;
  description?: string;
  startDate?: string;
  endDate?: string;
  metadata?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    targetLeads?: number;
    targetConversions?: number;
    targetRevenue?: number;
    [key: string]: unknown;
  };
  organizationId?: string;
  organization?: { id: string; name: string };
  // Enriched fields from API
  leadCount?: number;
  wonLeads?: number;
  totalLeadValue?: number;
  costPerLead?: number;
  conversionRate?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Campaign Dashboard Stats ─────────────────────────────────────

export interface CampaignDashboardStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalBudget: number;
  totalLeads: number;
  avgCostPerLead: number;
  bestPerforming: { id: string; name: string; leadCount: number } | null;
  byType: { type: string; count: number; leads: number }[];
  byStatus: { status: string; count: number }[];
}

// ─── Contacts ─────────────────────────────────────────────────────

export type ContactLifecycle =
  | 'SUBSCRIBER' | 'LEAD' | 'MARKETING_QUALIFIED' | 'SALES_QUALIFIED'
  | 'OPPORTUNITY' | 'CUSTOMER' | 'EVANGELIST' | 'OTHER';

export type ContactType = 'PROSPECT' | 'CUSTOMER' | 'PARTNER' | 'VENDOR' | 'INFLUENCER' | 'OTHER';

export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  jobTitle?: string;
  department?: string;
  source: LeadSource;
  lifecycle: ContactLifecycle;
  type: ContactType;
  salutation?: string;
  dateOfBirth?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  description?: string;
  score: number;
  lastContactedAt?: string;
  doNotEmail: boolean;
  doNotCall: boolean;
  hasOptedOutEmail: boolean;
  customData?: Record<string, unknown>;
  ownerId?: string;
  owner?: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatar'>;
  createdById?: string;
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  convertedFromLeadId?: string;
  convertedFromLead?: Pick<Lead, 'id' | 'firstName' | 'lastName' | 'status'>;
  tags?: { tag: Tag }[];
  activities?: ContactActivity[];
  notes?: ContactNote[];
  tasks?: Task[];
  deals?: Deal[];
  _count?: { activities: number; tasks: number; notes: number; deals: number };
  organizationId?: string;
  organization?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface ContactActivity {
  id: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

export interface ContactNote {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  user: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

export interface Deal {
  id: string;
  name: string;
  amount?: number;
  stage: string;
  probability: number;
  closeDate?: string;
  description?: string;
  status: DealStatus;
  contactId: string;
  contact?: Pick<Contact, 'id' | 'firstName' | 'lastName'>;
  ownerId?: string;
  owner?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  createdAt: string;
  updatedAt: string;
}

export interface ContactStats {
  total: number;
  byLifecycle: Record<string, number>;
  byType: Record<string, number>;
  recentlyAdded: number;
  recentlyContacted: number;
}

// ─── Integration ──────────────────────────────────────────────────

export type IntegrationPlatform =
  | 'facebook'
  | 'google'
  | 'tiktok'
  | 'whatsapp'
  | 'email'
  | 'website'
  | 'webhook'
  | 'zapier';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing';

export interface Integration {
  id: string;
  platform: IntegrationPlatform;
  status: IntegrationStatus;
  credentials?: Record<string, unknown>;
  config: Record<string, unknown>;
  lastSyncAt?: string;
  organizationId: string;
  createdBy?: string;
  campaignId?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Integration Log ──────────────────────────────────────────────

export interface IntegrationLog {
  id: string;
  integrationId: string;
  action: string;
  payload?: Record<string, unknown>;
  status: 'success' | 'failed';
  leadId?: string;
  errorMessage?: string;
  createdAt: string;
}

// ─── Integration Platform Info ────────────────────────────────────

export interface IntegrationPlatformInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: 'available' | 'coming_soon';
  requiresOAuth: boolean;
  color: string;
}

// ─── API Key ──────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  key: string;
  name: string;
  organizationId: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
}

// ─── Widget Config ────────────────────────────────────────────────

export interface WidgetConfig {
  fields: string[];
  formTitle: string;
  submitButtonText: string;
  successMessage: string;
  backgroundColor: string;
  buttonColor: string;
  divisionId: string;
}


// ─── Automation ──────────────────────────────────────────────────
export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger: string;
  conditions: { field: string; operator: string; value: unknown }[];
  actions: { type: string; config: Record<string, unknown> }[];
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
}

// ─── Analytics ───────────────────────────────────────────────────
export interface DashboardData {
  overview: {
    totalLeads: number;
    newLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: number;
    pipelineValue: number;
  };
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  recentLeads: Lead[];
  upcomingTasks: Task[];
}

// ─── Pagination ──────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ─── Notifications ───────────────────────────────────────────────

export type NotificationType =
  | 'LEAD_CREATED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_STATUS_CHANGED'
  | 'LEAD_WON'
  | 'LEAD_LOST'
  | 'LEAD_SCORE_CHANGED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE_SOON'
  | 'TASK_OVERDUE'
  | 'TASK_COMPLETED'
  | 'PIPELINE_STAGE_CHANGED'
  | 'CAMPAIGN_STARTED'
  | 'CAMPAIGN_COMPLETED'
  | 'CAMPAIGN_BUDGET_ALERT'
  | 'INTEGRATION_CONNECTED'
  | 'INTEGRATION_ERROR'
  | 'INTEGRATION_LEAD_RECEIVED'
  | 'TEAM_MEMBER_INVITED'
  | 'TEAM_MEMBER_ROLE_CHANGED'
  | 'TEAM_MEMBER_DEACTIVATED'
  | 'DIVISION_CREATED'
  | 'DIVISION_USER_TRANSFERRED'
  | 'IMPORT_COMPLETED'
  | 'IMPORT_FAILED'
  | 'AUTOMATION_TRIGGERED'
  | 'AUTOMATION_ERROR'
  | 'SYSTEM_ANNOUNCEMENT';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  isArchived: boolean;
  metadata?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  userId: string;
  actorId?: string;
  actor?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
  organizationId: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  isRead?: boolean;
  entityType?: string;
  page?: number;
  limit?: number;
}

export interface NotificationPreferences {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  emailEnabled: boolean;
  leads: boolean;
  tasks: boolean;
  campaigns: boolean;
  integrations: boolean;
  team: boolean;
  system: boolean;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  entityType?: string;
  entityId?: string;
}


// ─── Lead Allocation Types ────────────────────────────────────────

export type AllocationMethod = 'round_robin' | 'workload_based' | 'manual';

export interface SourceAllocationRule {
  source: string;
  assignToId: string;
  assignToName?: string;
}

export interface AllocationRules {
  method: AllocationMethod;
  autoAssignOnCreate: boolean;
  maxLeadsPerUser: number;
  sourceRules: SourceAllocationRule[];
  eligibleUserIds: string[];
  divisionId?: string;                  // Which division these rules apply to (undefined = global)
  inherited?: boolean;                  // true if division inherits from global
  scope?: 'global' | 'division';       // Indicates rule scope
}

export interface WorkloadUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  activeLeads: number;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  utilization: number;
  avatar?: string;
  capacity?: number;
}

export interface AllocationStats {
  totalUnassigned: number;
  teamMembers: WorkloadUser[];
  summary: {
    totalUnassigned: number;
    totalLeads?: number;
    assignedLeads?: number;
    unassignedLeads?: number;
    averageResponseTime?: string;
    topPerformer?: string;
    avgLeadsPerUser: number;
    maxCapacity: number;
  };
  users: WorkloadUser[];
}

export interface AutoAllocateResult {
  assigned: number;
  allocated: number;
  details: Array<{ leadId: string; assignedToId: string; assignedToName?: string; name: string }>;
}

export interface AssignmentHistoryEntry {
  id: string;
  description: string;
  metadata: {
    previousAssigneeId: string | null;
    newAssigneeId: string;
    reason: string | null;
  };
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

// ─── Industry Templates ──────────────────────────────────────────────

export interface IndustryTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  stageCount: number;
  fieldCount: number;
  tagCount: number;
}
