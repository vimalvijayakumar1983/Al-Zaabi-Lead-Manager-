'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

function apiUrl(path: string): string {
  return path.startsWith('/api') ? path : `/api${path}`;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  };
}

export interface RolesListApiResponse {
  roles: Array<{
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
  }>;
}

export function useRolesListQuery() {
  return useQuery({
    queryKey: queryKeys.roles.list,
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/roles'), { headers: authHeaders() });
      if (!res.ok) {
        throw new Error(`Failed to fetch roles (${res.status})`);
      }
      return (await res.json()) as RolesListApiResponse;
    },
    staleTime: 60_000,
  });
}

export type ModuleVisibilityMatrix = Record<string, Record<string, boolean>>;

export function useModuleVisibilityMatrixQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.roles.moduleVisibility,
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/users/permissions'), {
        headers: authHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch visibility matrix (${res.status})`);
      }
      const data = (await res.json()) as {
        rolePermissions?: ModuleVisibilityMatrix;
      };
      const cloned: ModuleVisibilityMatrix = {};
      for (const [role, perms] of Object.entries(data.rolePermissions || {})) {
        cloned[role] = { ...perms };
      }
      return cloned;
    },
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}
