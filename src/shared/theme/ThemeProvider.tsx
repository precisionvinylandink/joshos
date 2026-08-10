import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePersistentSlice } from '../persistence';
import { supabase } from '../lib/supabase';
import { isDesktop } from '../lib/buildTarget';
import type { Json } from '../lib/database.types';
import {
  DEFAULT_PRESET,
  THEME_PRESETS,
  resolveThemeVars,
  type ThemeVar,
  type ThemeVars,
} from './presets';

interface ThemeSlice {
  preset: string | null;
  overrides: ThemeVars;
}

interface ThemeContextValue {
  preset: string | null;
  vars: ThemeVars;
  presets: string[];
  setVar: (name: ThemeVar, value: string) => void;
  applyPreset: (name: string) => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const initialSlice: ThemeSlice = { preset: DEFAULT_PRESET, overrides: {} };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [slice, setSlice] = usePersistentSlice<ThemeSlice>('theme', initialSlice);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vars = useMemo(
    () => resolveThemeVars(slice.preset, slice.overrides),
    [slice.preset, slice.overrides],
  );

  // Apply to :root so both Tailwind classes and custom CSS see the live theme.
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(vars)) {
      if (value) root.style.setProperty(name, value);
    }
  }, [vars]);

  // Push to joshos_theme (id=1) so mobile mirrors — desktop only, debounced,
  // exactly like the prototype. Best-effort: never blocks the UI.
  useEffect(() => {
    if (!isDesktop) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void supabase
        .from('joshos_theme')
        .upsert({ id: 1, data: vars as unknown as Json })
        .then(({ error }) => {
          if (error) {
            /* offline / paused project — mobile mirror will catch up later */
          }
        });
    }, 2000);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [vars]);

  const setVar = useCallback(
    (name: ThemeVar, value: string) => {
      // A custom tweak drops the "active preset" pill (matches prototype behavior).
      setSlice((prev) => ({ preset: null, overrides: { ...prev.overrides, [name]: value } }));
    },
    [setSlice],
  );

  const applyPreset = useCallback(
    (name: string) => {
      if (!THEME_PRESETS[name]) return;
      setSlice({ preset: name, overrides: {} });
    },
    [setSlice],
  );

  const reset = useCallback(() => setSlice(initialSlice), [setSlice]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preset: slice.preset,
      vars,
      presets: Object.keys(THEME_PRESETS),
      setVar,
      applyPreset,
      reset,
    }),
    [slice.preset, vars, setVar, applyPreset, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
