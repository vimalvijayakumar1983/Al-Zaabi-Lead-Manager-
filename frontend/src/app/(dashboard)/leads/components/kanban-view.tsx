'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import type { Lead, CustomField } from '@/types';

const statusColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  NEW: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  CONTACTED: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  QUALIFIED: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  PROPOSAL_SENT: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  NEGOTIATION: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  WON: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  LOST: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
};

const statusOrder = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'];

interface KanbanViewProps {
  leads: Lead[];
  onStatusChange: (leadId: string, status: string) => Promise<void>;
  customFields?: CustomField[];
  /** Prefetch lead detail (e.g. TanStack Query) when hovering a card link */
  onLeadHover?: (leadId: string) => void;
}

function getDisplayName(lead: { firstName?: string | null; lastName?: string | null }) {
  const first = (lead.firstName || '').trim();
  const last = (lead.lastName || '').trim();
  if (first && last && first.toLowerCase() === last.toLowerCase()) return first;
  if (first && last && first.toLowerCase().includes(last.toLowerCase())) return first;
  if (first && last && last.toLowerCase().includes(first.toLowerCase())) return last;
  return [first, last].filter(Boolean).join(' ') || 'Unknown';
}

function getDisplayInitials(lead: { firstName?: string | null; lastName?: string | null }) {
  const name = getDisplayName(lead);
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export function KanbanView({ leads, onStatusChange, customFields = [], onLeadHover }: KanbanViewProps) {
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const grouped: Record<string, Lead[]> = {};
  for (const s of statusOrder) grouped[s] = [];
  for (const lead of leads) {
    const status = lead.status || 'NEW';
    if (grouped[status]) grouped[status].push(lead);
  }

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLead(leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDropTarget(null);
    if (draggedLead) {
      const lead = leads.find((l) => l.id === draggedLead);
      if (lead && lead.status !== status) {
        await onStatusChange(draggedLead, status);
      }
    }
    setDraggedLead(null);
  };

  const handleDragEnd = () => {
    setDraggedLead(null);
    setDropTarget(null);
  };

  const totalBudget = (items: Lead[]) =>
    items.reduce((sum, l) => sum + (Number(l.budget) || 0), 0);

  return (
    <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2" style={{ minHeight: '500px' }}>
      {statusOrder.map((status) => {
        const items = grouped[status];
        const colors = statusColors[status];
        const budget = totalBudget(items);
        const isTarget = dropTarget === status;

        return (
          <div
            key={status}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => handleDrop(e, status)}
            className={`flex-shrink-0 w-72 flex flex-col rounded-xl border-2 transition-colors ${
              isTarget ? 'border-brand-400 bg-brand-50/30' : 'border-gray-200 bg-gray-50/50'
            }`}
          >
            {/* Column Header */}
            <div className={`px-3 py-2.5 rounded-t-xl ${colors.bg}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
                  <span className={`text-sm font-semibold ${colors.text}`}>{status.replace(/_/g, ' ')}</span>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}>
                  {items.length}
                </span>
              </div>
              {budget > 0 && (
                <p className="text-xs text-gray-500 mt-1">${budget.toLocaleString()} pipeline</p>
              )}
            </div>

            {/* Cards */}
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
              {items.length === 0 && (
                <div className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                  isTarget ? 'border-brand-300 bg-brand-50' : 'border-gray-200'
                }`}>
                  <p className="text-xs text-gray-400">
                    {isTarget ? 'Drop here' : 'No leads'}
                  </p>
                </div>
              )}
              {items.map((lead) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                    draggedLead === lead.id ? 'opacity-50 scale-95' : ''
                  }`}
                >
                  <Link
                    href={`/leads/${lead.id}`}
                    className="block"
                    onMouseEnter={() => onLeadHover?.(lead.id)}
                    onClick={(e) => draggedLead && e.preventDefault()}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[10px] font-medium text-white">
                          {getDisplayInitials(lead)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 leading-tight">{getDisplayName(lead)}</p>
                          {lead.company && <p className="text-[11px] text-gray-500">{lead.company}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${lead.score ?? 0}%`,
                          backgroundColor: (lead.score ?? 0) >= 70 ? '#22c55e' : (lead.score ?? 0) >= 40 ? '#f59e0b' : '#ef4444',
                        }} />
                      </div>
                      <span className="text-[10px] font-bold tabular-nums" style={{
                        color: (lead.score ?? 0) >= 70 ? '#16a34a' : (lead.score ?? 0) >= 40 ? '#d97706' : '#dc2626'
                      }}>{lead.score ?? 0}</span>
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {lead.email && (
                          <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /></svg>
                        )}
                        {lead.phone && (
                          <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493" /></svg>
                        )}
                        {lead.budget && (
                          <span className="text-[10px] text-gray-500">${Number(lead.budget).toLocaleString()}</span>
                        )}
                      </div>
                      {lead.assignedTo && (
                        <div className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-medium text-gray-600" title={`${lead.assignedTo.firstName} ${lead.assignedTo.lastName}`}>
                          {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
                        </div>
                      )}
                    </div>

                    {lead.tags && lead.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {lead.tags.slice(0, 2).map((t) => (
                          <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                            {t.tag.name}
                          </span>
                        ))}
                        {lead.tags.length > 2 && <span className="text-[9px] text-gray-400">+{lead.tags.length - 2}</span>}
                      </div>
                    )}

                    {/* Custom field values */}
                    {customFields.length > 0 && lead.customData && (() => {
                      const cd = typeof lead.customData === 'object' ? lead.customData as Record<string, unknown> : {};
                      const visible = customFields.filter(cf => cd[cf.name] !== undefined && cd[cf.name] !== null && cd[cf.name] !== '');
                      if (visible.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {visible.slice(0, 3).map(cf => (
                            <span key={cf.id} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] bg-gray-100 text-gray-600">
                              <span className="font-medium text-gray-500">{cf.label}:</span>
                              {cf.type === 'BOOLEAN' ? (cd[cf.name] ? 'Yes' : 'No') :
                               Array.isArray(cd[cf.name]) ? (cd[cf.name] as string[]).join(', ') :
                               String(cd[cf.name])}
                            </span>
                          ))}
                          {visible.length > 3 && <span className="text-[9px] text-gray-400">+{visible.length - 3}</span>}
                        </div>
                      );
                    })()}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
