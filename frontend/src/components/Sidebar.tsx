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
  MessageCircle,
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
  UserCircle,
  Shield,
  Archive,
  LayoutTemplate,
  Radio,
  Clock3,
} from 'lucide-react';

// ─── Nav structure: grouped sections ─────────────────────────────

const NAV_GROUPS = [
  {
    label: 'MAIN MENU',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: '1', permission: 'dashboard' },
      { href: '/leads', label: 'Leads', icon: Users, shortcut: '2', permission: 'leads' },
      { href: '/contacts', label: 'Contacts', icon: UserCircle, shortcut: 'C', permission: 'contacts' },
      { href: '/inbox', label: 'Inbox', icon: Inbox, shortcut: 'I', permission: 'inbox', badge: null as string | null },
    ],
  },
  {
    label: 'MESSAGING',
    items: [
      { href: '/whatsapp-templates', label: 'WA Templates', icon: LayoutTemplate, permission: 'inbox' },
      { href: '/broadcast-lists', label: 'Broadcast Lists', icon: Radio, permission: 'import' },
      { href: '/scheduled-broadcasts', label: 'Scheduled', icon: Clock3, permission: 'campaigns' },
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: Kanban, shortcut: '3', permission: 'pipeline' },
      { href: '/tasks', label: 'Tasks', icon: CheckSquare, shortcut: '4', permission: 'tasks' },
      { href: '/analytics', label: 'Analytics', icon: BarChart3, shortcut: '5', permission: 'analytics' },
      { href: '/report-builder', label: 'Report Builder', icon: BarChart3, permission: 'reports' },
      { href: '/automations', label: 'Automations', icon: Zap, shortcut: '6', permission: 'automations' },
    ],
  },
  {
    label: null,
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, shortcut: '7', permission: 'campaigns' },
      { href: '/integrations', label: 'Integrations', icon: Plug2, permission: 'integrations' },
      { href: '/team', label: 'Team', icon: UserCog, shortcut: '8', permission: 'team' },
      { href: '/roles', label: 'Roles', icon: Shield, permission: 'roles' },
      { href: '/recycle-bin', label: 'Recycle Bin', icon: Archive, permission: 'recycleBin' },
      { href: '/import', label: 'Import', icon: Upload, shortcut: '9', permission: 'import' },
      { href: '/divisions', label: 'Divisions', icon: Building2, shortcut: '0', permission: 'divisions', divisionOnly: true },
    ],
  },
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
  inboxUnreadCount?: number;
}

export default function Sidebar({ orgBranding, divisionSwitcher, showDivisionsNav, mobileOpen, onMobileClose, inboxUnreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { hasPermission } = usePermissionsStore();
  const [collapsed, setCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const canAccessSettings = !user || hasPermission(user.id, user.role, 'settings');

  const isItemVisible = (item: any) =>
    (!user || hasPermission(user.id, user.role, item.permission)) &&
    (!item.divisionOnly || showDivisionsNav);

  // Sync --sidebar-width CSS variable with collapsed state
  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) {
      root.style.setProperty('--sidebar-width', 'var(--sidebar-collapsed-width)');
    } else {
      root.style.removeProperty('--sidebar-width');
    }
  }, [collapsed]);

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

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onMobileClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    if (!showUserMenu) return;
    const handler = () => setShowUserMenu(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showUserMenu]);

  const handleNavClick = () => onMobileClose?.();
  const effectiveInboxBadge = inboxUnreadCount > 0 ? String(inboxUnreadCount > 99 ? '99+' : inboxUnreadCount) : null;

  const navLinkClass = (isActive: boolean, extraCollapsed = false) =>
    clsx(
      'group relative flex items-center rounded-xl transition-all duration-150 ease-smooth overflow-hidden',
      extraCollapsed
        ? 'max-lg:gap-3 max-lg:px-3 max-lg:py-2.5 lg:justify-center lg:p-2.5'
        : 'gap-3 px-3 py-2.5',
      isActive
        ? 'bg-[linear-gradient(90deg,rgba(106,47,185,0.45)_0%,rgba(57,32,126,0.75)_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
        : 'text-white/65 hover:bg-white/8 hover:text-white/90'
    );

  const iconClass = (isActive: boolean, extraCollapsed = false) =>
    clsx(
      'flex-shrink-0 transition-colors',
      extraCollapsed ? 'max-lg:h-[18px] max-lg:w-[18px] lg:h-5 lg:w-5' : 'h-[18px] w-[18px]',
      isActive ? 'text-white' : 'text-white/55 group-hover:text-white/80'
    );

  const Tooltip = ({ label }: { label: string }) => (
    <div className="absolute left-full ml-2.5 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium
      opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg hidden lg:block">
      {label}
      <div className="absolute top-1/2 -left-1 -mt-1 h-2 w-2 bg-gray-900 rotate-45" />
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 flex flex-col transition-all duration-300 ease-smooth',
          // Dark indigo background
          'bg-[#100a52]',
          // Mobile
          'max-lg:z-50 max-lg:w-[280px] max-lg:shadow-2xl',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
          // Desktop
          'lg:z-30',
          collapsed ? 'lg:w-[var(--sidebar-collapsed-width)]' : 'lg:w-[var(--sidebar-width)]'
        )}
      >
        {/* Division Switcher */}
        {divisionSwitcher && !collapsed && (
          <div className="px-3 pt-2 pb-1">
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); divisionSwitcher.onToggleDropdown(); }}
                className="w-full flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 transition-all"
              >
                <Building2 className="h-4 w-4 text-white/50 flex-shrink-0" />
                <span className="flex-1 text-left truncate">
                  {divisionSwitcher.activeDivisionId
                    ? divisionSwitcher.divisions.find((d: any) => d.id === divisionSwitcher.activeDivisionId)?.tradeName || 'Division'
                    : 'All Divisions'}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-white/40 transition-transform ${divisionSwitcher.showDropdown ? 'rotate-180' : ''}`} />
              </button>
              {divisionSwitcher.showDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#2d2a5e] rounded-xl shadow-2xl border border-white/10 p-1.5 z-50">
                  <button
                    onClick={() => divisionSwitcher.onSelectDivision(null)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${!divisionSwitcher.activeDivisionId ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10'}`}
                  >
                    All Divisions
                  </button>
                  {divisionSwitcher.divisions.map((div: any) => (
                    <button
                      key={div.id}
                      onClick={() => divisionSwitcher.onSelectDivision(div.id)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${divisionSwitcher.activeDivisionId === div.id ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10'}`}
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
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={handleNavClick}>
            {orgBranding?.logo ? (
              <img src={orgBranding.logo} alt={orgBranding.name} className="h-8 w-8 rounded-lg flex-shrink-0 object-contain" />
            ) : (
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{ background: orgBranding?.primaryColor ? `linear-gradient(135deg, ${orgBranding.primaryColor}, ${orgBranding.primaryColor}cc)` : 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
              >
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 animate-fade-in">
                <p className="text-sm font-bold text-white truncate leading-tight">
                  {orgBranding?.name || 'LeadFlow'}
                </p>
                {divisionSwitcher?.activeDivisionId && (
                  <p className="text-[10px] text-white/50 truncate leading-tight">
                    {divisionSwitcher.divisions.find((d: any) => d.id === divisionSwitcher.activeDivisionId)?.tradeName || 'Division'}
                  </p>
                )}
              </div>
            )}
          </Link>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onMobileClose} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors lg:hidden" title="Close">
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={clsx('p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors hidden lg:flex items-center justify-center', collapsed && 'mx-auto')}
              title={collapsed ? 'Expand (⌘B)' : 'Collapse (⌘B)'}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <button
              onClick={() => {
                handleNavClick();
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
              }}
              className="w-full flex items-center gap-2.5 rounded-xl border border-transparent bg-[#272163] px-3 py-2.5
                text-sm text-white/40 hover:bg-white/12 hover:text-white/60 transition-all duration-150"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="text-[10px] text-white/30 font-mono hidden sm:inline">⌘K</kbd>
            </button>
          </div>
        )}
        {collapsed && (
          <div className="px-2 pt-3 pb-2 hidden lg:block flex-shrink-0">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="w-full flex items-center justify-center p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Search (⌘K)"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4" style={{ scrollbarWidth: 'none' }}>
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(isItemVisible);
            if (!visibleItems.length) return null;
            return (
              <div key={gi}>
                {/* Section label */}
                {group.label && !collapsed && (
                  <p className="px-3 mb-2 text-[11px] font-semibold tracking-[0.12em] text-white/35 uppercase">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const displayBadge =
                      item.href === '/inbox'
                        ? effectiveInboxBadge
                        : (('badge' in item) ? (item as any).badge : null);
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href + '/'));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavClick}
                        className={navLinkClass(isActive, collapsed)}
                        title={collapsed ? item.label : undefined}
                      >
                        {isActive && !collapsed && (
                          <span
                            className="absolute left-0 top-[14%] h-[72%] w-[4px] rounded-r-[6px] shadow-[0_0_8px_rgba(122,64,255,0.45)]"
                            style={{ background: 'linear-gradient(180deg, #3b82f6 0%, #7c3aed 55%, #ec4899 100%)' }}
                          />
                        )}
                        <Icon className={iconClass(isActive, collapsed)} />
                        <span className={clsx('flex-1 text-sm font-medium', collapsed ? 'lg:hidden' : '')}>
                          {item.label}
                        </span>
                        {!!displayBadge && !collapsed && (
                          <span className="h-5 min-w-[22px] px-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                            {String(displayBadge)}
                          </span>
                        )}
                        {('shortcut' in item) && (item as any).shortcut && !collapsed && (
                          <span className="text-[10px] text-white/20 font-mono opacity-0 group-hover:opacity-100 transition-opacity hidden lg:inline">
                            {String((item as any).shortcut)}
                          </span>
                        )}
                        {collapsed && <Tooltip label={item.label} />}
                      </Link>
                    );
                  })}
                </div>
                {!collapsed && <div className="mt-3 border-t border-white/10" />}
              </div>
            );
          })}
        </nav>

        {/* Settings */}
        {canAccessSettings && (
          <div className="px-2 pb-1 flex-shrink-0">
            <div className="border-t border-white/10 pt-2">
              <Link
                href="/settings"
                onClick={handleNavClick}
                className={navLinkClass(pathname === '/settings', collapsed)}
                title={collapsed ? 'Settings' : undefined}
              >
                <Settings className={iconClass(pathname === '/settings', collapsed)} />
                <span className={clsx('flex-1 text-sm font-medium', collapsed ? 'lg:hidden' : '')}>Settings</span>
                {collapsed && <Tooltip label="Settings" />}
              </Link>
            </div>
          </div>
        )}

        {/* User info */}
        <div className="p-3 border-t border-white/10 flex-shrink-0 relative">
          <div
            className={clsx(
              'flex items-center rounded-xl transition-all duration-150 cursor-pointer hover:bg-white/10',
              collapsed ? 'max-lg:gap-3 max-lg:px-2 max-lg:py-1.5 lg:justify-center lg:p-2' : 'gap-3 px-2 py-1.5'
            )}
            onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
          >
            <div className={clsx(
              'rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 shadow-lg',
              collapsed ? 'h-9 w-9 text-sm' : 'h-8 w-8 text-xs',
              'bg-gradient-to-br from-emerald-400 to-emerald-600'
            )}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className={clsx('flex-1 min-w-0', collapsed ? 'lg:hidden' : '')}>
              <p className="text-sm font-semibold text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[11px] text-white/50 truncate capitalize">
                {user?.role?.toLowerCase()?.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown className={clsx(
              'h-3.5 w-3.5 text-white/40 transition-transform',
              showUserMenu && 'rotate-180',
              collapsed ? 'lg:hidden' : ''
            )} />
          </div>

          {showUserMenu && (
            <div className={clsx(
              'absolute bottom-full mb-2 bg-[#2d2a5e] rounded-xl shadow-2xl border border-white/10 p-1.5 z-50',
              collapsed ? 'max-lg:left-3 max-lg:right-3 lg:left-[var(--sidebar-collapsed-width)] lg:ml-2 lg:w-48' : 'left-3 right-3'
            )}>
              <button
                onClick={logout}
                className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-colors"
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
