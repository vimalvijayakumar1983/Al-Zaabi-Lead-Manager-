export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedThemeMode = 'light' | 'dark';
export type ThemePresetKey = 'royal' | 'emerald' | 'sunset' | 'ocean';
export type ThemePresetId = ThemePresetKey;

export interface ThemeSettings {
  mode: ThemeMode;
  preset: ThemePresetKey;
}

export interface ThemePresetMeta {
  id: ThemePresetKey;
  label: string;
  description: string;
  colors: {
    brand500: string;
    surfaceSecondary: string;
    textPrimary: string;
  };
}

interface ThemePalette {
  brand: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
}

export const THEME_STORAGE_KEY = 'crm-theme-settings';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_THEME_PRESET: ThemePresetKey = 'royal';

export const THEME_PRESETS: ThemePresetMeta[] = [
  {
    id: 'royal',
    label: 'Royal Indigo',
    description: 'Balanced premium indigo palette.',
    colors: { brand500: '#6366f1', surfaceSecondary: '#f8f9fc', textPrimary: '#111827' },
  },
  {
    id: 'emerald',
    label: 'Emerald',
    description: 'Fresh, high-contrast green accent.',
    colors: { brand500: '#10b981', surfaceSecondary: '#f6fbf8', textPrimary: '#111827' },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm orange tone for energetic teams.',
    colors: { brand500: '#f97316', surfaceSecondary: '#fff9f5', textPrimary: '#111827' },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    description: 'Cool blue palette for analytical workflows.',
    colors: { brand500: '#3b82f6', surfaceSecondary: '#f4f8ff', textPrimary: '#111827' },
  },
];

const PRESET_PALETTES: Record<ThemePresetKey, ThemePalette> = {
  royal: {
    brand: {
      50: '#f0f0ff',
      100: '#e0e1ff',
      200: '#c7c8fe',
      300: '#a4a5fc',
      400: '#8183f8',
      500: '#6366f1',
      600: '#4f46e5',
      700: '#4338ca',
      800: '#3730a3',
      900: '#312e81',
      950: '#1e1b4b',
    },
  },
  emerald: {
    brand: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
      900: '#064e3b',
      950: '#022c22',
    },
  },
  sunset: {
    brand: {
      50: '#fff7ed',
      100: '#ffedd5',
      200: '#fed7aa',
      300: '#fdba74',
      400: '#fb923c',
      500: '#f97316',
      600: '#ea580c',
      700: '#c2410c',
      800: '#9a3412',
      900: '#7c2d12',
      950: '#431407',
    },
  },
  ocean: {
    brand: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
  },
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isThemePreset(value: unknown): value is ThemePresetKey {
  return value === 'royal' || value === 'emerald' || value === 'sunset' || value === 'ocean';
}

export function getResolvedMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveThemePreset(preset: ThemePresetKey): ThemePalette {
  return PRESET_PALETTES[preset] || PRESET_PALETTES[DEFAULT_THEME_PRESET];
}

export function readSavedThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') {
    return { mode: DEFAULT_THEME_MODE, preset: DEFAULT_THEME_PRESET };
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return { mode: DEFAULT_THEME_MODE, preset: DEFAULT_THEME_PRESET };
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    const mode = isThemeMode(parsed.mode) ? parsed.mode : DEFAULT_THEME_MODE;
    const preset = isThemePreset(parsed.preset) ? parsed.preset : DEFAULT_THEME_PRESET;
    return { mode, preset };
  } catch {
    return { mode: DEFAULT_THEME_MODE, preset: DEFAULT_THEME_PRESET };
  }
}

export function saveThemeSettings(next: ThemeSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
}

export function scriptToApplyStoredTheme() {
  return `
    (function () {
      try {
        var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
        var raw = window.localStorage.getItem(storageKey);
        var fallbackMode = ${JSON.stringify(DEFAULT_THEME_MODE)};
        var fallbackPreset = ${JSON.stringify(DEFAULT_THEME_PRESET)};
        var parsed = raw ? JSON.parse(raw) : {};
        var mode = (parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'system') ? parsed.mode : fallbackMode;
        var preset = (parsed.preset === 'royal' || parsed.preset === 'emerald' || parsed.preset === 'sunset' || parsed.preset === 'ocean') ? parsed.preset : fallbackPreset;
        var resolvedMode = mode === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : mode;
        var root = document.documentElement;
        root.dataset.theme = resolvedMode;
        root.dataset.themePreset = preset;
      } catch (e) {}
    })();
  `;
}

