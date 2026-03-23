'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { BrainCircuit, Sparkles, Zap } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/dashboard' : '/login');
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-secondary px-4">
      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-glow animate-pulse-soft">
        <Sparkles className="h-7 w-7 text-white" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-text-primary text-center">
        AI-powered CRM for faster conversions
      </h1>
      <p className="mt-2 text-sm text-text-secondary text-center max-w-xl">
        Smart lead scoring, call intelligence, and actionable recommendations are loading for your workspace.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-primary px-3 py-1.5 text-xs text-text-secondary ring-1 ring-border shadow-soft">
          <BrainCircuit className="h-3.5 w-3.5 text-brand-600" />
          AI Lead Insights
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-primary px-3 py-1.5 text-xs text-text-secondary ring-1 ring-border shadow-soft">
          <Zap className="h-3.5 w-3.5 text-brand-600" />
          Smart Automation
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-primary px-3 py-1.5 text-xs text-text-secondary ring-1 ring-border shadow-soft">
          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
          Conversation Intelligence
        </span>
      </div>
      <p className="mt-6 text-sm text-text-tertiary">Loading LeadFlow...</p>
    </div>
  );
}
