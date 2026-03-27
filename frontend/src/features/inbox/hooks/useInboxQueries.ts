'use client';

import { useCallback, useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export const INBOX_THREAD_LIMIT = 50;

/** Infinite query: pages[0] = API page 1 (newest chunk); append newest messages here. */
const NEWEST_PAGE_IDX = 0;

/** Merge API send response into the infinite thread cache (replace optimistic temp id or append). */
export function patchInboxThreadAfterOutbound(
  queryClient: QueryClient,
  leadId: string,
  threadParams: Record<string, unknown>,
  opts: { tempId?: string; message: Record<string, unknown> }
) {
  const key = queryKeys.inbox.messagesThread(leadId, threadParams);
  const { tempId, message: serverMsg } = opts;

  queryClient.setQueryData(key, (old: unknown) => {
    const o = old as {
      pages: Array<{ messages?: Record<string, unknown>[] }>;
      pageParams: unknown[];
    } | null;
    if (!o?.pages?.length) {
      return {
        pages: [
          {
            messages: [serverMsg],
            lead: null,
            pagination: { page: 1, totalPages: 1, hasMore: false },
          },
        ],
        pageParams: [1],
      };
    }

    const pages = o.pages.map((page, idx) => {
      if (idx !== NEWEST_PAGE_IDX) return page;
      const msgs = [...(page.messages || [])];
      const id = String(serverMsg.id ?? '');

      if (tempId) {
        const t = msgs.findIndex((m) => String(m.id) === tempId);
        if (t >= 0) {
          msgs[t] = serverMsg;
          // If WS already inserted the same server message id, keep only one instance.
          if (id) {
            const firstServerIdx = msgs.findIndex((m) => String(m.id) === id);
            if (firstServerIdx >= 0) {
              const deduped: Record<string, unknown>[] = [];
              let seen = false;
              for (let i = 0; i < msgs.length; i++) {
                const mid = String(msgs[i].id ?? '');
                if (mid === id) {
                  if (!seen) {
                    deduped.push(msgs[i]);
                    seen = true;
                  }
                } else {
                  deduped.push(msgs[i]);
                }
              }
              return { ...page, messages: deduped };
            }
          }
          return { ...page, messages: msgs };
        }
      }

      if (id && !msgs.some((m) => String(m.id) === id)) {
        msgs.push(serverMsg);
      }
      return { ...page, messages: msgs };
    });

    return { ...o, pages };
  });
}

/** WebSocket: upsert a communication into every matching thread cache for this lead (merge by id, else append on newest page). */
export function upsertCommunicationInThreadCaches(
  queryClient: QueryClient,
  leadId: string,
  message: Record<string, unknown>
) {
  const mid = message.id != null ? String(message.id) : '';
  if (!mid) return;

  queryClient.setQueriesData(
    {
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === 'inbox' &&
        q.queryKey[1] === 'messages' &&
        q.queryKey[2] === leadId &&
        q.queryKey[3] === 'thread',
    },
    (old: unknown) => {
      const o = old as {
        pages: Array<{ messages?: Record<string, unknown>[] }>;
        pageParams: unknown[];
      } | null;
      if (!o?.pages?.length) {
        return {
          pages: [
            {
              messages: [message],
              lead: null,
              pagination: { page: 1, totalPages: 1, hasMore: false },
            },
          ],
          pageParams: [1],
        };
      }

      let found = false;
      const pages = o.pages.map((page) => {
        const msgs = (page.messages || []).map((m) => {
          if (String(m.id) === mid) {
            found = true;
            return { ...m, ...message };
          }
          return m;
        });
        return { ...page, messages: msgs };
      });

      if (!found) {
        const p0 = pages[NEWEST_PAGE_IDX];
        const msgs = [...(p0.messages || [])];
        if (!msgs.some((m) => String(m.id) === mid)) {
          // Reconcile optimistic outbound row to avoid transient duplicate bubble.
          const isOutbound = String(message.direction || '').toUpperCase() === 'OUTBOUND';
          const incomingChannel = String(message.channel || '').toUpperCase();
          const incomingPlatform = String((message.platform || '')).toUpperCase();
          const incomingBody = String(message.body || '').trim();
          const incomingCreatedAt = Date.parse(String(message.createdAt || '')) || Date.now();

          if (isOutbound) {
            const optimisticIdx = msgs.findIndex((m) => {
              if (!m || !m._optimistic) return false;
              if (String(m.direction || '').toUpperCase() !== 'OUTBOUND') return false;
              if (String(m.channel || '').toUpperCase() !== incomingChannel) return false;
              if (String((m.platform || '')).toUpperCase() !== incomingPlatform) return false;

              const msgCreatedAt = Date.parse(String(m.createdAt || '')) || 0;
              const withinRecentWindow = Math.abs(incomingCreatedAt - msgCreatedAt) <= 20_000;
              if (!withinRecentWindow) return false;

              const tempBody = String(m.body || '').trim();
              const bodyMatches =
                tempBody === incomingBody ||
                (tempBody === '(no text)' && incomingBody === '') ||
                (tempBody === '' && incomingBody === '(no text)');

              if (bodyMatches) return true;

              // Attachment/voice sends may normalize body differently; use attachment presence as fallback.
              const tempHasAttachments = Array.isArray((m.metadata as any)?.attachments) && (m.metadata as any).attachments.length > 0;
              const incomingHasAttachments =
                Array.isArray((message.metadata as any)?.attachments) &&
                (message.metadata as any).attachments.length > 0;
              return tempHasAttachments && incomingHasAttachments;
            });

            if (optimisticIdx >= 0) {
              msgs[optimisticIdx] = message;
            } else {
              msgs.push(message);
            }
          } else {
            msgs.push(message);
          }
        }
        pages[NEWEST_PAGE_IDX] = { ...p0, messages: msgs };
      }

      return { ...o, pages };
    }
  );
}

export function useInboxConversationsQuery(params?: {
  channel?: string;
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  divisionId?: string;
}) {
  return useQuery({
    queryKey: queryKeys.inbox.conversations(params),
    queryFn: () => api.getInboxConversations(params),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useInboxMessagesQuery(
  leadId: string | null,
  params?: { channel?: string; page?: number; limit?: number; divisionId?: string },
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: queryKeys.inbox.messages(leadId || 'none', params),
    queryFn: () => api.getInboxMessages(leadId!, params),
    enabled: !!leadId,
    staleTime: 10_000,
    gcTime: 10 * 60_000,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

/** Latest chunk is page 1; fetchNextPage loads older history. */
export function useInboxThreadQuery(
  leadId: string | null,
  params?: { channel?: string; divisionId?: string },
  options?: { refetchInterval?: number | false }
) {
  const threadParams = useMemo(
    () => ({ ...params, limit: INBOX_THREAD_LIMIT }),
    [params?.channel, params?.divisionId]
  );

  return useInfiniteQuery({
    queryKey: queryKeys.inbox.messagesThread(leadId || 'none', threadParams),
    queryFn: ({ pageParam }) =>
      api.getInboxMessages(leadId!, {
        channel: params?.channel,
        divisionId: params?.divisionId,
        page: pageParam,
        limit: INBOX_THREAD_LIMIT,
      }),
    enabled: !!leadId,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const p = lastPage?.pagination;
      if (!p) return undefined;
      if (typeof p.hasMore === 'boolean') return p.hasMore ? p.page + 1 : undefined;
      return p.page < p.totalPages ? p.page + 1 : undefined;
    },
    staleTime: 10_000,
    gcTime: 10 * 60_000,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useInboxNotesQuery(leadId: string | null) {
  return useQuery({
    queryKey: queryKeys.inbox.notes(leadId || 'none'),
    queryFn: () => api.getInternalNotes(leadId!),
    enabled: !!leadId,
  });
}

export function useInboxAttachmentsQuery(leadId: string | null) {
  return useQuery({
    queryKey: queryKeys.inbox.attachments(leadId || 'none'),
    queryFn: () => api.getLeadAttachments(leadId!),
    enabled: !!leadId,
  });
}

export function useInboxStatsQuery(divisionId?: string | null) {
  return useQuery({
    queryKey: queryKeys.inbox.stats(divisionId),
    queryFn: () => api.getInboxStats(divisionId || undefined),
    staleTime: 60_000,
  });
}

export function useInboxBootstrapQuery() {
  const cannedResponses = useQuery({
    queryKey: queryKeys.inbox.cannedResponses,
    queryFn: () => api.getCannedResponses(),
    staleTime: 60_000,
  });

  const pipelineStages = useQuery({
    queryKey: queryKeys.inbox.pipelineStages,
    queryFn: () => api.getPipelineStages(),
    staleTime: 60_000,
  });

  return useMemo(
    () => ({
      cannedResponses,
      pipelineStages,
    }),
    [cannedResponses, pipelineStages]
  );
}

export function useInboxRealtimeInvalidation(selectedLeadId: string | null) {
  const queryClient = useQueryClient();

  const invalidateConversations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot }),
    [queryClient]
  );

  const invalidateStats = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] }),
    [queryClient]
  );

  const invalidateMessagesForLead = useCallback(
    (leadId: string) => {
      queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === 'inbox' &&
          q.queryKey[1] === 'messages' &&
          q.queryKey[2] === leadId &&
          q.queryKey[3] === 'thread',
      });
    },
    [queryClient]
  );

  const invalidateMessagesForSelected = useCallback(
    (entityId?: string) => {
      if (!selectedLeadId) return;
      if (entityId && entityId !== selectedLeadId) return;
      invalidateMessagesForLead(selectedLeadId);
    },
    [invalidateMessagesForLead, selectedLeadId]
  );

  const invalidateNotesForSelected = useCallback(
    (entityId?: string) => {
      if (!selectedLeadId) return;
      if (entityId && entityId !== selectedLeadId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.notes(selectedLeadId) });
    },
    [queryClient, selectedLeadId]
  );

  const invalidateAttachmentsForSelected = useCallback(
    (entityId?: string) => {
      if (!selectedLeadId) return;
      if (entityId && entityId !== selectedLeadId) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.attachments(selectedLeadId) });
    },
    [queryClient, selectedLeadId]
  );

  /** WebSocket `data_changed`: merge message payload when present; otherwise refetch thread. */
  const onCommunicationChanged = useCallback(
    (event: { entityId?: string; message?: Record<string, unknown> } | undefined) => {
      const entityId = event?.entityId;
      const msg = event?.message;
      invalidateConversations();
      invalidateStats();
      if (entityId && msg && typeof msg === 'object' && msg.id != null) {
        upsertCommunicationInThreadCaches(queryClient, entityId, msg);
      } else if (entityId) {
        invalidateMessagesForLead(entityId);
      } else if (selectedLeadId) {
        invalidateMessagesForLead(selectedLeadId);
      }
      if (entityId && selectedLeadId === entityId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox.notes(entityId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox.attachments(entityId) });
      }
    },
    [
      invalidateConversations,
      invalidateMessagesForLead,
      invalidateStats,
      queryClient,
      selectedLeadId,
    ]
  );

  const onLeadChanged = useCallback(
    (entityId?: string) => {
      invalidateConversations();
      invalidateStats();
      if (entityId) {
        invalidateMessagesForLead(entityId);
      } else if (selectedLeadId) {
        invalidateMessagesForLead(selectedLeadId);
      }
    },
    [invalidateConversations, invalidateMessagesForLead, invalidateStats, selectedLeadId]
  );

  return {
    invalidateConversations,
    invalidateStats,
    invalidateMessagesForLead,
    invalidateMessagesForSelected,
    invalidateNotesForSelected,
    invalidateAttachmentsForSelected,
    onCommunicationChanged,
    onLeadChanged,
  };
}

export function useInboxMessageMutations(selectedLeadId: string | null) {
  const queryClient = useQueryClient();

  const refreshInboxLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] }),
    ]);
  };

  const refreshAllInbox = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] }),
      selectedLeadId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.inbox.messagesRoot,
            predicate: (q) =>
              Array.isArray(q.queryKey) &&
              q.queryKey[2] === selectedLeadId &&
              q.queryKey[3] === 'thread',
          })
        : Promise.resolve(),
    ]);
  };

  const sendMessage = useMutation({
    mutationFn: api.sendInboxMessage.bind(api),
    onSuccess: refreshInboxLists,
  });

  const sendMessageWithAttachments = useMutation({
    mutationFn: api.sendInboxMessageWithAttachments.bind(api),
    onSuccess: refreshInboxLists,
  });

  const editMessage = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) => api.editInboxMessage(messageId, body),
    onSuccess: async (data) => {
      await refreshInboxLists();
      if (selectedLeadId && data && typeof data === 'object' && data.id != null) {
        upsertCommunicationInThreadCaches(queryClient, selectedLeadId, data as Record<string, unknown>);
      }
    },
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) => api.deleteInboxMessage(messageId),
    onSuccess: async (data) => {
      await refreshInboxLists();
      const comm = data && typeof data === 'object' ? (data as { communication?: Record<string, unknown> }).communication : undefined;
      if (selectedLeadId && comm?.id != null) {
        upsertCommunicationInThreadCaches(queryClient, selectedLeadId, comm);
      }
    },
  });

  const retryWhatsAppMessage = useMutation({
    mutationFn: (messageId: string) => api.retryInboxWhatsAppMessage(messageId),
    onSuccess: async (data) => {
      await refreshInboxLists();
      if (selectedLeadId && data && typeof data === 'object' && (data as Record<string, unknown>).id != null) {
        upsertCommunicationInThreadCaches(queryClient, selectedLeadId, data as Record<string, unknown>);
      }
    },
  });

  const addNote = useMutation({
    mutationFn: ({ leadId, body }: { leadId: string; body: string }) => api.addInternalNote(leadId, body),
    onSuccess: async () => {
      await refreshAllInbox();
      if (selectedLeadId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.inbox.notes(selectedLeadId) });
      }
    },
  });

  const markRead = useMutation({
    mutationFn: (leadId: string) => api.markConversationRead(leadId),
    onSuccess: refreshAllInbox,
  });

  return { sendMessage, sendMessageWithAttachments, editMessage, deleteMessage, retryWhatsAppMessage, addNote, markRead };
}

