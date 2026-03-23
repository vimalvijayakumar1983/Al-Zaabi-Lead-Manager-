'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Edit3,
  Copy,
  Trash2,
  Pause,
  Play,
  LayoutGrid,
  List,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Target,
  Megaphone,
  Facebook,
  Mail,
  MessageCircle,
  Globe,
  Share2,
  FileText,
  Zap,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Hash,
  Link2,
  Settings2,
  Eye,
  SlidersHorizontal,
  Keyboard,
  Check,
  MessageSquare,
} from 'lucide-react';
import type { Campaign, PaginatedResponse, User, Organization } from '@/types';
import { api } from '@/lib/api';
import { premiumConfirm } from '@/lib/premiumDialogs';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/authStore';
import { RefreshButton } from '@/components/RefreshButton';

// ---------------------------------------------------------------------------
// Local Interfaces
// ---------------------------------------------------------------------------

interface CampaignDashboardStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalBudget: number;
  totalLeads: number;
  avgCostPerLead: number;
  bestPerforming: { name: string; leads: number } | null;
}

interface CampaignFormData {
  name: string;
  campaignCode: string;
  type: string;
  status: string;
  budget: string;
  startDate: string;
  endDate: string;
  description: string;
  organizationId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  targetLeads: string;
  targetConversions: string;
  targetRevenue: string;
}

interface FormErrors {
  [key: string]: string;
}

interface SavedFilterView {
  id: string;
  name: string;
  filters: FilterState;
}

interface FilterState {
  search: string;
  types: string[];
  statuses: string[];
  divisions: string[];
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  budgetMin: string;
  budgetMax: string;
  sort: string;
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMPAIGN_TYPES = [
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads', icon: Facebook, color: 'text-blue-600 bg-blue-50 ring-blue-600/10' },
  { value: 'GOOGLE_ADS', label: 'Google Ads', icon: Globe, color: 'text-red-500 bg-red-50 ring-red-500/10' },
  { value: 'EMAIL', label: 'Email', icon: Mail, color: 'text-amber-600 bg-amber-50 ring-amber-600/10' },
  { value: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-600 bg-green-50 ring-green-600/10' },
  { value: 'LANDING_PAGE', label: 'Landing Page', icon: FileText, color: 'text-purple-600 bg-purple-50 ring-purple-600/10' },
  { value: 'REFERRAL', label: 'Referral', icon: Share2, color: 'text-pink-600 bg-pink-50 ring-pink-600/10' },
  { value: 'TIKTOK_ADS', label: 'TikTok Ads', icon: Zap, color: 'text-cyan-600 bg-cyan-50 ring-cyan-600/10' },
  { value: 'WEBSITE_FORM', label: 'Website Form', icon: Globe, color: 'text-indigo-600 bg-indigo-50 ring-indigo-600/10' },
  { value: 'LIVE_CHAT', label: 'Live Chat', icon: MessageSquare, color: 'text-violet-600 bg-violet-50 ring-violet-600/10' },
  { value: 'OTHER', label: 'Other', icon: Megaphone, color: 'text-gray-600 bg-gray-50 ring-gray-600/10' },
] as const;

const CAMPAIGN_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-50 text-gray-700 ring-gray-600/10' },
  { value: 'ACTIVE', label: 'Active', color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10' },
  { value: 'PAUSED', label: 'Paused', color: 'bg-amber-50 text-amber-700 ring-amber-600/10' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-blue-50 text-blue-700 ring-blue-600/10' },
] as const;

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently Updated' },
  { value: 'name_asc', label: 'Name A → Z' },
  { value: 'name_desc', label: 'Name Z → A' },
  { value: 'budget_desc', label: 'Budget High → Low' },
  { value: 'budget_asc', label: 'Budget Low → High' },
  { value: 'leads_desc', label: 'Most Leads' },
  { value: 'created_desc', label: 'Newest' },
  { value: 'created_asc', label: 'Oldest' },
  { value: 'updated_asc', label: 'Least Recently Updated' },
] as const;

const DATE_PRESETS = [
  { value: '', label: 'All Time' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'custom', label: 'Custom Range' },
] as const;

const PAGE_SIZES = [10, 25, 50, 100] as const;

const SAVED_FILTERS_KEY = 'crm_campaigns_saved_filters';

const DEFAULT_FILTER_STATE: FilterState = {
  search: '',
  types: [],
  statuses: [],
  divisions: [],
  datePreset: '',
  dateFrom: '',
  dateTo: '',
  budgetMin: '',
  budgetMax: '',
  sort: 'updated_desc',
};

const EMPTY_FORM_DATA: CampaignFormData = {
  name: '',
  campaignCode: '',
  type: 'FACEBOOK_ADS',
  status: 'DRAFT',
  budget: '',
  startDate: '',
  endDate: '',
  description: '',
  organizationId: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmContent: '',
  utmTerm: '',
  targetLeads: '',
  targetConversions: '',
  targetRevenue: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAED(amount: number | undefined | null): string {
  const val = amount || 0;
  return `AED ${val.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatAEDCompact(amount: number | undefined | null): string {
  const val = amount || 0;
  if (val >= 1_000_000) return `AED ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `AED ${(val / 1_000).toFixed(1)}K`;
  return `AED ${val.toLocaleString('en-AE')}`;
}

function formatNumber(n: number | undefined | null): string {
  return (n || 0).toLocaleString('en-AE');
}

function formatDateTime(date: string | undefined | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-AE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(date: string | undefined | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-AE', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCampaignType(value: string) {
  return CAMPAIGN_TYPES.find((t) => t.value === value) || CAMPAIGN_TYPES[CAMPAIGN_TYPES.length - 1];
}

function getCampaignStatus(value: string) {
  return CAMPAIGN_STATUSES.find((s) => s.value === value) || CAMPAIGN_STATUSES[0];
}

function computeCPL(budget: number | undefined, leads: number | undefined): number {
  const b = budget || 0;
  const l = leads || 0;
  if (l === 0) return 0;
  return Math.round(b / l);
}

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDay();

  switch (preset) {
    case 'this_week': {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      startOfWeek.setHours(0, 0, 0, 0);
      return { from: startOfWeek.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    case 'this_month': {
      const startOfMonth = new Date(year, month, 1);
      return { from: startOfMonth.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    case 'this_quarter': {
      const quarterStart = new Date(year, Math.floor(month / 3) * 3, 1);
      return { from: quarterStart.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
    }
    default:
      return { from: '', to: '' };
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hasTextSelection(): boolean {
  if (typeof window === 'undefined') return false;
  const selectedText = window.getSelection?.()?.toString?.() || '';
  return selectedText.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/* ---- Toast Container ---- */
function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} className="ml-2 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---- Stat Card ---- */
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 min-w-[200px] flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="animate-pulse bg-gray-200 rounded-lg w-10 h-10" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-24" />
        </div>
        <div className="animate-pulse bg-gray-200 rounded h-7 w-32 mb-1" />
        <div className="animate-pulse bg-gray-200 rounded h-3 w-20" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 min-w-[200px] flex-shrink-0 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-text-secondary">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      {subValue && <div className="text-xs text-text-tertiary mt-1">{subValue}</div>}
    </div>
  );
}

/* ---- Badge ---- */
function StatusBadge({ status }: { status: string }) {
  const s = getCampaignStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${s.color}`}>
      {status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {s.label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const t = getCampaignType(type);
  const Icon = t.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${t.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {t.label}
    </span>
  );
}

/* ---- Filter Badge ---- */
function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/10">
      {label}
      <button onClick={onRemove} className="hover:text-brand-900 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

/* ---- Multi-Select Filter Dropdown ---- */
function MultiSelectDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
          selected.length > 0
            ? 'border-brand-300 bg-brand-50 text-brand-700'
            : 'border-gray-200 text-text-secondary hover:border-gray-300'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="ml-1 w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-bold">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-40 w-56 bg-white rounded-xl border border-gray-100 shadow-xl py-2 max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm text-text-primary"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              {opt.label}
            </label>
          ))}
          {selected.length > 0 && (
            <div className="border-t mt-1 pt-1 px-4 py-2">
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Pagination ---- */
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 px-1">
      <div className="flex items-center gap-3 text-sm text-text-secondary">
        <span>
          Showing <span className="font-semibold text-text-primary">{from}</span> to{' '}
          <span className="font-semibold text-text-primary">{to}</span> of{' '}
          <span className="font-semibold text-text-primary">{total}</span>
        </span>
        <span className="text-gray-300">|</span>
        <div className="flex items-center gap-2">
          <span className="text-xs">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                pageNum === page
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'hover:bg-gray-100 text-text-secondary'
              }`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ---- Actions Menu ---- */
function ActionsMenu({
  campaign,
  onEdit,
  onOfferStudio,
  onDuplicate,
  onToggleStatus,
  onDelete,
}: {
  campaign: Campaign;
  onEdit: () => void;
  onOfferStudio: () => void;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-text-tertiary hover:text-text-primary"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-xl border border-gray-100 shadow-xl py-1">
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
          >
            <Edit3 className="w-4 h-4 text-text-tertiary" />
            Edit Campaign
          </button>
          <button
            onClick={() => { onDuplicate(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
          >
            <Copy className="w-4 h-4 text-text-tertiary" />
            Duplicate
          </button>
          <button
            onClick={() => { onOfferStudio(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
          >
            <Target className="w-4 h-4 text-brand-600" />
            Offer Studio
          </button>
          <button
            onClick={() => { onToggleStatus(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-gray-50 transition-colors"
          >
            {campaign.status === 'ACTIVE' ? (
              <>
                <Pause className="w-4 h-4 text-amber-500" />
                Pause Campaign
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-500" />
                Resume Campaign
              </>
            )}
          </button>
          <div className="border-t my-1" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Campaign
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- Campaign Card ---- */
function CampaignCard({
  campaign,
  onEdit,
  onOfferStudio,
  onDuplicate,
  onToggleStatus,
  onDelete,
  selected,
  onSelect,
}: {
  campaign: Campaign;
  onEdit: () => void;
  onOfferStudio: () => void;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const cType = getCampaignType(campaign.type);
  const TypeIcon = cType.icon;
  const budget = campaign.budget || 0;
  const leads = campaign.leadCount || 0;
  const cpl = computeCPL(budget, leads);
  const org = (campaign as unknown as Record<string, unknown>).organization as { name?: string } | undefined;
  const maxLeads = Math.max(leads, 1);
  const leadBarWidth = Math.min((leads / Math.max(maxLeads, 100)) * 100, 100);

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group ${
        selected ? 'border-brand-300 ring-2 ring-brand-100' : 'border-gray-100'
      }`}
    >
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              onClick={(e) => e.stopPropagation()}
            />
            <StatusBadge status={campaign.status} />
          </div>
          <div className="flex items-center gap-2">
            <TypeBadge type={campaign.type} />
            <ActionsMenu
              campaign={campaign}
              onEdit={onEdit}
              onOfferStudio={onOfferStudio}
              onDuplicate={onDuplicate}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
            />
          </div>
        </div>

        {/* Name */}
        <h3
          className="text-base font-bold text-text-primary mb-1 truncate cursor-pointer hover:text-brand-700 transition-colors"
          onClick={onEdit}
          title={campaign.name}
        >
          {campaign.name}
        </h3>

        {/* Division */}
        {org?.name && (
          <span className="inline-flex items-center gap-1 text-xs text-text-tertiary mb-3">
            <Hash className="w-3 h-3" />
            {org.name}
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="px-5 py-4 space-y-3">
        {/* Budget */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-tertiary font-medium">Budget</span>
            <span className="text-sm font-semibold text-text-primary">{formatAED(budget)}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: '65%' }} />
          </div>
        </div>

        {/* Leads */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-tertiary font-medium">Leads</span>
            <span className="text-sm font-semibold text-text-primary">{formatNumber(leads)}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${leadBarWidth}%` }} />
          </div>
        </div>

        {/* CPL */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-tertiary font-medium">Cost per Lead</span>
          <span className="text-sm font-semibold text-text-primary">{cpl > 0 ? formatAED(cpl) : '—'}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <Calendar className="w-3.5 h-3.5" />
          <span>
            {formatDateShort(campaign.startDate)}
            {campaign.endDate ? ` – ${formatDateShort(campaign.endDate)}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---- Delete Confirmation Modal ---- */
function DeleteConfirmModal({
  campaign,
  onConfirm,
  onCancel,
  loading,
}: {
  campaign: Campaign | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const backdropPressStarted = useRef(false);
  if (!campaign) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        backdropPressStarted.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (!backdropPressStarted.current) return;
        if (e.target !== e.currentTarget) return;
        if (hasTextSelection()) return;
        onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-text-primary mb-2">Delete Campaign</h3>
          <p className="text-sm text-text-secondary mb-1">
            Are you sure you want to delete <span className="font-semibold">&ldquo;{campaign.name}&rdquo;</span>?
          </p>
          <p className="text-xs text-text-tertiary">
            {(campaign.leadCount || 0) > 0
              ? `This campaign has ${campaign.leadCount} associated leads. They will be unlinked but not deleted.`
              : 'This action cannot be undone.'}
          </p>
        </div>
        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className="btn-secondary px-4 py-2 text-sm rounded-lg">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Campaign Form Modal (Create / Edit) ---- */
function CampaignFormModal({
  mode,
  initialData,
  divisions,
  isSuperAdmin,
  onSubmit,
  onClose,
  loading,
}: {
  mode: 'create' | 'edit';
  initialData: CampaignFormData;
  divisions: Organization[];
  isSuperAdmin: boolean;
  onSubmit: (data: CampaignFormData) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const backdropPressStarted = useRef(false);
  const [form, setForm] = useState<CampaignFormData>(initialData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showUtm, setShowUtm] = useState(
    !!(initialData.utmSource || initialData.utmMedium || initialData.utmCampaign || initialData.utmContent || initialData.utmTerm)
  );
  const [showGoals, setShowGoals] = useState(
    !!(initialData.targetLeads || initialData.targetConversions || initialData.targetRevenue)
  );

  function updateField(field: keyof CampaignFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!form.name.trim()) newErrors.name = 'Campaign name is required';
    if (form.name.trim().length > 200) newErrors.name = 'Name must be under 200 characters';
    if (form.budget && (isNaN(Number(form.budget)) || Number(form.budget) < 0))
      newErrors.budget = 'Budget must be a positive number';
    if (form.startDate && form.endDate && new Date(form.startDate) > new Date(form.endDate))
      newErrors.endDate = 'End date must be after start date';
    if (form.targetLeads && (isNaN(Number(form.targetLeads)) || Number(form.targetLeads) < 0))
      newErrors.targetLeads = 'Must be a positive number';
    if (form.targetConversions && (isNaN(Number(form.targetConversions)) || Number(form.targetConversions) < 0))
      newErrors.targetConversions = 'Must be a positive number';
    if (form.targetRevenue && (isNaN(Number(form.targetRevenue)) || Number(form.targetRevenue) < 0))
      newErrors.targetRevenue = 'Must be a positive number';
    if (isSuperAdmin && !form.organizationId) {
      newErrors.organizationId = 'Division is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) onSubmit(form);
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';
  const labelClass = 'block text-sm font-medium text-text-primary mb-1.5';
  const errorClass = 'text-xs text-red-600 mt-1';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        backdropPressStarted.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (!backdropPressStarted.current) return;
        if (e.target !== e.currentTarget) return;
        if (hasTextSelection()) return;
        onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {mode === 'create' ? 'Create Campaign' : 'Edit Campaign'}
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              {mode === 'create' ? 'Launch a new marketing campaign' : 'Update campaign details'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-text-tertiary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 min-h-0 overflow-y-auto space-y-5">
          {/* Name */}
          <div>
            <label className={labelClass}>
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Summer Sale 2026 – Facebook"
              className={`${inputClass} ${errors.name ? 'border-red-300 ring-1 ring-red-300' : ''}`}
              autoFocus
            />
            {errors.name && <p className={errorClass}>{errors.name}</p>}
          </div>

          <div>
            <label className={labelClass}>Campaign Code (for import mapping)</label>
            <input
              type="text"
              value={form.campaignCode}
              onChange={(e) => updateField('campaignCode', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="e.g., WINBACK_Q2_2026"
              className={inputClass}
            />
            <p className="text-2xs text-text-tertiary mt-1">
              Optional unique code used to attach offers during lead import.
            </p>
          </div>

          {/* Type & Status row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Type</label>
              <select
                value={form.type}
                onChange={(e) => updateField('type', e.target.value)}
                className={inputClass}
              >
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className={inputClass}
              >
                {CAMPAIGN_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className={labelClass}>Budget (AED)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary font-medium">
                AED
              </span>
              <input
                type="number"
                value={form.budget}
                onChange={(e) => updateField('budget', e.target.value)}
                placeholder="0"
                min="0"
                step="100"
                className={`${inputClass} pl-12 ${errors.budget ? 'border-red-300 ring-1 ring-red-300' : ''}`}
              />
            </div>
            {errors.budget && <p className={errorClass}>{errors.budget}</p>}
          </div>

          {/* Dates row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Date</label>
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={(e) => updateField('startDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(e) => updateField('endDate', e.target.value)}
                className={`${inputClass} ${errors.endDate ? 'border-red-300 ring-1 ring-red-300' : ''}`}
              />
              {errors.endDate && <p className={errorClass}>{errors.endDate}</p>}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              placeholder="Campaign description, goals, and notes..."
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Division (Super Admin only) */}
          {isSuperAdmin && divisions.length > 0 && (
            <div>
              <label className={labelClass}>Division</label>
              <select
                value={form.organizationId}
                onChange={(e) => updateField('organizationId', e.target.value)}
                className={inputClass}
              >
                <option value="">Select division...</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {errors.organizationId && <p className={errorClass}>{errors.organizationId}</p>}
            </div>
          )}

          {/* UTM Parameters (collapsible) */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowUtm(!showUtm)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-primary">UTM Parameters</span>
              </div>
              {showUtm ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {showUtm && (
              <div className="p-4 space-y-3 border-t border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">utm_source</label>
                    <input
                      type="text"
                      value={form.utmSource}
                      onChange={(e) => updateField('utmSource', e.target.value)}
                      placeholder="facebook"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">utm_medium</label>
                    <input
                      type="text"
                      value={form.utmMedium}
                      onChange={(e) => updateField('utmMedium', e.target.value)}
                      placeholder="cpc"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">utm_campaign</label>
                    <input
                      type="text"
                      value={form.utmCampaign}
                      onChange={(e) => updateField('utmCampaign', e.target.value)}
                      placeholder="summer_sale_2026"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">utm_content</label>
                    <input
                      type="text"
                      value={form.utmContent}
                      onChange={(e) => updateField('utmContent', e.target.value)}
                      placeholder="banner_ad"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">utm_term</label>
                  <input
                    type="text"
                    value={form.utmTerm}
                    onChange={(e) => updateField('utmTerm', e.target.value)}
                    placeholder="luxury+apartments"
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Goals (collapsible) */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGoals(!showGoals)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50/50 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-primary">Campaign Goals</span>
              </div>
              {showGoals ? <ChevronUp className="w-4 h-4 text-text-tertiary" /> : <ChevronDown className="w-4 h-4 text-text-tertiary" />}
            </button>
            {showGoals && (
              <div className="p-4 space-y-3 border-t border-gray-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Target Leads</label>
                    <input
                      type="number"
                      value={form.targetLeads}
                      onChange={(e) => updateField('targetLeads', e.target.value)}
                      placeholder="0"
                      min="0"
                      className={`${inputClass} ${errors.targetLeads ? 'border-red-300 ring-1 ring-red-300' : ''}`}
                    />
                    {errors.targetLeads && <p className={errorClass}>{errors.targetLeads}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Target Conversions</label>
                    <input
                      type="number"
                      value={form.targetConversions}
                      onChange={(e) => updateField('targetConversions', e.target.value)}
                      placeholder="0"
                      min="0"
                      className={`${inputClass} ${errors.targetConversions ? 'border-red-300 ring-1 ring-red-300' : ''}`}
                    />
                    {errors.targetConversions && <p className={errorClass}>{errors.targetConversions}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Target Revenue (AED)</label>
                    <input
                      type="number"
                      value={form.targetRevenue}
                      onChange={(e) => updateField('targetRevenue', e.target.value)}
                      placeholder="0"
                      min="0"
                      className={`${inputClass} ${errors.targetRevenue ? 'border-red-300 ring-1 ring-red-300' : ''}`}
                    />
                    {errors.targetRevenue && <p className={errorClass}>{errors.targetRevenue}</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t flex-shrink-0 flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="btn-secondary px-5 py-2.5 text-sm rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary px-5 py-2.5 text-sm rounded-lg flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'create' ? 'Create Campaign' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Save Filter View Modal ---- */
function SaveFilterModal({
  onSave,
  onClose,
}: {
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const backdropPressStarted = useRef(false);
  const [name, setName] = useState('');

  function handleSave() {
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        backdropPressStarted.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (!backdropPressStarted.current) return;
        if (e.target !== e.currentTarget) return;
        if (hasTextSelection()) return;
        onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b">
          <h3 className="text-lg font-bold text-text-primary">Save Filter View</h3>
          <p className="text-sm text-text-secondary mt-0.5">Give your current filter combination a name</p>
        </div>
        <div className="p-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Active Facebook Campaigns"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>
        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="btn-primary px-4 py-2 text-sm rounded-lg disabled:opacity-50"
          >
            Save View
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Offer Studio Modal ---- */
function OfferStudioModal({
  campaign,
  divisionLabel,
  onClose,
  onApplied,
  addToast,
}: {
  campaign: Campaign;
  divisionLabel?: string;
  onClose: () => void;
  onApplied: () => void;
  addToast: (type: 'success' | 'error', message: string) => void;
}) {
  const backdropPressStarted = useRef(false);
  type SelectedLeadOption = {
    id: string;
    name: string;
    subtitle?: string;
  };
  type OfferAudienceFilters = {
    search: string;
    selectedLeads: SelectedLeadOption[];
    scorePreset: string;
    minScore: string;
    maxScore: string;
    noCallsPreset: string;
    noCallsInDays: string;
    minCallPreset: string;
    minCallCount: string;
    tagsAny: string[];
  };
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTouched, setPreviewTouched] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [searchSuggestionsLoading, setSearchSuggestionsLoading] = useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color?: string }>>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [filters, setFilters] = useState<OfferAudienceFilters>({
    search: '',
    selectedLeads: [],
    scorePreset: 'all',
    minScore: '',
    maxScore: '',
    noCallsPreset: '',
    noCallsInDays: '',
    minCallPreset: '',
    minCallCount: '',
    tagsAny: [],
  });
  const [applyConfig, setApplyConfig] = useState({
    source: 'RULE',
    expiresAt: '',
    notes: '',
    overwriteExisting: false,
  });
  const searchInputWrapRef = useRef<HTMLDivElement | null>(null);

  const scorePresetOptions: Array<{ value: string; label: string; min?: number; max?: number }> = [
    { value: 'all', label: 'All scores' },
    { value: 'cold', label: 'Cold (0-24)', min: 0, max: 24 },
    { value: 'warm', label: 'Warm (25-49)', min: 25, max: 49 },
    { value: 'hot', label: 'Hot (50-74)', min: 50, max: 74 },
    { value: 'priority', label: 'Priority (75-100)', min: 75, max: 100 },
    { value: 'custom', label: 'Custom range' },
  ];

  function buildAudiencePayloadFromFilters() {
    const payload: Record<string, any> = {};
    if (filters.selectedLeads.length > 0) {
      payload.leadIds = filters.selectedLeads.map((lead) => lead.id);
    } else if (filters.search.trim()) {
      payload.search = filters.search.trim();
    }

    const selectedScorePreset = scorePresetOptions.find((opt) => opt.value === filters.scorePreset);
    if (filters.scorePreset === 'custom') {
      if (filters.minScore) payload.minScore = Number(filters.minScore);
      if (filters.maxScore) payload.maxScore = Number(filters.maxScore);
    } else if (selectedScorePreset && selectedScorePreset.value !== 'all') {
      if (selectedScorePreset.min !== undefined) payload.minScore = selectedScorePreset.min;
      if (selectedScorePreset.max !== undefined) payload.maxScore = selectedScorePreset.max;
    }

    if (filters.noCallsInDays) payload.noCallsInDays = Number(filters.noCallsInDays);
    if (filters.minCallCount) payload.minCallCount = Number(filters.minCallCount);
    if (filters.tagsAny.length > 0) payload.tagsAny = filters.tagsAny;
    return payload;
  }

  function getDivisionScopeId() {
    const campaignOrgId = (campaign as unknown as Record<string, unknown>).organizationId as string | undefined;
    const activeDivisionId = typeof window !== 'undefined'
      ? (localStorage.getItem('activeDivisionId') || undefined)
      : undefined;
    return campaignOrgId || activeDivisionId;
  }

  const loadAssignments = useCallback(async () => {
    try {
      const res = await api.getCampaignAssignments(campaign.id, { page: 1, limit: 50, sortBy: 'assignedAt', sortOrder: 'desc' });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      setAssignments(rows);
    } catch {
      setAssignments([]);
    }
  }, [campaign.id]);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await api.getCampaignOfferAnalytics(campaign.id);
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    }
  }, [campaign.id]);

  useEffect(() => {
    const divisionScopeId = getDivisionScopeId();
    setLoading(true);
    Promise.all([
      loadAssignments(),
      loadAnalytics(),
      api.getCampaignTemplates(divisionScopeId).then((rows) => setTemplates(Array.isArray(rows) ? rows : [])).catch(() => setTemplates([])),
      api.getTags(divisionScopeId).then((rows) => setAvailableTags(Array.isArray(rows) ? rows : [])).catch(() => setAvailableTags([])),
    ]).finally(() => setLoading(false));
  }, [campaign, loadAssignments, loadAnalytics]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (searchInputWrapRef.current && !searchInputWrapRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    const term = filters.search.trim();
    if (term.length < 2) {
      setSearchSuggestions([]);
      setSearchSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setSearchSuggestionsLoading(true);
        const divisionScopeId = getDivisionScopeId();
        const res = await api.getLeads({
          page: 1,
          limit: 20,
          search: term,
          ...(divisionScopeId ? { divisionId: divisionScopeId } : {}),
        });
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        const selectedIds = new Set(filters.selectedLeads.map((lead) => lead.id));
        const filteredRows = rows.filter((lead: any) => !selectedIds.has(lead.id));
        setSearchSuggestions(filteredRows);
        setSearchDropdownOpen(true);
      } catch {
        if (cancelled) return;
        setSearchSuggestions([]);
      } finally {
        if (!cancelled) setSearchSuggestionsLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters.search, filters.selectedLeads, campaign.id]);

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewTouched(true);
    try {
      const payload: Record<string, any> = buildAudiencePayloadFromFilters();
      payload.excludeAssignedToCampaign = true;
      const result = await api.previewCampaignAudience(campaign.id, payload);
      const rows = Array.isArray(result?.leads) ? result.leads : [];
      setPreviewRows(rows);
      addToast('success', `${rows.length} leads matched audience filters`);
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to preview audience');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleApply() {
    try {
      const payload: Record<string, any> = {
        source: applyConfig.source,
        overwriteExisting: applyConfig.overwriteExisting,
      };
      if (applyConfig.notes.trim()) payload.notes = applyConfig.notes.trim();
      if (applyConfig.expiresAt) payload.expiresAt = new Date(applyConfig.expiresAt).toISOString();
      if (previewRows.length > 0) payload.leadIds = previewRows.map((l) => l.id);
      else {
        payload.filters = {
          ...buildAudiencePayloadFromFilters(),
          excludeAssignedToCampaign: true,
        };
      }
      const res = await api.applyCampaignAudience(campaign.id, payload);
      addToast('success', `Offer assignments created: ${res.created || 0}, updated: ${res.updated || 0}`);
      await Promise.all([loadAssignments(), loadAnalytics()]);
      onApplied();
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to apply audience');
    }
  }

  async function updateAssignmentStatus(assignmentId: string, status: string) {
    try {
      await api.updateCampaignAssignment(assignmentId, {
        status,
        ...(status === 'CONTACTED' ? { discussedAt: new Date().toISOString() } : {}),
        ...(status === 'REDEEMED' ? { redeemedAt: new Date().toISOString() } : {}),
      });
      await Promise.all([loadAssignments(), loadAnalytics()]);
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to update assignment');
    }
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId);
    const cfg = tpl?.config || {};
    if (cfg.filters && typeof cfg.filters === 'object') {
      const incomingFilters = cfg.filters as Record<string, unknown>;
      const rawTagsAny = incomingFilters.tagsAny;
      const rawSelectedLeads = incomingFilters.selectedLeads;
      const normalizedTagsAny = Array.isArray(rawTagsAny)
        ? rawTagsAny.map((x) => String(x).trim()).filter(Boolean)
        : (typeof rawTagsAny === 'string'
          ? rawTagsAny.split(',').map((t) => t.trim()).filter(Boolean)
          : filters.tagsAny);
      const normalizedSelectedLeads: SelectedLeadOption[] = Array.isArray(rawSelectedLeads)
        ? rawSelectedLeads
            .map((item: any) => ({
              id: String(item?.id || ''),
              name: String(item?.name || ''),
              subtitle: item?.subtitle ? String(item.subtitle) : '',
            }))
            .filter((item) => item.id && item.name)
        : filters.selectedLeads;
      const merged = {
        ...filters,
        ...incomingFilters,
        selectedLeads: normalizedSelectedLeads,
        tagsAny: normalizedTagsAny,
      } as OfferAudienceFilters;
      if (!merged.scorePreset) {
        merged.scorePreset = merged.minScore || merged.maxScore ? 'custom' : 'all';
      }
      setFilters(merged);
    }
    if (cfg.applyConfig && typeof cfg.applyConfig === 'object') {
      setApplyConfig((prev) => ({ ...prev, ...cfg.applyConfig }));
    }
  }

  function toggleTag(tagName: string) {
    setFilters((prev) => ({
      ...prev,
      tagsAny: prev.tagsAny.includes(tagName)
        ? prev.tagsAny.filter((name) => name !== tagName)
        : [...prev.tagsAny, tagName],
    }));
  }

  function addCustomTags() {
    const names = customTagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setFilters((prev) => ({
      ...prev,
      tagsAny: Array.from(new Set(prev.tagsAny.concat(names))),
    }));
    setCustomTagInput('');
  }

  function getSuggestionName(lead: any) {
    const full = [lead?.firstName, lead?.lastName].filter(Boolean).join(' ').trim();
    return full || lead?.company || 'Unknown Lead';
  }

  function selectSearchSuggestion(lead: any) {
    const selected: SelectedLeadOption = {
      id: lead.id,
      name: getSuggestionName(lead),
      subtitle: lead.email || lead.phone || lead.company || '',
    };
    setFilters((prev) => {
      if (prev.selectedLeads.some((x) => x.id === selected.id)) {
        return { ...prev, search: '', selectedLeads: prev.selectedLeads };
      }
      return { ...prev, search: '', selectedLeads: [...prev.selectedLeads, selected] };
    });
    setSearchSuggestions([]);
    setSearchDropdownOpen(false);
  }

  function removeSelectedLead(id: string) {
    setFilters((prev) => ({
      ...prev,
      selectedLeads: prev.selectedLeads.filter((lead) => lead.id !== id),
    }));
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name) {
      addToast('error', 'Template name is required');
      return;
    }
    try {
      const divisionScopeId = getDivisionScopeId();
      await api.createCampaignTemplate({
        name,
        description: `Offer studio template for ${campaign.name}`,
        divisionId: divisionScopeId,
        config: {
          filters,
          applyConfig,
        },
      });
      const rows = await api.getCampaignTemplates(divisionScopeId);
      setTemplates(Array.isArray(rows) ? rows : []);
      setTemplateName('');
      addToast('success', 'Template saved');
    } catch (err: any) {
      addToast('error', err?.message || 'Failed to save template');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-6"
      onMouseDown={(e) => {
        backdropPressStarted.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (!backdropPressStarted.current) return;
        if (e.target !== e.currentTarget) return;
        if (hasTextSelection()) return;
        onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Offer Studio — {campaign.name}</h3>
            <p className="text-sm text-text-secondary">Build audience conditions, preview, apply and track offer lifecycle.</p>
            <p className="mt-1 text-xs inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 px-2 py-0.5">
              Division: {divisionLabel || 'Current Division'}
            </p>
          </div>
          <button className="p-2 rounded-lg hover:bg-gray-100" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="card p-4">
              <p className="text-xs text-text-tertiary">Assigned</p>
              <p className="text-2xl font-bold text-text-primary">{analytics?.funnel?.assigned ?? '—'}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-text-tertiary">Contacted</p>
              <p className="text-2xl font-bold text-text-primary">{analytics?.funnel?.contacted ?? '—'}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-text-tertiary">Accepted</p>
              <p className="text-2xl font-bold text-text-primary">{analytics?.funnel?.accepted ?? '—'}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-text-tertiary">Redeemed</p>
              <p className="text-2xl font-bold text-text-primary">{analytics?.funnel?.redeemed ?? '—'}</p>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-semibold text-text-primary mb-3">Templates</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select className="input" value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Select a template</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
              <input
                className="input md:col-span-1"
                placeholder="Save current setup as template"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
              <button className="btn-secondary px-4 py-2 text-sm" onClick={saveTemplate}>Save Template</button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-semibold text-text-primary mb-3">Audience Rules</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <div className="relative md:col-span-2 xl:col-span-3" ref={searchInputWrapRef}>
                {filters.selectedLeads.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {filters.selectedLeads.map((lead) => (
                      <span
                        key={lead.id}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-xs border border-brand-200"
                      >
                        {lead.name}
                        <button
                          type="button"
                          onClick={() => removeSelectedLead(lead.id)}
                          className="text-brand-500 hover:text-brand-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  className="input"
                  placeholder="Search and select multiple leads"
                  value={filters.search}
                  onFocus={() => {
                    if (filters.search.trim().length >= 2) setSearchDropdownOpen(true);
                  }}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFilters((p) => ({ ...p, search: next }));
                    if (next.trim().length < 2) {
                      setSearchSuggestions([]);
                      setSearchDropdownOpen(false);
                    } else {
                      setSearchDropdownOpen(true);
                    }
                  }}
                />
                {searchDropdownOpen && filters.search.trim().length >= 2 && (
                  <div className="absolute z-40 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-xl max-h-64 overflow-y-auto">
                    {searchSuggestionsLoading ? (
                      <p className="px-3 py-2 text-sm text-text-secondary">Searching...</p>
                    ) : searchSuggestions.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-text-secondary">No matching leads found</p>
                    ) : (
                      searchSuggestions
                        .filter((lead) => !filters.selectedLeads.some((sel) => sel.id === lead.id))
                        .map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSearchSuggestion(lead)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                        >
                          <div className="text-sm font-medium text-text-primary">{getSuggestionName(lead)}</div>
                          <div className="text-xs text-text-tertiary truncate">
                            {lead.email || lead.phone || lead.company || '—'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <select
                className="input"
                value={filters.scorePreset}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    scorePreset: e.target.value,
                    ...(e.target.value !== 'custom' ? { minScore: '', maxScore: '' } : {}),
                  }))
                }
              >
                {scorePresetOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {filters.scorePreset === 'custom' && (
                <>
                  <input className="input" type="number" placeholder="Custom min score" value={filters.minScore} onChange={(e) => setFilters((p) => ({ ...p, minScore: e.target.value }))} />
                  <input className="input" type="number" placeholder="Custom max score" value={filters.maxScore} onChange={(e) => setFilters((p) => ({ ...p, maxScore: e.target.value }))} />
                </>
              )}
              <select
                className="input"
                value={filters.noCallsPreset}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    noCallsPreset: e.target.value,
                    noCallsInDays: e.target.value === 'custom' ? p.noCallsInDays : e.target.value,
                  }))
                }
              >
                <option value="">Any call recency</option>
                <option value="7">No calls in 7 days</option>
                <option value="14">No calls in 14 days</option>
                <option value="30">No calls in 30 days</option>
                <option value="60">No calls in 60 days</option>
                <option value="90">No calls in 90 days</option>
                <option value="custom">Custom days...</option>
              </select>
              {filters.noCallsPreset === 'custom' && (
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Custom no-call days"
                  value={filters.noCallsInDays}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      noCallsInDays: e.target.value,
                    }))
                  }
                />
              )}
              <select
                className="input"
                value={filters.minCallPreset}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    minCallPreset: e.target.value,
                    minCallCount: e.target.value === 'custom' ? p.minCallCount : e.target.value,
                  }))
                }
              >
                <option value="">Any call count</option>
                <option value="1">At least 1 call</option>
                <option value="2">At least 2 calls</option>
                <option value="3">At least 3 calls</option>
                <option value="5">At least 5 calls</option>
                <option value="10">At least 10 calls</option>
                <option value="custom">Custom count...</option>
              </select>
              {filters.minCallPreset === 'custom' && (
                <input
                  className="input"
                  type="number"
                  min="0"
                  placeholder="Custom minimum call count"
                  value={filters.minCallCount}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      minCallCount: e.target.value,
                    }))
                  }
                />
              )}
              <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-text-secondary mb-2">Tags (available + custom)</p>
                {availableTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {availableTags.map((tag) => {
                      const isSelected = filters.tagsAny.includes(tag.name);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.name)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors ${
                            isSelected
                              ? 'bg-brand-50 text-brand-700 border-brand-200'
                              : 'bg-white text-text-secondary border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tag.color || '#6366f1' }} />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-text-tertiary mb-3">No saved tags found for this division. You can still add custom tags below.</p>
                )}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Add custom tag(s), comma separated"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                  />
                  <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={addCustomTags}>
                    Add Tag
                  </button>
                  {filters.tagsAny.length > 0 && (
                    <button
                      type="button"
                      className="px-3 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => setFilters((p) => ({ ...p, tagsAny: [] }))}
                    >
                      Clear Tags
                    </button>
                  )}
                </div>
                {filters.tagsAny.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filters.tagsAny.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs">
                        {name}
                        <button type="button" onClick={() => toggleTag(name)} className="text-gray-400 hover:text-gray-700">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className="btn-secondary px-4 py-2 text-sm" onClick={handlePreview} disabled={previewLoading}>
                {previewLoading ? 'Previewing...' : 'Preview Audience'}
              </button>
              <span className="text-sm text-text-secondary">{previewRows.length} leads ready for assignment</span>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="font-semibold text-text-primary">Preview Leads</h4>
              <span className="text-xs text-text-tertiary">
                {previewRows.length} matched
              </span>
            </div>
            {!previewTouched ? (
              <p className="text-sm text-text-secondary">
                Click <span className="font-medium">Preview Audience</span> to see the lead list before applying.
              </p>
            ) : previewLoading ? (
              <p className="text-sm text-text-secondary">Loading preview leads...</p>
            ) : previewRows.length === 0 ? (
              <p className="text-sm text-text-secondary">No leads matched the current audience rules.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary border-b border-gray-100">
                      <th className="py-2 pr-3">Lead</th>
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Calls</th>
                      <th className="py-2 pr-3">Current Offers</th>
                      <th className="py-2 pr-0">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-text-primary">{row.fullName || `${row.firstName || ''} ${row.lastName || ''}`.trim() || '—'}</div>
                          <div className="text-xs text-text-tertiary">{row.email || row.phone || '—'}</div>
                        </td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.company || '—'}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.score ?? '—'}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.status || '—'}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row?._count?.callLogs ?? 0}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row?._count?.campaignAssignments ?? 0}</td>
                        <td className="py-2 pr-0 text-sm text-text-secondary">{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card p-4">
            <h4 className="font-semibold text-text-primary mb-3">Apply Offer</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select className="input" value={applyConfig.source} onChange={(e) => setApplyConfig((p) => ({ ...p, source: e.target.value }))}>
                <option value="RULE">Rule</option>
                <option value="MANUAL">Manual</option>
                <option value="IMPORT">Import</option>
                <option value="API">API</option>
              </select>
              <input className="input" type="datetime-local" value={applyConfig.expiresAt} onChange={(e) => setApplyConfig((p) => ({ ...p, expiresAt: e.target.value }))} />
              <input className="input md:col-span-2" placeholder="Internal notes (optional)" value={applyConfig.notes} onChange={(e) => setApplyConfig((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={applyConfig.overwriteExisting} onChange={(e) => setApplyConfig((p) => ({ ...p, overwriteExisting: e.target.checked }))} />
              Overwrite existing assignments for this campaign
            </label>
            <div className="mt-3">
              <button className="btn-primary px-4 py-2 text-sm" onClick={handleApply}>Apply to Audience</button>
            </div>
          </div>

          <div className="card p-4">
            <h4 className="font-semibold text-text-primary mb-3">Assigned Leads</h4>
            {loading ? (
              <p className="text-sm text-text-secondary">Loading assignments...</p>
            ) : assignments.length === 0 ? (
              <p className="text-sm text-text-secondary">No assignments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-text-tertiary border-b border-gray-100">
                      <th className="py-2 pr-3">Lead</th>
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 pr-3">Score</th>
                      <th className="py-2 pr-3">Assigned At</th>
                      <th className="py-2 pr-3">Assigned By</th>
                      <th className="py-2 pr-0 w-[170px]">Lifecycle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-text-primary">{row.leadName || `${row.lead?.firstName || ''} ${row.lead?.lastName || ''}`.trim() || '—'}</div>
                          <div className="text-xs text-text-tertiary">{row.lead?.email || row.lead?.phone || '—'}</div>
                        </td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.lead?.company || '—'}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.lead?.score ?? '—'}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{new Date(row.assignedAt).toLocaleDateString()}</td>
                        <td className="py-2 pr-3 text-sm text-text-secondary">{row.assignedBy ? `${row.assignedBy.firstName} ${row.assignedBy.lastName}` : 'System'}</td>
                        <td className="py-2 pr-0 align-middle">
                          <div className="relative w-full max-w-[170px]">
                            <select
                              className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm font-medium text-text-primary shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                              value={row.status}
                              onChange={(e) => updateAssignmentStatus(row.id, e.target.value)}
                            >
                              <option value="ELIGIBLE">Eligible</option>
                              <option value="CONTACTED">Contacted</option>
                              <option value="ACCEPTED">Accepted</option>
                              <option value="REDEEMED">Redeemed</option>
                              <option value="EXPIRED">Expired</option>
                              <option value="REJECTED">Rejected</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Campaigns Page Component
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  // Auth & org
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const divisions: Organization[] = useMemo(() => {
    if (!user?.organization?.children) return [];
    return user.organization.children;
  }, [user]);
  const [activeDivisionId, setActiveDivisionId] = useState('');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = localStorage.getItem('activeDivisionId') || '';
    setActiveDivisionId(id);
  }, []);

  // Data state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [stats, setStats] = useState<CampaignDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View & filters
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Saved filters
  const [savedViews, setSavedViews] = useState<SavedFilterView[]>([]);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [offerStudioOpen, setOfferStudioOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);
  const [offerStudioCampaign, setOfferStudioCampaign] = useState<Campaign | null>(null);

  // Bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Action loading
  const [actionLoading, setActionLoading] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Refs
  const searchRef = useRef<HTMLInputElement>(null);

  // ------ Toasts ------
  const addToast = useCallback((type: 'success' | 'error', message: string) => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ------ Load saved views ------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      if (raw) setSavedViews(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  function persistSavedViews(views: SavedFilterView[]) {
    setSavedViews(views);
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(views));
    } catch {
      // ignore
    }
  }

  // ------ Fetch campaigns ------
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: pageSize,
        includeOrganization: 'true',
      };

      if (filters.search) params.search = filters.search;
      if (filters.types.length > 0) params.type = filters.types.join(',');
      if (filters.statuses.length > 0) params.status = filters.statuses.join(',');
      if (filters.divisions.length > 0) params.divisionId = filters.divisions[0];
      else if (isSuperAdmin && activeDivisionId) params.divisionId = activeDivisionId;
      if (filters.sort) params.sort = filters.sort;

      // Date range
      if (filters.datePreset && filters.datePreset !== 'custom') {
        const range = getDateRange(filters.datePreset);
        if (range.from) params.startDateFrom = range.from;
        if (range.to) params.startDateTo = range.to;
      } else if (filters.datePreset === 'custom') {
        if (filters.dateFrom) params.startDateFrom = filters.dateFrom;
        if (filters.dateTo) params.startDateTo = filters.dateTo;
      }

      if (filters.budgetMin) params.budgetMin = filters.budgetMin;
      if (filters.budgetMax) params.budgetMax = filters.budgetMax;

      const response = await api.getCampaigns(params);
      setCampaigns(response.data);
      setPagination(response.pagination);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load campaigns';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, filters, isSuperAdmin, activeDivisionId]);

  const resolveCampaignDivisionLabel = useCallback((campaign: Campaign | null) => {
    if (!campaign) return 'Current Division';
    const extra = campaign as unknown as Record<string, unknown>;
    const org = extra.organization as { name?: string } | undefined;
    if (org?.name) return org.name;
    const orgId = extra.organizationId as string | undefined;
    if (orgId) {
      const match = divisions.find((d) => d.id === orgId);
      if (match?.name) return match.name;
    }
    if (isSuperAdmin && activeDivisionId) {
      const active = divisions.find((d) => d.id === activeDivisionId);
      if (active?.name) return active.name;
    }
    return user?.organization?.name || 'Current Division';
  }, [divisions, isSuperAdmin, activeDivisionId, user?.organization?.name]);

  // ------ Fetch stats ------
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const divisionId = filters.divisions.length > 0
        ? filters.divisions[0]
        : (isSuperAdmin ? activeDivisionId : undefined);
      const data = await (api as unknown as Record<string, Function>).getCampaignStats(divisionId);
      setStats(data as CampaignDashboardStats);
    } catch {
      // Compute from local data as fallback
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [filters.divisions, isSuperAdmin, activeDivisionId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Auto-refresh when another user modifies campaign data
  useRealtimeSync(['campaign'], () => { fetchCampaigns(); });

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Compute fallback stats from loaded campaigns when API stats fail
  const computedStats: CampaignDashboardStats = useMemo(() => {
    if (stats) return stats;
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalLeads = campaigns.reduce((sum, c) => sum + (c.leadCount || 0), 0);
    const active = campaigns.filter((c) => c.status === 'ACTIVE');
    const best = campaigns.length > 0
      ? campaigns.reduce((prev, curr) => ((curr.leadCount || 0) > (prev.leadCount || 0) ? curr : prev))
      : null;
    return {
      totalCampaigns: pagination.total || campaigns.length,
      activeCampaigns: active.length,
      totalBudget,
      totalLeads,
      avgCostPerLead: totalLeads > 0 ? Math.round(totalBudget / totalLeads) : 0,
      bestPerforming: best ? { name: best.name, leads: best.leadCount || 0 } : null,
    };
  }, [stats, campaigns, pagination.total]);

  // ------ Keyboard shortcuts ------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

      // Ctrl+K / Cmd+K: focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Escape: close modals
      if (e.key === 'Escape') {
        if (deleteModalOpen) { setDeleteModalOpen(false); setDeletingCampaign(null); return; }
        if (editModalOpen) { setEditModalOpen(false); setEditingCampaign(null); return; }
        if (createModalOpen) { setCreateModalOpen(false); return; }
        if (showSaveFilterModal) { setShowSaveFilterModal(false); return; }
      }

      // N: new campaign (when no modal/input focused)
      if (e.key === 'n' && !isInput && !createModalOpen && !editModalOpen && !deleteModalOpen) {
        e.preventDefault();
        setCreateModalOpen(true);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [createModalOpen, editModalOpen, deleteModalOpen, showSaveFilterModal]);

  // ------ Filter helpers ------
  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  }

  function clearAllFilters() {
    setFilters(DEFAULT_FILTER_STATE);
    setCurrentPage(1);
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.types.length > 0) count++;
    if (filters.statuses.length > 0) count++;
    if (filters.divisions.length > 0) count++;
    if (filters.datePreset) count++;
    if (filters.budgetMin || filters.budgetMax) count++;
    return count;
  }, [filters]);

  const activeFilterBadges = useMemo(() => {
    const badges: { label: string; clear: () => void }[] = [];
    if (filters.search) {
      badges.push({ label: `Search: "${filters.search}"`, clear: () => updateFilter('search', '') });
    }
    filters.types.forEach((t) => {
      const type = getCampaignType(t);
      badges.push({
        label: type.label,
        clear: () => updateFilter('types', filters.types.filter((v) => v !== t)),
      });
    });
    filters.statuses.forEach((s) => {
      const status = getCampaignStatus(s);
      badges.push({
        label: status.label,
        clear: () => updateFilter('statuses', filters.statuses.filter((v) => v !== s)),
      });
    });
    filters.divisions.forEach((d) => {
      const div = divisions.find((o) => o.id === d);
      badges.push({
        label: div?.name || d,
        clear: () => updateFilter('divisions', filters.divisions.filter((v) => v !== d)),
      });
    });
    if (filters.datePreset && filters.datePreset !== 'custom') {
      const preset = DATE_PRESETS.find((p) => p.value === filters.datePreset);
      badges.push({ label: preset?.label || filters.datePreset, clear: () => { updateFilter('datePreset', ''); updateFilter('dateFrom', ''); updateFilter('dateTo', ''); } });
    } else if (filters.datePreset === 'custom' && (filters.dateFrom || filters.dateTo)) {
      badges.push({
        label: `${filters.dateFrom || '...'} to ${filters.dateTo || '...'}`,
        clear: () => { updateFilter('datePreset', ''); updateFilter('dateFrom', ''); updateFilter('dateTo', ''); },
      });
    }
    if (filters.budgetMin || filters.budgetMax) {
      badges.push({
        label: `Budget: ${filters.budgetMin ? `AED ${filters.budgetMin}` : '0'} – ${filters.budgetMax ? `AED ${filters.budgetMax}` : '∞'}`,
        clear: () => { updateFilter('budgetMin', ''); updateFilter('budgetMax', ''); },
      });
    }
    return badges;
  }, [filters, divisions]);

  // ------ CRUD Handlers ------
  async function handleCreateCampaign(formData: CampaignFormData) {
    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        type: formData.type,
        status: formData.status,
      };
      if (formData.budget) payload.budget = Number(formData.budget);
      if (formData.startDate) payload.startDate = new Date(formData.startDate).toISOString();
      if (formData.endDate) payload.endDate = new Date(formData.endDate).toISOString();
      if (formData.description) payload.description = formData.description;
      if (formData.organizationId) payload.organizationId = formData.organizationId;

      const metadata: Record<string, unknown> = {};
      if (formData.utmSource) metadata.utmSource = formData.utmSource;
      if (formData.utmMedium) metadata.utmMedium = formData.utmMedium;
      if (formData.utmCampaign) metadata.utmCampaign = formData.utmCampaign;
      if (formData.utmContent) metadata.utmContent = formData.utmContent;
      if (formData.utmTerm) metadata.utmTerm = formData.utmTerm;
      if (formData.targetLeads) metadata.targetLeads = Number(formData.targetLeads);
      if (formData.targetConversions) metadata.targetConversions = Number(formData.targetConversions);
      if (formData.targetRevenue) metadata.targetRevenue = Number(formData.targetRevenue);
      if (formData.campaignCode) payload.campaignCode = formData.campaignCode.trim();
      if (Object.keys(metadata).length > 0) payload.metadata = metadata;

      await (api as unknown as Record<string, Function>).createCampaign(payload);
      setCreateModalOpen(false);
      addToast('success', `Campaign "${formData.name}" created successfully`);
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateCampaign(formData: CampaignFormData) {
    if (!editingCampaign) return;
    setActionLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name.trim(),
        type: formData.type,
        status: formData.status,
      };
      if (formData.budget) payload.budget = Number(formData.budget);
      if (formData.startDate) payload.startDate = new Date(formData.startDate).toISOString();
      if (formData.endDate) payload.endDate = new Date(formData.endDate).toISOString();
      if (formData.description !== undefined) payload.description = formData.description;
      if (formData.organizationId) payload.organizationId = formData.organizationId;

      const metadata: Record<string, unknown> = {};
      if (formData.utmSource) metadata.utmSource = formData.utmSource;
      if (formData.utmMedium) metadata.utmMedium = formData.utmMedium;
      if (formData.utmCampaign) metadata.utmCampaign = formData.utmCampaign;
      if (formData.utmContent) metadata.utmContent = formData.utmContent;
      if (formData.utmTerm) metadata.utmTerm = formData.utmTerm;
      if (formData.targetLeads) metadata.targetLeads = Number(formData.targetLeads);
      if (formData.targetConversions) metadata.targetConversions = Number(formData.targetConversions);
      if (formData.targetRevenue) metadata.targetRevenue = Number(formData.targetRevenue);
      payload.campaignCode = formData.campaignCode ? formData.campaignCode.trim() : null;
      if (Object.keys(metadata).length > 0) payload.metadata = metadata;

      await (api as unknown as Record<string, Function>).updateCampaign(editingCampaign.id, payload);
      setEditModalOpen(false);
      setEditingCampaign(null);
      addToast('success', `Campaign "${formData.name}" updated successfully`);
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update campaign';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteCampaign() {
    if (!deletingCampaign) return;
    setActionLoading(true);
    try {
      await (api as unknown as Record<string, Function>).deleteCampaign(deletingCampaign.id);
      setDeleteModalOpen(false);
      const name = deletingCampaign.name;
      setDeletingCampaign(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingCampaign.id);
        return next;
      });
      addToast('success', `Campaign "${name}" deleted`);
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete campaign';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDuplicate(campaign: Campaign) {
    setActionLoading(true);
    try {
      await (api as unknown as Record<string, Function>).duplicateCampaign(campaign.id);
      addToast('success', `Campaign "${campaign.name}" duplicated`);
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to duplicate campaign';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleStatus(campaign: Campaign) {
    const newStatus = campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setActionLoading(true);
    try {
      await (api as unknown as Record<string, Function>).updateCampaign(campaign.id, { status: newStatus });
      addToast('success', `Campaign "${campaign.name}" ${newStatus === 'ACTIVE' ? 'resumed' : 'paused'}`);
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update campaign status';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  function handleOpenOfferStudio(campaign: Campaign) {
    setOfferStudioCampaign(campaign);
    setOfferStudioOpen(true);
  }

  // ------ Bulk Actions ------
  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(campaigns.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleBulkPause() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      await (api as unknown as Record<string, Function>).bulkUpdateCampaigns(Array.from(selectedIds), { status: 'PAUSED' });
      addToast('success', `${selectedIds.size} campaign(s) paused`);
      setSelectedIds(new Set());
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to pause campaigns';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkResume() {
    if (selectedIds.size === 0) return;
    setActionLoading(true);
    try {
      await (api as unknown as Record<string, Function>).bulkUpdateCampaigns(Array.from(selectedIds), { status: 'ACTIVE' });
      addToast('success', `${selectedIds.size} campaign(s) resumed`);
      setSelectedIds(new Set());
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resume campaigns';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = await premiumConfirm({
      title: `Delete ${selectedIds.size} campaign(s)?`,
      message: 'This action cannot be undone.',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    setActionLoading(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await (api as unknown as Record<string, Function>).deleteCampaign(id);
      }
      addToast('success', `${ids.length} campaign(s) deleted`);
      setSelectedIds(new Set());
      fetchCampaigns();
      fetchStats();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete campaigns';
      addToast('error', message);
    } finally {
      setActionLoading(false);
    }
  }

  // ------ Saved Filter Views ------
  function handleSaveFilterView(name: string) {
    const view: SavedFilterView = { id: generateId(), name, filters: { ...filters } };
    persistSavedViews([...savedViews, view]);
    addToast('success', `Filter view "${name}" saved`);
  }

  function handleLoadFilterView(view: SavedFilterView) {
    setFilters(view.filters);
    setCurrentPage(1);
  }

  function handleDeleteFilterView(id: string) {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  }

  // ------ Build edit form data from campaign ------
  function buildEditFormData(campaign: Campaign): CampaignFormData {
    const extra = campaign as unknown as Record<string, unknown>;
    const metadata = (extra.metadata || {}) as Record<string, unknown>;
    return {
      name: campaign.name || '',
      campaignCode: (metadata.campaignCode as string) || '',
      type: campaign.type || 'OTHER',
      status: campaign.status || 'DRAFT',
      budget: campaign.budget ? String(campaign.budget) : '',
      startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().slice(0, 16) : '',
      endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().slice(0, 16) : '',
      description: (extra.description as string) || '',
      organizationId: (extra.organizationId as string) || '',
      utmSource: (metadata.utmSource as string) || '',
      utmMedium: (metadata.utmMedium as string) || '',
      utmCampaign: (metadata.utmCampaign as string) || '',
      utmContent: (metadata.utmContent as string) || '',
      utmTerm: (metadata.utmTerm as string) || '',
      targetLeads: metadata.targetLeads ? String(metadata.targetLeads) : '',
      targetConversions: metadata.targetConversions ? String(metadata.targetConversions) : '',
      targetRevenue: metadata.targetRevenue ? String(metadata.targetRevenue) : '',
    };
  }

  // ------ Table sort ------
  const [tableSortField, setTableSortField] = useState<string>('');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');

  function handleTableSort(field: string) {
    if (tableSortField === field) {
      setTableSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTableSortField(field);
      setTableSortDir('asc');
    }
  }

  const sortedCampaigns = useMemo(() => {
    if (!tableSortField) return campaigns;
    const sorted = [...campaigns].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (tableSortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'type':
          aVal = a.type;
          bVal = b.type;
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'budget':
          aVal = a.budget || 0;
          bVal = b.budget || 0;
          break;
        case 'leads':
          aVal = a.leadCount || 0;
          bVal = b.leadCount || 0;
          break;
        case 'cpl':
          aVal = computeCPL(a.budget, a.leadCount);
          bVal = computeCPL(b.budget, b.leadCount);
          break;
        case 'startDate':
          aVal = a.startDate || '';
          bVal = b.startDate || '';
          break;
        case 'endDate':
          aVal = a.endDate || '';
          bVal = b.endDate || '';
          break;
        default:
          return 0;
      }
      if (aVal < bVal) return tableSortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return tableSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [campaigns, tableSortField, tableSortDir]);

  // ------ Debounced search ------
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setFilters((prev) => ({ ...prev, search: value }));
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setCurrentPage(1);
    }, 400);
  }

  // ------ Skeleton loaders ------
  function CardSkeleton() {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex justify-between">
            <div className="animate-pulse bg-gray-200 rounded-full h-6 w-20" />
            <div className="animate-pulse bg-gray-200 rounded-full h-6 w-28" />
          </div>
          <div className="animate-pulse bg-gray-200 rounded h-5 w-48" />
          <div className="space-y-3">
            <div>
              <div className="flex justify-between mb-1">
                <div className="animate-pulse bg-gray-200 rounded h-3 w-12" />
                <div className="animate-pulse bg-gray-200 rounded h-3 w-20" />
              </div>
              <div className="animate-pulse bg-gray-200 rounded-full h-1.5 w-full" />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <div className="animate-pulse bg-gray-200 rounded h-3 w-10" />
                <div className="animate-pulse bg-gray-200 rounded h-3 w-14" />
              </div>
              <div className="animate-pulse bg-gray-200 rounded-full h-1.5 w-full" />
            </div>
            <div className="flex justify-between">
              <div className="animate-pulse bg-gray-200 rounded h-3 w-20" />
              <div className="animate-pulse bg-gray-200 rounded h-3 w-16" />
            </div>
          </div>
        </div>
        <div className="px-5 py-3 bg-gray-50/50 border-t border-gray-100">
          <div className="animate-pulse bg-gray-200 rounded h-3 w-36" />
        </div>
      </div>
    );
  }

  function TableSkeleton() {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <tr key={i} className="border-b border-gray-50">
            {Array.from({ length: 10 }).map((__, j) => (
              <td key={j} className="px-4 py-3">
                <div className="animate-pulse bg-gray-200 rounded h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </>
    );
  }

  // ------ Column header helper ------
  function SortableHeader({ field, label }: { field: string; label: string }) {
    const isActive = tableSortField === field;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider cursor-pointer hover:text-text-primary select-none group"
        onClick={() => handleTableSort(field)}
      >
        <div className="flex items-center gap-1">
          {label}
          <ArrowUpDown
            className={`w-3.5 h-3.5 transition-colors ${
              isActive ? 'text-brand-600' : 'text-gray-300 group-hover:text-gray-400'
            }`}
          />
        </div>
      </th>
    );
  }

  // ====================================================================
  // RENDER
  // ====================================================================

  return (
    <div className="min-h-screen">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-brand-600" />
              </div>
              Campaigns
            </h1>
            <p className="text-sm text-text-secondary mt-1">Manage and track your marketing campaigns</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-xs text-text-tertiary">
              <Keyboard className="w-3.5 h-3.5" />
              <span><kbd className="font-mono font-bold">N</kbd> New</span>
              <span className="mx-1 text-gray-300">·</span>
              <span><kbd className="font-mono font-bold">⌘K</kbd> Search</span>
            </div>
            <RefreshButton onRefresh={() => { fetchCampaigns(); fetchStats(); }} />
            <button
              onClick={() => setCreateModalOpen(true)}
              className="btn-primary px-4 py-2.5 text-sm rounded-lg flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Campaign
            </button>
          </div>
        </div>
      </div>

      {/* ---- Dashboard Stats ---- */}
      <div className="mb-6 -mx-1 px-1 overflow-x-auto scrollbar-none">
        <div className="flex gap-4 min-w-max pb-2">
          <StatCard
            icon={Megaphone}
            label="Total Campaigns"
            value={formatNumber(computedStats.totalCampaigns)}
            color="bg-brand-50 text-brand-600"
            loading={statsLoading && !stats}
          />
          <StatCard
            icon={Zap}
            label="Active Campaigns"
            value={formatNumber(computedStats.activeCampaigns)}
            color="bg-emerald-50 text-emerald-600"
            loading={statsLoading && !stats}
          />
          <StatCard
            icon={DollarSign}
            label="Total Budget"
            value={formatAEDCompact(computedStats.totalBudget)}
            subValue={formatAED(computedStats.totalBudget)}
            color="bg-blue-50 text-blue-600"
            loading={statsLoading && !stats}
          />
          <StatCard
            icon={Users}
            label="Total Leads"
            value={formatNumber(computedStats.totalLeads)}
            color="bg-purple-50 text-purple-600"
            loading={statsLoading && !stats}
          />
          <StatCard
            icon={TrendingUp}
            label="Avg. Cost per Lead"
            value={computedStats.avgCostPerLead > 0 ? formatAED(computedStats.avgCostPerLead) : '—'}
            color="bg-amber-50 text-amber-600"
            loading={statsLoading && !stats}
          />
          <StatCard
            icon={Target}
            label="Best Performing"
            value={computedStats.bestPerforming?.name || '—'}
            subValue={computedStats.bestPerforming ? `${formatNumber(computedStats.bestPerforming.leads)} leads` : undefined}
            color="bg-pink-50 text-pink-600"
            loading={statsLoading && !stats}
          />
        </div>
      </div>

      {/* ---- Toolbar (search, filters, view toggle) ---- */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-6">
        {/* Top bar */}
        <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              ref={searchRef}
              type="text"
              value={filters.search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search campaigns... (Ctrl+K)"
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            {filters.search && (
              <button
                onClick={() => updateFilter('search', '')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <MultiSelectDropdown
              label="Type"
              icon={Megaphone}
              options={CAMPAIGN_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              selected={filters.types}
              onChange={(values) => updateFilter('types', values)}
            />
            <MultiSelectDropdown
              label="Status"
              icon={Zap}
              options={CAMPAIGN_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              selected={filters.statuses}
              onChange={(values) => updateFilter('statuses', values)}
            />
            {isSuperAdmin && divisions.length > 0 && (
              <MultiSelectDropdown
                label="Division"
                icon={Hash}
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                selected={filters.divisions}
                onChange={(values) => updateFilter('divisions', values)}
              />
            )}

            {/* More filters toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
                showFilters
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-text-secondary hover:border-gray-300'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              More Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort */}
            <select
              value={filters.sort}
              onChange={(e) => updateFilter('sort', e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-text-secondary"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Separator */}
            <div className="hidden lg:block w-px h-8 bg-gray-200 mx-1" />

            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('card')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'card' ? 'bg-white shadow-sm text-brand-600' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="Card View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'table' ? 'bg-white shadow-sm text-brand-600' : 'text-text-tertiary hover:text-text-secondary'
                }`}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Expanded filters panel */}
        {showFilters && (
          <div className="px-4 pb-4 border-t pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date range */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Date Range</label>
                <select
                  value={filters.datePreset}
                  onChange={(e) => {
                    updateFilter('datePreset', e.target.value);
                    if (e.target.value !== 'custom') {
                      updateFilter('dateFrom', '');
                      updateFilter('dateTo', '');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {DATE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom dates */}
              {filters.datePreset === 'custom' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">From</label>
                    <input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => updateFilter('dateFrom', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1.5">To</label>
                    <input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => updateFilter('dateTo', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {/* Budget min */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Min Budget (AED)</label>
                <input
                  type="number"
                  value={filters.budgetMin}
                  onChange={(e) => updateFilter('budgetMin', e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Budget max */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Max Budget (AED)</label>
                <input
                  type="number"
                  value={filters.budgetMax}
                  onChange={(e) => updateFilter('budgetMax', e.target.value)}
                  placeholder="No limit"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Saved views */}
            {savedViews.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Saved Views</label>
                <div className="flex flex-wrap gap-2">
                  {savedViews.map((view) => (
                    <div
                      key={view.id}
                      className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-medium bg-gray-50 text-text-secondary border border-gray-200 hover:border-gray-300 transition-colors"
                    >
                      <button
                        onClick={() => handleLoadFilterView(view)}
                        className="hover:text-brand-700 transition-colors flex items-center gap-1.5"
                      >
                        <Bookmark className="w-3 h-3" />
                        {view.name}
                      </button>
                      <button
                        onClick={() => handleDeleteFilterView(view.id)}
                        className="ml-1 p-1 rounded-full hover:bg-gray-200 transition-colors text-text-tertiary hover:text-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowSaveFilterModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                <BookmarkCheck className="w-3.5 h-3.5" />
                Save Current View
              </button>
            </div>
          </div>
        )}

        {/* Active filter badges */}
        {activeFilterBadges.length > 0 && (
          <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-text-tertiary">Active filters:</span>
            {activeFilterBadges.map((badge, i) => (
              <FilterBadge key={i} label={badge.label} onRemove={badge.clear} />
            ))}
            <button
              onClick={clearAllFilters}
              className="text-xs font-medium text-red-600 hover:text-red-700 ml-1 transition-colors"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* ---- Bulk Actions Bar ---- */}
      {selectedIds.size > 0 && (
        <div className="mb-4 bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
              {selectedIds.size}
            </div>
            <span className="text-sm font-medium text-brand-800">
              campaign{selectedIds.size > 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkPause}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause Selected
            </button>
            <button
              onClick={handleBulkResume}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Resume Selected
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Deselect
            </button>
          </div>
        </div>
      )}

      {/* ---- Error State ---- */}
      {error && !loading && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-12 text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Failed to Load Campaigns</h3>
          <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">{error}</p>
          <button
            onClick={fetchCampaigns}
            className="btn-primary px-5 py-2.5 text-sm rounded-lg inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      )}

      {/* ---- Card View ---- */}
      {!error && viewMode === 'card' && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="empty-state bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="empty-state-icon w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
                <Megaphone className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">No Campaigns Found</h3>
              <p className="text-sm text-text-secondary mb-6 max-w-md mx-auto">
                {activeFilterCount > 0
                  ? 'No campaigns match your current filters. Try adjusting or clearing your filters.'
                  : 'Get started by creating your first marketing campaign.'}
              </p>
              <div className="flex items-center justify-center gap-3">
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} className="btn-secondary px-4 py-2.5 text-sm rounded-lg">
                    Clear Filters
                  </button>
                )}
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="btn-primary px-5 py-2.5 text-sm rounded-lg inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Campaign
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  selected={selectedIds.has(campaign.id)}
                  onSelect={(checked) => handleSelectOne(campaign.id, checked)}
                  onEdit={() => {
                    setEditingCampaign(campaign);
                    setEditModalOpen(true);
                  }}
                  onOfferStudio={() => handleOpenOfferStudio(campaign)}
                  onDuplicate={() => handleDuplicate(campaign)}
                  onToggleStatus={() => handleToggleStatus(campaign)}
                  onDelete={() => {
                    setDeletingCampaign(campaign);
                    setDeleteModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- Table View ---- */}
      {!error && viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={campaigns.length > 0 && selectedIds.size === campaigns.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <SortableHeader field="name" label="Name" />
                  <SortableHeader field="type" label="Type" />
                  <SortableHeader field="status" label="Status" />
                  <SortableHeader field="budget" label="Budget (AED)" />
                  <SortableHeader field="leads" label="Leads" />
                  <SortableHeader field="cpl" label="CPL (AED)" />
                  <SortableHeader field="startDate" label="Start Date" />
                  <SortableHeader field="endDate" label="End Date" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Division
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-secondary uppercase tracking-wider w-20">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableSkeleton />
                ) : sortedCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center">
                        <Megaphone className="w-10 h-10 text-gray-300 mb-3" />
                        <p className="text-sm font-medium text-text-secondary">No campaigns found</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {activeFilterCount > 0 ? 'Try adjusting your filters' : 'Create your first campaign'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedCampaigns.map((campaign) => {
                    const org = (campaign as unknown as Record<string, unknown>).organization as { name?: string } | undefined;
                    const cpl = computeCPL(campaign.budget, campaign.leadCount);
                    return (
                      <tr
                        key={campaign.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                          selectedIds.has(campaign.id) ? 'bg-brand-50/30' : ''
                        }`}
                        onClick={() => {
                          setEditingCampaign(campaign);
                          setEditModalOpen(true);
                        }}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(campaign.id)}
                            onChange={(e) => handleSelectOne(campaign.id, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-text-primary hover:text-brand-700 transition-colors">
                            {campaign.name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TypeBadge type={campaign.type} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={campaign.status} />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {formatAED(campaign.budget)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {formatNumber(campaign.leadCount)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {cpl > 0 ? formatAED(cpl) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {formatDateTime(campaign.startDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {formatDateTime(campaign.endDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {org?.name || '—'}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <ActionsMenu
                            campaign={campaign}
                            onEdit={() => {
                              setEditingCampaign(campaign);
                              setEditModalOpen(true);
                            }}
                            onOfferStudio={() => handleOpenOfferStudio(campaign)}
                            onDuplicate={() => handleDuplicate(campaign)}
                            onToggleStatus={() => handleToggleStatus(campaign)}
                            onDelete={() => {
                              setDeletingCampaign(campaign);
                              setDeleteModalOpen(true);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Pagination ---- */}
      {!error && !loading && campaigns.length > 0 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
        />
      )}

      {/* ---- Create Modal ---- */}
      {createModalOpen && (
        <CampaignFormModal
          mode="create"
          initialData={{
            ...EMPTY_FORM_DATA,
            organizationId: isSuperAdmin ? activeDivisionId : '',
          }}
          divisions={divisions}
          isSuperAdmin={isSuperAdmin}
          onSubmit={handleCreateCampaign}
          onClose={() => setCreateModalOpen(false)}
          loading={actionLoading}
        />
      )}

      {/* ---- Edit Modal ---- */}
      {editModalOpen && editingCampaign && (
        <CampaignFormModal
          mode="edit"
          initialData={buildEditFormData(editingCampaign)}
          divisions={divisions}
          isSuperAdmin={isSuperAdmin}
          onSubmit={handleUpdateCampaign}
          onClose={() => {
            setEditModalOpen(false);
            setEditingCampaign(null);
          }}
          loading={actionLoading}
        />
      )}

      {/* ---- Delete Modal ---- */}
      {deleteModalOpen && (
        <DeleteConfirmModal
          campaign={deletingCampaign}
          onConfirm={handleDeleteCampaign}
          onCancel={() => {
            setDeleteModalOpen(false);
            setDeletingCampaign(null);
          }}
          loading={actionLoading}
        />
      )}

      {offerStudioOpen && offerStudioCampaign && (
        <OfferStudioModal
          campaign={offerStudioCampaign}
          divisionLabel={resolveCampaignDivisionLabel(offerStudioCampaign)}
          onClose={() => {
            setOfferStudioOpen(false);
            setOfferStudioCampaign(null);
          }}
          onApplied={() => {
            fetchCampaigns();
            fetchStats();
          }}
          addToast={addToast}
        />
      )}

      {/* ---- Save Filter Modal ---- */}
      {showSaveFilterModal && (
        <SaveFilterModal
          onSave={handleSaveFilterView}
          onClose={() => setShowSaveFilterModal(false)}
        />
      )}
    </div>
  );
}
