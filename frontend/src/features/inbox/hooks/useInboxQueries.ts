'use client';

import { useCallback, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

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
          q.queryKey[2] === leadId,
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

  /** WebSocket `data_changed`: refresh lists + thread for the affected lead. */
  const onCommunicationChanged = useCallback(
    (entityId?: string) => {
      invalidateConversations();
      invalidateStats();
      if (entityId) {
        invalidateMessagesForLead(entityId);
        if (selectedLeadId === entityId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.inbox.notes(entityId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.inbox.attachments(entityId) });
        }
      } else if (selectedLeadId) {
        invalidateMessagesForLead(selectedLeadId);
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

  const refreshAllInbox = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.conversationsRoot }),
      queryClient.invalidateQueries({ queryKey: ['inbox', 'stats'] }),
      selectedLeadId
        ? queryClient.invalidateQueries({
            queryKey: queryKeys.inbox.messagesRoot,
            predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[2] === selectedLeadId,
          })
        : Promise.resolve(),
    ]);
  };

  const sendMessage = useMutation({
    mutationFn: api.sendInboxMessage.bind(api),
    onSuccess: refreshAllInbox,
  });

  const sendMessageWithAttachments = useMutation({
    mutationFn: api.sendInboxMessageWithAttachments.bind(api),
    onSuccess: refreshAllInbox,
  });

  const editMessage = useMutation({
    mutationFn: ({ messageId, body }: { messageId: string; body: string }) => api.editInboxMessage(messageId, body),
    onSuccess: refreshAllInbox,
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) => api.deleteInboxMessage(messageId),
    onSuccess: refreshAllInbox,
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

  return { sendMessage, sendMessageWithAttachments, editMessage, deleteMessage, addNote, markRead };
}

