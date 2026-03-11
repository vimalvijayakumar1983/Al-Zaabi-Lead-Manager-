'use client';

import { useState } from 'react';

export interface ColumnDef {
  id: string;
  label: string;
  visible: boolean;
  sortable: boolean;
  sortField?: string;
  width?: string;
  locked?: boolean; // cannot be hidden (e.g. name)
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'select', label: '', visible: true, sortable: false, width: 'w-10', locked: true },
  { id: 'name', label: 'Name', visible: true, sortable: true, sortField: 'firstName', locked: true },
  { id: 'email', label: 'Email', visible: true, sortable: false },
  { id: 'phone', label: 'Phone', visible: true, sortable: false },
  { id: 'company', label: 'Company', visible: true, sortable: true, sortField: 'company' },
  { id: 'jobTitle', label: 'Job Title', visible: false, sortable: false },
  { id: 'status', label: 'Status', visible: true, sortable: true, sortField: 'status' },
  { id: 'source', label: 'Source', visible: true, sortable: true, sortField: 'source' },
  { id: 'score', label: 'Score', visible: true, sortable: true, sortField: 'score' },
  { id: 'budget', label: 'Budget', visible: false, sortable: false },
  { id: 'location', label: 'Location', visible: false, sortable: false },
  { id: 'productInterest', label: 'Product Interest', visible: false, sortable: false },
  { id: 'campaign', label: 'Campaign', visible: false, sortable: false },
  { id: 'conversionProb', label: 'Conversion %', visible: false, sortable: false },
  { id: 'assignedTo', label: 'Assigned To', visible: true, sortable: false },
  { id: 'tags', label: 'Tags', visible: false, sortable: false },
  { id: 'createdAt', label: 'Created', visible: true, sortable: true, sortField: 'createdAt' },
  { id: 'updatedAt', label: 'Updated', visible: false, sortable: true, sortField: 'updatedAt' },
  { id: 'actions', label: '', visible: true, sortable: false, width: 'w-10', locked: true },
];

const STORAGE_KEY = 'leads-column-config';

export function loadColumns(): ColumnDef[] {
  if (typeof window === 'undefined') return DEFAULT_COLUMNS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: ColumnDef[] = JSON.parse(saved);
      // Merge with defaults to pick up any new columns
      const ids = new Set(parsed.map((c) => c.id));
      const merged = [
        ...parsed,
        ...DEFAULT_COLUMNS.filter((c) => !ids.has(c.id)),
      ];
      return merged;
    }
  } catch { /* ignore */ }
  return DEFAULT_COLUMNS;
}

export function saveColumns(columns: ColumnDef[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

interface ColumnManagerProps {
  columns: ColumnDef[];
  onChange: (columns: ColumnDef[]) => void;
  onClose: () => void;
}

export function ColumnManager({ columns, onChange, onClose }: ColumnManagerProps) {
  const [local, setLocal] = useState<ColumnDef[]>([...columns]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const toggleColumn = (id: string) => {
    setLocal(local.map((c) => c.id === id ? { ...c, visible: !c.visible } : c));
  };

  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

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
    saveColumns(local);
    onChange(local);
    onClose();
  };

  const handleReset = () => {
    const reset = [...DEFAULT_COLUMNS];
    setLocal(reset);
  };

  const movableColumns = local.filter((c) => c.id !== 'select' && c.id !== 'actions');

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
          {movableColumns.map((col, i) => {
            const globalIdx = local.findIndex((c) => c.id === col.id);
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
