import { create } from 'zustand';
import { api } from './api';

export const FEATURES = [
  { key: 'dashboard', label: 'Dashboard', section: 'Navigation' },
  { key: 'leads', label: 'Leads', section: 'Navigation' },
  { key: 'contacts', label: 'Contacts', section: 'Navigation' },
  { key: 'inbox', label: 'Inbox', section: 'Navigation' },
  { key: 'pipeline', label: 'Pipeline', section: 'Navigation' },
  { key: 'tasks', label: 'Tasks', section: 'Navigation' },
  { key: 'analytics', label: 'Analytics', section: 'Navigation' },
  { key: 'reports', label: 'Report Builder', section: 'Navigation' },
  { key: 'automations', label: 'Automations', section: 'Navigation' },
  { key: 'campaigns', label: 'Campaigns', section: 'Navigation' },
  { key: 'integrations', label: 'Integrations', section: 'Navigation' },
  { key: 'import', label: 'Import', section: 'Navigation' },
  { key: 'team', label: 'Team Management', section: 'Management' },
  { key: 'roles', label: 'Roles & Permissions', section: 'Management' },
  { key: 'settings', label: 'Organization Settings', section: 'Management' },
  { key: 'invite', label: 'Invite Users', section: 'Management' },
  { key: 'notifications', label: 'Notifications', section: 'Management' },
  { key: 'recycleBin', label: 'Recycle Bin', section: 'Management' },
  { key: 'divisions', label: 'Division Management', section: 'Management' },
  { key: 'deleteData', label: 'Delete Data', section: 'Destructive' },
  { key: 'exportData', label: 'Export Data', section: 'Data' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  SUPER_ADMIN: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, reports: true, automations: true, campaigns: true, integrations: true, import: true, team: true, roles: true, settings: true, invite: true, notifications: true, recycleBin: true, divisions: true, deleteData: true, exportData: true },
  ADMIN: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, reports: true, automations: true, campaigns: true, integrations: true, import: true, team: true, roles: true, settings: true, invite: true, notifications: true, recycleBin: true, divisions: false, deleteData: true, exportData: true },
  MANAGER: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: true, reports: true, automations: true, campaigns: true, integrations: false, import: false, team: true, roles: false, settings: false, invite: true, notifications: true, recycleBin: true, divisions: false, deleteData: false, exportData: true },
  SALES_REP: { dashboard: true, leads: true, contacts: true, inbox: true, pipeline: true, tasks: true, analytics: false, reports: false, automations: false, campaigns: false, integrations: false, import: false, team: false, roles: false, settings: false, invite: false, notifications: true, recycleBin: true, divisions: false, deleteData: false, exportData: false },
  VIEWER: { dashboard: true, leads: true, contacts: true, inbox: false, pipeline: true, tasks: false, analytics: true, reports: true, automations: false, campaigns: false, integrations: false, import: false, team: false, roles: false, settings: false, invite: false, notifications: true, recycleBin: false, divisions: false, deleteData: false, exportData: false },
};

function mergeRolePermissions(
  incoming: Record<string, Record<string, boolean>> | undefined
): Record<string, Record<string, boolean>> {
  if (!incoming) return DEFAULT_PERMISSIONS;

  const merged: Record<string, Record<string, boolean>> = {};

  for (const [role, defaults] of Object.entries(DEFAULT_PERMISSIONS)) {
    merged[role] = { ...defaults, ...(incoming[role] || {}) };
  }

  for (const [role, permissions] of Object.entries(incoming)) {
    if (!merged[role]) {
      merged[role] = { ...permissions };
    }
  }

  return merged;
}

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
        rolePermissions: mergeRolePermissions(data.rolePermissions),
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
