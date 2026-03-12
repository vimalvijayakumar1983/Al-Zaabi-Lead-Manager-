import { create } from 'zustand';
import { api } from './api';

export const FEATURES = [
  { key: 'dashboard', label: 'Dashboard', section: 'Navigation' },
  { key: 'leads', label: 'Leads', section: 'Navigation' },
  { key: 'pipeline', label: 'Pipeline', section: 'Navigation' },
  { key: 'tasks', label: 'Tasks', section: 'Navigation' },
  { key: 'analytics', label: 'Analytics', section: 'Navigation' },
  { key: 'automations', label: 'Automations', section: 'Navigation' },
  { key: 'campaigns', label: 'Campaigns', section: 'Navigation' },
  { key: 'team', label: 'Team Management', section: 'Management' },
  { key: 'settings', label: 'Organization Settings', section: 'Management' },
  { key: 'invite', label: 'Invite Users', section: 'Management' },
  { key: 'divisions', label: 'Division Management', section: 'Management' },
  { key: 'deleteData', label: 'Delete Data', section: 'Destructive' },
  { key: 'exportData', label: 'Export Data', section: 'Data' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  SUPER_ADMIN: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: true, invite: true, divisions: true, deleteData: true, exportData: true },
  ADMIN: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: true, invite: true, divisions: false, deleteData: true, exportData: true },
  MANAGER: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: true, automations: true, campaigns: true, team: true, settings: false, invite: true, divisions: false, deleteData: false, exportData: true },
  SALES_REP: { dashboard: true, leads: true, pipeline: true, tasks: true, analytics: false, automations: false, campaigns: false, team: false, settings: false, invite: false, divisions: false, deleteData: false, exportData: false },
  VIEWER: { dashboard: true, leads: true, pipeline: true, tasks: false, analytics: true, automations: false, campaigns: false, team: false, settings: false, invite: false, divisions: false, deleteData: false, exportData: false },
};

interface PermissionsState {
  rolePermissions: Record<string, Record<string, boolean>>;
  userOverrides: Record<string, Record<string, boolean>>;
  loaded: boolean;
  loadPermissions: () => Promise<void>;
  hasPermission: (userId: string, role: string, feature: string) => boolean;
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  rolePermissions: DEFAULT_PERMISSIONS,
  userOverrides: {},
  loaded: false,

  loadPermissions: async () => {
    try {
      const data = await api.getPermissions();
      set({
        rolePermissions: data.rolePermissions || DEFAULT_PERMISSIONS,
        userOverrides: data.userOverrides || {},
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  hasPermission: (userId: string, role: string, feature: string) => {
    const { rolePermissions, userOverrides } = get();
    // User-level override takes priority
    const userPerms = userOverrides[userId];
    if (userPerms && typeof userPerms[feature] === 'boolean') {
      return userPerms[feature];
    }
    // Fall back to role-level permissions
    const rolePerms = rolePermissions[role];
    if (rolePerms && typeof rolePerms[feature] === 'boolean') {
      return rolePerms[feature];
    }
    // Fall back to defaults
    const defaults = DEFAULT_PERMISSIONS[role];
    return defaults?.[feature] ?? false;
  },
}));
