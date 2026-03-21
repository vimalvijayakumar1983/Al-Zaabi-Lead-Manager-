'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield,
  Crown,
  Briefcase,
  Target,
  Eye,
  Star,
  Heart,
  Zap,
  Globe,
  Lock,
  Key,
  Users,
  ClipboardList,
  Headphones,
  Award,
  Compass,
  Plus,
  ArrowLeft,
  LayoutDashboard,
  UserCog,
  Building2,
  Megaphone,
  Plug2,
  BarChart3,
  Settings,
  UserCircle,
  Kanban,
  Bell,
  Search,
  X,
  Copy,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle,
  Info,
  ToggleLeft,
  ToggleRight,
  Hash,
  Palette,
  Type,
  FileText,
  ShieldCheck,
  ShieldOff,
  Layers,
  CheckCircle2,
  XCircle,
  ChevronUp,
  LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CustomRole {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  level: number;
  baseRole: string;
  permissions: Record<string, Record<string, boolean>>;
  isSystem: boolean;
  userCount: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PermissionModule {
  label: string;
  icon: string;
  permissions: Record<string, string>;
}

interface RolesApiResponse {
  roles: CustomRole[];
  permissionModules: Record<string, PermissionModule>;
  systemDefaults: Record<string, Record<string, Record<string, boolean>>>;
}

type ModalTab = 'basic' | 'permissions' | 'preview';

interface FormState {
  name: string;
  description: string;
  color: string;
  icon: string;
  level: number;
  baseRole: string;
  permissions: Record<string, Record<string, boolean>>;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, LucideIcon> = {
  crown: Crown,
  shield: Shield,
  briefcase: Briefcase,
  target: Target,
  eye: Eye,
  star: Star,
  heart: Heart,
  zap: Zap,
  globe: Globe,
  lock: Lock,
  key: Key,
  users: Users,
  clipboard: ClipboardList,
  headphones: Headphones,
  award: Award,
  compass: Compass,
};

const ICON_NAMES = Object.keys(ROLE_ICONS);

const COLOR_PRESETS: string[] = [
  '#dc2626',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#6b7280',
];

const PERMISSION_MODULES: Record<string, PermissionModule> = {
  dashboard: {
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    permissions: {
      view: 'View dashboard',
      viewAllDivisions: 'View all divisions data',
    },
  },
  leads: {
    label: 'Lead Management',
    icon: 'Users',
    permissions: {
      view: 'View leads',
      viewAll: 'View all divisions leads',
      create: 'Create new leads',
      edit: 'Edit leads',
      delete: 'Delete leads permanently',
      archive: 'Archive/unarchive leads',
      import: 'Import leads from CSV',
      export: 'Export leads data',
      assign: 'Assign leads to users',
    },
  },
  team: {
    label: 'Team Management',
    icon: 'UserCog',
    permissions: {
      view: 'View team members',
      viewAll: 'View all divisions members',
      invite: 'Invite new users',
      edit: 'Edit user profiles',
      changeRole: 'Change user roles',
      transfer: 'Transfer between divisions',
      deactivate: 'Deactivate users',
      delete: 'Delete users permanently',
      resetPassword: 'Reset user passwords',
    },
  },
  divisions: {
    label: 'Divisions',
    icon: 'Building2',
    permissions: {
      view: 'View own division',
      viewAll: 'View all divisions',
      create: 'Create new divisions',
      edit: 'Edit division settings',
      delete: 'Delete divisions',
    },
  },
  campaigns: {
    label: 'Campaigns',
    icon: 'Megaphone',
    permissions: {
      view: 'View campaigns',
      create: 'Create campaigns',
      edit: 'Edit campaigns',
      delete: 'Delete campaigns',
    },
  },
  integrations: {
    label: 'Integrations',
    icon: 'Plug2',
    permissions: {
      view: 'View integrations',
      manage: 'Connect/disconnect platforms',
      configure: 'Configure integration settings',
    },
  },
  automations: {
    label: 'Automations',
    icon: 'Zap',
    permissions: {
      view: 'View automation rules',
      create: 'Create automation rules',
      edit: 'Edit automation rules',
      delete: 'Delete automation rules',
    },
  },
  analytics: {
    label: 'Analytics & Reports',
    icon: 'BarChart3',
    permissions: {
      view: 'View analytics',
      viewAll: 'View all divisions analytics',
      export: 'Export analytics data',
    },
  },
  settings: {
    label: 'Settings',
    icon: 'Settings',
    permissions: {
      view: 'View settings',
      manage: 'Manage organization settings',
      email: 'Manage email/SMTP settings',
    },
  },
  contacts: {
    label: 'Contacts',
    icon: 'UserCircle',
    permissions: {
      view: 'View contacts',
      create: 'Create contacts',
      edit: 'Edit contacts',
      delete: 'Delete contacts',
    },
  },
  pipeline: {
    label: 'Pipeline',
    icon: 'Kanban',
    permissions: {
      view: 'View pipeline',
      manage: 'Manage pipeline stages',
    },
  },
  notifications: {
    label: 'Notifications',
    icon: 'Bell',
    permissions: {
      view: 'View notifications',
      manageRules: 'Manage notification rules',
    },
  },
};

const MODULE_ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  Megaphone,
  Plug2,
  Zap,
  BarChart3,
  Settings,
  UserCircle,
  Kanban,
  Bell,
};

const TOTAL_PERMISSIONS = Object.values(PERMISSION_MODULES).reduce(
  (sum, mod) => sum + Object.keys(mod.permissions).length,
  0
);

const BASE_ROLE_OPTIONS: { value: string; label: string; level: number }[] = [
  { value: 'ADMIN', label: 'Same as Admin', level: 80 },
  { value: 'MANAGER', label: 'Same as Manager', level: 60 },
  { value: 'SALES_REP', label: 'Same as Sales Rep', level: 40 },
  { value: 'VIEWER', label: 'Same as Viewer', level: 20 },
];

const DEFAULT_FORM_STATE: FormState = {
  name: '',
  description: '',
  color: '#3b82f6',
  icon: 'shield',
  level: 40,
  baseRole: 'SALES_REP',
  permissions: {},
};

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

function apiUrl(path: string): string {
  // Use same-origin /api path — Next.js rewrites proxy to backend
  return path.startsWith('/api') ? path : `/api${path}`;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

function countEnabledPermissions(
  permissions: Record<string, Record<string, boolean>>
): number {
  let count = 0;
  for (const moduleKey of Object.keys(permissions)) {
    const modulePerms = permissions[moduleKey];
    if (modulePerms) {
      for (const permKey of Object.keys(modulePerms)) {
        if (modulePerms[permKey]) {
          count++;
        }
      }
    }
  }
  return count;
}

function buildEmptyPermissions(): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {};
  for (const moduleKey of Object.keys(PERMISSION_MODULES)) {
    perms[moduleKey] = {};
    const mod = PERMISSION_MODULES[moduleKey];
    for (const permKey of Object.keys(mod.permissions)) {
      perms[moduleKey][permKey] = false;
    }
  }
  return perms;
}

function buildAllEnabledPermissions(): Record<string, Record<string, boolean>> {
  const perms: Record<string, Record<string, boolean>> = {};
  for (const moduleKey of Object.keys(PERMISSION_MODULES)) {
    perms[moduleKey] = {};
    const mod = PERMISSION_MODULES[moduleKey];
    for (const permKey of Object.keys(mod.permissions)) {
      perms[moduleKey][permKey] = true;
    }
  }
  return perms;
}

function mergePermissions(
  base: Record<string, Record<string, boolean>>,
  overlay: Record<string, Record<string, boolean>>
): Record<string, Record<string, boolean>> {
  const result = buildEmptyPermissions();
  for (const moduleKey of Object.keys(result)) {
    for (const permKey of Object.keys(result[moduleKey])) {
      result[moduleKey][permKey] =
        (base[moduleKey]?.[permKey] ?? false) ||
        (overlay[moduleKey]?.[permKey] ?? false);
    }
  }
  return result;
}

function getModuleIcon(iconName: string): LucideIcon {
  return MODULE_ICON_MAP[iconName] ?? Shield;
}

function getRoleIcon(iconName: string): LucideIcon {
  return ROLE_ICONS[iconName] ?? Shield;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ─────────────────────────────────────────────────────────────
// Toast component
// ─────────────────────────────────────────────────────────────

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
      {toasts.map((toast) => {
        const bgColor =
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : toast.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800';

        const IconComp =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
            ? XCircle
            : Info;

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-fade-in ${bgColor}`}
          >
            <IconComp className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="ml-2 p-0.5 rounded hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton components
// ─────────────────────────────────────────────────────────────

function SkeletonStatCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="flex items-center gap-4">
        <div className="bg-gray-200 animate-pulse w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="bg-gray-200 animate-pulse h-7 w-16 rounded" />
          <div className="bg-gray-200 animate-pulse h-4 w-24 rounded" />
        </div>
      </div>
    </div>
  );
}

function SkeletonRoleCard() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gray-200 animate-pulse w-10 h-10 rounded-lg" />
          <div className="space-y-2">
            <div className="bg-gray-200 animate-pulse h-5 w-32 rounded" />
            <div className="bg-gray-200 animate-pulse h-3 w-48 rounded" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="bg-gray-200 animate-pulse h-6 w-20 rounded-full" />
        <div className="bg-gray-200 animate-pulse h-6 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
        <div className="bg-gray-200 animate-pulse h-8 w-full rounded" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Permission Toggle Switch
// ─────────────────────────────────────────────────────────────

function PermToggle({
  enabled,
  onChange,
  disabled = false,
  label,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2 ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer'
      } ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Color Picker Component
// ─────────────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customHex, setCustomHex] = useState(value);

  const handleCustomSubmit = () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(customHex)) {
      onChange(customHex);
      setShowCustom(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-4 h-4 text-gray-600" />
          Role Color
        </div>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => {
              onChange(color);
              setCustomHex(color);
            }}
            className={`w-9 h-9 rounded-lg border-2 transition-all duration-150 ${
              value === color
                ? 'border-gray-900 scale-110 shadow-md'
                : 'border-transparent hover:scale-105'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className={`w-9 h-9 rounded-lg border-2 border-dashed flex items-center justify-center transition-all duration-150 ${
            showCustom
              ? 'border-indigo-600 bg-indigo-50'
              : 'border-gray-200 hover:border-gray-400'
          }`}
          title="Custom color"
        >
          <Plus className="w-4 h-4 text-gray-600" />
        </button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 animate-fade-in">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <Hash className="w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={customHex}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCustomHex(e.target.value)
              }
              placeholder="#3b82f6"
              className="bg-transparent w-24 text-sm text-gray-900 outline-none"
              maxLength={7}
            />
          </div>
          <button
            type="button"
            onClick={handleCustomSubmit}
            className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 text-sm"
          >
            Apply
          </button>
          <div
            className="w-9 h-9 rounded-lg border border-gray-200"
            style={{
              backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customHex)
                ? customHex
                : '#e5e7eb',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Icon Picker Component
// ─────────────────────────────────────────────────────────────

function IconPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (icon: string) => void;
  color: string;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-4 h-4 text-gray-600" />
          Role Icon
        </div>
      </label>
      <div className="grid grid-cols-8 gap-2">
        {ICON_NAMES.map((name) => {
          const IconComp = ROLE_ICONS[name];
          const isSelected = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150 ${
                isSelected
                  ? 'ring-2 ring-offset-2 shadow-md scale-110'
                  : 'hover:bg-gray-50 hover:scale-105'
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: `${color}15`,
                      color: color,
                      outlineColor: color,
                    }
                  : undefined
              }
              title={name}
            >
              <IconComp
                className="w-5 h-5"
                style={isSelected ? { color } : undefined}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Permission Module Section (for the modal)
// ─────────────────────────────────────────────────────────────

function PermissionModuleSection({
  moduleKey,
  module,
  permissions,
  onToggle,
  onToggleAll,
  readOnly,
  searchQuery,
}: {
  moduleKey: string;
  module: PermissionModule;
  permissions: Record<string, boolean>;
  onToggle: (moduleKey: string, permKey: string, val: boolean) => void;
  onToggleAll: (moduleKey: string, val: boolean) => void;
  readOnly: boolean;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const ModIcon = getModuleIcon(module.icon);

  const permEntries = Object.entries(module.permissions);
  const filteredEntries = searchQuery
    ? permEntries.filter(
        ([, desc]) =>
          desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
          module.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : permEntries;

  if (searchQuery && filteredEntries.length === 0) return null;

  const allEnabled = permEntries.every(
    ([key]) => permissions[key] === true
  );
  const someEnabled = permEntries.some(
    ([key]) => permissions[key] === true
  );
  const enabledCount = permEntries.filter(
    ([key]) => permissions[key] === true
  ).length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              someEnabled
                ? 'bg-indigo-50 text-indigo-600'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            <ModIcon className="w-4 h-4" />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-gray-900">
              {module.label}
            </span>
            <span className="ml-2 text-xs text-gray-400">
              {enabledCount}/{permEntries.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!readOnly && (
            <div
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
              }}
            >
              <PermToggle
                enabled={allEnabled}
                onChange={(val) => onToggleAll(moduleKey, val)}
                label={`Toggle all ${module.label} permissions`}
              />
            </div>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-border-subtle animate-fade-in">
          {filteredEntries.map(([permKey, description]) => {
            const isEnabled = permissions[permKey] === true;
            return (
              <div
                key={permKey}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  isEnabled ? 'bg-indigo-50/30' : 'bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isEnabled ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm text-gray-900">{description}</p>
                    <p className="text-xs text-gray-400 font-mono">
                      {moduleKey}.{permKey}
                    </p>
                  </div>
                </div>
                {!readOnly && (
                  <PermToggle
                    enabled={isEnabled}
                    onChange={(val) => onToggle(moduleKey, permKey, val)}
                    label={description}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// View Permissions Drawer (for system roles)
// ─────────────────────────────────────────────────────────────

function ViewPermissionsDrawer({
  role,
  onClose,
  onEdit,
  onClone,
}: {
  role: CustomRole;
  onClose: () => void;
  onEdit?: () => void;
  onClone?: () => void;
}) {
  const RIcon = getRoleIcon(role.icon);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto animate-fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${role.color}15`, color: role.color }}
              >
                <RIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {role.name}
                </h3>
                <p className="text-sm text-gray-600">
                  {role.isSystem
                    ? 'System role defaults (read-only)'
                    : 'Permissions overview'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {role.isSystem && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                System roles cannot be edited directly. Clone this role to create an editable custom version.
              </p>
            </div>
          )}
          {Object.entries(PERMISSION_MODULES).map(([moduleKey, module]) => (
            <PermissionModuleSection
              key={moduleKey}
              moduleKey={moduleKey}
              module={module}
              permissions={role.permissions[moduleKey] ?? {}}
              onToggle={() => {}}
              onToggleAll={() => {}}
              readOnly={true}
              searchQuery=""
            />
          ))}
        </div>
        {(onEdit || onClone) && (
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-end gap-2">
            {onClone && (
              <button
                type="button"
                onClick={onClone}
                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {role.isSystem ? 'Clone as Custom Role' : 'Clone Role'}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit Role
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Delete Confirmation Modal
// ─────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  role,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  role: CustomRole;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const hasUsers = role.userCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Delete &ldquo;{role.name}&rdquo;?
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              This action cannot be undone. The role will be permanently removed.
            </p>
          </div>

          {hasUsers && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Cannot delete this role
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {role.userCount} user{role.userCount !== 1 ? 's are' : ' is'}{' '}
                    currently assigned to this role. Please reassign them before
                    deleting.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 w-full pt-2">
            <button
              onClick={onCancel}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={hasUsers || isDeleting}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${
                hasUsers || isDeleting
                  ? 'bg-red-300 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {isDeleting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Deleting…
                </span>
              ) : (
                'Delete Role'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Clone Modal
// ─────────────────────────────────────────────────────────────

function CloneModal({
  sourceRole,
  onConfirm,
  onCancel,
  isCloning,
}: {
  sourceRole: CustomRole;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  isCloning: boolean;
}) {
  const [name, setName] = useState(`${sourceRole.name} (Copy)`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `${sourceRole.color}15`,
                color: sourceRole.color,
              }}
            >
              <Copy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Clone &ldquo;{sourceRole.name}&rdquo;
              </h3>
              <p className="text-sm text-gray-600">
                Create a new custom role based on this role&apos;s permissions
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1.5">
              New Role Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all"
              placeholder="Enter role name"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onCancel}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(name)}
              disabled={!name.trim() || isCloning}
              className={`bg-indigo-600 text-white hover:bg-indigo-700 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium ${
                !name.trim() || isCloning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isCloning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Cloning…
                </span>
              ) : (
                'Create Clone'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Create / Edit Role Modal (Full)
// ─────────────────────────────────────────────────────────────

function RoleFormModal({
  editingRole,
  allRoles,
  onSave,
  onCancel,
  isSaving,
}: {
  editingRole: CustomRole | null;
  allRoles: CustomRole[];
  onSave: (data: FormState) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const isEditing = editingRole !== null;

  const [activeTab, setActiveTab] = useState<ModalTab>('basic');
  const [form, setForm] = useState<FormState>(() => {
    if (editingRole) {
      return {
        name: editingRole.name,
        description: editingRole.description,
        color: editingRole.color,
        icon: editingRole.icon,
        level: editingRole.level,
        baseRole: editingRole.baseRole,
        permissions: mergePermissions(
          buildEmptyPermissions(),
          editingRole.permissions
        ),
      };
    }
    return {
      ...DEFAULT_FORM_STATE,
      permissions: buildEmptyPermissions(),
    };
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [permSearch, setPermSearch] = useState('');
  const initialFormRef = useRef(JSON.stringify(form));

  useEffect(() => {
    setHasChanges(JSON.stringify(form) !== initialFormRef.current);
  }, [form]);

  const enabledCount = useMemo(
    () => countEnabledPermissions(form.permissions),
    [form.permissions]
  );

  const handleFieldChange = <K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBaseRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const option = BASE_ROLE_OPTIONS.find((o) => o.value === e.target.value);
    if (option) {
      setForm((prev) => ({
        ...prev,
        baseRole: option.value,
        level: option.level,
      }));
    }
  };

  const handleCopyFromRole = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const roleId = e.target.value;
    if (!roleId) return;
    const source = allRoles.find((r) => r.id === roleId);
    if (source) {
      setForm((prev) => ({
        ...prev,
        permissions: mergePermissions(buildEmptyPermissions(), source.permissions),
      }));
    }
  };

  const handlePermToggle = (
    moduleKey: string,
    permKey: string,
    val: boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleKey]: {
          ...prev.permissions[moduleKey],
          [permKey]: val,
        },
      },
    }));
  };

  const handlePermToggleAll = (moduleKey: string, val: boolean) => {
    const mod = PERMISSION_MODULES[moduleKey];
    if (!mod) return;
    const newPerms: Record<string, boolean> = {};
    for (const permKey of Object.keys(mod.permissions)) {
      newPerms[permKey] = val;
    }
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [moduleKey]: newPerms,
      },
    }));
  };

  const handleSelectAllPermissions = () => {
    setForm((prev) => ({
      ...prev,
      permissions: buildAllEnabledPermissions(),
    }));
  };

  const handleDeselectAllPermissions = () => {
    setForm((prev) => ({
      ...prev,
      permissions: buildEmptyPermissions(),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onSave(form);
  };

  // Permission preview data
  const previewData = useMemo(() => {
    const canDo: { module: string; permissions: string[] }[] = [];
    const cannotDo: { module: string; permissions: string[] }[] = [];

    for (const [moduleKey, module] of Object.entries(PERMISSION_MODULES)) {
      const enabled: string[] = [];
      const disabled: string[] = [];
      for (const [permKey, desc] of Object.entries(module.permissions)) {
        if (form.permissions[moduleKey]?.[permKey]) {
          enabled.push(desc);
        } else {
          disabled.push(desc);
        }
      }
      if (enabled.length > 0) {
        canDo.push({ module: module.label, permissions: enabled });
      }
      if (disabled.length > 0) {
        cannotDo.push({ module: module.label, permissions: disabled });
      }
    }
    return { canDo, cannotDo };
  }, [form.permissions]);

  const tabs: { id: ModalTab; label: string; icon: LucideIcon }[] = [
    { id: 'basic', label: 'Basic Info', icon: FileText },
    { id: 'permissions', label: 'Permissions', icon: ShieldCheck },
    { id: 'preview', label: 'Preview', icon: Eye },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-8 animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `${form.color}15`,
                color: form.color,
              }}
            >
              {React.createElement(getRoleIcon(form.icon), {
                className: 'w-5 h-5',
              })}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditing ? 'Edit Role' : 'Create Custom Role'}
              </h2>
              <p className="text-sm text-gray-600">
                {isEditing
                  ? `Modifying "${editingRole?.name}"`
                  : 'Define a new role with custom permissions'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium animate-fade-in">
                Unsaved changes
              </span>
            )}
            <button
              onClick={onCancel}
              className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 flex-shrink-0">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'permissions' && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-gray-50 text-gray-400'
                    }`}
                  >
                    {enabledCount}/{TOTAL_PERMISSIONS}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Basic Info Tab ── */}
          {activeTab === 'basic' && (
            <div className="space-y-6 animate-fade-in max-w-2xl">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-gray-600" />
                    Role Name <span className="text-red-500">*</span>
                  </div>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange('name', e.target.value)
                  }
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all"
                  placeholder="e.g. Regional Manager"
                  maxLength={50}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {form.name.length}/50 characters
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    Description
                  </div>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    handleFieldChange('description', e.target.value)
                  }
                  rows={3}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all resize-none"
                  placeholder="Describe what this role is for…"
                  maxLength={200}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {form.description.length}/200 characters
                </p>
              </div>

              {/* Color + Icon */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ColorPicker
                  value={form.color}
                  onChange={(c) => handleFieldChange('color', c)}
                />
                <IconPicker
                  value={form.icon}
                  onChange={(i) => handleFieldChange('icon', i)}
                  color={form.color}
                />
              </div>

              {/* Base Role Level */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-gray-600" />
                    Base Role Level
                  </div>
                </label>
                <select
                  value={form.baseRole}
                  onChange={handleBaseRoleChange}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all"
                >
                  {BASE_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} (Level {opt.level})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Determines the hierarchy level of this role in the organization.
                  Users with higher-level roles can manage those with lower levels.
                </p>
              </div>

              {/* Copy From */}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  <div className="flex items-center gap-2">
                    <Copy className="w-4 h-4 text-gray-600" />
                    Copy permissions from
                  </div>
                </label>
                <select
                  onChange={handleCopyFromRole}
                  defaultValue=""
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all"
                >
                  <option value="">— Start from scratch —</option>
                  {allRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({countEnabledPermissions(r.permissions)}{' '}
                      permissions)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Pre-fill this role&apos;s permissions from an existing role
                </p>
              </div>

              {/* Preview card */}
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-3 font-semibold">
                  Preview
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: `${form.color}15`,
                      color: form.color,
                    }}
                  >
                    {React.createElement(getRoleIcon(form.icon), {
                      className: 'w-6 h-6',
                    })}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {form.name || 'Role Name'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {form.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
                        Level {form.level}
                      </span>
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                        {enabledCount} permissions
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Permissions Tab ── */}
          {activeTab === 'permissions' && (
            <div className="space-y-4 animate-fade-in">
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllPermissions}
                    className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 text-xs font-medium rounded-lg"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAllPermissions}
                    className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 text-xs font-medium rounded-lg"
                  >
                    Deselect All
                  </button>
                  <span className="text-sm text-gray-600 ml-2">
                    <span className="font-semibold text-indigo-600">
                      {enabledCount}
                    </span>{' '}
                    of {TOTAL_PERMISSIONS} permissions enabled
                  </span>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={permSearch}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setPermSearch(e.target.value)
                    }
                    placeholder="Search permissions…"
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-600 transition-all"
                  />
                  {permSearch && (
                    <button
                      onClick={() => setPermSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-4 h-4 text-gray-400 hover:text-gray-900" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(enabledCount / TOTAL_PERMISSIONS) * 100}%`,
                  }}
                />
              </div>

              {/* Modules */}
              <div className="space-y-3">
                {Object.entries(PERMISSION_MODULES).map(
                  ([moduleKey, module]) => (
                    <PermissionModuleSection
                      key={moduleKey}
                      moduleKey={moduleKey}
                      module={module}
                      permissions={form.permissions[moduleKey] ?? {}}
                      onToggle={handlePermToggle}
                      onToggleAll={handlePermToggleAll}
                      readOnly={false}
                      searchQuery={permSearch}
                    />
                  )
                )}
              </div>
            </div>
          )}

          {/* ── Preview Tab ── */}
          {activeTab === 'preview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Summary card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-600">
                    {enabledCount}
                  </p>
                  <p className="text-sm text-gray-600">
                    Permissions Enabled
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {TOTAL_PERMISSIONS - enabledCount}
                  </p>
                  <p className="text-sm text-gray-600">
                    Permissions Disabled
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-900">
                    {Object.keys(PERMISSION_MODULES).filter((mk) =>
                      Object.values(form.permissions[mk] ?? {}).some(Boolean)
                    ).length}
                  </p>
                  <p className="text-sm text-gray-600">
                    Modules with Access
                  </p>
                </div>
              </div>

              {/* Permission grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Can Do */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    <h4 className="font-semibold text-gray-900">
                      Can Do ({enabledCount})
                    </h4>
                  </div>
                  {previewData.canDo.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      No permissions enabled
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {previewData.canDo.map((group) => (
                        <div
                          key={group.module}
                          className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3"
                        >
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">
                            {group.module}
                          </p>
                          <ul className="space-y-1">
                            {group.permissions.map((p) => (
                              <li
                                key={p}
                                className="flex items-center gap-2 text-sm text-emerald-800"
                              >
                                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Cannot Do */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldOff className="w-5 h-5 text-gray-400" />
                    <h4 className="font-semibold text-gray-900">
                      Cannot Do ({TOTAL_PERMISSIONS - enabledCount})
                    </h4>
                  </div>
                  {previewData.cannotDo.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      All permissions are enabled
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {previewData.cannotDo.map((group) => (
                        <div
                          key={group.module}
                          className="bg-gray-50 border border-gray-100 rounded-lg p-3"
                        >
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                            {group.module}
                          </p>
                          <ul className="space-y-1">
                            {group.permissions.map((p) => (
                              <li
                                key={p}
                                className="flex items-center gap-2 text-sm text-gray-500"
                              >
                                <X className="w-3.5 h-3.5 flex-shrink-0" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <div className="flex items-center gap-2">
            {activeTab !== 'basic' && (
              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    activeTab === 'permissions' ? 'basic' : 'permissions'
                  )
                }
                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            {activeTab !== 'preview' ? (
              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    activeTab === 'basic' ? 'permissions' : 'preview'
                  )
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!form.name.trim() || isSaving}
                className={`bg-indigo-600 text-white hover:bg-indigo-700 px-6 py-2.5 rounded-lg text-sm font-medium ${
                  !form.name.trim() || isSaving
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Saving…
                  </span>
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create Role'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Role Card Component
// ─────────────────────────────────────────────────────────────

function RoleCard({
  role,
  onEdit,
  onClone,
  onDelete,
  onViewPermissions,
}: {
  role: CustomRole;
  onEdit?: () => void;
  onClone?: () => void;
  onDelete?: () => void;
  onViewPermissions: () => void;
}) {
  const RIcon = getRoleIcon(role.icon);
  const isSystem = role.isSystem;
  const enabledPerms = countEnabledPermissions(role.permissions);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 hover:shadow-lg transition-all duration-200 animate-fade-in group">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
            style={{
              backgroundColor: `${role.color}15`,
              color: role.color,
            }}
          >
            <RIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 text-sm">
                {role.name}
              </h3>
              {isSystem && (
                <span title="System role"><Lock className="w-3.5 h-3.5 text-gray-400" /></span>
              )}
            </div>
            <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
              {role.description || 'No description'}
            </p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-full">
          <Users className="w-3 h-3" />
          {role.userCount} user{role.userCount !== 1 ? 's' : ''}
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded-full">
          <Layers className="w-3 h-3" />
          Level {role.level}
        </span>
        <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full">
          <ShieldCheck className="w-3 h-3" />
          {enabledPerms} perms
        </span>
      </div>

      {/* Date */}
      {role.createdAt && (
        <p className="text-xs text-gray-400 mb-3">
          Created {formatDate(role.createdAt)}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
        <button
          onClick={onViewPermissions}
          className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 flex-1 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          Permissions
        </button>
        {onClone && (
          <button
            onClick={onClone}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors"
            title="Clone role"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {!isSystem && onEdit && (
          <button
            onClick={onEdit}
            className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-gray-100 transition-colors"
            title="Edit role"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {!isSystem && onDelete && (
          <button
            onClick={onDelete}
            className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              role.userCount > 0
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-red-500 hover:bg-red-50 hover:text-red-600'
            }`}
            title={
              role.userCount > 0
                ? `Cannot delete: ${role.userCount} user(s) assigned`
                : 'Delete role'
            }
            disabled={role.userCount > 0}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────────────

function EmptyCustomRoles({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
        <Shield className="w-10 h-10 text-indigo-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        No custom roles yet
      </h3>
      <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
        Custom roles let you define exactly what each team member can access.
        Create your first role to get started.
      </p>
      <button
        onClick={onCreate}
        className="bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Create your first custom role
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Error State
// ─────────────────────────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="w-20 h-20 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-10 h-10 text-red-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Something went wrong
      </h3>
      <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-2.5 rounded-lg text-sm font-medium"
      >
        Try Again
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { user } = useAuthStore();
  const canManageRoles =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  // ── Data State ──
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI State ──
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<CustomRole | null>(null);
  const [cloningRole, setCloningRole] = useState<CustomRole | null>(null);
  const [viewingPermissions, setViewingPermissions] =
    useState<CustomRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  // ── Toasts ──
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        toastTimers.current.delete(id);
      }, 5000);
      toastTimers.current.set(id, timer);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = toastTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.current.delete(id);
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // ── Derived data ──
  const systemRoles = useMemo(
    () => roles.filter((r) => r.isSystem),
    [roles]
  );
  const customRoles = useMemo(
    () => roles.filter((r) => !r.isSystem),
    [roles]
  );
  const totalUsers = useMemo(
    () => roles.reduce((sum, r) => sum + r.userCount, 0),
    [roles]
  );

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    // token handled by authHeaders
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/roles'), {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch roles (${res.status})`);
      }
      const data: RolesApiResponse = await res.json();
      setRoles(data.roles ?? []);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // ── Create role ──
  const handleCreateRole = useCallback(
    async (formData: FormState) => {
      // token handled by authHeaders
      setIsSaving(true);
      try {
        const res = await fetch(apiUrl('/api/roles'), {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            color: formData.color,
            icon: formData.icon,
            permissions: formData.permissions,
            baseRole: formData.baseRole,
            level: formData.level,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as Record<string, string>).message ??
              `Failed to create role (${res.status})`
          );
        }
        setShowCreateModal(false);
        addToast('success', `Role "${formData.name}" created successfully`);
        await fetchRoles();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to create role';
        addToast('error', msg);
      } finally {
        setIsSaving(false);
      }
    },
    [fetchRoles, addToast]
  );

  // ── Update role ──
  const handleUpdateRole = useCallback(
    async (formData: FormState) => {
      if (!editingRole) return;
      setIsSaving(true);
      try {
        const res = await fetch(apiUrl(`/api/roles/${editingRole!.id}`), {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            name: formData.name,
            description: formData.description,
            color: formData.color,
            icon: formData.icon,
            permissions: formData.permissions,
            baseRole: formData.baseRole,
            level: formData.level,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as Record<string, string>).message ??
              `Failed to update role (${res.status})`
          );
        }
        setEditingRole(null);
        addToast('success', `Role "${formData.name}" updated successfully`);
        await fetchRoles();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to update role';
        addToast('error', msg);
      } finally {
        setIsSaving(false);
      }
    },
    [editingRole, fetchRoles, addToast]
  );

  // ── Delete role ──
  const handleDeleteRole = useCallback(async () => {
    if (!deletingRole) return;
    setIsDeleting(true);
    try {
      const res = await fetch(apiUrl(`/api/roles/${deletingRole!.id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as Record<string, string>).message ??
            `Failed to delete role (${res.status})`
        );
      }
      const roleName = deletingRole!.name;
      setDeletingRole(null);
      addToast('success', `Role "${roleName}" deleted successfully`);
      await fetchRoles();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to delete role';
      addToast('error', msg);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingRole, fetchRoles, addToast]);

  // ── Clone role ──
  const handleCloneRole = useCallback(
    async (newName: string) => {
      if (!cloningRole) return;
      setIsCloning(true);
      try {
        const res = await fetch(apiUrl(`/api/roles/${cloningRole!.id}/clone`), {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ name: newName }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as Record<string, string>).message ??
              `Failed to clone role (${res.status})`
          );
        }
        setCloningRole(null);
        addToast('success', `Role "${newName}" cloned successfully`);
        await fetchRoles();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to clone role';
        addToast('error', msg);
      } finally {
        setIsCloning(false);
      }
    },
    [cloningRole, fetchRoles, addToast]
  );

  // ── Stats data ──
  const stats = useMemo(
    () => [
      {
        label: 'Total Roles',
        value: roles.length,
        icon: Shield,
        color: '#3b82f6',
        bg: 'bg-blue-50',
      },
      {
        label: 'System Roles',
        value: systemRoles.length,
        icon: Lock,
        color: '#8b5cf6',
        bg: 'bg-violet-50',
      },
      {
        label: 'Custom Roles',
        value: customRoles.length,
        icon: Star,
        color: '#f59e0b',
        bg: 'bg-amber-50',
      },
      {
        label: 'Total Users',
        value: totalUsers,
        icon: Users,
        color: '#10b981',
        bg: 'bg-emerald-50',
      },
    ],
    [roles.length, systemRoles.length, customRoles.length, totalUsers]
  );

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 animate-fade-in">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <a
                href="/team"
                className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Team
              </a>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Roles & Permissions
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage access control across your organization
            </p>
          </div>
          {canManageRoles && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 text-white hover:bg-indigo-700 px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              Create Custom Role
            </button>
          )}
        </div>

        {/* ── Error State ── */}
        {error && !loading && (
          <ErrorState message={error} onRetry={fetchRoles} />
        )}

        {/* ── Loading State ── */}
        {loading && (
          <>
            {/* Stats Skeleton */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonStatCard key={i} />
              ))}
            </div>

            {/* System Roles Skeleton */}
            <div className="mb-8">
              <div className="bg-gray-200 animate-pulse h-7 w-40 rounded mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRoleCard key={i} />
                ))}
              </div>
            </div>

            {/* Custom Roles Skeleton */}
            <div>
              <div className="bg-gray-200 animate-pulse h-7 w-40 rounded mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonRoleCard key={i} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Loaded State ── */}
        {!loading && !error && (
          <>
            {/* ── Stats Bar ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((stat) => {
                const StatIcon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.bg}`}
                      >
                        <StatIcon
                          className="w-6 h-6"
                          style={{ color: stat.color }}
                        />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">
                          {stat.value}
                        </p>
                        <p className="text-sm text-gray-600">
                          {stat.label}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── System Roles ── */}
            <section className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    System Roles
                  </h2>
                </div>
                <span className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full">
                  {systemRoles.length}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                These built-in roles cannot be modified. You can clone them to
                create custom variants.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {systemRoles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onClone={canManageRoles ? () => setCloningRole(role) : undefined}
                    onViewPermissions={() => setViewingPermissions(role)}
                  />
                ))}
              </div>
            </section>

            {/* ── Custom Roles ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-0.5">
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-500" />
                      <h2 className="text-lg font-semibold text-gray-900">
                        Custom Roles
                      </h2>
                    </div>
                    <span className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full">
                      {customRoles.length}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Roles you&apos;ve created for your organization
                  </p>
                </div>
                {canManageRoles && customRoles.length > 0 && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Role
                  </button>
                )}
              </div>

              {customRoles.length === 0 ? (
                <EmptyCustomRoles
                  onCreate={() => setShowCreateModal(true)}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {customRoles.map((role) => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      onEdit={canManageRoles ? () => setEditingRole(role) : undefined}
                      onClone={canManageRoles ? () => setCloningRole(role) : undefined}
                      onDelete={canManageRoles ? () => setDeletingRole(role) : undefined}
                      onViewPermissions={() => setViewingPermissions(role)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── Modals ── */}

      {/* Create Role Modal */}
      {showCreateModal && (
        <RoleFormModal
          editingRole={null}
          allRoles={roles}
          onSave={handleCreateRole}
          onCancel={() => setShowCreateModal(false)}
          isSaving={isSaving}
        />
      )}

      {/* Edit Role Modal */}
      {editingRole && (
        <RoleFormModal
          editingRole={editingRole}
          allRoles={roles}
          onSave={handleUpdateRole}
          onCancel={() => setEditingRole(null)}
          isSaving={isSaving}
        />
      )}

      {/* Delete Confirmation */}
      {deletingRole && (
        <DeleteConfirmModal
          role={deletingRole}
          onConfirm={handleDeleteRole}
          onCancel={() => setDeletingRole(null)}
          isDeleting={isDeleting}
        />
      )}

      {/* Clone Modal */}
      {cloningRole && (
        <CloneModal
          sourceRole={cloningRole}
          onConfirm={handleCloneRole}
          onCancel={() => setCloningRole(null)}
          isCloning={isCloning}
        />
      )}

      {/* View Permissions Drawer */}
      {viewingPermissions && (
        <ViewPermissionsDrawer
          role={viewingPermissions}
          onClose={() => setViewingPermissions(null)}
          onClone={
            canManageRoles
              ? () => {
                  setCloningRole(viewingPermissions);
                  setViewingPermissions(null);
                }
              : undefined
          }
          onEdit={
            canManageRoles && !viewingPermissions.isSystem
              ? () => {
                  setEditingRole(viewingPermissions);
                  setViewingPermissions(null);
                }
              : undefined
          }
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
