# JoshOS

JoshOS is a shell that hosts two **master programs**:

- **JobOS** — print-shop operations for Precision Vinyl & Ink.
- **LifeOS** — personal health, money, habits, goals.

This file is the current law. The old prototype's instructions in
[`legacy/CLAUDE.legacy.md`](legacy/CLAUDE.legacy.md) — "single-file, vanilla JS, no
frameworks" — are **superseded**. Do not follow them for new work.

---

## Architecture

### The shell / two masters

`src/shell/` renders the chrome (sidebar, top bar, master switcher, command
palette, Today). Each master lives under `src/masters/<master>/` and mounts its
own routes and sidebar nav. The **Today** page is the point of the whole thing:
JobOS and LifeOS items interleave in ONE chronological column (a nutrition
reminder sits beside a shipping deadline). Never split Today into per-master
sections — sort strictly by `sortTime`, then urgency.

### JobOS — Job-centric DDD

JobOS is built around ONE central object: the **Job**
(`masters/jobos/core/job`). Every domain (crm, estimating, production, inventory,
procurement, fulfillment, accounting, files, vendors, printclub, rfid) exists only
because it serves the Job. Every module attaches to a Job; every action emits an
**event** (`masters/jobos/core/events`). Domain-Driven, event-driven, API-first.
Domain folders are currently stubs (`types.ts` / `api.ts` / `hooks.ts` with TODOs)
— no JobOS business logic yet.

### LifeOS — the rehomed prototype

LifeOS absorbs the prototype's real features as its first domains:
- **timelog** (`masters/lifeos/domains/timelog`) — real port. Hourly check-ins,
  `:15`-past alerts 7 AM–8 PM as **native OS notifications**, Pull-Phone sync.
- **scorecard** (`masters/lifeos/domains/scorecard`) — real port. Two blocks,
  exact S–D scoring.
- **health / money / habits / goals** — placeholders.

---

## Two build targets — and the hard rule

`VITE_BUILD_TARGET` = `desktop` | `web` (default `desktop`).

- **desktop** — full JoshOS (both masters), Electron, routes `/today`, `/job/*`,
  `/life/*`.
- **web** — **JobOS only**, deployed to `admin.precisionvinylandink.com`.

> **LifeOS must NEVER ship in the web bundle.** Personal health/financial data
> cannot live in a bundle served from a business subdomain. This is enforced at
> **build time, not hidden at runtime.**

**How it's enforced.** `vite.config.ts` defines the compile-time constant
`__LIFEOS_ENABLED__` ( = `VITE_BUILD_TARGET !== 'web'` ). Anything that reaches
LifeOS code — the `/life/*` routes, the Today route + aggregator, the desktop
shell chrome (master switcher + LifeOS nav), the hourly-alert scheduler — is
imported **only** through a dynamic `import()` guarded by `if (__LIFEOS_ENABLED__)`.
On the web build that constant is `false`, so Rollup dead-code-eliminates the
branch and never pulls the LifeOS subtree in.

Two rules keep it working:
1. **Shared shell code must contain no LifeOS literals.** The shell uses master id
   `'life'`, never `'lifeos'`. Any string that would match the acceptance grep
   (`lifeos`, `timelog`, `scorecard`, `Rochester`) lives only in gated modules
   (`shell/desktopChrome.ts`, `masters/lifeos/**`, `shell/today/**`).
2. **Verify after any routing/shell change:**
   ```bash
   npm run build:web
   grep -riE "lifeos|timelog|scorecard|rochester" dist/   # must print nothing
   ```

> Note: the migration prompt wrote `__LIFEOS_ENABLED__ = (target === 'desktop')`.
> We use `!== 'web'` so a bare `npm run dev` (which sets no target) still shows the
> full desktop app. Same guarantee, correct dev behavior.

---

## Persistence contract (ported — do not weaken)

`src/shared/persistence/` is the three-layer save system, ported from the
prototype because **data loss actually happened**. All persistence goes through
it — **never call `localStorage` directly from feature code.**

- **Layer 1** — in-memory, immediate.
- **Layer 2** — durable local write, debounced (Electron JSON file, else
  localStorage, with a localStorage mirror/fallback even in Electron).
- **Layer 3** — Supabase sync, debounced + retried, always best-effort; a failed
  sync never loses local data.
- **Flush on every exit path**: `beforeunload`, `pagehide`,
  `visibilitychange→hidden`, window `blur` — and the Electron main process flushes
  AGAIN on window `close`, `before-quit`, and `window-all-closed`. Belt and
  suspenders, on purpose.
- Manual flush is exposed as `window.__flushSave` (the prototype's
  `window._flushSave`).

The app persists as ONE namespaced document (like the prototype's `appData`)
because the Electron backend is a single file. Domains own namespaced slices via
`usePersistentSlice(namespace, initial)`.

---

## Theme (ported)

`src/shared/theme/`. All colors are **CSS variables** — never hardcode hex in a
component. Tailwind maps to the same vars (`tailwind.config.js`), so utility
classes and custom CSS stay in sync. Themes persist to the `joshos_theme` table
and, on desktop, are pushed to Supabase so mobile mirrors them. Fixed shell chrome
(`--brand`, `--sidebar-bg`, `--login-bg`) is intentionally not themeable.

---

## Backend — Supabase `joshos-sync`

- Project: **joshos-sync** — `https://lavbxjegicshhfvytapb.supabase.co`
- The new app and the legacy apps share this project and these tables, so both run
  against the same data during the transition. **No data migration was done.**
- Tables (open RLS, public schema, unchanged): `timelog`, `daily_scorecard`,
  `joshos_theme`, and `joshos_data` (multi-device full state at id=2, iOS summary
  at id=1 — load-bearing, not in the old README).
- New LifeOS code reads/writes through typed adapters
  (`masters/lifeos/domains/*/api.ts`) so schema can be formalized later without
  touching feature code.

> The migration prompt named project `precision-os` (`hwgxnxqbnqlvdczpduzz`) and an
> old ref `fxhwqnojrcjetpcyhdwa`. Both were wrong for the live data — the prototype
> had already migrated to **joshos-sync**. Decision (confirmed with the owner):
> stay on joshos-sync; `precision-os` is out of scope.

---

## `/legacy` — do not extend

`legacy/` is the original working prototype (Electron single-file app + iOS PWA),
preserved for reference and as the fallback. **Do not add features to it.** It
still talks to joshos-sync. An untouched snapshot is on the `legacy/prototype`
branch. The iOS PWA is still live at `joshos-timelog.vercel.app` — see Vercel debt
below.

---

## Electron config provenance

The Electron/Vite/electron-builder setup was adapted from a proven config salvaged
from an abandoned PVI admin app (`~/Developer/_salvage/pvi-admin-electron`).
**Adopted:** dmg (arm64+x64), `category: business`, `darkModeSupport`,
`extendInfo.NSUserNotificationAlertStyle: "alert"` (**required** — makes the
timelog notifications persist), `LSUIElement: false`, the `joshos://` protocol,
`files`/`directories`, the `concurrently + wait-on` dev pattern, and
`tsconfig.electron.json`. **Discarded:** all of its application code (stub pages)
and PVI-specific identifiers.

---

## Known debt

- **Open RLS on personal tables.** `timelog`, `daily_scorecard`, `joshos_theme`,
  `joshos_data` are wide open. Lock down when LifeOS schemas are formalized.
- **LifeOS schema formalization pending.** Tables are shared-with-legacy and
  informal; a real schema + migration comes later, behind the typed adapters.
- **Legacy PWA replacement pending.** A React PWA will replace `legacy/ios`; until
  then the prototype PWA stays live.
- **Vercel root-deploy clobber (act before merging to `main`).** The live
  `joshos-timelog.vercel.app` deploys from the **repo root** with git auto-deploy
  on. This branch replaces the root with the new web app, so the connected Vercel
  project's **Root Directory must be repointed to `legacy/ios`** (or the PWA moved
  to its own project) BEFORE `main` updates, or the PWA breaks. Root `vercel.json`
  now builds the JobOS web target.
- **Supabase 2-active-free-project cap.** joshos-sync is paused and can't be
  restored without pausing `precision-vinyl` or `murphy-crew-store` (or upgrading).
  Live auth + live reads/writes can't be verified until a slot is freed.
- **Tauri migration undecided.** Electron for now; Tauri is a possible future move.

---

## Commands

```bash
npm run dev           # Vite dev (browser), full desktop app
npm run dev:desktop   # Vite + Electron window
npm run build:web     # JobOS-only web bundle (LifeOS stripped) → dist/
npm run build:desktop # desktop build + electron-builder --mac → release/
npm run typecheck     # tsc strict, app + electron
```
