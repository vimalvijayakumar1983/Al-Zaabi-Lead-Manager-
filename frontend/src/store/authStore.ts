import { create } from 'zustand';
import { api } from '@/lib/api';
import { usePermissionsStore } from '@/lib/permissions';
import { useNotificationStore } from '@/store/notificationStore';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; organizationName: string }) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const response = await api.login(email, password);
    const { token, user } = response;
    api.setToken(token);
    // Set isLoading:false here so the dashboard layout doesn't stay in loading state
    set({ user, isAuthenticated: true, isLoading: false });
    // Load permissions in background (fire-and-forget with error handling)
    usePermissionsStore.getState().loadPermissions().catch(() => {});
    return response;
  },

  register: async (data) => {
    const { token, user } = await api.register(data);
    api.setToken(token);
    set({ user, isAuthenticated: true, isLoading: false });
    usePermissionsStore.getState().loadPermissions().catch(() => {});
  },

  logout: () => {
    // 1. Set logging-out flag FIRST to prevent 401 handler and layout
    //    useEffect from doing competing redirects
    if (typeof window !== 'undefined') {
      (window as any).__loggingOut = true;
    }

    // 2. Disconnect WebSocket first (prevents reconnect attempts with null token)
    try {
      useNotificationStore.getState().disconnectWebSocket();
    } catch {
      // Ignore errors during cleanup
    }

    // 3. Clear auth token
    api.setToken(null);

    // 4. Clear all stored session data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('organization');
      localStorage.removeItem('divisions');
      localStorage.removeItem('activeDivisionId');
    }

    // 5. Hard redirect BEFORE clearing Zustand state.
    //    This prevents React from re-rendering with isAuthenticated=false
    //    (which used to cause hooks-order crashes before the layout fix).
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }

    // 6. Clear Zustand state (for non-browser / SSR contexts)
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const token = api.getToken();
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.getMe();
      set({ user, isAuthenticated: true, isLoading: false });
      usePermissionsStore.getState().loadPermissions().catch(() => {});
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
