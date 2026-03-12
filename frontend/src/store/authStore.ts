import { create } from 'zustand';
import { api } from '@/lib/api';
import { usePermissionsStore } from '@/lib/permissions';
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
    set({ user, isAuthenticated: true });
    usePermissionsStore.getState().loadPermissions();
    return response;
  },

  register: async (data) => {
    const { token, user } = await api.register(data);
    api.setToken(token);
    set({ user, isAuthenticated: true });
    usePermissionsStore.getState().loadPermissions();
  },

  logout: () => {
    api.setToken(null);
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
      usePermissionsStore.getState().loadPermissions();
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
