'use client';

import { useMemo, useState } from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { THEME_PRESETS, type ThemeMode, type ThemePresetId } from '@/lib/theme';
import { useTheme } from '@/components/providers/theme-provider';

const MODE_META: { id: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher() {
  const { mode, setMode, preset, setPreset } = useTheme();
  const [open, setOpen] = useState(false);

  const activePreset = useMemo(
    () => THEME_PRESETS.find((option) => option.id === preset) || THEME_PRESETS[0],
    [preset]
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-icon relative"
        title="Theme"
      >
        <Palette className="h-4.5 w-4.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
            aria-label="Close theme menu"
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-border bg-white p-3 shadow-float">
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Appearance</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Mode: <span className="font-medium text-text-primary">{mode}</span> • Preset:{' '}
                <span className="font-medium text-text-primary">{activePreset.label}</span>
              </p>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg bg-surface-secondary p-1">
              {MODE_META.map((m) => {
                const Icon = m.icon;
                const active = m.id === mode;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      active ? 'bg-white text-text-primary shadow-xs' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-text-tertiary">Color preset</p>
            <div className="space-y-1">
              {THEME_PRESETS.map((presetOption) => {
                const active = presetOption.id === preset;
                return (
                  <button
                    key={presetOption.id}
                    type="button"
                    onClick={() => setPreset(presetOption.id as ThemePresetId)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-left transition-all ${
                      active ? 'border-brand-300 bg-brand-50' : 'border-border hover:bg-surface-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{presetOption.label}</p>
                        <p className="text-2xs text-text-secondary">{presetOption.description}</p>
                      </div>
                      {active ? <Check className="h-4 w-4 text-brand-600" /> : null}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: presetOption.colors.brand500 }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: presetOption.colors.surfaceSecondary }} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: presetOption.colors.textPrimary }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
