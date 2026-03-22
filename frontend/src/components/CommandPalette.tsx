'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Users,
  Kanban,
  CheckSquare,
  BarChart3,
  Zap,
  Megaphone,
  UserCog,
  Archive,
  Plus,
  ArrowRight,
  Hash,
} from 'lucide-react';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  category: string;
  shortcut?: string;
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = [
    // Navigation
    { id: 'nav-dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, action: () => router.push('/dashboard'), category: 'Navigation', shortcut: '1' },
    { id: 'nav-leads', label: 'Go to Leads', icon: Users, action: () => router.push('/leads'), category: 'Navigation', shortcut: '2' },
    { id: 'nav-pipeline', label: 'Go to Pipeline', icon: Kanban, action: () => router.push('/pipeline'), category: 'Navigation', shortcut: '3' },
    { id: 'nav-tasks', label: 'Go to Tasks', icon: CheckSquare, action: () => router.push('/tasks'), category: 'Navigation', shortcut: '4' },
    { id: 'nav-analytics', label: 'Go to Analytics', icon: BarChart3, action: () => router.push('/analytics'), category: 'Navigation', shortcut: '5' },
    { id: 'nav-automations', label: 'Go to Automations', icon: Zap, action: () => router.push('/automations'), category: 'Navigation', shortcut: '6' },
    { id: 'nav-campaigns', label: 'Go to Campaigns', icon: Megaphone, action: () => router.push('/campaigns'), category: 'Navigation', shortcut: '7' },
    { id: 'nav-team', label: 'Go to Team', icon: UserCog, action: () => router.push('/team'), category: 'Navigation', shortcut: '8' },
    { id: 'nav-recycle-bin', label: 'Go to Recycle Bin', icon: Archive, action: () => router.push('/recycle-bin'), category: 'Navigation' },
    // Actions
    { id: 'action-new-lead', label: 'Create New Lead', description: 'Add a new lead to the system', icon: Plus, action: () => { router.push('/leads'); setTimeout(() => window.dispatchEvent(new CustomEvent('open-lead-form')), 100); }, category: 'Actions' },
    { id: 'action-new-task', label: 'Create New Task', description: 'Add a new task', icon: Plus, action: () => router.push('/tasks'), category: 'Actions' },
    { id: 'action-new-automation', label: 'Create Automation Rule', description: 'Set up a new workflow rule', icon: Zap, action: () => router.push('/automations'), category: 'Actions' },
  ];

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()) ||
          c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  const categories = Array.from(new Set(filtered.map((c) => c.category)));

  // Open/close with Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        setOpen(false);
      }
    },
    [filtered, selectedIndex]
  );

  // Reset selection on query change
  useEffect(() => setSelectedIndex(0), [query]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div className="modal" onClick={() => setOpen(false)}>
      <div className="overlay" />
      <div
        className="relative z-50 w-full max-w-lg animate-fade-in-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white rounded-2xl shadow-modal overflow-hidden border border-border">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 border-b border-border-subtle">
            <Search className="h-4.5 w-4.5 text-text-tertiary flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 py-4 text-base bg-transparent border-0 outline-none placeholder:text-text-tertiary"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <kbd className="kbd">ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto scrollbar-thin py-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-text-tertiary">No results found</p>
                <p className="text-xs text-text-tertiary mt-1">Try a different search term</p>
              </div>
            ) : (
              categories.map((category) => (
                <div key={category}>
                  <div className="px-4 py-1.5">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {category}
                    </p>
                  </div>
                  {filtered
                    .filter((c) => c.category === category)
                    .map((cmd) => {
                      flatIndex++;
                      const idx = flatIndex;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          data-index={idx}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            idx === selectedIndex
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-text-primary hover:bg-surface-tertiary'
                          }`}
                          onClick={() => {
                            cmd.action();
                            setOpen(false);
                          }}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            idx === selectedIndex
                              ? 'bg-brand-100'
                              : 'bg-surface-tertiary'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{cmd.label}</p>
                            {cmd.description && (
                              <p className="text-xs text-text-tertiary truncate">{cmd.description}</p>
                            )}
                          </div>
                          {cmd.shortcut && <kbd className="kbd">{cmd.shortcut}</kbd>}
                          <ArrowRight className={`h-3.5 w-3.5 text-text-tertiary transition-opacity ${
                            idx === selectedIndex ? 'opacity-100' : 'opacity-0'
                          }`} />
                        </button>
                      );
                    })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border-subtle bg-surface-secondary text-2xs text-text-tertiary">
            <span className="flex items-center gap-1"><kbd className="kbd">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> Select</span>
            <span className="flex items-center gap-1"><kbd className="kbd">ESC</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
