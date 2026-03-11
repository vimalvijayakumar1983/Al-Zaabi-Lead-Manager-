'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Campaign } from '@/types';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCampaigns().then((res: any) => setCampaigns(res.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 mt-1">Track your marketing campaigns</p>
        </div>
        <button className="btn-primary">+ New Campaign</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">No campaigns yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <div key={campaign.id} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className={`badge ${statusColors[campaign.status] || 'bg-gray-100'}`}>{campaign.status}</span>
                <span className="text-xs text-gray-500">{campaign.type.replace('_', ' ')}</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{campaign.name}</h3>
              <div className="space-y-1 text-sm text-gray-600">
                {campaign.budget && <p>Budget: ${Number(campaign.budget).toLocaleString()}</p>}
                {campaign.leadCount !== undefined && <p>Leads: {campaign.leadCount}</p>}
                {campaign.startDate && (
                  <p>
                    {new Date(campaign.startDate).toLocaleDateString()}
                    {campaign.endDate && ` - ${new Date(campaign.endDate).toLocaleDateString()}`}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
