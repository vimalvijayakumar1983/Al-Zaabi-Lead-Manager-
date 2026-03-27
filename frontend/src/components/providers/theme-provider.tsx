'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_PRESET,
  getResolvedMode,
  readSavedThemeSettings,
  resolveThemePreset,
  saveThemeSettings,
  THEME_PRESETS,
  type ThemeMode,
  type ThemePresetKey,
} from '@/lib/theme';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  preset: ThemePresetKey;
  setMode: (mode: ThemeMode) => void;
  setPreset: (preset: ThemePresetKey) => void;
  presets: typeof THEME_PRESETS;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(mode: ThemeMode, preset: ThemePresetKey) {
  if (typeof document === 'undefined') return;
  const resolvedMode = getResolvedMode(mode);
  const palette = resolveThemePreset(preset);
  const root = document.documentElement;

  root.dataset.theme = resolvedMode;
  root.dataset.themePreset = preset;

  root.style.setProperty('--brand-50', palette.brand[50]);
  root.style.setProperty('--brand-100', palette.brand[100]);
  root.style.setProperty('--brand-200', palette.brand[200]);
  root.style.setProperty('--brand-300', palette.brand[300]);
  root.style.setProperty('--brand-400', palette.brand[400]);
  root.style.setProperty('--brand-500', palette.brand[500]);
  root.style.setProperty('--brand-600', palette.brand[600]);
  root.style.setProperty('--brand-700', palette.brand[700]);
  root.style.setProperty('--brand-800', palette.brand[800]);
  root.style.setProperty('--brand-900', palette.brand[900]);
  root.style.setProperty('--brand-950', palette.brand[950]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [preset, setPresetState] = useState<ThemePresetKey>(DEFAULT_THEME_PRESET);
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>(() => getResolvedMode(DEFAULT_THEME_MODE));

  useEffect(() => {
    const saved = readSavedThemeSettings();
    const initialMode = saved.mode || DEFAULT_THEME_MODE;
    const initialPreset = saved.preset || DEFAULT_THEME_PRESET;
    setModeState(initialMode);
    setPresetState(initialPreset);
    const nextResolved = getResolvedMode(initialMode);
    setResolvedMode(nextResolved);
    applyThemeToDocument(initialMode, initialPreset);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mode !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const nextResolved = media.matches ? 'dark' : 'light';
      setResolvedMode(nextResolved);
      applyThemeToDocument('system', preset);
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, [mode, preset]);

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      setModeState(nextMode);
      const nextResolved = getResolvedMode(nextMode);
      setResolvedMode(nextResolved);
      saveThemeSettings({ mode: nextMode, preset });
      applyThemeToDocument(nextMode, preset);
    },
    [preset]
  );

  const setPreset = useCallback(
    (nextPreset: ThemePresetKey) => {
      setPresetState(nextPreset);
      saveThemeSettings({ mode, preset: nextPreset });
      applyThemeToDocument(mode, nextPreset);
    },
    [mode]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolvedMode,
      preset,
      setMode,
      setPreset,
      presets: THEME_PRESETS,
    }),
    [mode, resolvedMode, preset, setMode, setPreset]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
