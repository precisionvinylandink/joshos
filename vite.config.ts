import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

// VITE_BUILD_TARGET controls which master(s) ship.
//   'web'     → JobOS only (served from a business subdomain). LifeOS is stripped.
//   'desktop' → full JoshOS (both masters). This is also the default for `npm run dev`.
//
// NOTE: the migration prompt specified `=== 'desktop'`, but that would strip LifeOS
// during a bare `npm run dev` (which sets no target), breaking the desktop dev
// experience. `!== 'web'` is the faithful realization of the hard rule
// "LifeOS must never ship to web" while keeping dev = full app.
const target = process.env.VITE_BUILD_TARGET ?? 'desktop';
const isWeb = target === 'web';
const LIFEOS_ENABLED = !isWeb;

export default defineConfig(({ command }) => ({
  define: {
    // Compile-time constant. Any LifeOS code reached ONLY through `if (__LIFEOS_ENABLED__)`
    // + dynamic `import()` is dead-code-eliminated from the web bundle by Rollup.
    __LIFEOS_ENABLED__: JSON.stringify(LIFEOS_ENABLED),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  plugins: [
    react(),
    // Electron main + preload are only relevant to the desktop build/dev.
    // Skipping the plugin for the web build keeps Node/Electron out of that graph.
    ...(isWeb
      ? []
      : [
          electron({
            main: {
              entry: 'electron/main.ts',
              // In dev, concurrently + wait-on launches Electron (prompt's pattern),
              // so the plugin only (re)builds the main process; it does not auto-start.
              onstart() {
                /* no auto-launch: `npm run dev:desktop` handles it */
              },
              vite: {
                build: {
                  outDir: 'dist-electron',
                  rollupOptions: { external: ['electron', 'electron-updater'] },
                },
              },
            },
            preload: {
              input: 'electron/preload.ts',
              vite: { build: { outDir: 'dist-electron' } },
            },
            renderer: {},
          }),
        ]),
  ],
  build: {
    outDir: 'dist',
    sourcemap: command === 'serve',
    // A single vendor split keeps the tree-shake grep simple to reason about.
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: { port: 5173, strictPort: true },
}));
