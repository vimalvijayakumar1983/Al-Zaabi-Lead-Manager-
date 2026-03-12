'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SearchResult {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  status: string;
  score: number;
  matchFields?: string[];
  assignedTo?: { firstName: string; lastName: string };
  tags?: { tag: { name: string; color: string } }[];
}

const statusColors: Record<string, string> = {
  NEW: 'bg-indigo-100 text-indigo-700',
  CONTACTED: 'bg-blue-100 text-blue-700',
  QUALIFIED: 'bg-cyan-100 text-cyan-700',
  PROPOSAL_SENT: 'bg-amber-100 text-amber-700',
  NEGOTIATION: 'bg-orange-100 text-orange-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setTotal(0);
      setSelectedIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.globalSearch(query);
        setResults(data.leads || []);
        setTotal(data.total || 0);
        setSelectedIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    router.push(`/leads/${result.id}`);
  }, [router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      handleSelect(results[selectedIdx]);
    }
  };

  const highlightMatch = (text: string | undefined | null) => {
    if (!text || !query) return text || '';
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark> : part
    );
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors bg-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden sm:inline">Search everywhere...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <svg className="h-5 w-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search leads by name, email, company, phone, tags, location..."
            className="flex-1 text-sm outline-none placeholder-gray-400"
          />
          {loading && (
            <div className="h-4 w-4 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          )}
          <kbd className="text-[10px] font-mono text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <svg className="h-8 w-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500">No leads found for &quot;{query}&quot;</p>
              <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
            </div>
          )}

          {results.length > 0 && (
            <>
              <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b">
                {total} result{total !== 1 ? 's' : ''} found
              </div>
              {results.map((result, idx) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                    idx === selectedIdx ? 'bg-brand-50' : 'hover:bg-gray-50'
                  } ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                >
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                    {result.firstName[0]}{result.lastName[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {highlightMatch(`${result.firstName} ${result.lastName}`)}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColors[result.status] || 'bg-gray-100 text-gray-600'}`}>
                        {result.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {result.email && (
                        <span className="text-xs text-gray-500 truncate">{highlightMatch(result.email)}</span>
                      )}
                      {result.company && (
                        <span className="text-xs text-gray-400">{highlightMatch(result.company)}</span>
                      )}
                      {result.phone && (
                        <span className="text-xs text-gray-400">{highlightMatch(result.phone)}</span>
                      )}
                    </div>
                    {/* Match context */}
                    {result.matchFields && result.matchFields.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {result.matchFields.map((f) => (
                          <span key={f} className="text-[9px] bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-1 py-0.5">
                            matched: {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {result.tags && result.tags.length > 0 && (
                      <div className="flex gap-0.5">
                        {result.tags.slice(0, 2).map((t) => (
                          <span key={t.tag.name} className="h-2 w-2 rounded-full" style={{ backgroundColor: t.tag.color || '#6b7280' }} title={t.tag.name} />
                        ))}
                      </div>
                    )}
                    <span className="text-xs font-bold tabular-nums" style={{
                      color: (result.score ?? 0) >= 70 ? '#16a34a' : (result.score ?? 0) >= 40 ? '#d97706' : '#dc2626'
                    }}>
                      {result.score ?? 0}
                    </span>
                    <svg className="h-3.5 w-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
              {total > results.length && (
                <div className="px-4 py-2 text-center border-t">
                  <button
                    onClick={() => { setOpen(false); router.push(`/leads?search=${encodeURIComponent(query)}`); }}
                    className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                  >
                    View all {total} results →
                  </button>
                </div>
              )}
            </>
          )}

          {query.length < 2 && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-gray-400">Type at least 2 characters to search</p>
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {['Name', 'Email', 'Company', 'Phone', 'Tags', 'Location', 'Job Title'].map((field) => (
                  <span key={field} className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> Navigate</span>
          <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↵</kbd> Open</span>
          <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
