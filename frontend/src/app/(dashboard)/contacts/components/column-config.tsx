'use client';

import { useState } from 'react';

export interface ContactColumnDef {
  id: string;
  label: string;
  visible: boolean;
  sortable: boolean;
  sortField?: string;
  width?: string;
  locked?: boolean;
}

export const DEFAULT_CONTACT_COLUMNS: ContactColumnDef[] = [
  { id: 'select', label: '', visible: true, sortable: false, width: 'w-10', locked: true },
  { id: 'name', label: 'Name', visible: true, sortable: true, sortField: 'firstName', locked: true },
  { id: 'emailPhone', label: 'Email / Phone', visible: true, sortable: false },
  { id: 'company', label: 'Company', visible: true, sortable: true, sortField: 'company' },
  { id: 'jobTitle', label: 'Job Title', visible: false, sortable: false },
  { id: 'lifecycle', label: 'Lifecycle', visible: true, sortable: false },
  { id: 'type', label: 'Type', visible: true, sortable: false },
  { id: 'owner', label: 'Owner', visible: true, sortable: false },
  { id: 'score', label: 'Score', visible: true, sortable: true, sortField: 'score' },
  { id: 'tags', label: 'Tags', visible: true, sortable: false },
  { id: 'location', label: 'Location', visible: false, sortable: false },
  { id: 'website', label: 'Website', visible: false, sortable: false },
  { id: 'linkedin', label: 'LinkedIn', visible: false, sortable: false },
  { id: 'createdAt', label: 'Created', visible: true, sortable: true, sortField: 'createdAt' },
  { id: 'updatedAt', label: 'Updated', visible: false, sortable: true, sortField: 'updatedAt' },
  { id: 'actions', label: '', visible: true, sortable: false, width: 'w-12', locked: true },
];

const STORAGE_KEY_PREFIX = 'contacts-column-config';

function getStorageKey(): string {
  if (typeof window === 'undefined') return STORAGE_KEY_PREFIX;
  const divisionId = localStorage.getItem('activeDivisionId');
  return divisionId ? `${STORAGE_KEY_PREFIX}-${divisionId}` : STORAGE_KEY_PREFIX;
}

export function loadContactColumns(): ContactColumnDef[] {
  if (typeof window === 'undefined') return DEFAULT_CONTACT_COLUMNS;
  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      const parsed: ContactColumnDef[] = JSON.parse(saved);
      const savedIds = new Set(parsed.map(c => c.id));
      const newCols = DEFAULT_CONTACT_COLUMNS.filter(c => !savedIds.has(c.id));
      const actionsIdx = parsed.findIndex(c => c.id === 'actions');
      if (actionsIdx >= 0 && newCols.length > 0) {
        parsed.splice(actionsIdx, 0, ...newCols);
      } else if (newCols.length > 0) {
        parsed.push(...newCols);
      }
      // Remove columns that no longer exist in defaults
      const defaultIds = new Set(DEFAULT_CONTACT_COLUMNS.map(c => c.id));
      return parsed.filter(c => defaultIds.has(c.id));
    }
  } catch { /* ignore */ }
  return DEFAULT_CONTACT_COLUMNS;
}

export function saveContactColumns(columns: ContactColumnDef[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(), JSON.stringify(columns));
}

interface ContactColumnManagerProps {
  columns: ContactColumnDef[];
  onChange: (columns: ContactColumnDef[]) => void;
  onClose: () => void;
}

export function ContactColumnManager({ columns, onChange, onClose }: ContactColumnManagerProps) {
  const [local, setLocal] = useState<ContactColumnDef[]>([...columns]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const toggleColumn = (id: string) => {
    setLocal(local.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const items = [...local];
    const dragged = items.splice(dragIdx, 1)[0];
    items.splice(idx, 0, dragged);
    setLocal(items);
    setDragIdx(idx);
  };

  const handleApply = () => {
    saveContactColumns(local);
    onChange(local);
    onClose();
  };

  const handleReset = () => {
    setLocal([...DEFAULT_CONTACT_COLUMNS]);
  };

  const movableColumns = local.filter(c => c.id !== 'select' && c.id !== 'actions');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage Columns</h2>
            <p className="text-xs text-gray-500 mt-0.5">Drag to reorder. Toggle to show/hide.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {movableColumns.map((col) => {
            const globalIdx = local.findIndex(c => c.id === col.id);
            return (
              <div
                key={col.id}
                draggable={!col.locked}
                onDragStart={() => handleDragStart(globalIdx)}
                onDragOver={(e) => handleDragOver(e, globalIdx)}
                onDragEnd={() => setDragIdx(null)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                  dragIdx === globalIdx ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
                } ${col.locked ? 'opacity-70' : 'cursor-grab active:cursor-grabbing'}`}
              >
                <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
                <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => !col.locked && toggleColumn(col.id)}
                    disabled={col.locked}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                </label>
                {col.locked && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Required</span>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between p-4 border-t">
          <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700">Reset to Default</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleApply} className="btn-primary text-sm">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
