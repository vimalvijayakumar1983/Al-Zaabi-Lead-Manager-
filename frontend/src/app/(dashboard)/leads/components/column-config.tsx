'use client';

import { useState } from 'react';
import type { CustomField } from '@/types';

export interface ColumnDef {
  id: string;
  label: string;
  customLabel?: string;
  visible: boolean;
  sortable: boolean;
  sortField?: string;
  width?: string;
  locked?: boolean; // cannot be hidden (e.g. name)
  isCustom?: boolean; // custom field column
  customFieldType?: string; // field type for rendering
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
  { id: 'division', label: 'Division', visible: false, sortable: false },
  { id: 'assignedTo', label: 'Assigned To', visible: true, sortable: false },
  { id: 'tags', label: 'Tags', visible: false, sortable: false },
  { id: 'callCount', label: 'Calls', visible: true, sortable: false },
  { id: 'lastCallOutcome', label: 'Last Call Outcome', visible: true, sortable: false },
  { id: 'channels', label: 'Channels', visible: true, sortable: false },
  { id: 'sla', label: 'SLA', visible: true, sortable: true, sortField: 'slaStatus' },
  { id: 'createdAt', label: 'Created', visible: true, sortable: true, sortField: 'createdAt' },
  { id: 'updatedAt', label: 'Updated', visible: true, sortable: true, sortField: 'updatedAt' },
  { id: 'actions', label: '', visible: true, sortable: false, width: 'w-10', locked: true },
];

const STORAGE_KEY_PREFIX = 'leads-column-config';

function getStorageKey(): string {
  if (typeof window === 'undefined') return STORAGE_KEY_PREFIX;
  const divisionId = localStorage.getItem('activeDivisionId');
  return divisionId ? `${STORAGE_KEY_PREFIX}-${divisionId}` : STORAGE_KEY_PREFIX;
}

export function customFieldToColumn(cf: CustomField): ColumnDef {
  return {
    id: `cf_${cf.name}`,
    label: cf.label,
    visible: true,
    sortable: false,
    isCustom: true,
    customFieldType: cf.type,
  };
}

export function loadColumns(customFields?: CustomField[]): ColumnDef[] {
  // Build custom field columns
  const cfColumns = (customFields || []).map(customFieldToColumn);

  // All available columns = defaults + custom (before actions)
  const allColumns = [
    ...DEFAULT_COLUMNS.filter(c => c.id !== 'actions'),
    ...cfColumns,
    DEFAULT_COLUMNS.find(c => c.id === 'actions')!,
  ];

  if (typeof window === 'undefined') return allColumns;

  try {
    const saved = localStorage.getItem(getStorageKey());
    if (saved) {
      const parsed: ColumnDef[] = JSON.parse(saved);
      const savedIds = new Set(parsed.map((c) => c.id));

      // Update saved custom columns with latest labels/types
      const updated = parsed.map(c => {
        if (c.isCustom) {
          const fresh = cfColumns.find(cf => cf.id === c.id);
          if (fresh) return { ...c, label: fresh.label, customFieldType: fresh.customFieldType };
          // Custom field was deleted - remove from saved
          return null;
        }
        return c;
      }).filter(Boolean) as ColumnDef[];

      // Add any new columns not in saved
      const newCols = allColumns.filter(c => !savedIds.has(c.id));
      // Insert new columns before 'actions'
      const actionsIdx = updated.findIndex(c => c.id === 'actions');
      if (actionsIdx >= 0) {
        updated.splice(actionsIdx, 0, ...newCols);
      } else {
        updated.push(...newCols);
      }

      return updated;
    }
  } catch { /* ignore */ }

  return allColumns;
}

export function saveColumns(columns: ColumnDef[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getStorageKey(), JSON.stringify(columns));
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
    // Keep custom columns but reset visibility/order to defaults
    const defaults = [...DEFAULT_COLUMNS.filter(c => c.id !== 'actions')];
    const customs = local.filter(c => c.isCustom).map(c => ({ ...c, visible: false }));
    const reset = [...defaults, ...customs, DEFAULT_COLUMNS.find(c => c.id === 'actions')!];
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
          {movableColumns.map((col) => {
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
                {col.isCustom && <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">Custom</span>}
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
