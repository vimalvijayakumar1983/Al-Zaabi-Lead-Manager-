'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { PipelineStage } from '@/types';
import { GripVertical, DollarSign, User2, Plus } from 'lucide-react';

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const fetchStages = useCallback(async () => {
    try {
      const data = await api.getPipelineStages();
      setStages(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggedLead(leadId);
    e.dataTransfer.effectAllowed = 'move';
    // Add visual feedback
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.opacity = '1';
    setDragOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedLead) return;

    try {
      await api.moveLead(draggedLead, stageId, 0);
      fetchStages();
    } catch (err: any) {
      alert(err.message);
    }
    setDraggedLead(null);
  };

  // Calculate total pipeline value per stage
  const getStageValue = (stage: PipelineStage) => {
    return stage.leads?.reduce((sum: number, lead: any) => sum + (Number(lead.budget) || 0), 0) || 0;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div><div className="skeleton h-8 w-32 mb-2" /><div className="skeleton h-4 w-64" /></div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex-shrink-0 w-72">
              <div className="skeleton h-10 w-full mb-3 rounded-lg" />
              <div className="space-y-2">
                {[1,2,3].map(j => <div key={j} className="skeleton h-24 w-full rounded-xl" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalValue = stages.reduce((sum, s) => sum + getStageValue(s), 0);
  const totalLeads = stages.reduce((sum, s) => sum + (s.leads?.length || 0), 0);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Pipeline</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            {totalLeads} leads &middot; AED {totalValue.toLocaleString()} total value
          </p>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin" style={{ minHeight: 'calc(100vh - 220px)' }}>
        {stages.map((stage) => {
          const stageValue = getStageValue(stage);
          const leadCount = stage.leads?.length || 0;
          const isDragOver = dragOverStage === stage.id;

          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-72 flex flex-col"
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage Header */}
              <div className="flex items-center gap-2.5 mb-2.5 px-1">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-xs" style={{ backgroundColor: stage.color }} />
                <h3 className="font-semibold text-text-primary text-sm flex-1 truncate">{stage.name}</h3>
                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-md bg-surface-tertiary text-2xs font-semibold text-text-secondary">
                  {leadCount}
                </span>
              </div>

              {/* Stage value */}
              {stageValue > 0 && (
                <div className="flex items-center gap-1 px-1 mb-2">
                  <DollarSign className="h-3 w-3 text-text-tertiary" />
                  <span className="text-xs font-medium text-text-secondary">AED {stageValue.toLocaleString()}</span>
                </div>
              )}

              {/* Cards Container */}
              <div className={`flex-1 space-y-2 rounded-xl p-2 transition-all duration-200 ${
                isDragOver
                  ? 'bg-brand-50 ring-2 ring-brand-500/30 ring-offset-1'
                  : 'bg-surface-tertiary/50'
              }`}>
                {stage.leads?.map((lead: any) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    onDragEnd={handleDragEnd}
                    className="card-interactive p-3 group"
                  >
                    <Link href={`/leads/${lead.id}`}>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-semibold text-white shadow-xs flex-shrink-0">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary truncate group-hover:text-brand-700 transition-colors">
                            {lead.firstName} {lead.lastName}
                          </p>
                          <p className="text-xs text-text-tertiary truncate">
                            {lead.company || lead.email || '-'}
                          </p>
                        </div>
                      </div>

                      {lead.budget && (
                        <div className="flex items-center gap-1 mb-2">
                          <DollarSign className="h-3 w-3 text-text-tertiary" />
                          <span className="text-xs font-semibold text-text-primary">AED {Number(lead.budget).toLocaleString()}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex gap-1 flex-wrap">
                          {lead.tags?.slice(0, 2).map((t: any) => (
                            <span key={t.tag.id} className="inline-block rounded-md px-1.5 py-0.5 text-2xs font-medium ring-1 ring-inset"
                              style={{ backgroundColor: t.tag.color + '12', color: t.tag.color, boxShadow: `inset 0 0 0 1px ${t.tag.color}30` }}>
                              {t.tag.name}
                            </span>
                          ))}
                          {lead.tags?.length > 2 && (
                            <span className="text-2xs text-text-tertiary">+{lead.tags.length - 2}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-8 h-1 bg-surface-tertiary rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${lead.score}%`,
                              backgroundColor: lead.score >= 70 ? '#10b981' : lead.score >= 40 ? '#f59e0b' : '#ef4444',
                            }} />
                          </div>
                          <span className="text-2xs font-semibold tabular-nums text-text-secondary">{lead.score}</span>
                        </div>
                      </div>

                      {lead.assignedTo && (
                        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-subtle">
                          <div className="h-5 w-5 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-[9px] font-semibold text-white">
                            {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
                          </div>
                          <span className="text-2xs text-text-tertiary">{lead.assignedTo.firstName} {lead.assignedTo.lastName}</span>
                        </div>
                      )}
                    </Link>
                  </div>
                ))}

                {(!stage.leads || stage.leads.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="h-8 w-8 rounded-lg bg-surface-secondary flex items-center justify-center mb-2">
                      <Plus className="h-4 w-4 text-text-tertiary" />
                    </div>
                    <p className="text-xs text-text-tertiary">Drop leads here</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
