import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { User } from '@/types';

const MAX_CAPACITY = 25;

interface AssigneeDropdownProps {
  users: User[];
  selectedId: string | null;
  onChange: (userId: string | null) => void;
  currentUserId?: string;
  showAutoAssign?: boolean;
  showUnassigned?: boolean;
  compact?: boolean;
  placeholder?: string;
  className?: string;
}

type SpecialOption = 'auto-assign' | 'assign-to-me' | 'unassigned';

const ROLE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  ADMIN: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  MANAGER: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  SALES_REP: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  VIEWER: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' },
};

const ROLE_AVATAR_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-purple-500',
  ADMIN: 'bg-indigo-500',
  MANAGER: 'bg-blue-500',
  SALES_REP: 'bg-green-500',
  VIEWER: 'bg-gray-500',
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
  VIEWER: 'Viewer',
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getWorkloadColor(activeLeads: number): string {
  const pct = activeLeads / MAX_CAPACITY;
  if (pct < 0.5) return 'bg-green-500';
  if (pct < 0.8) return 'bg-amber-500';
  return 'bg-red-500';
}

function getWorkloadTextColor(activeLeads: number): string {
  const pct = activeLeads / MAX_CAPACITY;
  if (pct < 0.5) return 'text-green-600';
  if (pct < 0.8) return 'text-amber-600';
  return 'text-red-600';
}

function UserAvatar({ user, size = 'md' }: { user: User; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  const colorClass = ROLE_AVATAR_COLORS[user.role] || 'bg-gray-500';

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={`${user.firstName} ${user.lastName}`}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center text-white font-medium flex-shrink-0`}
    >
      {getInitials(user.firstName, user.lastName)}
    </div>
  );
}

function RoleBadge({ role, compact = false }: { role: string; compact?: boolean }) {
  const colors = ROLE_COLORS[role] || ROLE_COLORS.VIEWER;
  const label = ROLE_LABELS[role] || role;

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${colors.bg} ${colors.text} ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      {label}
    </span>
  );
}

function WorkloadBar({ activeLeads, compact = false }: { activeLeads: number; compact?: boolean }) {
  const pct = Math.min((activeLeads / MAX_CAPACITY) * 100, 100);
  const barColor = getWorkloadColor(activeLeads);
  const textColor = getWorkloadTextColor(activeLeads);

  if (compact) {
    return (
      <span className={`text-[10px] font-medium ${textColor}`}>
        {activeLeads}/{MAX_CAPACITY}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-0.5">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-medium ${textColor} whitespace-nowrap`}>
        {activeLeads}/{MAX_CAPACITY}
      </span>
    </div>
  );
}

export function AssigneeDropdown({
  users,
  selectedId,
  onChange,
  currentUserId,
  showAutoAssign = true,
  showUnassigned = true,
  compact = false,
  placeholder = 'Select assignee…',
  className = '',
}: AssigneeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);
  const [dropDirection, setDropDirection] = useState<'down' | 'up'>('down');

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeUsers = useMemo(
    () => users.filter((u) => u.isActive),
    [users]
  );

  const sortedUsers = useMemo(() => {
    return [...activeUsers].sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
      const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [activeUsers]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return sortedUsers;
    const q = search.toLowerCase().trim();
    return sortedUsers.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [sortedUsers, search]);

  // Build the full option list (special + users)
  type OptionItem =
    | { type: 'special'; key: SpecialOption; label: string; icon: string }
    | { type: 'separator' }
    | { type: 'user'; user: User };

  const optionList = useMemo<OptionItem[]>(() => {
    const items: OptionItem[] = [];

    if (!compact) {
      if (showAutoAssign) {
        items.push({ type: 'special', key: 'auto-assign', label: 'Auto-assign (Round Robin)', icon: '🤖' });
      }
      if (currentUserId) {
        items.push({ type: 'special', key: 'assign-to-me', label: 'Assign to Me', icon: '👤' });
      }
      if (showUnassigned) {
        items.push({ type: 'special', key: 'unassigned', label: 'Unassigned', icon: '——' });
      }
      if (items.length > 0 && filteredUsers.length > 0) {
        items.push({ type: 'separator' });
      }
    }

    filteredUsers.forEach((user) => {
      items.push({ type: 'user', user });
    });

    return items;
  }, [compact, showAutoAssign, showUnassigned, currentUserId, filteredUsers]);

  // Selectable items only (no separators)
  const selectableItems = useMemo(
    () => optionList.filter((o) => o.type !== 'separator'),
    [optionList]
  );

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId]
  );

  // Determine drop direction
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropDirection(spaceBelow < 280 && spaceAbove > spaceBelow ? 'up' : 'down');
    }
  }, [isOpen]);

  // Focus search when opened
  useEffect(() => {
    if (isOpen && !compact && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen, compact]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setFocusIndex(-1);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (item: OptionItem) => {
      if (item.type === 'separator') return;

      if (item.type === 'special') {
        switch (item.key) {
          case 'auto-assign':
            onChange(null);
            break;
          case 'assign-to-me':
            onChange(currentUserId || null);
            break;
          case 'unassigned':
            onChange(null);
            break;
        }
      } else {
        onChange(item.user.id);
      }

      setIsOpen(false);
    },
    [onChange, currentUserId]
  );

  const handleKeyboardNav = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusIndex((prev) => Math.min(prev + 1, selectableItems.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < selectableItems.length) {
            handleSelect(selectableItems[focusIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    },
    [isOpen, focusIndex, selectableItems, handleSelect]
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-selectable]');
      if (items[focusIndex]) {
        items[focusIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [focusIndex]);

  // -- Render trigger button --
  const renderTrigger = () => {
    if (compact) {
      return (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={handleKeyboardNav}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200 min-w-0 ${className}`}
        >
          {selectedUser ? (
            <>
              <UserAvatar user={selectedUser} size="sm" />
              <span className="truncate text-gray-900 text-xs">
                {selectedUser.firstName} {selectedUser.lastName}
              </span>
            </>
          ) : (
            <span className="text-gray-400 text-xs">{placeholder}</span>
          )}
          <svg
            className={`h-3 w-3 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyboardNav}
        className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all ${className}`}
      >
        {selectedUser ? (
          <>
            <UserAvatar user={selectedUser} size="sm" />
            <div className="flex-1 text-left min-w-0">
              <div className="text-gray-900 font-medium truncate text-sm">
                {selectedUser.firstName} {selectedUser.lastName}
              </div>
              <div className="text-gray-500 text-xs truncate">{selectedUser.email}</div>
            </div>
            <RoleBadge role={selectedUser.role} compact />
          </>
        ) : selectedId === null && showAutoAssign ? (
          <>
            <span className="text-lg">🤖</span>
            <span className="flex-1 text-left text-gray-700 font-medium text-sm">Auto-assign (Round Robin)</span>
          </>
        ) : (
          <span className="flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        <svg
          className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  };

  // -- Render dropdown --
  const renderDropdown = () => {
    if (!isOpen) return null;

    let selectableIdx = -1;

    return (
      <div
        ref={dropdownRef}
        className={`absolute z-50 w-full min-w-[280px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden transition-all duration-200 ${
          dropDirection === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'
        }`}
        style={{
          animation: 'fadeSlideIn 0.15s ease-out',
        }}
      >
        {/* Search input (not in compact mode) */}
        {!compact && (
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusIndex(-1);
                }}
                onKeyDown={handleKeyboardNav}
                placeholder="Search team members…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-colors"
              />
            </div>
          </div>
        )}

        {/* Options list */}
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {optionList.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              No team members found
            </div>
          )}

          {optionList.map((item, idx) => {
            if (item.type === 'separator') {
              return <div key={`sep-${idx}`} className="my-1 border-t border-gray-100" />;
            }

            selectableIdx++;
            const currentSelectableIdx = selectableIdx;
            const isFocused = currentSelectableIdx === focusIndex;

            if (item.type === 'special') {
              const isSelected =
                (item.key === 'auto-assign' && selectedId === null) ||
                (item.key === 'assign-to-me' && selectedId === currentUserId) ||
                (item.key === 'unassigned' && selectedId === null && !showAutoAssign);

              return (
                <button
                  key={item.key}
                  type="button"
                  data-selectable
                  onClick={() => handleSelect(item)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    isFocused ? 'bg-brand-50' : 'hover:bg-gray-50'
                  } ${isSelected ? 'bg-brand-50 text-brand-700' : 'text-gray-700'}`}
                >
                  <span className="text-base w-6 text-center flex-shrink-0">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                  {isSelected && (
                    <svg
                      className="ml-auto h-4 w-4 text-brand-600 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            }

            // User option
            const { user } = item;
            const isSelected = user.id === selectedId;
            const activeLeads = user._count?.assignedLeads ?? 0;

            return (
              <button
                key={user.id}
                type="button"
                data-selectable
                onClick={() => handleSelect(item)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  isFocused ? 'bg-brand-50' : 'hover:bg-gray-50'
                } ${isSelected ? 'bg-brand-50' : ''}`}
              >
                <UserAvatar user={user} size={compact ? 'sm' : 'md'} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium truncate text-sm ${
                        isSelected ? 'text-brand-700' : 'text-gray-900'
                      }`}
                    >
                      {user.firstName} {user.lastName}
                    </span>
                    <RoleBadge role={user.role} compact />
                  </div>
                  {!compact && (
                    <WorkloadBar activeLeads={activeLeads} />
                  )}
                  {compact && (
                    <WorkloadBar activeLeads={activeLeads} compact />
                  )}
                </div>
                {isSelected && (
                  <svg
                    className="h-4 w-4 text-brand-600 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {renderTrigger()}
      {renderDropdown()}

      {/* Inline keyframe animation */}
      {isOpen && (
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(${dropDirection === 'down' ? '-4px' : '4px'}); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      )}
    </div>
  );
}

export { UserAvatar, RoleBadge, WorkloadBar, ROLE_COLORS, ROLE_AVATAR_COLORS, ROLE_LABELS, MAX_CAPACITY };
export type { AssigneeDropdownProps };
