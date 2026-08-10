/**
 * The ported CSS-variable theme system. All colors in the app come from these
 * vars (Tailwind maps to them too, see tailwind.config.js) — never hardcode hex
 * in a component. Themes persist to the `joshos_theme` table and are mirrored to
 * mobile, exactly as in the prototype.
 */
export const THEME_VARS = [
  '--bg',
  '--surface',
  '--surface2',
  '--border',
  '--text',
  '--text-dim',
  '--text-muted',
  '--accent',
  '--accent2',
  '--accent3',
  '--radius',
] as const;
export type ThemeVar = (typeof THEME_VARS)[number];
export type ThemeVars = Partial<Record<ThemeVar, string>>;

/**
 * Presets. `joshos` is the new default (neutral-dark + orange brand); the other
 * eight are carried forward verbatim from the prototype so nothing is lost.
 */
export const THEME_PRESETS: Record<string, ThemeVars> = {
  joshos: {
    '--bg': '#0a0a0a',
    '--surface': '#141414',
    '--surface2': '#1a1a1a',
    '--border': '#262626',
    '--text': '#fafafa',
    '--text-dim': '#a3a3a3',
    '--text-muted': '#737373',
    '--accent': '#d94f00',
    '--accent2': '#f97316',
    '--accent3': '#378add',
    '--radius': '8px',
  },
  hacker: {
    '--bg': '#0a0a0a',
    '--surface': '#111',
    '--surface2': '#181818',
    '--border': '#2a2a2a',
    '--text': '#f0ede6',
    '--text-dim': '#888',
    '--text-muted': '#444',
    '--accent': '#c8f535',
    '--accent2': '#ff5c1a',
    '--accent3': '#3b82f6',
    '--radius': '0px',
  },
  midnight: {
    '--bg': '#0f0f1a',
    '--surface': '#141428',
    '--surface2': '#1a1a32',
    '--border': '#2a2a50',
    '--text': '#e8e6f8',
    '--text-dim': '#8880cc',
    '--text-muted': '#44406a',
    '--accent': '#7c3aed',
    '--accent2': '#ec4899',
    '--radius': '8px',
  },
  rust: {
    '--bg': '#1a0f0a',
    '--surface': '#221510',
    '--surface2': '#2a1a14',
    '--border': '#442820',
    '--text': '#f5ede8',
    '--text-dim': '#a07060',
    '--text-muted': '#604030',
    '--accent': '#ea580c',
    '--accent2': '#fbbf24',
    '--radius': '6px',
  },
  ice: {
    '--bg': '#0a0f1a',
    '--surface': '#0f1520',
    '--surface2': '#141c28',
    '--border': '#1e2c40',
    '--text': '#e8f0f8',
    '--text-dim': '#6080a0',
    '--text-muted': '#304050',
    '--accent': '#38bdf8',
    '--accent2': '#818cf8',
    '--radius': '10px',
  },
  blood: {
    '--bg': '#0f0000',
    '--surface': '#1a0000',
    '--surface2': '#220000',
    '--border': '#3a0808',
    '--text': '#f8e8e8',
    '--text-dim': '#a06060',
    '--text-muted': '#603030',
    '--accent': '#ef4444',
    '--accent2': '#f97316',
    '--radius': '4px',
  },
  forest: {
    '--bg': '#0a120a',
    '--surface': '#0f180f',
    '--surface2': '#141e14',
    '--border': '#1e3020',
    '--text': '#e8f5e8',
    '--text-dim': '#60a060',
    '--text-muted': '#305030',
    '--accent': '#4ade80',
    '--accent2': '#a3e635',
    '--radius': '8px',
  },
  gold: {
    '--bg': '#0f0e00',
    '--surface': '#1a1800',
    '--surface2': '#222000',
    '--border': '#403800',
    '--text': '#f8f5e8',
    '--text-dim': '#a09050',
    '--text-muted': '#604820',
    '--accent': '#fbbf24',
    '--accent2': '#f97316',
    '--radius': '8px',
  },
  paper: {
    '--bg': '#f5f0e8',
    '--surface': '#ede8de',
    '--surface2': '#e5e0d4',
    '--border': '#c8c0b0',
    '--text': '#1a1a1a',
    '--text-dim': '#505050',
    '--text-muted': '#909090',
    '--accent': '#1a1a1a',
    '--accent2': '#8b4513',
    '--radius': '8px',
  },
};

export const DEFAULT_PRESET = 'joshos';

/** Merge a preset with any custom per-var overrides into the final applied set. */
export function resolveThemeVars(preset: string | null, overrides: ThemeVars): ThemeVars {
  const base = THEME_PRESETS[preset ?? DEFAULT_PRESET] ?? THEME_PRESETS[DEFAULT_PRESET]!;
  return { ...base, ...overrides };
}
