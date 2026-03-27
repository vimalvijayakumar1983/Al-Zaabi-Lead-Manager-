'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Search, Sparkles } from 'lucide-react';
import { FEATURE_CATALOG, type FeatureCatalogItem } from '@/lib/feature-catalog';

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark key={`${part}-${idx}`} className="rounded bg-yellow-100 px-0.5 text-yellow-900">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${idx}`}>{part}</span>
    )
  );
}

function scoreFeature(item: FeatureCatalogItem, q: string) {
  const query = q.toLowerCase();
  let score = 0;
  if (item.name.toLowerCase().includes(query)) score += 10;
  if (item.category.toLowerCase().includes(query)) score += 6;
  if (item.summary.toLowerCase().includes(query)) score += 5;
  if (item.whereToFind.toLowerCase().includes(query)) score += 4;
  if (item.keywords.some((k) => k.toLowerCase().includes(query))) score += 4;
  if (item.howToUse.some((h) => h.toLowerCase().includes(query))) score += 3;
  return score;
}

function FeatureCard({ item, query }: { item: FeatureCatalogItem; query: string }) {
  return (
    <article className="card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-text-primary">
              {highlight(item.name, query)}
            </h3>
            <span className="badge bg-brand-50 text-brand-700 ring-brand-200">
              {item.category}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            {highlight(item.summary, query)}
          </p>
        </div>
        <Link href={item.path} className="btn-secondary text-xs">
          Open
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">How to use</p>
          <ol className="mt-2 space-y-1.5 text-sm text-text-secondary">
            {item.howToUse.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-2xs font-semibold text-brand-700">
                  {idx + 1}
                </span>
                <span>{highlight(step, query)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-text-tertiary">Where to find</p>
          <p className="mt-2 text-sm text-text-secondary">{highlight(item.whereToFind, query)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {item.keywords.map((keyword) => (
          <span key={keyword} className="rounded-full bg-surface-secondary px-2 py-0.5 text-2xs text-text-tertiary">
            {highlight(keyword, query)}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function FeatureFinderPage() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = FEATURE_CATALOG.slice();
    if (!q) return list.sort((a, b) => a.name.localeCompare(b.name));
    return list
      .map((item) => ({ item, score: scoreFeature(item, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
      .map((row) => row.item);
  }, [query]);

  const notFound = query.trim().length > 0 && filtered.length === 0;

  return (
    <div className="space-y-5">
      <div className="card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-600" />
              <h1 className="text-xl font-bold text-text-primary">Feature Finder</h1>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              Search CRM capabilities, confirm whether a feature exists, see usage steps, and open the exact page instantly.
            </p>
          </div>
          <div className="badge bg-brand-50 text-brand-700 ring-brand-200">
            <Sparkles className="h-3.5 w-3.5" />
            {FEATURE_CATALOG.length} documented features
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: offer studio, team filter, import duplicates, report builder..."
              className="input pl-9"
            />
          </div>
        </div>
      </div>

      {notFound ? (
        <div className="card p-8 text-center">
          <p className="text-base font-semibold text-text-primary">Feature not found</p>
          <p className="mt-1 text-sm text-text-secondary">
            No catalog entry matches <span className="font-semibold">&quot;{query}&quot;</span> yet.
          </p>
          <p className="mt-2 text-xs text-text-tertiary">
            Add it to <code className="rounded bg-surface-secondary px-1 py-0.5">frontend/src/lib/feature-catalog.ts</code> so it becomes searchable.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <FeatureCard key={item.id} item={item} query={query} />
          ))}
        </div>
      )}
    </div>
  );
}
