'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';
import type {
  AppNotification,
  NotificationFilters,
  NotificationPreferences,
  NotificationType,
  Toast,
} from '@/types';

const getToastType = (notificationType: NotificationType): Toast['type'] => {
  if (
    notificationType === 'LEAD_WON' ||
    notificationType === 'TASK_COMPLETED' ||
    notificationType === 'CAMPAIGN_COMPLETED' ||
    notificationType === 'INTEGRATION_CONNECTED' ||
    notificationType === 'IMPORT_COMPLETED'
  ) {
    return 'success';
  }
  if (
    notificationType === 'LEAD_LOST' ||
    notificationType === 'INTEGRATION_ERROR' ||
    notificationType === 'IMPORT_FAILED' ||
    notificationType === 'AUTOMATION_ERROR' ||
    notificationType === 'TEAM_MEMBER_DEACTIVATED'
  ) {
    return 'error';
  }
  if (
    notificationType === 'TASK_OVERDUE' ||
    notificationType === 'TASK_DUE_SOON' ||
    notificationType === 'TASK_REMINDER' ||
    notificationType === 'CAMPAIGN_BUDGET_ALERT' ||
    notificationType === 'CALLBACK_REMINDER' ||
    notificationType === 'CALLBACK_REMINDER_HANDOFF' ||
    notificationType === 'NOTIFICATION_ESCALATED'
  ) {
    return 'warning';
  }
  return 'info';
};

const playNotificationSound = () => {
  try {
    const audio = new Audio(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSMgHJkXGN0hJGZm5OHd2dfZHWGk5qZkYR0ZV9leIiUmpeTg3JjXmV5ipaampSEdGRfZnqKl5qYkYJxYl5me4uYmpeQgHBhXmd9jJmbl5B/b2BeaH6NmpuXj35uX15pf46bm5eOfW1fX2qAj5yblo17bF9gaoGQnJuVjHtrX2BrgpsA'
    );
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch {
    // ignore audio errors
  }
};

type DataChangeHandler = (event: { entity: string; action: string; entityId?: string }) => void;
type NotificationAction = 'MARK_DONE' | 'SNOOZE' | 'ESCALATE';

interface NotificationPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  pagination: NotificationPagination;
  isLoading: boolean;
  isConnected: boolean;
  preferences: NotificationPreferences;
  fetchNotifications: (params?: NotificationFilters) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  notificationAction: (id: string, action: NotificationAction, minutes?: number) => Promise<any>;
  snoozeNotification: (id: string, minutes?: number) => Promise<any>;
  escalateNotification: (id: string) => Promise<any>;
  connectWebSocket: (token: string) => void;
  disconnectWebSocket: () => void;
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  subscribeDataChange: (handler: DataChangeHandler) => void;
  unsubscribeDataChange: (handler: DataChangeHandler) => void;
  dispatchDataChange: (event: { entity: string; action: string; entityId?: string }) => void;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30_000;
const dataChangeListeners = new Set<DataChangeHandler>();

const DEFAULT_PAGINATION: NotificationPagination = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrev: false,
};

function mergeUniqueNotifications(existing: AppNotification[], incoming: AppNotification[]) {
  const map = new Map<string, AppNotification>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  pagination: DEFAULT_PAGINATION,
  isLoading: false,
  isConnected: false,
  preferences: {
    soundEnabled: true,
    desktopEnabled: false,
    emailEnabled: true,
    leads: true,
    tasks: true,
    campaigns: true,
    integrations: true,
    team: true,
    system: true,
    emailNewLead: true,
    emailLeadAssigned: true,
    emailTaskDue: true,
    emailWeeklyDigest: true,
    inAppNewLead: true,
    inAppLeadAssigned: true,
    inAppTaskDue: true,
    inAppStatusChange: true,
    escalationEnabled: true,
    digestEnabled: true,
  },
  toasts: [],

  fetchNotifications: async (params) => {
    const requestedPage = params?.page || 1;
    set({ isLoading: requestedPage === 1 });
    try {
      const queryParams: Record<string, string | number> = {};
      if (params?.type) queryParams.type = params.type;
      if (params?.isRead !== undefined) queryParams.isRead = String(params.isRead);
      if (params?.entityType) queryParams.entityType = params.entityType;
      if (params?.page) queryParams.page = params.page;
      if (params?.limit) queryParams.limit = params.limit;

      const response = await api.getNotifications(
        Object.keys(queryParams).length > 0 ? queryParams : undefined
      );

      set((state) => {
        const append = requestedPage > 1;
        return {
          notifications: append
            ? mergeUniqueNotifications(state.notifications, response.data)
            : response.data,
          pagination: response.pagination || DEFAULT_PAGINATION,
          isLoading: false,
        };
      });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const { count } = await api.getUnreadCount();
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  markAsRead: async (id) => {
    try {
      const response = await api.markNotificationRead(id) as any;
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount:
          typeof response.unreadCount === 'number'
            ? response.unreadCount
            : Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  markAllAsRead: async () => {
    try {
      const response = await api.markAllNotificationsRead() as any;
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount:
          typeof response.unreadCount === 'number'
            ? response.unreadCount
            : 0,
      }));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  },

  archiveNotification: async (id) => {
    try {
      const response = await api.archiveNotification(id) as any;
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount:
          typeof response.unreadCount === 'number'
            ? response.unreadCount
            : state.unreadCount,
      }));
    } catch (error) {
      console.error('Failed to archive notification:', error);
    }
  },

  deleteNotification: async (id) => {
    try {
      const response = await api.deleteNotification(id) as any;
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount:
            typeof response.unreadCount === 'number'
              ? response.unreadCount
              : notification && !notification.isRead
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
        };
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  notificationAction: async (id, action, minutes) => {
    const response = await api.notificationAction(id, action, minutes);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? response.notification || n : n)),
      unreadCount:
        typeof response.unreadCount === 'number'
          ? response.unreadCount
          : state.unreadCount,
    }));
    return response;
  },

  snoozeNotification: async (id, minutes = 15) => {
    const response = await api.snoozeNotification(id, minutes);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? response.notification || n : n)),
      unreadCount:
        typeof response.unreadCount === 'number'
          ? response.unreadCount
          : state.unreadCount,
    }));
    return response;
  },

  escalateNotification: async (id) => {
    const response = await api.escalateNotification(id);
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? response.notification || n : n)),
      unreadCount:
        typeof response.unreadCount === 'number'
          ? response.unreadCount
          : state.unreadCount,
    }));
    return response;
  },

  connectWebSocket: (token) => {
    get().disconnectWebSocket();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const wsUrl =
      apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '') +
      '/ws?token=' +
      encodeURIComponent(token);

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        set({ isConnected: true });
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as Record<string, any>;

          if (data.type === 'notification') {
            const notification = data.notification as AppNotification;
            set((state) => {
              const existing = state.notifications.find((n) => n.id === notification.id);
              const notifications = existing
                ? state.notifications.map((n) => (n.id === notification.id ? { ...n, ...notification } : n))
                : [notification, ...state.notifications];
              const unreadCount = (() => {
                if (!existing) {
                  return !notification.isRead ? state.unreadCount + 1 : state.unreadCount;
                }
                if (existing.isRead && !notification.isRead) return state.unreadCount + 1;
                if (!existing.isRead && notification.isRead) return Math.max(0, state.unreadCount - 1);
                return state.unreadCount;
              })();
              return { notifications, unreadCount };
            });

            const isUrgentReminder =
              notification.type === 'CALLBACK_REMINDER' ||
              notification.type === 'CALLBACK_REMINDER_HANDOFF' ||
              notification.type === 'TASK_REMINDER' ||
              notification.type === 'NOTIFICATION_ESCALATED';
            get().addToast({
              type: getToastType(notification.type),
              title: notification.title,
              message: notification.message,
              duration: isUrgentReminder ? 15000 : 5000,
              entityType: notification.entityType,
              entityId: notification.entityId,
            });

            if (get().preferences.soundEnabled !== false) {
              playNotificationSound();
            }
          }

          if (data.type === 'notification_updated') {
            const notification = data.notification as AppNotification;
            set((state) => ({
              notifications: state.notifications.map((n) =>
                n.id === notification.id ? { ...n, ...notification } : n
              ),
            }));
          }

          if (data.type === 'data_changed') {
            const changeEvent = {
              entity: data.entity as string,
              action: data.action as string,
              entityId: data.entityId as string | undefined,
            };
            dataChangeListeners.forEach((handler) => {
              try {
                handler(changeEvent);
              } catch {
                // ignore single subscriber failures
              }
            });
          }
        } catch {
          // ignore malformed ws payloads
        }
      };

      ws.onclose = () => {
        set({ isConnected: false });
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(() => {
          if (ws !== null) connect();
        }, delay);
      };

      ws.onerror = () => {
        // reconnect handled by onclose
      };
    };

    connect();
  },

  disconnectWebSocket: () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    reconnectAttempts = 0;
    set({ isConnected: false });
  },

  addToast: (toast) => {
    const id = crypto.randomUUID();
    const duration = toast.duration || 5000;

    set((state) => {
      const next = [...state.toasts, { ...toast, id }];
      return { toasts: next.length > 5 ? next.slice(-5) : next };
    });

    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  subscribeDataChange: (handler) => {
    dataChangeListeners.add(handler);
  },

  unsubscribeDataChange: (handler) => {
    dataChangeListeners.delete(handler);
  },

  dispatchDataChange: (event) => {
    dataChangeListeners.forEach((handler) => {
      try {
        handler(event);
      } catch {
        // ignore single subscriber failures
      }
    });
  },

  fetchPreferences: async () => {
    try {
      const prefs = await api.getNotificationPrefs();
      set({ preferences: prefs });
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    }
  },

  updatePreferences: async (prefs) => {
    try {
      const updated = await api.updateNotificationPrefs(prefs);
      set({ preferences: updated });
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
    }
  },
}));
