'use client';

import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

type DialogVariant = 'default' | 'danger' | 'info';

interface BaseDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

interface PromptDialogOptions extends BaseDialogOptions {
  placeholder?: string;
  initialValue?: string;
  requiredValue?: string;
  requiredValueHint?: string;
}

function DialogShell({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  showCancel = true,
  inputConfig,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  showCancel?: boolean;
  inputConfig?: {
    placeholder?: string;
    initialValue?: string;
    requiredValue?: string;
    requiredValueHint?: string;
    onValueChange: (value: string) => void;
    value: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, onConfirm]);

  if (!mounted) return null;

  const icon = variant === 'danger'
    ? <Trash2 className="h-5 w-5 text-red-600" />
    : variant === 'info'
      ? <Info className="h-5 w-5 text-brand-600" />
      : <AlertTriangle className="h-5 w-5 text-amber-600" />;
  const iconBg = variant === 'danger'
    ? 'bg-red-50 ring-red-100'
    : variant === 'info'
      ? 'bg-brand-50 ring-brand-100'
      : 'bg-amber-50 ring-amber-100';
  const confirmClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-brand-600 hover:bg-brand-700 text-white';

  return (
    <div
      className={`fixed inset-0 z-[120] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-8">
        <div
          className={`w-full max-w-md rounded-2xl border border-border bg-white shadow-[0_25px_80px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 ${visible ? 'translate-y-0 scale-100' : '-translate-y-2 scale-[0.98]'}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl ring-1 flex items-center justify-center shrink-0 ${iconBg}`}>
                {icon}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary leading-tight">{title}</h3>
                <p className="text-sm text-text-secondary mt-1 leading-relaxed">{message}</p>
              </div>
            </div>

            {inputConfig && (
              <div className="mt-4">
                <input
                  autoFocus
                  value={inputConfig.value}
                  onChange={(event) => inputConfig.onValueChange(event.target.value)}
                  placeholder={inputConfig.placeholder || 'Type here'}
                  className="w-full h-10 rounded-lg border border-border-subtle px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                {inputConfig.requiredValueHint && (
                  <p className="text-2xs text-text-tertiary mt-1.5">
                    {inputConfig.requiredValueHint}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              {showCancel && (
                <button
                  onClick={onCancel}
                  className="h-9 px-3 rounded-lg text-sm font-medium bg-surface-secondary text-text-secondary hover:bg-surface-tertiary"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={onConfirm}
                className={`h-9 px-3 rounded-lg text-sm font-semibold ${confirmClass}`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function mountDialog<T>(renderer: (resolve: (value: T) => void) => JSX.Element): Promise<T> {
  return new Promise<T>((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const settle = (value: T) => {
      root.unmount();
      container.remove();
      resolve(value);
    };

    root.render(renderer(settle));
  });
}

export async function premiumConfirm(options: BaseDialogOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  return mountDialog<boolean>((resolve) => (
    <DialogShell
      open
      title={options.title}
      message={options.message}
      confirmText={options.confirmText || 'Confirm'}
      cancelText={options.cancelText || 'Cancel'}
      variant={options.variant || 'default'}
      onConfirm={() => resolve(true)}
      onCancel={() => resolve(false)}
    />
  ));
}

export async function premiumAlert(options: Omit<BaseDialogOptions, 'cancelText'>): Promise<void> {
  if (typeof window === 'undefined') return;
  await mountDialog<void>((resolve) => (
    <DialogShell
      open
      title={options.title}
      message={options.message}
      confirmText={options.confirmText || 'OK'}
      variant={options.variant || 'info'}
      showCancel={false}
      onConfirm={() => resolve()}
      onCancel={() => resolve()}
    />
  ));
}

export async function premiumPrompt(options: PromptDialogOptions): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return mountDialog<string | null>((resolve) => {
    function PromptDialog() {
      const [value, setValue] = useState(options.initialValue || '');
      const canConfirm = useMemo(() => {
        if (!options.requiredValue) return value.trim().length > 0;
        return value.trim().toUpperCase() === options.requiredValue.trim().toUpperCase();
      }, [value]);

      return (
        <DialogShell
          open
          title={options.title}
          message={options.message}
          confirmText={options.confirmText || 'Confirm'}
          cancelText={options.cancelText || 'Cancel'}
          variant={options.variant || 'danger'}
          inputConfig={{
            value,
            onValueChange: setValue,
            placeholder: options.placeholder || '',
            initialValue: options.initialValue,
            requiredValue: options.requiredValue,
            requiredValueHint: options.requiredValueHint,
          }}
          onConfirm={() => {
            if (!canConfirm) return;
            resolve(value.trim());
          }}
          onCancel={() => resolve(null)}
        />
      );
    }

    return <PromptDialog />;
  });
}
