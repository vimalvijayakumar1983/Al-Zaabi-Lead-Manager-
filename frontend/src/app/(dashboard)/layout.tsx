'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Sidebar from '@/components/Sidebar';
import CommandPalette from '@/components/CommandPalette';
import { Bell, HelpCircle } from 'lucide-react';

const pageTitles: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: 'Your lead management overview' },
  '/leads': { title: 'Leads', description: 'Manage and track your leads' },
  '/pipeline': { title: 'Pipeline', description: 'Drag and drop leads between stages' },
  '/tasks': { title: 'Tasks', description: 'Manage follow-ups and activities' },
  '/analytics': { title: 'Analytics', description: 'Reports and performance metrics' },
  '/automations': { title: 'Automations', description: 'Workflow automation rules' },
  '/campaigns': { title: 'Campaigns', description: 'Marketing campaign management' },
  '/team': { title: 'Team', description: 'Team members and access control' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, loadUser, user } = useAuthStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

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

  return (
    <div className="min-h-screen bg-surface-secondary">
      <Sidebar />
      <CommandPalette />

      {/* Main content area */}
      <main className="transition-all duration-300 ease-smooth pl-[var(--sidebar-width)]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 flex items-center justify-between px-6 bg-surface-secondary/80 backdrop-blur-lg border-b border-border-subtle">
          <div className="flex items-center gap-3">
            {pageInfo && !pathname?.includes('/leads/') && (
              <div className="animate-fade-in">
                <h1 className="text-sm font-semibold text-text-primary">{pageInfo.title}</h1>
              </div>
            )}
            {pathname?.includes('/leads/') && (
              <div className="animate-fade-in">
                <h1 className="text-sm font-semibold text-text-primary">Lead Details</h1>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button className="btn-icon relative" title="Notifications">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
            <button className="btn-icon" title="Help">
              <HelpCircle className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
