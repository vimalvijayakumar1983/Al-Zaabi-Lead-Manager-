'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { AssignmentHistoryEntry } from '@/types';

// ─── Types ───────────────────────────────────────────────────────

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'VIEWER';
  avatar?: string;
  organizationId: string;
  isActive: boolean;
  _count?: { assignedLeads: number; tasks: number };
}

interface ReassignmentPanelProps {
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    assignedToId?: string;
    assignedTo?: {
      id: string;
      firstName: string;
      lastName: string;
      avatar?: string;
    };
  };
  users: User[];
  currentUserId?: string;
  onReassign: (leadId: string, assignedToId: string, reason?: string) => Promise<void>;
  assignmentHistory: AssignmentHistoryEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES_REP: 'Sales Rep',
  VIEWER: 'Viewer',
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  SUPER_ADMIN: { bg: 'bg-purple-100', text: 'text-purple-700' },
  ADMIN: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  MANAGER: { bg: 'bg-blue-100', text: 'text-blue-700' },
  SALES_REP: { bg: 'bg-green-100', text: 'text-green-700' },
  VIEWER: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function formatHistoryDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AE', {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AE', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Avatar Component ────────────────────────────────────────────

function UserAvatar({
  firstName,
  lastName,
  avatar,
  size = 'md',
}: {
  firstName: string;
  lastName: string;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-11 w-11 text-base',
  };

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={`${firstName} ${lastName}`}
        className={`${sizeClasses[size]} rounded-full object-cover ring-2 ring-white`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center ring-2 ring-white`}
    >
      {getInitials(firstName, lastName)}
    </div>
  );
}

// ─── Searchable User Dropdown ────────────────────────────────────

function UserDropdown({
  users,
  selectedUserId,
  onSelect,
  currentAssigneeId,
}: {
  users: User[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
  currentAssigneeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredUsers = useMemo(() => {
    const activeUsers = users.filter((u) => u.isActive && u.id !== currentAssigneeId);
    if (!search.trim()) return activeUsers;
    const query = search.toLowerCase();
    return activeUsers.filter(
      (u) =>
        u.firstName.toLowerCase().includes(query) ||
        u.lastName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
    );
  }, [users, search, currentAssigneeId]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-left hover:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all duration-200"
      >
        {selectedUser ? (
          <>
            <UserAvatar
              firstName={selectedUser.firstName}
              lastName={selectedUser.lastName}
              avatar={selectedUser.avatar}
              size="sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {selectedUser.firstName} {selectedUser.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {ROLE_LABELS[selectedUser.role] || selectedUser.role} ·{' '}
                {selectedUser._count?.assignedLeads ?? 0} leads
              </p>
            </div>
          </>
        ) : (
          <span className="text-gray-400 flex-1">Select a team member…</span>
        )}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search team members…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              autoFocus
            />
          </div>

          {/* User list */}
          <div className="max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                No matching team members
              </div>
            ) : (
              filteredUsers.map((user) => {
                const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.VIEWER;
                const leadCount = user._count?.assignedLeads ?? 0;
                const isSelected = user.id === selectedUserId;

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      onSelect(user.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-brand-50 transition-colors duration-150 ${
                      isSelected ? 'bg-brand-50' : ''
                    }`}
                  >
                    <UserAvatar
                      firstName={user.firstName}
                      lastName={user.lastName}
                      avatar={user.avatar}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        {isSelected && (
                          <svg className="h-4 w-4 text-brand-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${roleColor.bg} ${roleColor.text}`}
                        >
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                        <span className="text-xs text-gray-400">
                          {leadCount} active lead{leadCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ReassignmentPanel Component ────────────────────────────

export function ReassignmentPanel({
  lead,
  users,
  currentUserId,
  onReassign,
  assignmentHistory,
}: ReassignmentPanelProps) {
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const assignee = useMemo(() => {
    if (!lead.assignedToId) return null;
    return users.find((u) => u.id === lead.assignedToId) ?? null;
  }, [lead.assignedToId, users]);

  const assigneeRole = assignee?.role || 'SALES_REP';
  const assigneeRoleColor = ROLE_COLORS[assigneeRole] || ROLE_COLORS.VIEWER;
  const activeLeadCount = assignee?._count?.assignedLeads ?? 0;

  // Clear feedback after 4 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const handleOpenReassign = useCallback(() => {
    setIsReassigning(true);
    setSelectedUserId('');
    setReason('');
    setFeedback(null);
  }, []);

  const handleCancelReassign = useCallback(() => {
    setIsReassigning(false);
    setSelectedUserId('');
    setReason('');
  }, []);

  const handleConfirmReassign = useCallback(async () => {
    if (!selectedUserId) return;
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await onReassign(lead.id, selectedUserId, reason.trim() || undefined);
      const newUser = users.find((u) => u.id === selectedUserId);
      const newName = newUser ? `${newUser.firstName} ${newUser.lastName}` : 'selected user';
      setFeedback({ type: 'success', message: `Reassigned to ${newName}` });
      setIsReassigning(false);
      setSelectedUserId('');
      setReason('');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to reassign lead. Please try again.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedUserId, lead.id, reason, onReassign, users]);

  const handleAutoAssign = useCallback(async () => {
    setIsAutoAssigning(true);
    setFeedback(null);

    try {
      await onReassign(lead.id, '__auto__');
      setFeedback({ type: 'success', message: 'Lead auto-assigned successfully' });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Auto-assignment failed. Please try again.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsAutoAssigning(false);
    }
  }, [lead.id, onReassign]);

  const handleViewAllHistory = useCallback(() => {
    const timelineTab = document.querySelector('[data-tab="timeline"]');
    if (timelineTab instanceof HTMLElement) {
      timelineTab.click();
      timelineTab.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Resolve user names for history entries
  const resolveUserName = useCallback(
    (userId?: string): string => {
      if (!userId) return 'Unknown';
      const user = users.find((u) => u.id === userId);
      return user ? `${user.firstName} ${user.lastName}` : 'Unknown';
    },
    [users]
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">Assignment</h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Current Assignee Display */}
        {assignee ? (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <UserAvatar
              firstName={assignee.firstName}
              lastName={assignee.lastName}
              avatar={assignee.avatar}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {assignee.firstName} {assignee.lastName}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${assigneeRoleColor.bg} ${assigneeRoleColor.text}`}
                >
                  {ROLE_LABELS[assigneeRole] || assigneeRole}
                </span>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-500">
                  {activeLeadCount} active lead{activeLeadCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
            <div className="h-11 w-11 rounded-full bg-gray-200 flex items-center justify-center ring-2 ring-white">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Unassigned</p>
              <p className="text-xs text-gray-400">No team member assigned yet</p>
            </div>
          </div>
        )}

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
              feedback.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Inline Reassignment Form */}
        {isReassigning ? (
          <div className="space-y-3 p-3 bg-brand-50/30 border border-brand-100 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Assign to
              </label>
              <UserDropdown
                users={users}
                selectedUserId={selectedUserId}
                onSelect={setSelectedUserId}
                currentAssigneeId={lead.assignedToId}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Geographic territory change"
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all duration-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmReassign}
                disabled={!selectedUserId || isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Reassigning…
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelReassign}
                disabled={isSubmitting}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50 transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Action Buttons */
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenReassign}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 transition-all duration-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
              Reassign
            </button>
            <button
              type="button"
              onClick={handleAutoAssign}
              disabled={isAutoAssigning}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isAutoAssigning ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Assigning…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Auto-assign
                </>
              )}
            </button>
          </div>
        )}

        {/* Assignment History */}
        {assignmentHistory.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200"
            >
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Assignment History
              </span>
              <svg
                className={`h-3.5 w-3.5 transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showHistory && (
              <div className="mt-1 space-y-0">
                {assignmentHistory.map((entry) => {
                  const previousName = entry.metadata?.previousAssigneeId
                    ? resolveUserName(entry.metadata.previousAssigneeId)
                    : null;
                  const newName = entry.metadata?.newAssigneeId
                    ? resolveUserName(entry.metadata.newAssigneeId)
                    : null;

                  return (
                    <div
                      key={entry.id}
                      className="relative pl-4 py-2 border-l-2 border-gray-200 group"
                    >
                      {/* Timeline dot */}
                      <div className="absolute left-[-5px] top-3 h-2 w-2 rounded-full bg-gray-300 group-hover:bg-brand-400 transition-colors duration-200" />

                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {/* Build a descriptive line from metadata or fallback to description */}
                          <p className="text-xs text-gray-700 leading-relaxed">
                            {previousName && newName ? (
                              <>
                                Reassigned from{' '}
                                <span className="font-medium text-gray-900">{previousName}</span> to{' '}
                                <span className="font-medium text-gray-900">{newName}</span>
                              </>
                            ) : newName ? (
                              <>
                                Assigned to{' '}
                                <span className="font-medium text-gray-900">{newName}</span>
                              </>
                            ) : (
                              <span>{entry.description}</span>
                            )}
                          </p>
                          {entry.metadata?.reason && (
                            <p className="text-xs text-gray-400 mt-0.5 italic">
                              Reason: {entry.metadata.reason}
                            </p>
                          )}
                        </div>
                        <time
                          className="text-xs text-gray-400 shrink-0 whitespace-nowrap"
                          title={formatFullDate(entry.createdAt)}
                        >
                          {formatHistoryDate(entry.createdAt)}
                        </time>
                      </div>
                    </div>
                  );
                })}

                {/* View all link */}
                <button
                  type="button"
                  onClick={handleViewAllHistory}
                  className="mt-1 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors duration-200"
                >
                  View all in Timeline →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReassignmentPanel;
