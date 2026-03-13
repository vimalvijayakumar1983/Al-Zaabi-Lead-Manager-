'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePermissionsStore } from '@/lib/permissions';
import { clsx } from 'clsx';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Kanban,
  CheckSquare,
  BarChart3,
  Zap,
  Megaphone,
  UserCog,
  Search,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Settings,
  ChevronDown,
  Sparkles,
  Upload,
  Building2,
  Plug2,
  X,
  Inbox,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1', permission: 'dashboard' },
  { href: '/leads', label: 'Leads', icon: Users, shortcut: '2', badge: null as string | null, permission: 'leads' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, shortcut: 'I', permission: 'leads' },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban, shortcut: '3', permission: 'pipeline' },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, shortcut: '4', permission: 'tasks' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, shortcut: '5', permission: 'analytics' },
  { href: '/automations', label: 'Automations', icon: Zap, shortcut: '6', permission: 'automations' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, shortcut: '7', permission: 'campaigns' },
  { href: '/integrations', label: 'Integrations', icon: Plug2, permission: 'settings' },
  { href: '/team', label: 'Team', icon: UserCog, shortcut: '8', permission: 'team' },
  { href: '/import', label: 'Import', icon: Upload, shortcut: '9', permission: 'leads' },
  { href: '/divisions', label: 'Divisions', icon: Building2, shortcut: '0', permission: 'divisions', divisionOnly: true },
];

interface SidebarProps {
  orgBranding?: {
    name: string;
    logo?: string;
    primaryColor: string;
  };
  divisionSwitcher?: {
    divisions: any[];
    activeDivisionId: string | null;
    showDropdown: boolean;
    onToggleDropdown: () => void;
    onSelectDivision: (divisionId: string | null) => void;
  };
  showDivisionsNav?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ orgBranding, divisionSwitcher, showDivisionsNav, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { hasPermission } = usePermissionsStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const visibleNavItems = navItems.filter((item: any) =>
    (!user || hasPermission(user.id, user.role, item.permission)) &&
    (!item.divisionOnly || showDivisionsNav)
  );
  const canAccessSettings = !user || hasPermission(user.id, user.role, 'settings');

  // Keyboard shortcut: Cmd+B to toggle sidebar (desktop only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on Escape (mobile)
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handler = () => setShowUserMenu(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showUserMenu]);

  // Close mobile sidebar when navigating
  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 flex flex-col bg-white border-r border-border transition-all duration-300 ease-smooth',
          // Mobile: slide-in overlay
          'max-lg:z-50 max-lg:w-[280px] max-lg:shadow-2xl',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          // Desktop: normal behavior
          'lg:z-30',
          collapsed ? 'lg:w-[var(--sidebar-collapsed-width)]' : 'lg:w-[var(--sidebar-width)]'
        )}
      >
        {/* Division Switcher for Super Admin */}
        {divisionSwitcher && !collapsed && (
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); divisionSwitcher.onToggleDropdown(); }}
                className="w-full flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm hover:bg-surface-tertiary transition-all"
              >
                <Building2 className="h-4 w-4 text-text-tertiary flex-shrink-0" />
                <span className="flex-1 text-left truncate text-text-secondary">
                  {divisionSwitcher.activeDivisionId
                    ? divisionSwitcher.divisions.find((d: any) => d.id === divisionSwitcher.activeDivisionId)?.tradeName || 'Division'
                    : 'All Divisions'}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${divisionSwitcher.showDropdown ? 'rotate-180' : ''}`} />
              </button>
              {divisionSwitcher.showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-float border border-border p-1.5 z-50 animate-scale-in">
                  <button
                    onClick={() => divisionSwitcher.onSelectDivision(null)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${!divisionSwitcher.activeDivisionId ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-surface-tertiary'}`}
                  >
                    All Divisions
                  </button>
                  {divisionSwitcher.divisions.map((div: any) => (
                    <button
                      key={div.id}
                      onClick={() => divisionSwitcher.onSelectDivision(div.id)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${divisionSwitcher.activeDivisionId === div.id ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-surface-tertiary'}`}
                    >
                      {div.tradeName || div.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Logo header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border-subtle">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={handleNavClick}>
            {orgBranding?.logo ? (
              <img src={orgBranding.logo} alt={orgBranding.name} className="h-8 w-8 rounded-lg flex-shrink-0 object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-soft" style={{ background: orgBranding?.primaryColor ? `linear-gradient(135deg, ${orgBranding.primaryColor}, ${orgBranding.primaryColor}dd)` : undefined }} >
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            )}
            {!collapsed && (
              <span className="text-lg font-bold text-text-primary tracking-tight animate-fade-in">
                {orgBranding?.name || 'LeadFlow'}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-1">
            {/* Mobile close button */}
            <button
              onClick={onMobileClose}
              className="btn-icon h-7 w-7 flex-shrink-0 lg:hidden"
              title="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={clsx(
                'btn-icon h-7 w-7 flex-shrink-0 hidden lg:flex',
                collapsed && 'mx-auto'
              )}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Search trigger */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => {
                handleNavClick();
                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                window.dispatchEvent(event);
              }}
              className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-surface-secondary px-3 py-2
                text-sm text-text-tertiary hover:bg-surface-tertiary hover:border-border-strong transition-all duration-150"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="kbd hidden sm:inline-flex">&#8984;K</kbd>
            </button>
          </div>
        )}

        {collapsed && (
          <div className="px-3 pt-3 pb-1 hidden lg:block">
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                window.dispatchEvent(event);
              }}
              className="btn-icon w-full"
              title="Search (⌘K)"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-3">
          <div className="space-y-0.5">
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={clsx(
                    'group relative flex items-center rounded-lg transition-all duration-150 ease-smooth',
                    collapsed ? 'max-lg:gap-3 max-lg:px-3 max-lg:py-2 lg:justify-center lg:p-2.5' : 'gap-3 px-3 py-2',
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-xs'
                      : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={clsx(
                    'flex-shrink-0 transition-colors',
                    collapsed ? 'max-lg:h-[18px] max-lg:w-[18px] lg:h-5 lg:w-5' : 'h-[18px] w-[18px]',
                    isActive ? 'text-brand-600' : 'text-text-tertiary group-hover:text-text-secondary'
                  )} />
                  {/* Always show label on mobile, hide on desktop when collapsed */}
                  <span className={clsx(
                    'flex-1 text-sm font-medium',
                    collapsed ? 'lg:hidden' : ''
                  )}>{item.label}</span>
                  {!collapsed && item.badge && (
                    <span className="badge bg-brand-100 text-brand-700 ring-brand-200">
                      {item.badge}
                    </span>
                  )}
                  {!collapsed && (
                    <span className="kbd opacity-0 group-hover:opacity-100 transition-opacity hidden lg:inline-flex">
                      {item.shortcut}
                    </span>
                  )}

                  {/* Collapsed tooltip (desktop only) */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium
                      opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg hidden lg:block">
                      {item.label}
                      <div className="absolute top-1/2 -left-1 -mt-1 h-2 w-2 bg-gray-900 rotate-45" />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Settings link */}
        {canAccessSettings && <div className="px-3 pb-1">
          <div className="divider mb-2" />
          <Link
            href="/settings"
            onClick={handleNavClick}
            className={clsx(
              'group relative flex items-center rounded-lg transition-all duration-150 ease-smooth',
              collapsed ? 'max-lg:gap-3 max-lg:px-3 max-lg:py-2 lg:justify-center lg:p-2.5' : 'gap-3 px-3 py-2',
              pathname === '/settings'
                ? 'bg-brand-50 text-brand-700 shadow-xs'
                : 'text-text-secondary hover:bg-surface-tertiary hover:text-text-primary'
            )}
            title={collapsed ? 'Settings' : undefined}
          >
            <Settings className={clsx(
              'flex-shrink-0 transition-colors',
              collapsed ? 'max-lg:h-[18px] max-lg:w-[18px] lg:h-5 lg:w-5' : 'h-[18px] w-[18px]',
              pathname === '/settings' ? 'text-brand-600' : 'text-text-tertiary group-hover:text-text-secondary'
            )} />
            <span className={clsx(
              'flex-1 text-sm font-medium',
              collapsed ? 'lg:hidden' : ''
            )}>Settings</span>
            {collapsed && (
              <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium
                opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg hidden lg:block">
                Settings
                <div className="absolute top-1/2 -left-1 -mt-1 h-2 w-2 bg-gray-900 rotate-45" />
              </div>
            )}
          </Link>
        </div>}

        {/* User info */}
        <div className="p-3 border-t border-border-subtle">
          <div
            className={clsx(
              'flex items-center rounded-lg transition-all duration-150 cursor-pointer hover:bg-surface-tertiary',
              collapsed ? 'max-lg:gap-3 max-lg:px-2 max-lg:py-1.5 lg:justify-center lg:p-2' : 'gap-3 px-2 py-1.5'
            )}
            onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
          >
            <div className={clsx(
              'rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center font-semibold text-white flex-shrink-0 shadow-soft',
              collapsed ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-xs'
            )}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            {/* Always show user info on mobile, hide on desktop when collapsed */}
            <div className={clsx('flex-1 min-w-0', collapsed ? 'lg:hidden' : '')}>
              <p className="text-sm font-semibold text-text-primary truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-2xs text-text-tertiary truncate capitalize">
                {user?.role?.toLowerCase()?.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown className={clsx(
              'h-4 w-4 text-text-tertiary transition-transform',
              showUserMenu && 'rotate-180',
              collapsed ? 'lg:hidden' : ''
            )} />
          </div>

          {/* User menu dropdown */}
          {showUserMenu && (
            <div className={clsx(
              'absolute bottom-16 bg-white rounded-xl shadow-float border border-border p-1.5 animate-scale-in z-50',
              collapsed ? 'max-lg:left-3 max-lg:right-3 lg:left-[var(--sidebar-collapsed-width)] lg:ml-2 lg:w-48' : 'left-3 right-3'
            )}>
              <button
                onClick={logout}
                className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-red-600
                  hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
