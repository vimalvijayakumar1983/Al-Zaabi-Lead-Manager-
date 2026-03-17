import React, { useState, useCallback } from 'react';
import type { User } from '@/types';
import { AssigneeDropdown } from './AssigneeDropdown';

interface BulkReassignModalProps {
  leadCount: number;
  users: User[];
  currentUserId?: string;
  onConfirm: (assignedToId: string, reason?: string) => void;
  onClose: () => void;
}

export function BulkReassignModal({
  leadCount,
  users,
  currentUserId,
  onConfirm,
  onClose,
}: BulkReassignModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const handleConfirm = useCallback(async () => {
    if (!selectedUserId) return;

    setIsSubmitting(true);
    try {
      await onConfirm(selectedUserId, reason.trim() || undefined);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedUserId, reason, onConfirm]);

  return (
    <div className="overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-md overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Reassign {leadCount} {leadCount === 1 ? 'Lead' : 'Leads'}
              </h2>
              <p className="text-sm text-gray-500">Select a new team member</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-icon text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Warning Banner */}
          <div className="flex gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <svg
              className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-800">
                This will reassign {leadCount} {leadCount === 1 ? 'lead' : 'leads'} to the selected team member
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                The previous assignees will lose access to these leads.
              </p>
            </div>
          </div>

          {/* Assignee Picker */}
          <div>
            <label className="label">New Assignee</label>
            <AssigneeDropdown
              users={users}
              selectedId={selectedUserId}
              onChange={(userId) => setSelectedUserId(userId)}
              currentUserId={currentUserId}
              showAutoAssign={false}
              showUnassigned={false}
              placeholder="Select team member…"
            />
          </div>

          {/* Reason (optional) */}
          <div>
            <label className="label">
              Reason <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why are you reassigning these leads?"
              className="input w-full resize-none"
            />
          </div>

          {/* Selected user preview */}
          {selectedUser && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-brand-50 border border-brand-200">
              <svg className="h-4 w-4 text-brand-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <p className="text-sm text-brand-700">
                <span className="font-medium">
                  {selectedUser.firstName} {selectedUser.lastName}
                </span>{' '}
                will receive{' '}
                <span className="font-medium">
                  {leadCount} {leadCount === 1 ? 'lead' : 'leads'}
                </span>
                {selectedUser._count?.assignedLeads !== undefined && (
                  <span className="text-brand-500">
                    {' '}
                    (currently has {selectedUser._count.assignedLeads} active{' '}
                    {selectedUser._count.assignedLeads === 1 ? 'lead' : 'leads'})
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn-primary"
            disabled={!selectedUserId || isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Reassigning…
              </span>
            ) : (
              `Reassign ${leadCount} ${leadCount === 1 ? 'Lead' : 'Leads'}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { BulkReassignModalProps };
