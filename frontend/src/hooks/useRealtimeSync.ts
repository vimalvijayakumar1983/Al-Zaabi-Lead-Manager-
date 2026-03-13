'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/store/notificationStore';

/**
 * Hook that triggers a callback when a data_changed event is received
 * for the specified entity types. Use this in list pages so they
 * auto-refresh when another user makes a change.
 *
 * @param entities - Entity types to listen for (e.g. ['lead', 'contact'])
 * @param onDataChanged - Callback to invoke (typically a refetch function)
 */
export function useRealtimeSync(
  entities: string[],
  onDataChanged: (event: { entity: string; action: string; entityId?: string }) => void,
) {
  const subscribe = useNotificationStore((s) => s.subscribeDataChange);
  const unsubscribe = useNotificationStore((s) => s.unsubscribeDataChange);

  useEffect(() => {
    const handler = (event: { entity: string; action: string; entityId?: string }) => {
      if (entities.includes(event.entity)) {
        onDataChanged(event);
      }
    };

    subscribe(handler);
    return () => unsubscribe(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, unsubscribe, ...entities]);
}
