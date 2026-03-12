'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Campaign } from '@/types';
import { Megaphone, Plus, DollarSign, Users, Calendar, Globe, Facebook, Mail } from 'lucide-react';

const statusConfig: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  DRAFT: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-600/10', dot: 'bg-gray-400' },
  ACTIVE: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-600/10', dot: 'bg-emerald-500' },
  PAUSED: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-600/10', dot: 'bg-amber-500' },
  COMPLETED: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-600/10', dot: 'bg-blue-500' },
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  FACEBOOK_ADS: Facebook,
  GOOGLE_ADS: Globe,
  EMAIL: Mail,
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCampaigns().then((res: any) => setCampaigns(res.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Campaigns</h1>
          <p className="text-text-secondary text-sm mt-0.5">{campaigns.length} campaigns</p>
        </div>
        <button className="btn-primary">
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="card p-5">
              <div className="flex justify-between mb-4"><div className="skeleton h-5 w-16 rounded-md" /><div className="skeleton h-4 w-20" /></div>
              <div className="skeleton h-5 w-40 mb-3" />
              <div className="space-y-2"><div className="skeleton h-4 w-32" /><div className="skeleton h-4 w-24" /></div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Megaphone className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text-primary">No campaigns yet</p>
            <p className="text-xs text-text-tertiary mt-1 mb-3">Start tracking your marketing campaigns</p>
            <button className="btn-primary text-sm">Create Campaign</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => {
            const status = statusConfig[campaign.status] || statusConfig.DRAFT;
            const TypeIcon = typeIcons[campaign.type] || Megaphone;
            return (
              <div key={campaign.id} className="card p-5 hover:shadow-card-hover transition-all duration-200 group">
                <div className="flex items-center justify-between mb-3">
                  <span className={`badge ${status.bg} ${status.text} ring-1 ${status.ring}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                    {campaign.status}
                  </span>
                  <div className="flex items-center gap-1.5 text-text-tertiary">
                    <TypeIcon className="h-3.5 w-3.5" />
                    <span className="text-xs">{campaign.type.replace(/_/g, ' ')}</span>
                  </div>
                </div>

                <h3 className="font-semibold text-text-primary mb-3 group-hover:text-brand-700 transition-colors">
                  {campaign.name}
                </h3>

                <div className="space-y-2">
                  {campaign.budget && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-3.5 w-3.5 text-text-tertiary" />
                      <span className="text-text-secondary">${Number(campaign.budget).toLocaleString()}</span>
                    </div>
                  )}
                  {campaign.leadCount !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-3.5 w-3.5 text-text-tertiary" />
                      <span className="text-text-secondary">{campaign.leadCount} leads</span>
                    </div>
                  )}
                  {campaign.startDate && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-3.5 w-3.5 text-text-tertiary" />
                      <span className="text-text-secondary">
                        {new Date(campaign.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {campaign.endDate && ` - ${new Date(campaign.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
