'use client';

import { useState } from 'react';

export interface SavedView {
  id: string;
  name: string;
  icon?: string;
  isSystem?: boolean; // predefined views
  filters: {
    search?: string;
    status?: string;
    source?: string;
    assignedToId?: string;
    minScore?: number | string;
    maxScore?: number | string;
    dateFrom?: string;
    dateTo?: string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  columns?: string[]; // visible column IDs
}

export const SYSTEM_VIEWS: SavedView[] = [
  {
    id: 'all',
    name: 'All Leads',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    isSystem: true,
    filters: {},
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  },
  {
    id: 'my-leads',
    name: 'My Leads',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    isSystem: true,
    filters: { assignedToId: '__current_user__' },
  },
  {
    id: 'new-leads',
    name: 'New Leads',
    icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
    isSystem: true,
    filters: { status: 'NEW' },
  },
  {
    id: 'hot-leads',
    name: 'Hot Leads',
    icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z',
    isSystem: true,
    filters: { minScore: 70 },
    sortBy: 'score',
    sortOrder: 'desc',
  },
  {
    id: 'qualified',
    name: 'Qualified',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    isSystem: true,
    filters: { status: 'QUALIFIED' },
  },
  {
    id: 'won-deals',
    name: 'Won Deals',
    icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
    isSystem: true,
    filters: { status: 'WON' },
  },
  {
    id: 'unassigned',
    name: 'Unassigned',
    icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
    isSystem: true,
    filters: { assignedToId: '__unassigned__' },
  },
  {
    id: 'this-week',
    name: 'Created This Week',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    isSystem: true,
    filters: { dateFrom: '__this_week__' },
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
];

const STORAGE_KEY = 'leads-custom-views';

export function loadCustomViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return [];
}

export function saveCustomViews(views: SavedView[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

interface ViewSidebarProps {
  activeViewId: string;
  customViews: SavedView[];
  onSelectView: (view: SavedView) => void;
  onSaveView: (view: SavedView) => void;
  onDeleteView: (id: string) => void;
  currentFilters: SavedView['filters'];
  currentSortBy?: string;
  currentSortOrder?: string;
}

export function ViewSidebar({
  activeViewId,
  customViews,
  onSelectView,
  onSaveView,
  onDeleteView,
  currentFilters,
  currentSortBy,
  currentSortOrder,
}: ViewSidebarProps) {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const handleSave = () => {
    if (!newViewName.trim()) return;
    const view: SavedView = {
      id: `custom-${Date.now()}`,
      name: newViewName.trim(),
      filters: { ...currentFilters },
      sortBy: currentSortBy,
      sortOrder: currentSortOrder as 'asc' | 'desc',
    };
    onSaveView(view);
    setNewViewName('');
    setShowSaveForm(false);
  };

  return (
    <div className="w-56 flex-shrink-0 space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Views</h3>
      </div>

      {/* System Views */}
      {SYSTEM_VIEWS.map((view) => (
        <button
          key={view.id}
          onClick={() => onSelectView(view)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeViewId === view.id
              ? 'bg-brand-50 text-brand-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={view.icon || 'M4 6h16M4 10h16M4 14h16M4 18h16'} />
          </svg>
          <span className="truncate">{view.name}</span>
        </button>
      ))}

      {/* Custom Views */}
      {customViews.length > 0 && (
        <>
          <div className="pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom Views</h3>
          </div>
          {customViews.map((view) => (
            <div key={view.id} className={`group flex items-center rounded-lg transition-colors ${
              activeViewId === view.id ? 'bg-brand-50' : 'hover:bg-gray-50'
            }`}>
              <button
                onClick={() => onSelectView(view)}
                className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm ${
                  activeViewId === view.id ? 'text-brand-700 font-medium' : 'text-gray-600'
                }`}
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="truncate">{view.name}</span>
              </button>
              <button
                onClick={() => onDeleteView(view.id)}
                className="p-1 mr-1 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </>
      )}

      {/* Save Current View */}
      <div className="pt-2">
        {showSaveForm ? (
          <div className="space-y-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
            <input
              className="input text-sm"
              placeholder="View name..."
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <div className="flex gap-1">
              <button onClick={handleSave} className="btn-primary text-xs flex-1">Save</button>
              <button onClick={() => setShowSaveForm(false)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveForm(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 border border-dashed border-gray-300"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Save Current View
          </button>
        )}
      </div>
    </div>
  );
}
