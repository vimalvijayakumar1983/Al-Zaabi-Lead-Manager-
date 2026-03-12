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

// ─── Helpers ─────────────────────────────────────────────────────

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
    notificationType === 'CAMPAIGN_BUDGET_ALERT'
  ) {
    return 'warning';
  }
  return 'info';
};

const playNotificationSound = () => {
  try {
    // A subtle, short notification chime encoded as a data URI
    // (a tiny sine-wave beep generated offline, ~0.15 s)
    const audio = new Audio(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJSMgHJkXGN0hJGZm5OHd2dfZHWGk5qZkYR0ZV9leIiUmpeTg3JjXmV5ipaampSEdGRfZnqKl5qYkYJxYl5me4uYmpeQgHBhXmd9jJmbl5B/b2BeaH6NmpuXj35uX15pf46bm5eOfW1fX2qAj5yblo17bF9gaoGQnJuVjHtrX2BrgpsA'
    );
    audio.volume = 0.3;
    audio.play().catch(() => {
      // Autoplay may be blocked — silently ignore
    });
  } catch {
    // Audio API not available (e.g., SSR) — ignore
  }
};

// ─── Store types ─────────────────────────────────────────────────

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isConnected: boolean;
  preferences: NotificationPreferences;

  // Notification actions
  fetchNotifications: (params?: NotificationFilters) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archiveNotification: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  // WebSocket
  connectWebSocket: (token: string) => void;
  disconnectWebSocket: () => void;

  // Toast
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  // Preferences
  fetchPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
}

// ─── Internal references (outside Zustand for WebSocket lifecycle) ─

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30_000; // 30 s

// ─── Store ───────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
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
  },

  toasts: [],

  // ── Fetch notifications ──────────────────────────────────────

  fetchNotifications: async (params) => {
    set({ isLoading: true });
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
      set({ notifications: response.data, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      set({ isLoading: false });
    }
  },

  // ── Unread count ─────────────────────────────────────────────

  fetchUnreadCount: async () => {
    try {
      const { count } = await api.getUnreadCount();
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  // ── Mark as read ─────────────────────────────────────────────

  markAsRead: async (id) => {
    try {
      await api.markNotificationRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  },

  // ── Mark all as read ─────────────────────────────────────────

  markAllAsRead: async () => {
    try {
      await api.markAllNotificationsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  },

  // ── Archive ──────────────────────────────────────────────────

  archiveNotification: async (id) => {
    try {
      await api.archiveNotification(id);
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    } catch (error) {
      console.error('Failed to archive notification:', error);
    }
  },

  // ── Delete ───────────────────────────────────────────────────

  deleteNotification: async (id) => {
    try {
      await api.deleteNotification(id);
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount:
            notification && !notification.isRead
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
        };
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  // ── WebSocket ────────────────────────────────────────────────

  connectWebSocket: (token) => {
    // Tear down any existing connection first
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
          const data = JSON.parse(event.data as string) as {
            type: string;
            notification: AppNotification;
          };

          if (data.type === 'notification') {
            // Prepend the new notification
            set((state) => ({
              notifications: [data.notification, ...state.notifications],
              unreadCount: state.unreadCount + 1,
            }));

            // Show a toast for real-time notifications
            get().addToast({
              type: getToastType(data.notification.type),
              title: data.notification.title,
              message: data.notification.message,
              duration: 5000,
              entityType: data.notification.entityType,
              entityId: data.notification.entityId,
            });

            // Play sound if preference enabled
            if (get().preferences.soundEnabled !== false) {
              playNotificationSound();
            }
          }
        } catch {
          // Malformed message — ignore
        }
      };

      ws.onclose = () => {
        set({ isConnected: false });

        // Reconnect with exponential back-off
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts),
          MAX_RECONNECT_DELAY
        );
        reconnectAttempts += 1;

        reconnectTimer = setTimeout(() => {
          // Only reconnect if disconnectWebSocket wasn't called
          if (ws !== null) {
            connect();
          }
        }, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror — reconnection is handled there
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
      // Remove onclose handler so it doesn't trigger reconnect
      ws.onclose = null;
      ws.close();
      ws = null;
    }
    reconnectAttempts = 0;
    set({ isConnected: false });
  },

  // ── Toast management ─────────────────────────────────────────

  addToast: (toast) => {
    const id = crypto.randomUUID();
    const duration = toast.duration || 5000;

    set((state) => {
      const newToasts = [...state.toasts, { ...toast, id }];
      // Keep at most 5 visible — drop the oldest if we exceed
      return { toasts: newToasts.length > 5 ? newToasts.slice(-5) : newToasts };
    });

    // Auto-remove after duration
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  // ── Preferences ──────────────────────────────────────────────

  fetchPreferences: async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      set({ preferences: prefs });
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    }
  },

  updatePreferences: async (prefs) => {
    try {
      const updated = await api.updateNotificationPreferences(prefs);
      set({ preferences: updated });
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
    }
  },
}));
