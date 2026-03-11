// ─── User & Auth ─────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'VIEWER';
  avatar?: string;
  phone?: string;
  organizationId: string;
  organizationName?: string;
  isActive: boolean;
  lastLoginAt?: string;
  _count?: { assignedLeads: number; tasks: number };
}

export interface AuthResponse {
  token: string;
  user: User;
}

// ─── Lead ────────────────────────────────────────────────────────
export type LeadSource =
  | 'WEBSITE_FORM' | 'LANDING_PAGE' | 'WHATSAPP' | 'FACEBOOK_ADS'
  | 'GOOGLE_ADS' | 'MANUAL' | 'CSV_IMPORT' | 'API' | 'REFERRAL'
  | 'EMAIL' | 'PHONE' | 'OTHER';

export type LeadStatus =
  | 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT'
  | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
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
  assignee?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  createdBy?: Pick<User, 'id' | 'firstName' | 'lastName'>;
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

// ─── Campaign ────────────────────────────────────────────────────
export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  leadCount?: number;
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
