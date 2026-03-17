'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import type { Toast } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────

const getEntityUrl = (entityType?: string, entityId?: string): string | null => {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'lead':
      return `/leads/${entityId}`;
    case 'task':
      return '/tasks';
    case 'campaign':
      return '/campaigns';
    case 'pipeline':
      return '/pipeline';
    default:
      return null;
  }
};

const toastConfig: Record<
  Toast['type'],
  {
    icon: typeof CheckCircle;
    bgClass: string;
    borderClass: string;
    iconClass: string;
    progressClass: string;
  }
> = {
  success: {
    icon: CheckCircle,
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    iconClass: 'text-emerald-500',
    progressClass: 'bg-emerald-500',
  },
  error: {
    icon: XCircle,
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
    iconClass: 'text-red-500',
    progressClass: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    iconClass: 'text-amber-500',
    progressClass: 'bg-amber-500',
  },
  info: {
    icon: Info,
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    iconClass: 'text-blue-500',
    progressClass: 'bg-blue-500',
  },
};

// ─── Single Toast Item ───────────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
  onNavigate: (url: string) => void;
}

function ToastItem({ toast, onDismiss, onNavigate }: ToastItemProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const duration = toast.duration || 5000;
  const config = toastConfig[toast.type];
  const Icon = config.icon;
  const entityUrl = getEntityUrl(toast.entityType, toast.entityId);

  // Animate the progress bar
  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;

    // Force a reflow so the transition starts from 100 %
    el.style.width = '100%';
    el.getBoundingClientRect();
    el.style.transition = `width ${duration}ms linear`;
    el.style.width = '0%';
  }, [duration]);

  const handleClick = useCallback(() => {
    if (entityUrl) {
      onNavigate(entityUrl);
      onDismiss(toast.id);
    }
  }, [entityUrl, onNavigate, onDismiss, toast.id]);

  return (
    <div
      role="alert"
      className={`
        relative overflow-hidden
        w-80 max-w-full
        ${config.bgClass} border ${config.borderClass}
        shadow-float rounded-xl
        animate-slide-in-right
        transition-all duration-300 ease-out
        ${entityUrl ? 'cursor-pointer' : ''}
      `}
      onClick={entityUrl ? handleClick : undefined}
    >
      {/* Content */}
      <div className="flex items-start gap-3 p-4">
        <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconClass}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {toast.title}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
            {toast.message}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="flex-shrink-0 p-0.5 rounded-md hover:bg-black/5 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-black/5">
        <div
          ref={progressRef}
          className={`h-full ${config.progressClass} opacity-60`}
        />
      </div>
    </div>
  );
}

// ─── Toast Provider (renders all active toasts) ──────────────────

export default function ToastProvider() {
  const toasts = useNotificationStore((s) => s.toasts);
  const removeToast = useNotificationStore((s) => s.removeToast);
  const router = useRouter();

  const handleNavigate = useCallback(
    (url: string) => {
      router.push(url);
    },
    [router]
  );

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-3 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem
            toast={toast}
            onDismiss={removeToast}
            onNavigate={handleNavigate}
          />
        </div>
      ))}
    </div>
  );
}
