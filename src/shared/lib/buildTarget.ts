/**
 * Which master(s) this bundle ships. Single source of truth for runtime target
 * checks. For build-time tree-shaking of the LifeOS subtree, use the
 * `__LIFEOS_ENABLED__` compile-time constant instead (see global.d.ts).
 */
export const BUILD_TARGET = (import.meta.env.VITE_BUILD_TARGET ?? 'desktop') as
  | 'desktop'
  | 'web';

export const isDesktop = BUILD_TARGET === 'desktop';
export const isWeb = BUILD_TARGET === 'web';

/** True when running inside the Electron shell (preload bridge present). */
export const isElectron =
  typeof window !== 'undefined' && Boolean(window.joshOS?.isElectron);
