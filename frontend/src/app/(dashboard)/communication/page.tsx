'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { MessageCircle, Instagram, Facebook, Send, RefreshCw, Phone, Plus } from 'lucide-react';
import type { Communication } from '@/types';

type ChannelTab = 'whatsapp' | 'instagram' | 'facebook';

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<ChannelTab>('whatsapp');

  const tabs: { key: ChannelTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
    { key: 'instagram', label: 'Instagram', icon: Instagram },
    { key: 'facebook', label: 'Facebook', icon: Facebook },
  ];

  return (
    <div className="animate-fade-in h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-4 mb-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#25D366] text-white shadow-md'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'whatsapp' && <WhatsAppView />}
      {activeTab === 'instagram' && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary/30">
          <div className="text-center text-text-tertiary">
            <Instagram className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Instagram coming soon</p>
            <p className="text-sm mt-1">Connect your Instagram DMs here</p>
          </div>
        </div>
      )}
      {activeTab === 'facebook' && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary/30">
          <div className="text-center text-text-tertiary">
            <Facebook className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Facebook Messenger coming soon</p>
            <p className="text-sm mt-1">Connect your Facebook Messenger here</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── WhatsApp view: conversation list + chat ─────────────────────── */
type WhatsAppConversation = {
  lead: { id: string; firstName: string; lastName: string; phone: string | null };
  lastMessage: { body: string; createdAt: string; direction: string };
};

type LeadBasic = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status?: string;
  stage?: { name: string; color?: string };
  updatedAt?: string;
};

type ChatListItem = { lead: LeadBasic; lastMessage?: { body: string; createdAt: string; direction: string } };

function WhatsAppView() {
  const [allChats, setAllChats] = useState<ChatListItem[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newLeadFirstName, setNewLeadFirstName] = useState('');
  const [newLeadLastName, setNewLeadLastName] = useState('');
  const [creatingLead, setCreatingLead] = useState(false);
  const [createLeadError, setCreateLeadError] = useState('');
  /** When set, we're viewing a chat by number only (no lead yet). Header shows "Create lead". */
  const [selectedPhoneOnly, setSelectedPhoneOnly] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => (selectedLeadId ? allChats.find((c) => c.lead.id === selectedLeadId)?.lead : undefined),
    [allChats, selectedLeadId]
  );

  const fetchAllChats = useCallback(async () => {
    try {
      // Fetch both; use allSettled so one failure doesn't clear the list
      const [convResult, leadsResult] = await Promise.allSettled([
        api.getWhatsAppConversations(),
        api.getLeads({ page: 1, limit: 100, hasPhone: 'true' }),
      ]);

      const conversationsList: WhatsAppConversation[] =
        convResult.status === 'fulfilled' && Array.isArray(convResult.value) ? convResult.value : [];

      let leads: (LeadBasic & { updatedAt?: string })[] = [];
      if (leadsResult.status === 'fulfilled' && leadsResult.value) {
        const firstPage = leadsResult.value as { data?: unknown[]; pagination?: { total?: number } };
        const firstData = Array.isArray(firstPage?.data)
          ? (firstPage.data as Array<LeadBasic & { updatedAt?: string }>)
          : Array.isArray(firstPage)
            ? (firstPage as Array<LeadBasic & { updatedAt?: string }>)
            : [];
        leads = firstData.filter((l) => l?.phone);
        const total = firstPage?.pagination?.total ?? leads.length;
        if (total > 100) {
          const pages = Math.ceil(total / 100);
          const rest = await Promise.all(
            Array.from({ length: pages - 1 }, (_, i) =>
              api.getLeads({ page: i + 2, limit: 100, hasPhone: 'true' })
            )
          );
          rest.forEach((res: { data?: Array<{ phone?: string | null }> }) => {
            const pageData = Array.isArray(res?.data) ? res.data : [];
            leads = leads.concat(pageData.filter((l) => l?.phone) as (LeadBasic & { updatedAt?: string })[]);
          });
        }
      }

      // Fallback: if leads API returned none but we didn't fail, try without hasPhone and filter by phone client-side
      if (leads.length === 0 && leadsResult.status === 'fulfilled') {
        try {
          const fallback = await api.getLeads({ page: 1, limit: 100 });
          const fallbackData = Array.isArray((fallback as { data?: unknown[] })?.data)
            ? ((fallback as { data: Array<LeadBasic & { updatedAt?: string }> }).data)
            : Array.isArray(fallback)
              ? (fallback as Array<LeadBasic & { updatedAt?: string }>)
              : [];
          leads = fallbackData.filter((l) => l?.phone);
        } catch {
          // ignore
        }
      }

      // If no leads from leads API, use leads from WhatsApp conversations so we still show chats
      const leadIdsFromLeads = new Set(leads.map((l) => l.id));
      if (conversationsList.length > 0 && leads.length === 0) {
        leads = conversationsList.map((c) => ({
          id: c.lead.id,
          firstName: c.lead.firstName,
          lastName: c.lead.lastName,
          phone: c.lead.phone,
          status: undefined,
          stage: undefined,
          updatedAt: undefined,
        }));
      } else if (conversationsList.length > 0) {
        conversationsList.forEach((c) => {
          if (!leadIdsFromLeads.has(c.lead.id)) {
            leads.push({
              id: c.lead.id,
              firstName: c.lead.firstName,
              lastName: c.lead.lastName,
              phone: c.lead.phone,
              status: undefined,
              stage: undefined,
              updatedAt: undefined,
            });
          }
        });
      }

      const lastByLeadId = new Map(
        conversationsList.map((c) => [c.lead.id, c.lastMessage])
      );
      const leadToItem = (l: LeadBasic & { updatedAt?: string }) => ({
        lead: {
          id: l.id,
          firstName: l.firstName,
          lastName: l.lastName,
          phone: l.phone,
          status: l.status,
          stage: l.stage,
          updatedAt: l.updatedAt,
        },
        lastMessage: lastByLeadId.get(l.id),
      });
      const merged: ChatListItem[] = leads.map(leadToItem);
      merged.sort((a, b) => {
        const aAt = a.lastMessage?.createdAt || a.lead.updatedAt || '';
        const bAt = b.lastMessage?.createdAt || b.lead.updatedAt || '';
        return new Date(bAt).getTime() - new Date(aAt).getTime();
      });
      setAllChats(merged);
      setSelectedLeadId((current) => (current && merged.some((c) => c.lead.id === current) ? current : merged[0]?.lead.id ?? null));
    } catch {
      setAllChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateLead = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLeadError('');
    const phone = newLeadPhone.trim().replace(/\D/g, '');
    if (!phone) {
      setCreateLeadError('Phone number is required');
      return;
    }
    const firstName = newLeadFirstName.trim() || 'Unknown';
    const lastName = newLeadLastName.trim() || '—';
    setCreatingLead(true);
    try {
      const created = await api.createLead({
        firstName,
        lastName,
        phone: phone.startsWith('+') ? phone : `+${phone}`,
        source: 'WHATSAPP',
      });
      const lead: LeadBasic = {
        id: created.id,
        firstName: created.firstName ?? firstName,
        lastName: created.lastName ?? lastName,
        phone: created.phone ?? `+${phone}`,
        status: created.status,
        stage: created.stage,
      };
      setAllChats((prev) => [{ lead, lastMessage: undefined }, ...prev]);
      setNewLeadPhone('');
      setNewLeadFirstName('');
      setNewLeadLastName('');
      setShowCreateLead(false);
      setSelectedLeadId(lead.id);
      setSelectedPhoneOnly(null);
    } catch (err: unknown) {
      setCreateLeadError(err instanceof Error ? err.message : 'Failed to create lead');
    } finally {
      setCreatingLead(false);
    }
  }, [newLeadPhone, newLeadFirstName, newLeadLastName]);

  const startChatByNumber = useCallback(() => {
    const raw = newLeadPhone.trim().replace(/\D/g, '');
    if (!raw) return;
    const phone = raw.startsWith('+') ? raw : `+${raw}`;
    const existing = allChats.find((c) => c.lead.phone === phone || c.lead.phone?.replace(/\D/g, '') === raw);
    if (existing) {
      setSelectedLeadId(existing.lead.id);
      setSelectedPhoneOnly(null);
      setShowCreateLead(false);
      setNewLeadPhone('');
    } else {
      setSelectedLeadId(null);
      setSelectedPhoneOnly(phone);
      setShowCreateLead(false);
      setNewLeadPhone('');
    }
  }, [newLeadPhone, allChats]);

  const fetchMessages = useCallback(async (leadId: string | null) => {
    if (!leadId) {
      setCommunications([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    try {
      const raw = await api.getCommunications(leadId);
      let list: Communication[] = [];
      if (Array.isArray(raw)) list = raw;
      else if (raw && typeof raw === 'object') {
        const o = raw as { data?: unknown[]; communications?: unknown[] };
        if (Array.isArray(o.data)) list = o.data as Communication[];
        else if (Array.isArray(o.communications)) list = o.communications as Communication[];
      }
      const whatsappOnly = list.filter((c) => c && String(c.channel).toUpperCase() === 'WHATSAPP');
      whatsappOnly.sort((a: Communication, b: Communication) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setCommunications(whatsappOnly);
    } catch {
      setCommunications([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllChats();
  }, []);

  useEffect(() => {
    fetchMessages(selectedLeadId);
  }, [selectedLeadId, fetchMessages]);

  // Poll for new conversations and messages every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllChats();
      if (selectedLeadId) fetchMessages(selectedLeadId);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedLeadId, fetchAllChats, fetchMessages]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAllChats(), fetchMessages(selectedLeadId)]);
    setRefreshing(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadId || !messageText.trim() || sending) return;
    setSending(true);
    try {
      await api.sendWhatsApp({ leadId: selectedLeadId, body: messageText.trim() });
      setMessageText('');
      await Promise.all([fetchMessages(selectedLeadId), fetchAllChats()]);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary/30">
        <div className="animate-spin h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 rounded-xl border border-border-subtle overflow-hidden bg-[#e5ddd5] shadow-inner">
      {/* Conversation list - WhatsApp style */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-border-subtle">
        <div className="p-3 bg-[#f0f2f5] border-b border-border-subtle flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-text-primary">Chats</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowCreateLead((v) => !v)}
              className={`p-1.5 rounded-lg hover:bg-black/10 ${showCreateLead ? 'bg-black/10 text-brand-600' : 'text-text-tertiary'}`}
              title="Create lead and start chat"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1.5 rounded-lg hover:bg-black/10 text-text-tertiary disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {showCreateLead && (
          <div className="p-3 border-b border-border-subtle bg-surface-secondary/30">
            <form onSubmit={handleCreateLead} className="space-y-2">
              <input
                type="text"
                placeholder="First name *"
                value={newLeadFirstName}
                onChange={(e) => setNewLeadFirstName(e.target.value)}
                className="input text-sm w-full py-2"
              />
              <input
                type="text"
                placeholder="Last name"
                value={newLeadLastName}
                onChange={(e) => setNewLeadLastName(e.target.value)}
                className="input text-sm w-full py-2"
              />
              <input
                type="tel"
                placeholder="Phone number *"
                value={newLeadPhone}
                onChange={(e) => setNewLeadPhone(e.target.value)}
                className="input text-sm w-full py-2"
              />
              {createLeadError && (
                <p className="text-xs text-red-600">{createLeadError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateLead(false); setCreateLeadError(''); setSelectedPhoneOnly(null); }}
                  className="btn-secondary flex-1 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={startChatByNumber}
                  disabled={!newLeadPhone.trim()}
                  className="btn-secondary py-2 text-sm disabled:opacity-50"
                  title="Open chat with this number (create lead later)"
                >
                  Start chat
                </button>
                <button
                  type="submit"
                  disabled={creatingLead}
                  className="btn-primary flex-1 py-2 text-sm disabled:opacity-50"
                >
                  {creatingLead ? 'Creating…' : 'Create & chat'}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {allChats.length === 0 ? (
            <div className="p-4 text-center text-sm text-text-tertiary">
              No leads with phone numbers yet. Click + to create a lead and start a chat.
            </div>
          ) : (
            allChats.map(({ lead, lastMessage }) => {
              const isSelected = lead.id === selectedLeadId;
              const hasChat = !!lastMessage;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setSelectedPhoneOnly(null);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-[#f0f2f5]' : 'hover:bg-surface-secondary'
                  }`}
                >
                  <div className="h-12 w-12 rounded-full bg-[#25D366] flex items-center justify-center text-white font-semibold flex-shrink-0">
                    {(lead.firstName?.[0] || '?') + (lead.lastName?.[0] || '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {lead.firstName} {lead.lastName}
                    </p>
                    <p className="text-xs text-text-tertiary truncate">
                      {lastMessage?.body ? lastMessage.body.substring(0, 40) + (lastMessage.body.length > 40 ? '…' : '') : lead.phone || '—'}
                    </p>
                    {(lead.stage?.name || lead.status || hasChat) && (
                      <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-1">
                        {lead.stage?.name && (
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: lead.stage?.color || '#94a3b8' }}
                          />
                        )}
                        {lead.stage?.name || lead.status || ''}
                        {hasChat && (
                          <span className="text-[#25D366]">{lead.stage?.name || lead.status ? ' · Chat' : 'Chat'}</span>
                        )}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#e5ddd5] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><path fill=%22%23d9dbd5%22 fill-opacity=%220.4%22 d=%22M30 0L0 30L30 60L60 30z%22/></svg>')]">
        {!selectedLead && !selectedPhoneOnly ? (
          <div className="flex-1 flex items-center justify-center text-text-tertiary">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Select a chat</p>
              <p className="text-sm mt-1">Choose a lead from the list or use + to create a lead and start a chat</p>
            </div>
          </div>
        ) : selectedPhoneOnly ? (
          <>
            {/* Chat header: number only, no lead — show Create lead */}
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-[#f0f2f5] border-b border-border-subtle">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-[#25D366]/80 flex items-center justify-center text-white font-semibold text-sm">
                  <Phone className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">Unknown contact</p>
                  <p className="text-xs text-text-tertiary flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {selectedPhoneOnly}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateLead(true);
                  setNewLeadPhone(selectedPhoneOnly);
                }}
                className="btn-primary flex-shrink-0 py-2 px-4 text-sm"
              >
                Create lead
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center text-text-tertiary p-4">
              <div className="text-center max-w-xs">
                <p className="text-sm">No lead for this number yet.</p>
                <p className="text-xs mt-1">Click &quot;Create lead&quot; above to add them as a lead, then you can send messages.</p>
              </div>
            </div>
          </>
        ) : selectedLead ? (
          <>
            {/* Chat header: lead exists — show status */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-[#f0f2f5] border-b border-border-subtle">
              <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                {(selectedLead.firstName?.[0] || '?') + (selectedLead.lastName?.[0] || '')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text-primary truncate">
                  {selectedLead.firstName} {selectedLead.lastName}
                </p>
                <p className="text-xs text-text-tertiary flex items-center gap-1 truncate">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  {selectedLead.phone || 'No phone'}
                </p>
                {(selectedLead.stage?.name || selectedLead.status) && (
                  <p className="text-[11px] text-text-secondary mt-1 flex items-center gap-1.5">
                    {selectedLead.stage?.name && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium"
                        style={{ backgroundColor: (selectedLead.stage?.color || '#94a3b8') + '20', color: selectedLead.stage?.color || '#64748b' }}
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: selectedLead.stage?.color || '#94a3b8' }} />
                        {selectedLead.stage.name}
                      </span>
                    )}
                    {selectedLead.status && (
                      <span className="text-text-tertiary">{selectedLead.status}</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[200px]">
                  <div className="animate-spin h-8 w-8 border-2 border-[#25D366] border-t-transparent rounded-full" />
                  <p className="text-sm text-text-tertiary mt-3">Loading messages…</p>
                </div>
              ) : communications.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-center px-4">
                  <div className="rounded-full bg-[#25D366]/20 p-4 mb-3">
                    <MessageCircle className="h-10 w-10 text-[#25D366]" />
                  </div>
                  <p className="font-medium text-text-primary">No messages yet</p>
                  <p className="text-sm text-text-tertiary mt-1 max-w-xs">
                    Start the conversation — type your message below and send. The lead will receive it on WhatsApp.
                  </p>
                  <p className="text-xs text-text-tertiary mt-3">
                    Incoming messages from your business number will appear here automatically.
                  </p>
                </div>
              ) : (
                communications.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-lg shadow-sm ${
                        msg.direction === 'OUTBOUND'
                          ? 'bg-[#d9fdd3] rounded-tr-none'
                          : 'bg-white rounded-tl-none'
                      }`}
                    >
                      <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{msg.body}</p>
                      <p className={`text-[10px] mt-1 ${msg.direction === 'OUTBOUND' ? 'text-[#667781]' : 'text-text-tertiary'}`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Send box */}
            <form onSubmit={handleSend} className="flex-shrink-0 p-3 bg-[#f0f2f5] flex items-center gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message"
                className="flex-1 input bg-white border-border-subtle py-2.5 rounded-2xl text-sm"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="p-2.5 rounded-full bg-[#25D366] text-white hover:bg-[#20bd5a] disabled:opacity-50 disabled:pointer-events-none transition-colors"
                title="Send"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
