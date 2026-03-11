'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types';

export interface FilterState {
  search: string;
  status: string;
  source: string;
  assignedToId: string;
  minScore: string;
  maxScore: string;
  dateFrom: string;
  dateTo: string;
}

export const emptyFilters: FilterState = {
  search: '',
  status: '',
  source: '',
  assignedToId: '',
  minScore: '',
  maxScore: '',
  dateFrom: '',
  dateTo: '',
};

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'PROPOSAL_SENT', label: 'Proposal Sent' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

const sourceOptions = [
  { value: '', label: 'All Sources' },
  { value: 'WEBSITE_FORM', label: 'Website Form' },
  { value: 'LANDING_PAGE', label: 'Landing Page' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CSV_IMPORT', label: 'CSV Import' },
  { value: 'API', label: 'API' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'OTHER', label: 'Other' },
];

interface AdvancedFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  users: User[];
  onClose: () => void;
}

export function AdvancedFilters({ filters, onChange, users, onClose }: AdvancedFiltersProps) {
  const [local, setLocal] = useState<FilterState>({ ...filters });

  const handleApply = () => {
    onChange(local);
    onClose();
  };

  const handleClear = () => {
    const cleared = { ...emptyFilters };
    setLocal(cleared);
    onChange(cleared);
    onClose();
  };

  const activeCount = Object.values(local).filter((v) => v !== '').length;

  return (
    <div className="card p-5 border-brand-200 bg-white shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <svg className="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
          Advanced Filters
          {activeCount > 0 && <span className="badge bg-brand-100 text-brand-700">{activeCount} active</span>}
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Status */}
        <div>
          <label className="label">Status</label>
          <select className="input" value={local.status} onChange={(e) => setLocal({ ...local, status: e.target.value })}>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Source */}
        <div>
          <label className="label">Source</label>
          <select className="input" value={local.source} onChange={(e) => setLocal({ ...local, source: e.target.value })}>
            {sourceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Assigned To */}
        <div>
          <label className="label">Assigned To</label>
          <select className="input" value={local.assignedToId} onChange={(e) => setLocal({ ...local, assignedToId: e.target.value })}>
            <option value="">All Users</option>
            <option value="__unassigned__">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
        </div>

        {/* Score Range */}
        <div>
          <label className="label">Score Range</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="input"
              placeholder="Min"
              min={0}
              max={100}
              value={local.minScore}
              onChange={(e) => setLocal({ ...local, minScore: e.target.value })}
            />
            <span className="text-gray-400">-</span>
            <input
              type="number"
              className="input"
              placeholder="Max"
              min={0}
              max={100}
              value={local.maxScore}
              onChange={(e) => setLocal({ ...local, maxScore: e.target.value })}
            />
          </div>
        </div>

        {/* Date Range */}
        <div>
          <label className="label">Created From</label>
          <input
            type="date"
            className="input"
            value={local.dateFrom}
            onChange={(e) => setLocal({ ...local, dateFrom: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Created To</label>
          <input
            type="date"
            className="input"
            value={local.dateTo}
            onChange={(e) => setLocal({ ...local, dateTo: e.target.value })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t">
        <button onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700">Clear All Filters</button>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button onClick={handleApply} className="btn-primary text-sm">Apply Filters</button>
        </div>
      </div>
    </div>
  );
}

export function FilterBadges({ filters, onRemove }: { filters: FilterState; onRemove: (key: keyof FilterState) => void }) {
  const badges: { key: keyof FilterState; label: string }[] = [];

  if (filters.status) badges.push({ key: 'status', label: `Status: ${filters.status.replace(/_/g, ' ')}` });
  if (filters.source) badges.push({ key: 'source', label: `Source: ${filters.source.replace(/_/g, ' ')}` });
  if (filters.assignedToId) badges.push({ key: 'assignedToId', label: filters.assignedToId === '__unassigned__' ? 'Unassigned' : `Assigned` });
  if (filters.minScore) badges.push({ key: 'minScore', label: `Score >= ${filters.minScore}` });
  if (filters.maxScore) badges.push({ key: 'maxScore', label: `Score <= ${filters.maxScore}` });
  if (filters.dateFrom) badges.push({ key: 'dateFrom', label: `From: ${filters.dateFrom}` });
  if (filters.dateTo) badges.push({ key: 'dateTo', label: `To: ${filters.dateTo}` });

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span key={b.key} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-2.5 py-1 border border-brand-200">
          {b.label}
          <button onClick={() => onRemove(b.key)} className="hover:text-brand-900">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </span>
      ))}
    </div>
  );
}
