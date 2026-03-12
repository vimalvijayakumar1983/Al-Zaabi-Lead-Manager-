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
    // 1. Disconnect WebSocket first (prevents reconnect attempts with null token)
    try {
      useNotificationStore.getState().disconnectWebSocket();
    } catch {
      // Ignore errors during cleanup
    }

    // 2. Clear auth token
    api.setToken(null);

    // 3. Clear all stored session data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('organization');
      localStorage.removeItem('divisions');
      localStorage.removeItem('activeDivisionId');
    }

    // 4. Clear Zustand state
    set({ user: null, isAuthenticated: false });

    // 5. Hard redirect to login (avoids race conditions with soft navigation)
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
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
