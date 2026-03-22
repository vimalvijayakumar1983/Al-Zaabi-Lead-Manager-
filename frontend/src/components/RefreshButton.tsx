'use client';

import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void;
  className?: string;
}

export function RefreshButton({ onRefresh, className = '' }: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);

  const handleClick = useCallback(async () => {
    setSpinning(true);
    try {
      await onRefresh();
    } catch {
      // ignore — individual pages handle their own errors
    } finally {
      // Keep spinning for at least 500ms so the animation is visible
      setTimeout(() => setSpinning(false), 500);
    }
  }, [onRefresh]);

  return (
    <button
      onClick={handleClick}
      disabled={spinning}
      className={`btn-icon h-9 w-9 ${className}`}
      title="Refresh data"
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} />
    </button>
  );
}
