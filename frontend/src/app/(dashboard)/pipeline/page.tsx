'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { PipelineStage } from '@/types';

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedLead, setDraggedLead] = useState<string | null>(null);

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
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (!draggedLead) return;

    try {
      await api.moveLead(draggedLead, stageId, 0);
      fetchStages();
    } catch (err: any) {
      alert(err.message);
    }
    setDraggedLead(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-gray-500 mt-1">Drag and drop leads between stages</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex-shrink-0 w-72"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            {/* Stage Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <h3 className="font-semibold text-gray-900 text-sm">{stage.name}</h3>
              <span className="text-xs text-gray-500 ml-auto">{stage.leads?.length || 0}</span>
            </div>

            {/* Cards Container */}
            <div className="space-y-2 min-h-[200px] bg-gray-50 rounded-lg p-2">
              {stage.leads?.map((lead: any) => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                  className="card p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                >
                  <Link href={`/leads/${lead.id}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-medium text-brand-700">
                        {lead.firstName[0]}{lead.lastName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{lead.firstName} {lead.lastName}</p>
                        <p className="text-xs text-gray-500 truncate">{lead.company || lead.email || '-'}</p>
                      </div>
                    </div>

                    {lead.budget && (
                      <p className="text-xs text-gray-600 mb-1">${Number(lead.budget).toLocaleString()}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        {lead.tags?.map((t: any) => (
                          <span key={t.tag.id} className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: t.tag.color + '20', color: t.tag.color }}>
                            {t.tag.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${lead.score}%`,
                            backgroundColor: lead.score >= 70 ? '#22c55e' : lead.score >= 40 ? '#f59e0b' : '#ef4444',
                          }} />
                        </div>
                        <span className="text-[10px] text-gray-500">{lead.score}</span>
                      </div>
                    </div>

                    {lead.assignedTo && (
                      <div className="flex items-center gap-1 mt-2">
                        <div className="h-5 w-5 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-medium text-gray-600">
                          {lead.assignedTo.firstName[0]}{lead.assignedTo.lastName[0]}
                        </div>
                        <span className="text-[10px] text-gray-500">{lead.assignedTo.firstName}</span>
                      </div>
                    )}
                  </Link>
                </div>
              ))}

              {(!stage.leads || stage.leads.length === 0) && (
                <p className="text-xs text-gray-400 text-center py-8">Drop leads here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
