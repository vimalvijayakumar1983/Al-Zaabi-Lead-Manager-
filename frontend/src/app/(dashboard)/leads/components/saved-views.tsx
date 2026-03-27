'use client';

import { useState, useRef, useEffect } from 'react';

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
    updatedFrom?: string;
    updatedTo?: string;
    lastOpenedFrom?: string;
    lastOpenedTo?: string;
    tags?: string;
    stageId?: string;
    divisionId?: string;
    callOutcome?: string;
    lastCallFrom?: string;
    lastCallTo?: string;
    showBlocked?: string;
    budgetMin?: number | string;
    budgetMax?: number | string;
    hasEmail?: string;
    hasPhone?: string;
    searchText?: string;
    minCallCount?: number | string;
    maxCallCount?: number | string;
  };
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  columns?: string[]; // visible column IDs
  // Server-side shared view fields
  visibility?: 'everyone' | 'private' | 'specific_users' | 'specific_roles';
  visibleToUsers?: string[];
  visibleToRoles?: string[];
  createdById?: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  organizationId?: string;
  divisionId?: string;
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
    id: 'blocked',
    name: 'Blocked (DNC)',
    icon: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
    isSystem: true,
    filters: { showBlocked: 'true' },
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

// ─── LocalStorage helpers (active view ID = per-user preference) ────────
const ACTIVE_VIEW_KEY = 'leads-active-view-id';
const MIGRATED_KEY = 'leads-views-migrated-v2';
const LEGACY_KEY = 'leads-custom-views';

export function saveActiveViewId(id: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACTIVE_VIEW_KEY, id);
}

export function loadActiveViewId(): string {
  if (typeof window === 'undefined') return 'all';
  return localStorage.getItem(ACTIVE_VIEW_KEY) || 'all';
}

/** Check if we still have un-migrated localStorage views */
export function getLegacyLocalViews(): SavedView[] {
  if (typeof window === 'undefined') return [];
  if (localStorage.getItem(MIGRATED_KEY)) return []; // already migrated
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function markViewsMigrated() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MIGRATED_KEY, 'true');
  localStorage.removeItem(LEGACY_KEY);
}

// ─── Visibility helpers ─────────────────────────────────────────────────
const VISIBILITY_OPTIONS = [
  { value: 'everyone', label: 'Everyone', desc: 'All users in the division', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { value: 'private', label: 'Only Me', desc: 'Only you can see this view', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { value: 'specific_roles', label: 'Specific Roles', desc: 'Only selected roles can see', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { value: 'specific_users', label: 'Specific People', desc: 'Only selected users can see', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
] as const;

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SALES_REP', label: 'Sales Rep' },
  { value: 'VIEWER', label: 'Viewer' },
];

function getVisibilityIcon(visibility?: string): string {
  switch (visibility) {
    case 'private': return 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z';
    case 'specific_roles': return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z';
    case 'specific_users': return 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z';
    default: return 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z';
  }
}

function getVisibilityLabel(visibility?: string): string {
  switch (visibility) {
    case 'private': return 'Private';
    case 'specific_roles': return 'Specific Roles';
    case 'specific_users': return 'Specific People';
    default: return 'Everyone';
  }
}

// ─── View Sidebar Component ─────────────────────────────────────────────

interface OrgUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive?: boolean;
}

interface ViewSidebarProps {
  activeViewId: string;
  customViews: SavedView[];
  onSelectView: (view: SavedView) => void;
  onSaveView: (view: Omit<SavedView, 'id'> & { visibility: string; visibleToUsers?: string[]; visibleToRoles?: string[] }) => void;
  onDeleteView: (id: string) => void;
  onEditView: (id: string, data: Partial<SavedView>) => void;
  currentFilters: SavedView['filters'];
  currentSortBy?: string;
  currentSortOrder?: string;
  currentUserId?: string;
  currentUserRole?: string;
  orgUsers?: OrgUser[];
}

export function ViewSidebar({
  activeViewId,
  customViews,
  onSelectView,
  onSaveView,
  onDeleteView,
  onEditView,
  currentFilters,
  currentSortBy,
  currentSortOrder,
  currentUserId,
  currentUserRole,
  orgUsers = [],
}: ViewSidebarProps) {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [editingView, setEditingView] = useState<SavedView | null>(null);

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

      {/* Custom (Server) Views */}
      {customViews.length > 0 && (
        <>
          <div className="pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Custom Views</h3>
          </div>
          {customViews.map((view) => {
            const isOwner = view.createdById === currentUserId;
            const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(currentUserRole || '');
            const canManage = isOwner || isAdmin;
            const creatorName = view.createdBy
              ? `${view.createdBy.firstName} ${view.createdBy.lastName}`.trim()
              : '';

            return (
              <div key={view.id} className={`group flex items-center rounded-lg transition-colors ${
                activeViewId === view.id ? 'bg-brand-50' : 'hover:bg-gray-50'
              }`}>
                <button
                  onClick={() => onSelectView(view)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm min-w-0 ${
                    activeViewId === view.id ? 'text-brand-700 font-medium' : 'text-gray-600'
                  }`}
                  title={`${view.name}${creatorName && !isOwner ? ` (by ${creatorName})` : ''} • ${getVisibilityLabel(view.visibility)}`}
                >
                  {/* Visibility icon */}
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getVisibilityIcon(view.visibility)} />
                  </svg>
                  <span className="truncate">{view.name}</span>
                </button>
                {/* Action buttons — edit + delete */}
                {canManage && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingView(view); }}
                      className="p-1 rounded text-gray-400 hover:text-brand-600 transition-colors"
                      title="Edit view"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteView(view.id); }}
                      className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete view"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Save Current View Button */}
      <div className="pt-2">
        <button
          onClick={() => setShowSaveModal(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 border border-dashed border-gray-300"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Save Current View
        </button>
      </div>

      {/* Save View Modal */}
      {showSaveModal && (
        <SaveViewModal
          mode="create"
          currentFilters={currentFilters}
          currentSortBy={currentSortBy}
          currentSortOrder={currentSortOrder}
          orgUsers={orgUsers}
          currentUserId={currentUserId}
          onSave={(data) => {
            onSaveView(data);
            setShowSaveModal(false);
          }}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Edit View Modal */}
      {editingView && (
        <SaveViewModal
          mode="edit"
          existingView={editingView}
          orgUsers={orgUsers}
          currentUserId={currentUserId}
          onSave={(data) => {
            onEditView(editingView.id, data);
            setEditingView(null);
          }}
          onClose={() => setEditingView(null)}
        />
      )}
    </div>
  );
}

// ─── Save / Edit View Modal ─────────────────────────────────────────────

interface SaveViewModalProps {
  mode: 'create' | 'edit';
  existingView?: SavedView;
  currentFilters?: SavedView['filters'];
  currentSortBy?: string;
  currentSortOrder?: string;
  orgUsers: OrgUser[];
  currentUserId?: string;
  onSave: (data: any) => void;
  onClose: () => void;
}

function SaveViewModal({
  mode,
  existingView,
  currentFilters,
  currentSortBy,
  currentSortOrder,
  orgUsers,
  currentUserId,
  onSave,
  onClose,
}: SaveViewModalProps) {
  const [name, setName] = useState(existingView?.name || '');
  const [visibility, setVisibility] = useState<string>(existingView?.visibility || 'everyone');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(existingView?.visibleToRoles || []);
  const [selectedUsers, setSelectedUsers] = useState<string[]>(existingView?.visibleToUsers || []);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredUsers = orgUsers.filter(u =>
    u.id !== currentUserId &&
    u.isActive !== false &&
    (`${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const toggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(u => u !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = () => {
    if (!name.trim()) return;

    const data: any = {
      name: name.trim(),
      visibility,
      visibleToUsers: visibility === 'specific_users' ? selectedUsers : [],
      visibleToRoles: visibility === 'specific_roles' ? selectedRoles : [],
    };

    if (mode === 'create') {
      data.filters = { ...(currentFilters || {}) };
      data.sortBy = currentSortBy;
      data.sortOrder = currentSortOrder;
    }

    // In edit mode, only send changed fields
    if (mode === 'edit' && existingView) {
      data.filters = existingView.filters;
      data.sortBy = existingView.sortBy;
      data.sortOrder = existingView.sortOrder;
    }

    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? 'Save Current View' : 'Edit View'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* View Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View Name</label>
            <input
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              placeholder="e.g., Hot Leads This Week"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>

          {/* Visibility Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Who can see this view?</label>
            <div className="grid grid-cols-2 gap-2">
              {VISIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVisibility(opt.value)}
                  className={`flex items-start gap-2 p-3 rounded-lg border text-left transition-all ${
                    visibility === opt.value
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <svg className={`h-4 w-4 mt-0.5 flex-shrink-0 ${visibility === opt.value ? 'text-brand-600' : 'text-gray-400'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                  </svg>
                  <div className="min-w-0">
                    <div className={`text-xs font-medium ${visibility === opt.value ? 'text-brand-700' : 'text-gray-700'}`}>{opt.label}</div>
                    <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Role Selector (when specific_roles) */}
          {visibility === 'specific_roles' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Roles</label>
              <div className="space-y-1.5">
                {ROLE_OPTIONS.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.value)}
                      onChange={() => toggleRole(role.value)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{role.label}</span>
                  </label>
                ))}
              </div>
              {selectedRoles.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Please select at least one role</p>
              )}
            </div>
          )}

          {/* User Selector (when specific_users) */}
          {visibility === 'specific_users' && (
            <div ref={dropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select People</label>
              {/* Selected users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedUsers.map(uid => {
                    const u = orgUsers.find(u => u.id === uid);
                    if (!u) return null;
                    return (
                      <span key={uid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
                        {u.firstName} {u.lastName}
                        <button onClick={() => toggleUser(uid)} className="hover:text-red-600">
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Search input */}
              <div className="relative">
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true); }}
                  onFocus={() => setShowUserDropdown(true)}
                />
                {showUserDropdown && filteredUsers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => { toggleUser(u.id); setUserSearch(''); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left ${
                          selectedUsers.includes(u.id) ? 'bg-brand-50 text-brand-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-600">
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate">{u.firstName} {u.lastName}</div>
                          <div className="text-[10px] text-gray-500">{u.role}</div>
                        </div>
                        {selectedUsers.includes(u.id) && (
                          <svg className="h-4 w-4 ml-auto text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUsers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Please select at least one person</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              (visibility === 'specific_roles' && selectedRoles.length === 0) ||
              (visibility === 'specific_users' && selectedUsers.length === 0)
            }
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'create' ? 'Save View' : 'Update View'}
          </button>
        </div>
      </div>
    </div>
  );
}
