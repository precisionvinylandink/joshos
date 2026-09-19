# JoshOS — production readiness

Assessed 2026-09-19, at the commit that adds the Cost Center.

## Architecture

Not a framework app. JoshOS is a **single-file, zero-dependency HTML
application**: all CSS, all JavaScript and every page live in
`desktop/src/index.html` (~640 KB). This is deliberate and enforced by
`CLAUDE.md`. There is no React, no bundler, no build step for the web target,
no `node_modules` in the deployed artifact.

| Layer | What it actually is |
|---|---|
| Frontend | Vanilla JS + hand-written CSS, one file |
| Routing | `goTo(id)` toggling `.page` visibility; no router library |
| Backend | None of its own — Supabase REST is called directly with `fetch` |
| Database | Supabase Postgres, project `joshos-sync` (`lavbxjegicshhfvytapb`) |
| Query layer | Hand-rolled `fetch` against PostgREST. No ORM |
| Auth | Supabase GoTrue over REST, hand-rolled in the `JOSHOS-AUTH` block |
| Authorization | Postgres **RLS**, every table scoped to `auth.uid()` |
| Hosting | Vercel, project `joshos-timelog` (`prj_jjGOezpNb32GFq5GRmSfwZ5Fg6KF`) |
| CI/CD | Vercel's GitHub integration — a push to `main` deploys production |
| Tests | Plain Node scripts, no framework (`desktop/test/*.test.js`) |
| Desktop | Electron wrapper (`desktop/main.js`), `npm run build` → DMG |

`vercel.json` rewrites `/` → `desktop/src/index.html` and `/mobile` →
`ios/index.html`, and sets `X-Content-Type-Options`, `Referrer-Policy` and
`X-Frame-Options`.

## Persistence model — why there is no migration

State is **one row per user**: `joshos_state(user_id, data jsonb, device,
version, updated_at)`, RLS-scoped to `auth.uid()`, foreign-keyed to
`auth.users`. The whole `appData` object is the `data` column.

`localStorage['joshos']` is an offline cache only. The cloud row is the source
of truth: `pullFullState()` on boot, on a 60 s interval and on tab focus;
`pushFullState()` is a debounced write-through. Both no-op when signed out.

The Cost Center therefore needed **no schema change**. It rides in
`appData.costs`, exactly as the Financial Engine rides in `appData.finance` and
Growth Point 1's cache rides in `appData.work`. No table was created, altered or
dropped; no migration was applied; no existing data was touched.

One related change was required and made: `localHasContent()` now counts
`appData.costs.expenses` and `.payments`. Without it, a device holding only cost
data would have looked empty on boot and could have overwritten the cloud row.

## Existing tables (`joshos-sync`, public schema)

| Table | RLS | Rows | Status |
|---|---|---|---|
| `joshos_state` | ✅ owner-scoped | 1 | **GREEN** — the live store |
| `joshos_transactions` | ✅ owner-scoped | 0 | GREEN schema, no data yet |
| `plaid_items` / `plaid_accounts` / `plaid_syncs` | ✅ RLS, no policies | 0 | YELLOW — schema applied, function undeployed |
| `finance_connections` / `finance_metrics` | ✅ owner-scoped | 0 | YELLOW — deployed, inert without `FINANCE_SECRET_KEY` |
| `finance_connection_secrets` | ✅ RLS, **no policies** | 0 | GREEN by design — service role only |
| `timelog`, `daily_scorecard`, `joshos_theme`, `joshos_data` | RLS, policies dropped | 0 | Retired. Code paths early-return. Do not revive |

## Assessment

### GREEN — verified working

- Application starts and runs (local dev server and production build path).
- Authentication: Supabase GoTrue, session in `localStorage['joshos.session']`,
  auto-refresh, confirmed working in production (one real user row exists).
- **Authorization is server-side**: RLS on every table. Client-side hiding is
  not the protection — a request without a valid JWT returns nothing.
- Navigation: sidebar, mobile nav, command palette, all routes reachable.
- Cloud sync: pull/push against `joshos_state`, last-write-wins with an
  offline-dirty exception.
- **Cost Center**: full vertical slice — create, edit, archive, allocate,
  recur, record actuals, variance, forecast, history, CSV in and out. Verified
  in a browser against real records, including persistence across a reload.
- Test suite: 237 tests, 0 failures (see below).
- Production deployment pipeline: push to `main` → Vercel build → live.

### YELLOW — built and tested, no live data

- **Financial Engine (`FIN`)**: complete and covered by 58 tests, but no bank
  data has ever landed. It is an engine without a pipe.
- **WorkOS bridge**: the contract, retries and outbox are implemented and
  tested; live business sync depends on the bridge token being configured.
- **Growth Point 1 actuals**: the goal side is live; actuals require
  `GET {BRIDGE_URL}/metrics`.
- **Electron/DMG build**: `npm run build` is configured but was not run in this
  session (the web target is what deploys).

### RED — not working

- **Plaid bank sync**: `supabase/functions/joshos-plaid/index.ts` is written and
  its schema is applied, but the function is **not deployed** — it needs Plaid
  credentials. See `docs/FINANCIAL_ENGINE.md` §7.
- **`FINANCE_SECRET_KEY`** is not set, so `joshos-finance` is deployed but
  inert.

## Deployed URL

Production: **https://joshos-timelog.vercel.app**

The project has no custom domain attached. `josh-os.com` is not registered.
Vercel's generated domain is the real production URL and has automatic HTTPS.

## Environment requirements

The web app needs **no server-side environment variables** — it is a static
page. Its two endpoint values are compiled into the source on purpose:

| Value | Where | Kind | Safe to ship? |
|---|---|---|---|
| `SB_URL` | `index.html` | public | Yes |
| `SB_KEY` (publishable) | `index.html` | public | Yes — grants nothing without a session; every table is RLS-scoped |
| `APP_URL` | `index.html` | public | Yes |

Secrets that exist only as Supabase edge-function secrets, never in the client
and never in git:

| Secret | Function | Set? |
|---|---|---|
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_TOKEN_KEY` | `joshos-plaid` | **No** |
| `FINANCE_SECRET_KEY` | `joshos-finance` | **No** |
| Bridge token | `joshos-bridge` (on `precision-vinyl`) | Yes |

The repository is **public**. No secret may be committed. Nothing in this
change adds one.

## Test results

```
desktop/test/workos-bridge.test.js      30 passed, 0 failed
desktop/test/order-execution.test.js    36 passed, 0 failed
desktop/test/growth-point-1.test.js     36 passed, 0 failed
desktop/test/financial-engine.test.js   58 passed, 0 failed
desktop/test/cost-center.test.js        77 passed, 0 failed
─────────────────────────────────────────────────────────
                                       237 passed, 0 failed
```

There is no lint or typecheck configuration in this repository — no ESLint
config, no TypeScript for the client, no `lint` or `typecheck` npm script.
Nothing was disabled to reach green; the scripts do not exist. The equivalent
gate used here is a JavaScript syntax parse of the shipped file plus the test
suite, both of which pass.

## Remaining blockers

1. **Plaid is undeployed** — needs Plaid credentials. Blocks automatic bank
   ingestion, not the Cost Center.
2. **`FINANCE_SECRET_KEY` unset** — blocks Stripe/finance connections.
3. **No custom domain** — production runs on the Vercel-generated URL. This is
   a choice, not a fault.

None of these blocks the Cost Center, which is self-contained in
`appData.costs` and needs nothing beyond the existing authenticated sync.
