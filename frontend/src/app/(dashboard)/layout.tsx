'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore } from '@/lib/permissions';
import { useNotificationStore } from '@/store/notificationStore';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import Sidebar from '@/components/Sidebar';
import CommandPalette from '@/components/CommandPalette';
import NotificationCenter from '@/components/NotificationCenter';
import ToastProvider from '@/components/ToastProvider';
import ErrorBoundary from '@/components/ErrorBoundary';
import { GlobalSearch } from './components/global-search';
import { Bell, HelpCircle, ShieldAlert, Building2, ChevronDown, Menu } from 'lucide-react';

const pageTitles: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: 'Your lead management overview' },
  '/leads': { title: 'Leads', description: 'Manage and track your leads' },
  '/contacts': { title: 'Contacts', description: 'Manage your contacts and relationships' },
  '/inbox': { title: 'Inbox', description: 'Omnichannel messaging hub' },
  '/pipeline': { title: 'Pipeline', description: 'Drag and drop leads between stages' },
  '/tasks': { title: 'Tasks', description: 'Manage follow-ups and activities' },
  '/analytics': { title: 'Analytics', description: 'Reports and performance metrics' },
  '/report-builder': { title: 'Report Builder', description: 'Build custom reports with all fields and custom columns' },
  '/automations': { title: 'Automations', description: 'Workflow automation rules' },
  '/campaigns': { title: 'Campaigns', description: 'Marketing campaign management' },
  '/team': { title: 'Team', description: 'Team members and access control' },
  '/settings': { title: 'Settings', description: 'Account and organization preferences' },
  '/recycle-bin': { title: 'Recycle Bin', description: 'Restore or permanently remove deleted records' },
  '/import': { title: 'Import Center', description: 'Import data from files' },
  '/divisions': { title: 'Divisions', description: 'Manage organization divisions' },
  '/roles': { title: 'Roles & Permissions', description: 'Manage roles and access control' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();
  const { hasPermission, loaded: permissionsLoaded } = usePermissionsStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Notification Center state
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const { unreadCount, fetchUnreadCount, connectWebSocket, disconnectWebSocket, fetchPreferences } =
    useNotificationStore();

  // IMPORTANT: usePermissionsStore must be called here at the top level,
  // BEFORE any conditional returns. React requires hooks to always be
  // called in the same order on every render. Moving this after a
  // conditional return (like `if (!isAuthenticated) return null`) causes
  // "Rendered fewer hooks than expected" crashes during sign-out.
  const hasNotificationAccess = !user || !permissionsLoaded ||
    hasPermission(user.id, user.role, 'notifications');

  // Organization branding state
  const [orgBranding, setOrgBranding] = useState<{
    name: string;
    tradeName?: string;
    logo?: string;
    primaryColor: string;
    secondaryColor: string;
  } | null>(null);

  // Division switcher state (SUPER_ADMIN only)
  const [divisions, setDivisions] = useState<any[]>([]);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [showDivisionDropdown, setShowDivisionDropdown] = useState(false);

  // Load branding and division data from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load organization branding
    try {
      const orgData = localStorage.getItem('organization');
      if (orgData) {
        setOrgBranding(JSON.parse(orgData));
      }
    } catch {
      // ignore parse errors
    }

    // Load divisions for SUPER_ADMIN
    try {
      const divisionsData = localStorage.getItem('divisions');
      if (divisionsData) {
        setDivisions(JSON.parse(divisionsData));
      }
    } catch {
      // ignore parse errors
    }

    // Load active division selection
    const storedDivisionId = localStorage.getItem('activeDivisionId');
    if (storedDivisionId) {
      setActiveDivisionId(storedDivisionId);
    }
  }, []);

  // Apply primary color as CSS custom property
  useEffect(() => {
    if (orgBranding?.primaryColor) {
      document.documentElement.style.setProperty('--org-primary-color', orgBranding.primaryColor);
    }
    return () => {
      document.documentElement.style.removeProperty('--org-primary-color');
    };
  }, [orgBranding?.primaryColor]);

  const handleDivisionSwitch = useCallback((divisionId: string | null) => {
    setActiveDivisionId(divisionId);
    setShowDivisionDropdown(false);
    if (divisionId) {
      localStorage.setItem('activeDivisionId', divisionId);
    } else {
      localStorage.removeItem('activeDivisionId');
    }
    // Reload page data by triggering a navigation refresh
    window.location.reload();
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Check if we're in the middle of a logout - skip soft redirect
      // since logout() does a hard redirect via window.location.href
      if (typeof window !== 'undefined' && (window as any).__loggingOut) {
        return;
      }
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Connect WebSocket and fetch unread count when authenticated
  useEffect(() => {
    if (isAuthenticated && hasNotificationAccess) {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          connectWebSocket(token);
          fetchUnreadCount();
          fetchPreferences();
        }
      } catch (err) {
        console.error('WebSocket/notification init error:', err);
      }
    }
    return () => {
      try {
        disconnectWebSocket();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isAuthenticated, hasNotificationAccess, connectWebSocket, disconnectWebSocket, fetchUnreadCount, fetchPreferences]);

  // When a user's profile is updated (e.g. role change by super admin),
  // re-fetch the profile. If the role actually changed, reload the page
  // so all data is re-fetched with the correct role-based scoping.
  const currentRoleRef = useRef(user?.role);
  useEffect(() => { currentRoleRef.current = user?.role; }, [user?.role]);

  useRealtimeSync(['user'], useCallback(async (event) => {
    if (event.action === 'updated') {
      const prevRole = currentRoleRef.current;
      await loadUser();
      const newRole = useAuthStore.getState().user?.role;
      if (prevRole && newRole && prevRole !== newRole) {
        // Role changed — full reload so all page data respects new scoping
        window.location.reload();
      }
    }
  }, [loadUser]));

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Detect sidebar collapse from CSS variable
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const sidebar = document.querySelector('aside');
      if (sidebar) {
        setSidebarCollapsed(sidebar.clientWidth < 100);
      }
    });
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, []);

  // Close division dropdown on outside click
  useEffect(() => {
    if (!showDivisionDropdown) return;
    const handleClick = () => setShowDivisionDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showDivisionDropdown]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-secondary">
        <div className="relative">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 animate-pulse-soft shadow-glow" />
        </div>
        <p className="mt-4 text-sm text-text-tertiary animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const basePath = '/' + (pathname?.split('/')[1] || '');
  const pageInfo = pageTitles[basePath];

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const activeDivision = divisions.find((d) => d.id === activeDivisionId);

  // Route-to-permission mapping
  const routePermissions: Record<string, string> = {
    '/dashboard': 'dashboard',
    '/leads': 'leads',
    '/contacts': 'contacts',
    '/inbox': 'inbox',
    '/pipeline': 'pipeline',
    '/tasks': 'tasks',
    '/analytics': 'analytics',
    '/report-builder': 'reports',
    '/automations': 'automations',
    '/campaigns': 'campaigns',
    '/integrations': 'integrations',
    '/team': 'team',
    '/roles': 'roles',
    '/settings': 'settings',
    '/recycle-bin': 'recycleBin',
    '/import': 'import',
    '/divisions': 'divisions',
  };

  const requiredPermission = routePermissions[basePath];
  const hasAccess = !requiredPermission || !user || !permissionsLoaded ||
    hasPermission(user.id, user.role, requiredPermission);

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-surface-secondary">
        <Sidebar />
        <main className="transition-all duration-300 ease-smooth lg:pl-[var(--sidebar-width)]">
          <div className="flex flex-col items-center justify-center min-h-screen -mt-14">
            <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-1">Access Denied</h2>
            <p className="text-sm text-text-secondary mb-4">You don&apos;t have permission to access this page.</p>
            <button onClick={() => router.push('/dashboard')} className="btn-primary">Go to Dashboard</button>
          </div>
        </main>
      </div>
    );
  }

  // Determine branding display values
  const displayName = orgBranding?.tradeName || orgBranding?.name || '';
  const primaryColor = orgBranding?.primaryColor || '#6366f1';

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Sidebar
        orgBranding={orgBranding ? {
          name: displayName,
          logo: orgBranding.logo,
          primaryColor,
        } : undefined}
        divisionSwitcher={isSuperAdmin && divisions.length > 0 ? {
          divisions,
          activeDivisionId,
          showDropdown: showDivisionDropdown,
          onToggleDropdown: () => setShowDivisionDropdown(!showDivisionDropdown),
          onSelectDivision: handleDivisionSwitch,
        } : undefined}
        showDivisionsNav={isSuperAdmin}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <CommandPalette />
      {hasNotificationAccess && (
        <NotificationCenter
          isOpen={notifOpen}
          onClose={() => setNotifOpen(false)}
          anchorRef={bellRef}
        />
      )}

      {/* Main content area */}
      <main className="transition-all duration-300 ease-smooth lg:pl-[var(--sidebar-width)]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-3 sm:px-4 md:px-6 bg-surface-secondary/80 backdrop-blur-lg border-b border-border-subtle">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              className="btn-icon -ml-1 lg:hidden flex-shrink-0"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            {pageInfo && !pathname?.includes('/leads/') && !pathname?.includes('/contacts/') && (
              <div className="animate-fade-in min-w-0">
                <h1 className="text-sm font-semibold text-text-primary truncate">{pageInfo.title}</h1>
              </div>
            )}
            {pathname?.includes('/leads/') && (
              <div className="animate-fade-in min-w-0">
                <h1 className="text-sm font-semibold text-text-primary truncate">Lead Details</h1>
              </div>
            )}
            {pathname?.includes('/contacts/') && (
              <div className="animate-fade-in min-w-0">
                <h1 className="text-sm font-semibold text-text-primary truncate">Contact Details</h1>
              </div>
            )}
            {/* Show active division indicator for SUPER_ADMIN */}
            {isSuperAdmin && activeDivision && (
              <span className="text-xs px-2 py-0.5 rounded-full text-white hidden sm:inline-flex flex-shrink-0" style={{ backgroundColor: primaryColor }}>
                {activeDivision.tradeName || activeDivision.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <div className="hidden sm:block">
              <GlobalSearch />
            </div>
            {hasNotificationAccess && (
              <button
                ref={bellRef}
                className="btn-icon relative"
                title="Notifications"
                onClick={() => setNotifOpen(!notifOpen)}
              >
                <Bell className="h-4.5 w-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4.5 min-w-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold ring-2 ring-white px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button className="btn-icon hidden sm:inline-flex" title="Help">
              <HelpCircle className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Page content wrapped in error boundary */}
        <ErrorBoundary>
          <div className="p-3 sm:p-4 md:p-6">{children}</div>
        </ErrorBoundary>

        {/* Toast notifications */}
        <ToastProvider />
      </main>
    </div>
  );
}
