'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { api } from '@/lib/api';
import type { AutomationRule } from '@/types';
import {
  Zap, Plus, X, Hash, Clock, Play, Pause, MoreHorizontal,
  Copy, Trash2, Edit3, ChevronRight, ChevronDown, ArrowRight,
  CheckCircle2, XCircle, AlertTriangle, Activity, Filter,
  LayoutTemplate, Search, RefreshCw, Eye, ArrowLeft, GitBranch,
  Sparkles, Target, Bell, Mail, MessageSquare, UserPlus, Tag,
  ListTodo, Globe, TrendingUp, Shield, BarChart3,
} from 'lucide-react';
import { RefreshButton } from '@/components/RefreshButton';

// ─── Constants ───────────────────────────────────────────────────

const triggerLabels: Record<string, { label: string; description: string; icon: any; color: string }> = {
  LEAD_CREATED: { label: 'Lead Created', description: 'When a new lead is added', icon: Plus, color: 'text-emerald-600 bg-emerald-50' },
  LEAD_STATUS_CHANGED: { label: 'Status Changed', description: 'When lead status is updated', icon: RefreshCw, color: 'text-blue-600 bg-blue-50' },
  LEAD_STAGE_CHANGED: { label: 'Stage Changed', description: 'When lead moves to a new stage', icon: GitBranch, color: 'text-violet-600 bg-violet-50' },
  LEAD_ASSIGNED: { label: 'Lead Assigned', description: 'When a lead is assigned to someone', icon: UserPlus, color: 'text-amber-600 bg-amber-50' },
  LEAD_SCORE_CHANGED: { label: 'Score Changed', description: 'When lead score is updated', icon: TrendingUp, color: 'text-rose-600 bg-rose-50' },
  LEAD_INACTIVE: { label: 'Lead Inactive', description: 'When a lead becomes inactive', icon: AlertTriangle, color: 'text-orange-600 bg-orange-50' },
  LEAD_SLA_WARNING: { label: 'SLA Warning', description: 'When a lead is approaching SLA breach', icon: Shield, color: 'text-amber-600 bg-amber-50' },
  LEAD_SLA_BREACHED: { label: 'SLA Breached', description: 'When a lead has breached SLA response time', icon: Shield, color: 'text-red-600 bg-red-50' },
  LEAD_SLA_ESCALATED: { label: 'SLA Escalated', description: 'When a lead SLA breach is escalated', icon: Shield, color: 'text-rose-700 bg-rose-50' },
  TASK_DUE: { label: 'Task Due', description: 'When a task reaches its due date', icon: Clock, color: 'text-sky-600 bg-sky-50' },
  TASK_OVERDUE: { label: 'Task Overdue', description: 'When a task passes its due date', icon: XCircle, color: 'text-red-600 bg-red-50' },
};

const actionLabels: Record<string, { label: string; icon: any; color: string }> = {
  send_email: { label: 'Send Email', icon: Mail, color: 'text-blue-600 bg-blue-50' },
  send_whatsapp: { label: 'Send WhatsApp', icon: MessageSquare, color: 'text-green-600 bg-green-50' },
  assign_lead: { label: 'Assign Lead', icon: UserPlus, color: 'text-amber-600 bg-amber-50' },
  change_status: { label: 'Change Status', icon: RefreshCw, color: 'text-violet-600 bg-violet-50' },
  change_stage: { label: 'Change Stage', icon: GitBranch, color: 'text-indigo-600 bg-indigo-50' },
  add_tag: { label: 'Add Tag', icon: Tag, color: 'text-pink-600 bg-pink-50' },
  create_task: { label: 'Create Task', icon: ListTodo, color: 'text-cyan-600 bg-cyan-50' },
  notify_user: { label: 'Notify User', icon: Bell, color: 'text-yellow-600 bg-yellow-50' },
  webhook: { label: 'Fire Webhook', icon: Globe, color: 'text-gray-600 bg-gray-50' },
  reassign_lead_round_robin: { label: 'Reassign Lead (Round Robin)', icon: UserPlus, color: 'text-rose-600 bg-rose-50' },
  update_sla_status: { label: 'Update SLA Status', icon: Shield, color: 'text-orange-600 bg-orange-50' },
};

const operatorLabels: Record<string, string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  gt: 'is greater than',
  lt: 'is less than',
  in: 'is one of',
};

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'PROPOSAL_SENT', label: 'Proposal Sent' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

const sourceOptions = [
  { value: 'WEBSITE_FORM', label: 'Website Form' },
  { value: 'LIVE_CHAT', label: 'Live Chat Widget' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CSV_IMPORT', label: 'CSV Import' },
  { value: 'API', label: 'API' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'OTHER', label: 'Other' },
];

const priorityOptions = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const taskTypeOptions = [
  { value: 'FOLLOW_UP_CALL', label: 'Follow Up Call' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'DEMO', label: 'Demo' },
  { value: 'PROPOSAL', label: 'Proposal' },
  { value: 'OTHER', label: 'Other' },
];

// Static value options for standard fields (assignedTo populated dynamically)
const standardConditionFieldValueOptions: Record<string, { value: string; label: string }[] | 'number' | 'text' | 'date' | 'boolean' | 'user'> = {
  status: statusOptions,
  source: sourceOptions,
  score: 'number',
  budget: 'number',
  conversionProb: 'number',
  productInterest: 'text',
  location: 'text',
  company: 'text',
  email: 'text',
  phone: 'text',
  jobTitle: 'text',
  campaign: 'text',
  website: 'text',
  firstName: 'text',
  lastName: 'text',
  assignedTo: 'user', // dynamically populated with team members
  tags: 'text',       // match by tag name
  createdAt: 'date',
  updatedAt: 'date',
  isArchived: 'boolean',
};

// All standard fields matching the Manage Columns list + extra lead fields
const standardConditionFields: { value: string; label: string; category: 'standard'; fieldType: string }[] = [
  // Core identification
  { value: 'firstName', label: 'First Name', category: 'standard', fieldType: 'TEXT' },
  { value: 'lastName', label: 'Last Name', category: 'standard', fieldType: 'TEXT' },
  { value: 'email', label: 'Email', category: 'standard', fieldType: 'TEXT' },
  { value: 'phone', label: 'Phone', category: 'standard', fieldType: 'TEXT' },
  { value: 'company', label: 'Company', category: 'standard', fieldType: 'TEXT' },
  { value: 'jobTitle', label: 'Job Title', category: 'standard', fieldType: 'TEXT' },
  // Status & classification
  { value: 'status', label: 'Status', category: 'standard', fieldType: 'SELECT' },
  { value: 'source', label: 'Source', category: 'standard', fieldType: 'SELECT' },
  { value: 'score', label: 'Score', category: 'standard', fieldType: 'NUMBER' },
  { value: 'budget', label: 'Budget', category: 'standard', fieldType: 'NUMBER' },
  { value: 'conversionProb', label: 'Conversion %', category: 'standard', fieldType: 'NUMBER' },
  // Details
  { value: 'location', label: 'Location', category: 'standard', fieldType: 'TEXT' },
  { value: 'productInterest', label: 'Product Interest', category: 'standard', fieldType: 'TEXT' },
  { value: 'campaign', label: 'Campaign', category: 'standard', fieldType: 'TEXT' },
  { value: 'website', label: 'Website', category: 'standard', fieldType: 'TEXT' },
  // Relationships
  { value: 'assignedTo', label: 'Assigned To', category: 'standard', fieldType: 'USER' },
  { value: 'tags', label: 'Tags', category: 'standard', fieldType: 'TEXT' },
  // Timestamps
  { value: 'createdAt', label: 'Created', category: 'standard', fieldType: 'DATE' },
  { value: 'updatedAt', label: 'Updated', category: 'standard', fieldType: 'DATE' },
  // State
  { value: 'isArchived', label: 'Archived', category: 'standard', fieldType: 'BOOLEAN' },
];

// Returns which operators make sense for a field type
const getOperatorsForFieldType = (fieldType: string): { value: string; label: string }[] => {
  switch (fieldType) {
    case 'SELECT':
    case 'MULTI_SELECT':
    case 'USER':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'in', label: 'is one of' },
      ];
    case 'NUMBER':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'gt', label: 'is greater than' },
        { value: 'lt', label: 'is less than' },
      ];
    case 'BOOLEAN':
      return [
        { value: 'equals', label: 'equals' },
      ];
    case 'DATE':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'gt', label: 'is after' },
        { value: 'lt', label: 'is before' },
      ];
    default: // TEXT, EMAIL, PHONE, URL
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'contains', label: 'contains' },
      ];
  }
};

// Field type to icon label for the dropdown badges
const fieldTypeBadge: Record<string, { label: string; color: string }> = {
  SELECT: { label: 'Select', color: 'bg-violet-100 text-violet-700' },
  MULTI_SELECT: { label: 'Multi', color: 'bg-purple-100 text-purple-700' },
  USER: { label: 'User', color: 'bg-indigo-100 text-indigo-700' },
  TEXT: { label: 'Text', color: 'bg-sky-100 text-sky-700' },
  NUMBER: { label: 'Number', color: 'bg-amber-100 text-amber-700' },
  DATE: { label: 'Date', color: 'bg-emerald-100 text-emerald-700' },
  BOOLEAN: { label: 'Yes/No', color: 'bg-pink-100 text-pink-700' },
  URL: { label: 'URL', color: 'bg-sky-100 text-sky-700' },
  EMAIL: { label: 'Email', color: 'bg-sky-100 text-sky-700' },
  PHONE: { label: 'Phone', color: 'bg-sky-100 text-sky-700' },
};

const templateCategories = [
  { id: 'all', label: 'All Templates' },
  { id: 'sla', label: 'SLA Response Time' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'communication', label: 'Communication' },
  { id: 'notification', label: 'Notification' },
  { id: 'task', label: 'Tasks' },
  { id: 'organization', label: 'Organization' },
  { id: 'integration', label: 'Integration' },
  { id: 'workflow', label: 'Multi-Action Workflows' },
  { id: 'custom', label: 'My Templates' },
];

type ViewMode = 'list' | 'detail' | 'templates';

// ─── Main Page ───────────────────────────────────────────────────

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrigger, setFilterTrigger] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [stats, setStats] = useState<any>(null);

  const fetchRules = useCallback(async () => {
    try {
      const data = await api.getAutomations();
      setRules(data);
    } catch (err) {
      console.error('Failed to fetch automations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getAutomationStats();
      setStats(data);
    } catch {
      // Stats endpoint may not exist yet on production
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchStats();
  }, [fetchRules, fetchStats]);

  const handleToggle = async (id: string) => {
    try {
      await api.toggleAutomation(id);
      await Promise.all([fetchRules(), fetchStats()]);
    } catch (err: any) {
      alert(err.message || 'Failed to toggle automation');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this automation? This cannot be undone.')) return;
    try {
      await api.deleteAutomation(id);
      if (selectedRuleId === id) {
        setSelectedRuleId(null);
        setView('list');
      }
      await Promise.all([fetchRules(), fetchStats()]);
    } catch (err: any) {
      alert(err.message || 'Failed to delete automation');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await api.duplicateAutomation(id);
      await Promise.all([fetchRules(), fetchStats()]);
    } catch (err: any) {
      alert(err.message || 'Failed to duplicate automation');
    }
  };

  const handleCreate = async (data: any) => {
    try {
      if (editingRule && editingRule.id) {
        await api.updateAutomation(editingRule.id, data);
      } else {
        await api.createAutomation(data);
      }
      setShowForm(false);
      setEditingRule(null);
      await Promise.all([fetchRules(), fetchStats()]);
    } catch (err: any) {
      alert(err.message || 'Failed to save automation');
    }
  };

  const handleEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setShowForm(true);
  };

  const handleViewDetail = (id: string) => {
    setSelectedRuleId(id);
    setView('detail');
  };

  const handleUseTemplate = (template: any) => {
    setEditingRule(null);
    setShowForm(true);
    // We pass template data through editingRule but with no ID
    setEditingRule({
      ...template,
      id: '',
      isActive: true,
      executionCount: 0,
    } as any);
    setView('list');
  };

  // Filtered rules
  const filteredRules = rules.filter(r => {
    if (searchQuery && !r.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !r.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterTrigger !== 'all' && r.trigger !== filterTrigger) return false;
    if (filterStatus === 'active' && !r.isActive) return false;
    if (filterStatus === 'inactive' && r.isActive) return false;
    return true;
  });

  const activeCount = rules.filter(r => r.isActive).length;

  if (view === 'detail' && selectedRuleId) {
    return (
      <AutomationDetail
        ruleId={selectedRuleId}
        onBack={() => { setView('list'); setSelectedRuleId(null); }}
        onEdit={(rule) => { handleEdit(rule); setView('list'); }}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />
    );
  }

  if (view === 'templates') {
    return <TemplatesGallery onBack={() => setView('list')} onUseTemplate={handleUseTemplate} />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Automations</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {rules.length} rules &middot; {activeCount} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton onRefresh={() => { fetchRules(); fetchStats(); }} />
          <button onClick={() => setView('templates')} className="btn-secondary text-sm">
            <LayoutTemplate className="h-4 w-4" />
            Templates
          </button>
          <button onClick={() => { setEditingRule(null); setShowForm(true); }} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Automation
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard icon={Zap} label="Total Rules" value={stats.totalRules} color="text-brand-600 bg-brand-50" />
          <StatCard icon={Play} label="Active" value={stats.activeRules} color="text-emerald-600 bg-emerald-50" />
          <StatCard icon={Activity} label="Total Executions" value={stats.totalExecutions} color="text-violet-600 bg-violet-50" />
          <StatCard icon={CheckCircle2} label="Success Rate" value={`${stats.successRate}%`} color="text-sky-600 bg-sky-50" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search automations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto text-sm"
          value={filterTrigger}
          onChange={(e) => setFilterTrigger(e.target.value)}
        >
          <option value="all">All Triggers</option>
          {Object.entries(triggerLabels).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <select
          className="input w-auto text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Rules List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5 flex items-center gap-4">
              <div className="skeleton h-10 w-10 rounded-lg" />
              <div className="flex-1"><div className="skeleton h-4 w-48 mb-2" /><div className="skeleton h-3 w-64" /></div>
              <div className="skeleton h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Zap className="h-6 w-6" />
            </div>
            {rules.length === 0 ? (
              <>
                <p className="text-sm font-medium text-text-primary">No automation rules yet</p>
                <p className="text-xs text-text-tertiary mt-1 mb-3">Automate repetitive tasks and workflows to save time</p>
                <div className="flex gap-2">
                  <button onClick={() => setView('templates')} className="btn-secondary text-sm">
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    Browse Templates
                  </button>
                  <button onClick={() => { setEditingRule(null); setShowForm(true); }} className="btn-primary text-sm">
                    <Plus className="h-3.5 w-3.5" />
                    Create from Scratch
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text-primary">No matching automations</p>
                <p className="text-xs text-text-tertiary mt-1">Try adjusting your filters</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredRules.map((rule) => (
            <AutomationCard
              key={rule.id}
              rule={rule}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onViewDetail={handleViewDetail}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AutomationFormModal
          rule={editingRule}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-lg font-bold text-text-primary">{value}</p>
          <p className="text-xs text-text-tertiary">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Automation Card ─────────────────────────────────────────────

function AutomationCard({ rule, onToggle, onEdit, onDelete, onDuplicate, onViewDetail }: {
  rule: AutomationRule;
  onToggle: (id: string) => void;
  onEdit: (rule: AutomationRule) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onViewDetail: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const trigger = triggerLabels[rule.trigger];
  const TriggerIcon = trigger?.icon || Zap;

  return (
    <div className={`card p-5 transition-all duration-200 hover:shadow-card-hover ${!rule.isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Left: Trigger icon + info */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${trigger?.color || 'bg-surface-tertiary text-text-tertiary'}`}>
            <TriggerIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onViewDetail(rule.id)}
                className="text-sm font-semibold text-text-primary hover:text-brand-600 transition-colors truncate"
              >
                {rule.name}
              </button>
              {rule.isActive ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-emerald-50 text-emerald-700">Active</span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-gray-100 text-gray-500">Paused</span>
              )}
            </div>
            {rule.description && (
              <p className="text-xs text-text-tertiary mt-0.5 truncate">{rule.description}</p>
            )}

            {/* Workflow visualization */}
            <div className="mt-2.5 flex items-center gap-2 flex-wrap">
              {/* Trigger pill */}
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium ${trigger?.color || 'bg-surface-tertiary text-text-secondary'}`}>
                <TriggerIcon className="h-3 w-3" />
                {trigger?.label || rule.trigger}
              </span>

              {/* Conditions */}
              {rule.conditions.length > 0 && (
                <>
                  <ArrowRight className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium bg-amber-50 text-amber-700">
                    <Filter className="h-3 w-3" />
                    {rule.conditions.length} condition{rule.conditions.length > 1 ? 's' : ''}
                  </span>
                </>
              )}

              {/* Actions */}
              <ArrowRight className="h-3 w-3 text-text-tertiary flex-shrink-0" />
              <div className="flex gap-1 flex-wrap">
                {rule.actions.map((a, i) => {
                  const act = actionLabels[a.type];
                  const ActIcon = act?.icon || Zap;
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium ${act?.color || 'bg-brand-50 text-brand-700'}`}>
                      <ActIcon className="h-3 w-3" />
                      {act?.label || a.type.replace(/_/g, ' ')}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Stats + Toggle + Menu */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-text-tertiary">
              <Hash className="h-3 w-3" />
              <span>{rule.executionCount} runs</span>
            </div>
            {rule.lastExecutedAt && (
              <div className="flex items-center gap-1 text-xs text-text-tertiary">
                <Clock className="h-3 w-3" />
                <span>{formatRelative(rule.lastExecutedAt)}</span>
              </div>
            )}
          </div>

          {/* Toggle */}
          <button
            onClick={() => onToggle(rule.id)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
              rule.isActive ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-soft transition-transform duration-200 mt-0.5 ${
              rule.isActive ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`} />
          </button>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="btn-icon h-8 w-8"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-border-subtle py-1 z-40">
                  <button onClick={() => { onViewDetail(rule.id); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </button>
                  <button onClick={() => { onEdit(rule); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2">
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => { onDuplicate(rule.id); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5" /> Duplicate
                  </button>
                  <div className="border-t border-border-subtle my-1" />
                  <button onClick={() => { onDelete(rule.id); setShowMenu(false); }} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Automation Detail View ──────────────────────────────────────

function AutomationDetail({ ruleId, onBack, onEdit, onToggle, onDelete }: {
  ruleId: string;
  onBack: () => void;
  onEdit: (rule: AutomationRule) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [rule, setRule] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'logs'>('overview');
  const [logsPage, setLogsPage] = useState(1);
  const [logsPagination, setLogsPagination] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getAutomation(ruleId);
        setRule(data);
        if (data.recentLogs) setLogs(data.recentLogs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [ruleId]);

  const fetchLogs = async (page: number) => {
    try {
      const data = await api.getAutomationLogs(ruleId, page);
      setLogs(data.data);
      setLogsPagination(data.pagination);
      setLogsPage(page);
    } catch {
      // Logs endpoint may not exist yet
    }
  };

  useEffect(() => {
    if (tab === 'logs') fetchLogs(1);
  }, [tab]);

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-48" />
        <div className="card p-6"><div className="skeleton h-32 w-full" /></div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="animate-fade-in">
        <button onClick={onBack} className="btn-secondary text-sm mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="card"><div className="empty-state"><p className="text-sm text-text-secondary">Automation not found</p></div></div>
      </div>
    );
  }

  const trigger = triggerLabels[rule.trigger];
  const TriggerIcon = trigger?.icon || Zap;
  const successCount = rule.stats?.successCount || 0;
  const failedCount = rule.stats?.failedCount || 0;
  const totalLogs = rule.stats?.totalLogs || 0;
  const successRate = totalLogs > 0 ? ((successCount / totalLogs) * 100).toFixed(1) : '0';

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-icon h-8 w-8"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{rule.name}</h1>
              {rule.isActive ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">Active</span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Paused</span>
              )}
            </div>
            {rule.description && <p className="text-sm text-text-tertiary mt-0.5">{rule.description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onToggle(rule.id)} className={`btn-secondary text-sm ${rule.isActive ? '' : 'btn-primary'}`}>
            {rule.isActive ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Activate</>}
          </button>
          <button onClick={() => onEdit(rule)} className="btn-secondary text-sm"><Edit3 className="h-3.5 w-3.5" /> Edit</button>
          <button
            onClick={async () => {
              try {
                await api.saveAutomationAsTemplate(rule.id);
                alert('Automation saved as a reusable template!');
              } catch (err: any) {
                alert(err.message || 'Failed to save as template');
              }
            }}
            className="btn-secondary text-sm"
          >
            <LayoutTemplate className="h-3.5 w-3.5" /> Save as Template
          </button>
          <button onClick={() => onDelete(rule.id)} className="btn-secondary text-sm text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={Hash} label="Total Runs" value={rule.executionCount} color="text-brand-600 bg-brand-50" />
        <StatCard icon={CheckCircle2} label="Successful" value={successCount} color="text-emerald-600 bg-emerald-50" />
        <StatCard icon={XCircle} label="Failed" value={failedCount} color="text-red-600 bg-red-50" />
        <StatCard icon={TrendingUp} label="Success Rate" value={`${successRate}%`} color="text-sky-600 bg-sky-50" />
      </div>

      {/* Visual Workflow */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Workflow</h3>
        <div className="flex items-start gap-3">
          {/* Trigger */}
          <div className="flex flex-col items-center">
            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${trigger?.color || 'bg-surface-tertiary'}`}>
              <TriggerIcon className="h-6 w-6" />
            </div>
            <span className="text-2xs font-semibold text-text-tertiary mt-1.5 uppercase tracking-wider">Trigger</span>
            <span className="text-xs font-medium text-text-primary mt-0.5">{trigger?.label || rule.trigger}</span>
          </div>

          {/* Conditions */}
          {rule.conditions && rule.conditions.length > 0 && (
            <>
              <div className="flex items-center self-center pt-2">
                <div className="w-8 h-px bg-border-subtle" />
                <ChevronRight className="h-4 w-4 text-text-tertiary -mx-1" />
              </div>
              <div className="flex flex-col items-center">
                <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
                  <Filter className="h-6 w-6" />
                </div>
                <span className="text-2xs font-semibold text-text-tertiary mt-1.5 uppercase tracking-wider">Conditions</span>
                <div className="mt-1 space-y-1">
                  {rule.conditions.map((c: any, i: number) => {
                    const isCustom = c.field?.startsWith('custom.');
                    const fieldLabel = standardConditionFields.find(f => f.value === c.field)?.label
                      || (isCustom ? c.field.slice(7).replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase()) : c.field);
                    const opts = standardConditionFieldValueOptions[c.field];
                    const valueLabel = Array.isArray(opts) ? (opts.find(o => o.value === c.value)?.label || String(c.value)) : String(c.value);
                    return (
                      <span key={i} className="block text-xs text-text-secondary">
                        {fieldLabel}{isCustom && <span className="text-violet-500"> *</span>} {operatorLabels[c.operator] || c.operator} <strong>{valueLabel}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex items-center self-center pt-2">
            <div className="w-8 h-px bg-border-subtle" />
            <ChevronRight className="h-4 w-4 text-text-tertiary -mx-1" />
          </div>
          <div className="flex gap-3">
            {rule.actions?.map((a: any, i: number) => {
              const act = actionLabels[a.type];
              const ActIcon = act?.icon || Zap;
              return (
                <div key={i} className="flex flex-col items-center">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${act?.color || 'bg-brand-50 text-brand-600'}`}>
                    <ActIcon className="h-6 w-6" />
                  </div>
                  <span className="text-2xs font-semibold text-text-tertiary mt-1.5 uppercase tracking-wider">Action {i + 1}</span>
                  <span className="text-xs font-medium text-text-primary mt-0.5">{act?.label || a.type}</span>
                  {a.config && Object.keys(a.config).length > 0 && (
                    <div className="mt-1 text-2xs text-text-tertiary max-w-[120px] text-center">
                      {Object.entries(a.config).slice(0, 2).map(([k, v]) => (
                        <div key={k} className="truncate">{k}: {String(v)}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border-subtle flex gap-4">
        <button
          onClick={() => setTab('overview')}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'overview' ? 'border-brand-600 text-brand-600' : 'border-transparent text-text-tertiary hover:text-text-primary'}`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab('logs')}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'logs' ? 'border-brand-600 text-brand-600' : 'border-transparent text-text-tertiary hover:text-text-primary'}`}
        >
          Execution Logs ({totalLogs})
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="card p-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-text-tertiary">Created</span><p className="font-medium text-text-primary mt-0.5">{rule.createdAt ? new Date(rule.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}</p></div>
            <div><span className="text-text-tertiary">Last executed</span><p className="font-medium text-text-primary mt-0.5">{rule.lastExecutedAt ? formatRelative(rule.lastExecutedAt) : 'Never'}</p></div>
            <div><span className="text-text-tertiary">Trigger</span><p className="font-medium text-text-primary mt-0.5">{trigger?.description || rule.trigger}</p></div>
            <div><span className="text-text-tertiary">Actions</span><p className="font-medium text-text-primary mt-0.5">{rule.actions?.length || 0} action(s) configured</p></div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="card"><div className="empty-state"><Activity className="h-5 w-5 text-text-tertiary" /><p className="text-sm text-text-secondary mt-2">No execution logs yet</p></div></div>
          ) : (
            <>
              {logs.map((log: any) => (
                <div key={log.id} className="card p-4 flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  ) : log.status === 'skipped' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase ${log.status === 'success' ? 'text-emerald-600' : log.status === 'skipped' ? 'text-amber-600' : 'text-red-600'}`}>
                        {log.status}
                      </span>
                      {log.leadName && (
                        <span className="text-xs text-text-secondary truncate">
                          &middot; {log.leadName}
                        </span>
                      )}
                    </div>
                    {log.error && <p className="text-xs text-red-500 mt-0.5 truncate">{log.error}</p>}
                    {log.actionsExecuted && Array.isArray(log.actionsExecuted) && log.actionsExecuted.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {log.actionsExecuted.map((a: any, i: number) => (
                          <span key={i} className={`text-2xs px-1.5 py-0.5 rounded ${a.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {a.type?.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-text-tertiary">{formatRelative(log.createdAt)}</p>
                    <p className="text-2xs text-text-tertiary mt-0.5">{log.executionTimeMs}ms</p>
                  </div>
                </div>
              ))}
              {logsPagination && logsPagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 pt-2">
                  <button disabled={logsPage <= 1} onClick={() => fetchLogs(logsPage - 1)} className="btn-secondary text-xs disabled:opacity-50">Previous</button>
                  <span className="text-xs text-text-tertiary self-center">Page {logsPage} of {logsPagination.totalPages}</span>
                  <button disabled={logsPage >= logsPagination.totalPages} onClick={() => fetchLogs(logsPage + 1)} className="btn-secondary text-xs disabled:opacity-50">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Templates Gallery ───────────────────────────────────────────

function TemplatesGallery({ onBack, onUseTemplate }: { onBack: () => void; onUseTemplate: (t: any) => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [triggerFilter, setTriggerFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getAutomationTemplates();
        setTemplates(data);
      } catch {
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = templates.filter(t => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (triggerFilter !== 'all' && t.trigger !== triggerFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesName = t.name.toLowerCase().includes(q);
      const matchesDesc = t.description?.toLowerCase().includes(q);
      const matchesTags = t.tags?.some((tag: string) => tag.toLowerCase().includes(q));
      if (!matchesName && !matchesDesc && !matchesTags) return false;
    }
    return true;
  });

  const categoryIcons: Record<string, any> = {
    assignment: UserPlus,
    communication: Mail,
    notification: Bell,
    task: ListTodo,
    organization: Tag,
    integration: Globe,
    workflow: GitBranch,
    custom: Sparkles,
  };

  // Count templates per category
  const categoryCounts = templateCategories.reduce((acc, cat) => {
    acc[cat.id] = cat.id === 'all' ? templates.length : templates.filter(t => t.category === cat.id).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-icon h-8 w-8"><ArrowLeft className="h-4 w-4" /></button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Automation Templates</h1>
            <p className="text-text-secondary text-sm mt-0.5">{templates.length} pre-built workflows to get started quickly</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search templates by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto text-sm"
          value={triggerFilter}
          onChange={(e) => setTriggerFilter(e.target.value)}
        >
          <option value="all">All Triggers</option>
          {Object.entries(triggerLabels).map(([val, { label }]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {templateCategories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              categoryFilter === cat.id
                ? 'bg-brand-600 text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            {cat.label}
            {categoryCounts[cat.id] > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-2xs ${
                categoryFilter === cat.id ? 'bg-white/20' : 'bg-surface-tertiary'
              }`}>{categoryCounts[cat.id]}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="card p-5"><div className="skeleton h-24 w-full" /></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <LayoutTemplate className="h-5 w-5 text-text-tertiary" />
            <p className="text-sm text-text-secondary mt-2">
              {searchQuery || triggerFilter !== 'all' ? 'No templates match your search' : 'No templates available'}
            </p>
            {(searchQuery || triggerFilter !== 'all') && (
              <button
                onClick={() => { setSearchQuery(''); setTriggerFilter('all'); setCategoryFilter('all'); }}
                className="btn-secondary text-xs mt-2"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((template: any) => {
            const trigger = triggerLabels[template.trigger];
            const TriggerIcon = trigger?.icon || Zap;
            const CatIcon = categoryIcons[template.category] || Sparkles;

            return (
              <div key={template.id} className="card p-5 hover:shadow-card-hover transition-all duration-200 group">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${trigger?.color || 'bg-brand-50 text-brand-600'}`}>
                    <CatIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-text-primary">{template.name}</h3>
                      {template.isCustom && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 font-medium">Custom</span>
                      )}
                      {template.actions?.length > 1 && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-medium">{template.actions.length} actions</span>
                      )}
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5">{template.description}</p>

                    {/* Tags */}
                    {template.tags && template.tags.length > 0 && (
                      <div className="mt-1.5 flex gap-1 flex-wrap">
                        {template.tags.slice(0, 4).map((tag: string) => (
                          <span key={tag} className="text-2xs px-1.5 py-0.5 rounded bg-surface-tertiary text-text-tertiary">{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* Mini workflow */}
                    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ${trigger?.color || 'bg-surface-tertiary text-text-secondary'}`}>
                        <TriggerIcon className="h-3 w-3" />
                        {trigger?.label || template.trigger}
                      </span>
                      {template.conditions?.length > 0 && (
                        <>
                          <ArrowRight className="h-2.5 w-2.5 text-text-tertiary" />
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">{template.conditions.length} filter{template.conditions.length > 1 ? 's' : ''}</span>
                        </>
                      )}
                      <ArrowRight className="h-2.5 w-2.5 text-text-tertiary" />
                      {template.actions?.map((a: any, i: number) => {
                        const act = actionLabels[a.type];
                        return (
                          <span key={i} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium ${act?.color || 'bg-brand-50 text-brand-700'}`}>
                            {act?.label || a.type}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => onUseTemplate(template)}
                    className="btn-primary text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  >
                    Use
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Create / Edit Form Modal ────────────────────────────────────

// Searchable field picker for conditions — renders dropdown via portal to avoid overflow clipping
function ConditionFieldPicker({ value, onChange, allFields }: {
  value: string;
  onChange: (fieldValue: string) => void;
  allFields: { value: string; label: string; category: string; fieldType: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });

  // Position the dropdown relative to the button
  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 340; // approximate max height
      // Open upward if not enough space below
      if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
        setPos({ top: rect.top - dropdownHeight, left: rect.left, width: Math.max(rect.width, 320) });
      } else {
        setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 320) });
      }
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); } };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  const selected = allFields.find(f => f.value === value);
  const filtered = allFields.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.value.toLowerCase().includes(search.toLowerCase())
  );
  const standardFields = filtered.filter(f => f.category === 'standard');
  const customFields = filtered.filter(f => f.category === 'custom');

  return (
    <div className="relative flex-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="input text-sm w-full text-left flex items-center justify-between gap-2 pr-2"
      >
        <span className="flex items-center gap-2 truncate min-w-0">
          <span className="truncate">{selected?.label || value}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-white rounded-xl shadow-2xl border border-border-subtle overflow-hidden animate-fade-in"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border-subtle">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
              <input
                autoFocus
                className="input text-sm pl-8 w-full"
                placeholder="Search fields..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto overscroll-contain">
            {/* Standard Fields */}
            {standardFields.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-2xs font-semibold text-text-tertiary uppercase tracking-wider bg-surface-secondary sticky top-0 z-10">
                  Standard Fields
                </div>
                {standardFields.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { onChange(f.value); setOpen(false); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-surface-secondary transition-colors ${f.value === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-text-primary'}`}
                  >
                    <span className="truncate">{f.label}</span>
                    <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${fieldTypeBadge[f.fieldType]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {fieldTypeBadge[f.fieldType]?.label || f.fieldType}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Custom Fields */}
            {customFields.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-2xs font-semibold text-text-tertiary uppercase tracking-wider bg-surface-secondary sticky top-0 z-10 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Custom Fields
                </div>
                {customFields.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { onChange(f.value); setOpen(false); setSearch(''); }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-surface-secondary transition-colors ${f.value === value ? 'bg-brand-50 text-brand-700 font-medium' : 'text-text-primary'}`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Sparkles className="h-3 w-3 text-violet-400 flex-shrink-0" />
                      <span className="truncate">{f.label}</span>
                    </span>
                    <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${fieldTypeBadge[f.fieldType]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {fieldTypeBadge[f.fieldType]?.label || f.fieldType}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="p-4 text-center text-sm text-text-tertiary">
                No fields match &ldquo;{search}&rdquo;
              </div>
            )}
          </div>

          {/* Footer with count */}
          <div className="border-t border-border-subtle px-3 py-1.5 text-2xs text-text-tertiary bg-surface-secondary">
            {allFields.length} fields available ({allFields.filter(f => f.category === 'custom').length} custom)
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function AutomationFormModal({ rule, onClose, onSubmit }: {
  rule: AutomationRule | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const isEditing = rule && rule.id;
  const [form, setForm] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    trigger: rule?.trigger || 'LEAD_CREATED',
    conditions: rule?.conditions || [] as any[],
    actions: rule?.actions?.length ? rule.actions : [{ type: 'notify_user', config: { message: '' } }],
  });
  const [step, setStep] = useState(1); // 1=basics, 2=conditions, 3=actions, 4=review

  // Custom fields + users state
  const [customFieldsRaw, setCustomFieldsRaw] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);

  // Fetch custom fields and team members on mount
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const [fields, users] = await Promise.all([
          api.getCustomFields().catch(() => []),
          api.getUsers().catch(() => []),
        ]);
        if (!cancelled) {
          setCustomFieldsRaw(fields || []);
          setTeamUsers(users || []);
        }
      } catch (err) {
        console.error('Failed to fetch condition data:', err);
      } finally {
        if (!cancelled) setLoadingFields(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  // Build merged field lists: standard + custom
  const allConditionFields = React.useMemo(() => {
    const customMapped = customFieldsRaw.map((cf: any) => ({
      value: `custom.${cf.name}`,
      label: cf.label,
      category: 'custom' as const,
      fieldType: cf.type,
    }));
    return [...standardConditionFields, ...customMapped];
  }, [customFieldsRaw]);

  // Build user options for "Assigned To"
  const userOptions = React.useMemo(() => {
    return teamUsers
      .filter((u: any) => u.isActive !== false)
      .map((u: any) => ({
        value: u.id,
        label: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
      }));
  }, [teamUsers]);

  // Build merged value options: standard + custom + dynamic users
  const allConditionFieldValueOptions = React.useMemo(() => {
    const merged: Record<string, { value: string; label: string }[] | 'number' | 'text' | 'date' | 'boolean'> = {};
    // Copy standard options, resolving 'user' type to actual user list
    for (const [key, val] of Object.entries(standardConditionFieldValueOptions)) {
      if (val === 'user') {
        merged[key] = userOptions;
      } else {
        merged[key] = val as any;
      }
    }
    // Add custom field options
    for (const cf of customFieldsRaw) {
      const key = `custom.${cf.name}`;
      switch (cf.type) {
        case 'SELECT':
        case 'MULTI_SELECT': {
          const opts = Array.isArray(cf.options) ? cf.options : [];
          merged[key] = opts.map((o: string) => ({ value: o, label: o }));
          break;
        }
        case 'NUMBER':
          merged[key] = 'number';
          break;
        case 'DATE':
          merged[key] = 'date';
          break;
        case 'BOOLEAN':
          merged[key] = 'boolean';
          break;
        default:
          merged[key] = 'text';
      }
    }
    return merged;
  }, [customFieldsRaw, userOptions]);

  // Helper: get field type for a given field value
  const getFieldType = (fieldValue: string): string => {
    return allConditionFields.find(f => f.value === fieldValue)?.fieldType || 'TEXT';
  };

  const totalSteps = 4;

  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { field: 'status', operator: 'equals', value: 'NEW' }] });
  };

  const removeCondition = (index: number) => {
    setForm({ ...form, conditions: form.conditions.filter((_, i) => i !== index) });
  };

  const updateCondition = (index: number, updates: any) => {
    const updated = [...form.conditions];
    updated[index] = { ...updated[index], ...updates };
    setForm({ ...form, conditions: updated });
  };

  const addAction = () => {
    setForm({ ...form, actions: [...form.actions, { type: 'notify_user', config: { message: '' } }] });
  };

  const removeAction = (index: number) => {
    if (form.actions.length <= 1) return;
    setForm({ ...form, actions: form.actions.filter((_, i) => i !== index) });
  };

  const updateAction = (index: number, updates: any) => {
    const updated = [...form.actions];
    updated[index] = { ...updated[index], ...updates };
    setForm({ ...form, actions: updated });
  };

  const updateActionConfig = (index: number, key: string, value: string) => {
    const updated = [...form.actions];
    updated[index] = { ...updated[index], config: { ...updated[index].config, [key]: value } };
    setForm({ ...form, actions: updated });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return alert('Name is required');
    if (form.actions.length === 0) return alert('At least one action is required');
    onSubmit(form);
  };

  const trigger = triggerLabels[form.trigger];

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl max-h-[92vh] overflow-hidden relative z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{isEditing ? 'Edit Automation' : 'New Automation'}</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Step {step} of {totalSteps}</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        {/* Step Progress */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand-600' : 'bg-surface-tertiary'}`} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-2xs text-text-tertiary">
            <span className={step >= 1 ? 'text-brand-600 font-medium' : ''}>Basics</span>
            <span className={step >= 2 ? 'text-brand-600 font-medium' : ''}>Conditions</span>
            <span className={step >= 3 ? 'text-brand-600 font-medium' : ''}>Actions</span>
            <span className={step >= 4 ? 'text-brand-600 font-medium' : ''}>Review</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="label">Name *</label>
                <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Auto-assign new leads" />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this automation do?" />
              </div>
              <div>
                <label className="label">Trigger Event *</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(triggerLabels).map(([value, { label, description, icon: Icon, color }]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, trigger: value })}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        form.trigger === value
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-border-subtle hover:border-border-default'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded flex items-center justify-center ${color}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-text-primary">{label}</p>
                          <p className="text-2xs text-text-tertiary">{description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Conditions */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Conditions</h3>
                  <p className="text-xs text-text-tertiary mt-0.5">Optional — leave empty to trigger for all matching events</p>
                </div>
                <button type="button" onClick={addCondition} className="btn-secondary text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Condition
                </button>
              </div>

              {/* Field availability info */}
              {!loadingFields && customFieldsRaw.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                  <p className="text-xs text-violet-700">
                    <span className="font-medium">{customFieldsRaw.length} custom field{customFieldsRaw.length !== 1 ? 's' : ''}</span> available from your division settings
                  </p>
                </div>
              )}

              {form.conditions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-border-subtle p-8 text-center">
                  <Filter className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
                  <p className="text-sm text-text-secondary font-medium">No conditions</p>
                  <p className="text-xs text-text-tertiary mt-1">This automation will trigger for every matching event</p>
                  <button type="button" onClick={addCondition} className="btn-secondary text-xs mt-3">
                    <Plus className="h-3 w-3" /> Add a condition
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {form.conditions.map((cond: any, i: number) => {
                    const fieldType = getFieldType(cond.field);
                    const availableOperators = getOperatorsForFieldType(fieldType);
                    const opts = allConditionFieldValueOptions[cond.field];
                    const isCustom = cond.field?.startsWith('custom.');

                    return (
                      <div key={i} className={`p-3 rounded-lg border ${isCustom ? 'bg-violet-50/50 border-violet-200' : 'bg-surface-secondary border-transparent'}`}>
                        {i > 0 && (
                          <div className="flex items-center gap-2 mb-2">
                            <div className="h-px flex-1 bg-border-subtle" />
                            <span className="text-2xs font-semibold text-text-tertiary uppercase px-2">AND</span>
                            <div className="h-px flex-1 bg-border-subtle" />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {/* Field Picker */}
                          <ConditionFieldPicker
                            value={cond.field}
                            allFields={allConditionFields}
                            onChange={(newField) => {
                              const newOpts = allConditionFieldValueOptions[newField];
                              const newFieldType = getFieldType(newField);
                              const newOperators = getOperatorsForFieldType(newFieldType);
                              let defaultValue = '';
                              if (Array.isArray(newOpts)) defaultValue = newOpts[0]?.value || '';
                              else if (newOpts === 'number') defaultValue = '0';
                              else if (newOpts === 'boolean') defaultValue = 'true';
                              else if (newOpts === 'date') defaultValue = '';
                              const defaultOp = newOperators[0]?.value || 'equals';
                              updateCondition(i, { field: newField, value: defaultValue, operator: defaultOp });
                            }}
                          />

                          {/* Smart Operator Select */}
                          <select
                            className="input text-sm w-40"
                            value={cond.operator}
                            onChange={(e) => updateCondition(i, { operator: e.target.value })}
                          >
                            {availableOperators.map(op => (
                              <option key={op.value} value={op.value}>{op.label}</option>
                            ))}
                          </select>

                          {/* Type-Aware Value Input */}
                          {(() => {
                            if (Array.isArray(opts)) {
                              return (
                                <select className="input text-sm flex-1" value={String(cond.value)} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                                  <option value="">Select...</option>
                                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              );
                            }
                            if (opts === 'number') {
                              return <input type="number" className="input text-sm flex-1" value={String(cond.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="Enter number..." />;
                            }
                            if (opts === 'date') {
                              return <input type="date" className="input text-sm flex-1" value={String(cond.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} />;
                            }
                            if (opts === 'boolean') {
                              return (
                                <select className="input text-sm flex-1" value={String(cond.value)} onChange={(e) => updateCondition(i, { value: e.target.value })}>
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              );
                            }
                            return <input className="input text-sm flex-1" value={String(cond.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="Enter value..." />;
                          })()}

                          <button type="button" onClick={() => removeCondition(i)} className="btn-icon h-8 w-8 text-red-500 hover:text-red-700 flex-shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Actions */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Actions</h3>
                  <p className="text-xs text-text-tertiary mt-0.5">What should happen when this automation triggers?</p>
                </div>
                <button type="button" onClick={addAction} className="btn-secondary text-xs">
                  <Plus className="h-3.5 w-3.5" /> Add Action
                </button>
              </div>

              <div className="space-y-3">
                {form.actions.map((action: any, i: number) => {
                  const act = actionLabels[action.type];
                  const ActIcon = act?.icon || Zap;
                  return (
                    <div key={i} className="rounded-lg border border-border-subtle p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`h-7 w-7 rounded flex items-center justify-center ${act?.color || 'bg-surface-tertiary text-text-tertiary'}`}>
                            <ActIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-text-tertiary uppercase">Action {i + 1}</span>
                        </div>
                        {form.actions.length > 1 && (
                          <button type="button" onClick={() => removeAction(i)} className="btn-icon h-7 w-7 text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="label">Action Type</label>
                          <select className="input text-sm" value={action.type} onChange={(e) => updateAction(i, { type: e.target.value, config: {} })}>
                            {Object.entries(actionLabels).map(([val, { label }]) => <option key={val} value={val}>{label}</option>)}
                          </select>
                        </div>

                        {/* Dynamic config fields based on action type */}
                        {action.type === 'notify_user' && (
                          <div>
                            <label className="label">Notification Message</label>
                            <input className="input text-sm" value={action.config.message || ''} onChange={(e) => updateActionConfig(i, 'message', e.target.value)} placeholder="Automation triggered — check the lead!" />
                          </div>
                        )}
                        {action.type === 'send_email' && (
                          <>
                            <div>
                              <label className="label">Subject</label>
                              <input className="input text-sm" value={action.config.subject || ''} onChange={(e) => updateActionConfig(i, 'subject', e.target.value)} placeholder="Email subject line" />
                            </div>
                            <div>
                              <label className="label">Template</label>
                              <select className="input text-sm" value={action.config.template || ''} onChange={(e) => updateActionConfig(i, 'template', e.target.value)}>
                                <option value="">Select template...</option>
                                <option value="welcome">Welcome</option>
                                <option value="follow-up">Follow Up</option>
                                <option value="proposal">Proposal</option>
                                <option value="meeting-reminder">Meeting Reminder</option>
                                <option value="thank-you">Thank You</option>
                                <option value="custom">Custom</option>
                              </select>
                            </div>
                          </>
                        )}
                        {action.type === 'send_whatsapp' && (
                          <div>
                            <label className="label">Message</label>
                            <input className="input text-sm" value={action.config.message || ''} onChange={(e) => updateActionConfig(i, 'message', e.target.value)} placeholder="WhatsApp message text" />
                          </div>
                        )}
                        {action.type === 'change_status' && (
                          <div>
                            <label className="label">New Status</label>
                            <select className="input text-sm" value={action.config.status || ''} onChange={(e) => updateActionConfig(i, 'status', e.target.value)}>
                              <option value="">Select status...</option>
                              {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                        )}
                        {action.type === 'add_tag' && (
                          <div>
                            <label className="label">Tag Name</label>
                            <input className="input text-sm" value={action.config.tagName || ''} onChange={(e) => updateActionConfig(i, 'tagName', e.target.value)} placeholder="e.g. Hot Lead, VIP, Follow Up" />
                          </div>
                        )}
                        {action.type === 'create_task' && (
                          <>
                            <div>
                              <label className="label">Task Title</label>
                              <input className="input text-sm" value={action.config.title || ''} onChange={(e) => updateActionConfig(i, 'title', e.target.value)} placeholder="Follow up with lead" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="label">Task Type</label>
                                <select className="input text-sm" value={action.config.taskType || 'FOLLOW_UP_CALL'} onChange={(e) => updateActionConfig(i, 'taskType', e.target.value)}>
                                  {taskTypeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="label">Due In (hours)</label>
                                <input type="number" className="input text-sm" value={action.config.dueInHours || 24} onChange={(e) => updateActionConfig(i, 'dueInHours', e.target.value)} />
                              </div>
                            </div>
                            <div>
                              <label className="label">Priority</label>
                              <select className="input text-sm" value={action.config.priority || 'MEDIUM'} onChange={(e) => updateActionConfig(i, 'priority', e.target.value)}>
                                {priorityOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                        {action.type === 'webhook' && (
                          <>
                            <div>
                              <label className="label">Webhook URL</label>
                              <input className="input text-sm" value={action.config.url || ''} onChange={(e) => updateActionConfig(i, 'url', e.target.value)} placeholder="https://..." />
                            </div>
                            <div>
                              <label className="label">HTTP Method</label>
                              <select className="input text-sm" value={action.config.method || 'POST'} onChange={(e) => updateActionConfig(i, 'method', e.target.value)}>
                                <option value="POST">POST</option>
                                <option value="GET">GET</option>
                                <option value="PUT">PUT</option>
                              </select>
                            </div>
                          </>
                        )}
                        {action.type === 'change_stage' && (
                          <div>
                            <label className="label">New Stage</label>
                            <select className="input text-sm" value={action.config.stage || ''} onChange={(e) => updateActionConfig(i, 'stage', e.target.value)}>
                              <option value="">Select stage...</option>
                              <option value="NEW_INQUIRY">New Inquiry</option>
                              <option value="INITIAL_CONTACT">Initial Contact</option>
                              <option value="QUALIFICATION">Qualification</option>
                              <option value="PROPOSAL">Proposal</option>
                              <option value="NEGOTIATION">Negotiation</option>
                              <option value="CLOSED_WON">Closed Won</option>
                              <option value="CLOSED_LOST">Closed Lost</option>
                            </select>
                          </div>
                        )}
                        {action.type === 'assign_lead' && (
                          <div>
                            <label className="label">Assignment Method</label>
                            <select className="input text-sm" value={action.config.method || 'round_robin'} onChange={(e) => updateActionConfig(i, 'method', e.target.value)}>
                              <option value="round_robin">Round Robin</option>
                              <option value="workload_based">Workload Based</option>
                            </select>
                          </div>
                        )}
                        {action.type === 'reassign_lead_round_robin' && (
                          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                            <p className="text-xs text-rose-700">This action automatically reassigns the lead to the next available team member using round-robin. The previous assignee and new assignee will both be notified.</p>
                          </div>
                        )}
                        {action.type === 'update_sla_status' && (
                          <>
                            <div>
                              <label className="label">SLA Status</label>
                              <select className="input text-sm" value={action.config.slaStatus || ''} onChange={(e) => updateActionConfig(i, 'slaStatus', e.target.value)}>
                                <option value="">Select status...</option>
                                <option value="ON_TIME">On Time</option>
                                <option value="AT_RISK">At Risk</option>
                                <option value="BREACHED">Breached</option>
                                <option value="ESCALATED">Escalated</option>
                                <option value="RESPONDED">Responded</option>
                              </select>
                            </div>
                            <div>
                              <label className="label">Escalation Level</label>
                              <select className="input text-sm" value={String(action.config.escalationLevel ?? '')} onChange={(e) => updateActionConfig(i, 'escalationLevel', e.target.value || '')}>
                                <option value="">No change</option>
                                <option value="0">Level 0 — Normal</option>
                                <option value="1">Level 1 — Reminded</option>
                                <option value="2">Level 2 — Escalated</option>
                                <option value="3">Level 3 — Reassigned</option>
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-semibold text-text-primary">Review Your Automation</h3>

              <div className="card p-4 space-y-3">
                <div>
                  <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider">Name</span>
                  <p className="text-sm font-medium text-text-primary">{form.name}</p>
                  {form.description && <p className="text-xs text-text-tertiary">{form.description}</p>}
                </div>
              </div>

              {/* Visual workflow preview */}
              <div className="card p-4">
                <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider block mb-3">Workflow</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${trigger?.color || 'bg-surface-tertiary text-text-secondary'}`}>
                    {trigger && <trigger.icon className="h-3.5 w-3.5" />}
                    {trigger?.label || form.trigger}
                  </span>

                  {form.conditions.length > 0 && (
                    <>
                      <ArrowRight className="h-4 w-4 text-text-tertiary" />
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700">
                        <Filter className="h-3.5 w-3.5" />
                        {form.conditions.length} condition{form.conditions.length > 1 ? 's' : ''}
                      </span>
                    </>
                  )}

                  <ArrowRight className="h-4 w-4 text-text-tertiary" />

                  {form.actions.map((a, i) => {
                    const act = actionLabels[a.type];
                    const ActIcon = act?.icon || Zap;
                    return (
                      <span key={i} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${act?.color || 'bg-brand-50 text-brand-700'}`}>
                        <ActIcon className="h-3.5 w-3.5" />
                        {act?.label || a.type}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Conditions detail */}
              {form.conditions.length > 0 && (
                <div className="card p-4">
                  <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider block mb-2">Conditions</span>
                  {form.conditions.map((c, i) => {
                    const fieldDef = allConditionFields.find(f => f.value === c.field);
                    const fieldLabel = fieldDef?.label || c.field.replace('custom.', '');
                    const isCustom = c.field?.startsWith('custom.');
                    const opts = allConditionFieldValueOptions[c.field];
                    const valueLabel = Array.isArray(opts) ? (opts.find(o => o.value === c.value)?.label || String(c.value))
                      : opts === 'boolean' ? (c.value === 'true' ? 'Yes' : 'No')
                      : String(c.value);
                    return (
                      <p key={i} className="text-xs text-text-secondary">
                        {i > 0 && <span className="text-text-tertiary font-medium">AND </span>}
                        <span className="font-medium text-text-primary">{fieldLabel}</span>
                        {isCustom && <span className="text-2xs text-violet-500 ml-1">(custom)</span>}
                        {' '}{operatorLabels[c.operator] || c.operator}{' '}
                        <span className="font-medium text-text-primary">{valueLabel}</span>
                      </p>
                    );
                  })}
                </div>
              )}

              {/* Actions detail */}
              <div className="card p-4 space-y-2">
                <span className="text-2xs font-semibold text-text-tertiary uppercase tracking-wider block">Actions</span>
                {form.actions.map((a, i) => {
                  const act = actionLabels[a.type];
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs font-medium text-text-tertiary mt-0.5">{i + 1}.</span>
                      <div>
                        <p className="text-xs font-medium text-text-primary">{act?.label || a.type}</p>
                        {Object.entries(a.config).filter(([, v]) => v).map(([k, v]) => {
                          const configLabels: Record<string, string> = { status: 'Status', taskType: 'Task Type', priority: 'Priority', stage: 'Stage', template: 'Template', subject: 'Subject', message: 'Message', tagName: 'Tag', title: 'Title', dueInHours: 'Due In (hours)', url: 'URL', method: 'Method' };
                          const valueMappers: Record<string, { value: string; label: string }[]> = { status: statusOptions, taskType: taskTypeOptions, priority: priorityOptions };
                          const displayVal = valueMappers[k]?.find(o => o.value === String(v))?.label || String(v);
                          return <p key={k} className="text-2xs text-text-tertiary">{configLabels[k] || k}: {displayVal}</p>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-subtle flex-shrink-0">
          <div>
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} className="btn-secondary text-sm">
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            {step < totalSteps ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !form.name.trim()) return alert('Name is required');
                  setStep(step + 1);
                }}
                className="btn-primary text-sm"
              >
                Continue
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} className="btn-primary text-sm">
                <Sparkles className="h-3.5 w-3.5" />
                {isEditing ? 'Save Changes' : 'Create Automation'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
