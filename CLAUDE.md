# CLAUDE.md — Instructions for Claude Code

This is joshOS, a personal daily operating system for Josh Sonnenberg.

## Architecture

**Single-file design.** The entire desktop app lives in `desktop/src/index.html` (~560KB). All CSS, all JavaScript, all HTML pages are in this one file. Do not split it into separate files unless explicitly asked.

The iOS app lives entirely in `ios/index.html`. Same principle.

## Key Patterns

### Global State
All data is stored in a single `appData` object:
```javascript
let appData = {
  checks: {},        // checkbox states, keyed by data-id
  notes: {},         // check-in journal notes
  journal: {},       // end-of-day journal entries
  wins: [],          // wins log array
  morning: {},       // morning routine data
  settings: {},      // CSS vars, API keys, Supabase creds
  streak: 0,
  lastDate: null,
  timerSessions: 0,
  timeLog: {},       // { 'YYYY-MM-DD': { hour: entry } }
  scorecard: {},     // { 'Day Mon DD YYYY': { dials, connects, ... } }
  visionBoard: [],
  history: {},       // archived daily data
  aiHistory: []
}
```

### Saving Data
Always call `saveData()` after mutating `appData`. It's async but fire-and-forget is fine for most UI interactions.
```javascript
appData.someField = newValue;
saveData(); // no need to await in event handlers
```

### Adding a New Page
1. Add nav item in the `<nav id="sb">` sidebar
2. Add `<div class="page" id="page-yourpage">` in `#content`
3. Handle any init in the `goTo()` function switch

### CSS Variables (Theming)
Never hardcode colors. Always use CSS vars:
- `var(--bg)` — main background
- `var(--surface)` — card backgrounds  
- `var(--border)` — borders/dividers
- `var(--text)` — primary text
- `var(--text-dim)` — secondary text
- `var(--text-muted)` — tertiary/disabled text
- `var(--accent)` — primary accent (default: #c8f535 lime green)
- `var(--accent2)` — secondary accent (default: #ff5c1a orange)
- `var(--font-display)` — Bebas Neue
- `var(--font-mono)` — IBM Plex Mono
- `var(--font-body)` — IBM Plex Sans

### Auth + cloud state (personal)
JoshOS is an **authenticated, cloud-first** app. The Supabase project is
`joshos-sync` (`lavbxjegicshhfvytapb`).

```javascript
const SB_URL = 'https://lavbxjegicshhfvytapb.supabase.co';
const SB_KEY = 'sb_publishable_…'; // publishable key — safe to ship, grants nothing alone
```

- **Auth** lives in the `JOSHOS-AUTH:BEGIN … END` block: Supabase Auth over its REST
  endpoints, hand-rolled with `fetch` to keep the zero-dependency rule. The session
  (not the data) is cached in `localStorage['joshos.session']` and auto-refreshed.
- **State** lives in one row per user: `joshos_state(user_id, data, device, version,
  updated_at)`, RLS-scoped to `auth.uid()`. **The cloud row is the source of truth.**
  `localStorage['joshos']` is only an offline cache and is cleared on sign out.
- `pullFullState()` on boot, on a 60s interval, and on tab focus; `pushFullState()`
  is debounced write-through. Both no-op when signed out — personal state is never
  written unauthenticated.

> ⚠️ The org runs **more than two active Supabase projects** (verified
> 2026-08-26: `precision-vinyl`, `joshos-sync`, `jobos`, `ados`, `dynamicQR`
> active; `precision-os`, `joshos-timelog`, `murphy-crew-store` paused) — the
> old "free tier allows 2" note was stale. Still: never create a new project
> for data that needs to JOIN something in `precision-vinyl`.

**Retired:** `timelog`, `daily_scorecard`, `joshos_theme`, `joshos_data` all carried an
`allow_anon` policy (ALL / public / `true`) and were world-readable and writable with a
key committed to this public repo. Those policies are dropped and the code paths
early-return. Everything they held rides in `joshos_state`. Do not revive them.

### WorkOS bridge (business work)
JoshOS is the personal execution layer; the **business** system of record is a
separate system (today the `precision-vinyl` Supabase project). The boundary lives
in the marked block `WORKOS-BRIDGE:BEGIN … END` inside `index.html`.

- That block is **DOM-free and clock-injectable on purpose** — `desktop/test/workos-bridge.test.js`
  extracts and executes that exact block. Keep `document`/`window` out of it, and keep
  the markers intact.
- Business sync is the **one place that must not** use `.catch(()=>{})`. Failures are
  surfaced, retried from an outbox, and never reported as success.
- JoshOS holds only a scoped bridge token — **never** the business project's service
  role key or anon key.

A converted PVI order arrives over the same bridge as `type: 'job'` and becomes a
backward-scheduled execution plan (artwork → purchasing → production → QC →
packaging → delivery) anchored on the CUSTOMER due date. PVI owns the production
lead times and sends them as `stages`; JoshOS owns the schedule. Never
substitute a quote's `valid_until` for a production due date — they are
different facts, and §6.1 of the contract explains why.

### Growth Point 1 (revenue goal)
The revenue operating goal: **$53,990/month**, August 2026 → February 2027, the
same target every month. Lives in the marked block `GROWTH-POINT-1:BEGIN … END`
inside `index.html` — DOM-free and clock-injectable like the WorkOS engine, and
extracted by `desktop/test/growth-point-1.test.js`.

- **One canonical config.** `GP1.GOAL` is the only place any of these numbers
  appear. Never hardcode `53990`, `3000`, `15000`, `990` or `99` anywhere else.
  `GP1.goalIntegrity()` asserts the generators sum to the target.
- **JoshOS owns the goal; the business DB owns the actuals.** Actuals come from
  `GET {BRIDGE_URL}/metrics?month=YYYY-MM` (scope `metrics:read`), which calls
  `joshos_gp1_metrics()` in `precision-vinyl`. The flow is one-directional:
  *source-of-truth data → GP1 calculations → dashboard*. Never the reverse.
- **Live always beats manual.** Manual entry is a labelled fallback for a
  generator with no system of record (today: Scratch Off Studio only). A typed
  number must never be able to prop the goal up after a cancellation.
- **Active, never historical.** Subscriber counts use current active state, so
  a cancellation lowers the goal and a resubscription raises it again.
- **MRR is not cash.** Recurring generators are measured at run rate
  (`basis:'mrr'`); collected cash is carried separately and never substituted.

Sources per generator are tabulated in §4.5 of the contract.

### Financial Engine (Money / Business Money)
The shared financial domain model for both lenses — LIFE (personal) and WORK
(business). Lives in the marked block `FIN-ENGINE:BEGIN … END` inside
`index.html` — DOM-free and clock-injectable like WOB/GP1, extracted by
`desktop/test/financial-engine.test.js`. Full contract:
[`docs/FINANCIAL_ENGINE.md`](docs/FINANCIAL_ENGINE.md).

- **State** rides `appData.finance` (created lazily by `FIN.ensure`), integer
  cents everywhere, `YYYY-MM-DD` UTC dates. Every record carries
  `domain: 'LIFE'|'WORK'`, `businessId`, `source`, `sourceId`.
- **One canonical config.** Every threshold lives in `FIN.CFG` — never
  scatter a tolerance, window or confidence cut anywhere else.
- **Business facts arrive over the bridge** (`GET /finance`, scope
  `finance:read` → `joshos_finance_snapshot()` in `precision-vinyl`) as
  reference + display snapshot keyed by `externalId`. JoshOS derives expected
  payments from open receivables; a fresh snapshot always beats local edits,
  and MRR is carried separately from cash.
- **Precedence:** user override > user rule > system rule > provider hint >
  AI suggestion. Retro rule runs never touch a reviewed transaction.
- **Bank sync (Plaid)** is server-side only: schema is applied on
  `joshos-sync`; `supabase/functions/joshos-plaid/index.ts` is ported but
  NOT deployed (needs credentials — see `docs/FINANCIAL_ENGINE.md` §7).
- **Sandbox** (`FIN.sandboxEnter/Exit`) stashes the real books untouched and
  restores them exactly. Sandbox and real data are never mixed.

### Cost Center (shared business costs)
The other half of the money question. Growth Point 1 answers what comes in; the
Cost Center answers **what it costs to keep the whole ecosystem alive** across
Precision Vinyl & Ink, Chicago Promotional Group, Dynamic QR and shared
overhead. Lives in the marked block `COST-CENTER:BEGIN … END` inside
`index.html` — DOM-free and clock-injectable like WOB/GP1/FIN, extracted by
`desktop/test/cost-center.test.js`.

- **State** rides `appData.costs` (created lazily by `CC.ensure`), so it syncs
  through the existing `joshos_state` row. No new table, no migration.
- **One canonical record per cost.** A cost shared by three businesses is ONE
  expense with an allocation model — never three copies. Duplicating it turns a
  shared $200 bill into $600 of phantom overhead.
- **Allocation must be exact.** Percent splits use largest-remainder so the
  parts always sum to the whole, to the cent. A split that does not total 100%
  (or fixed parts that miss the expense total) is refused at save time and
  shown in red, never silently rounded away.
- **Money is integer cents, parsed by string arithmetic** (`CC.parseMoney`).
  Never `parseFloat(x)*100` — `19.99*100` is `1998.9999999999998`.
- **Expected ≠ actual.** A recorded payment snapshots the expected amount AND
  the allocation as they stood. Editing an expense changes the future only;
  it can never rewrite recorded history.
- **Estimates are labelled.** Only `billing.model === 'FIXED'` is a commitment;
  METERED / TIERED / UNKNOWN are carried in their own bucket with a confidence
  and a source, and the UI says "est".
- **One-time costs never enter the run rate** — they are not what next month
  costs.
- **One canonical config.** Every threshold lives in `CC.CFG`.

Businesses are `PVI`, `CPG`, `DQR`, `SHARED` — ids deliberately shared with the
Financial Engine's `businessId`, so a cost and a transaction agree on who owns
what. JoshOS owns costs; JobOS remains the production system and is never
reached into directly.

Full contract: [`docs/WORKOS_BRIDGE_CONTRACT.md`](docs/WORKOS_BRIDGE_CONTRACT.md).

```bash
node desktop/test/workos-bridge.test.js && node desktop/test/order-execution.test.js && node desktop/test/growth-point-1.test.js && node desktop/test/financial-engine.test.js && node desktop/test/cost-center.test.js
```

`desktop/test/authorization.test.js` is separate because it needs the network:
it takes the publishable key straight out of the shipped `index.html` and tries
to read and write every private table anonymously. Financial data is protected
by RLS, not by the UI, and this is what proves it.

```bash
node desktop/test/authorization.test.js
```

## Do Not
- Do not use React, Vue, or any framework
- Do not split index.html into multiple files
- Do not use `localStorage` directly — always go through `appData` + `saveData()`
- Do not remove the `window._flushSave` or `beforeunload` handler — critical for data persistence
- Do not change the Supabase credentials
- Do not add `node_modules` to git
- Do not let JoshOS write business state (quotes, invoices, customers) — it may only
  reference and react to it
- Do not identify a business record by name, email or title — only by `externalId`
- Do not scatter Growth Point 1 numbers through the code — they live only in `GP1.GOAL`
- Do not scatter Financial Engine thresholds — they live only in `FIN.CFG`
- Do not scatter Cost Center thresholds — they live only in `CC.CFG`
- Do not duplicate a shared cost per business — one record, one allocation
- Do not let an expense edit rewrite a recorded payment's expected amount
- Do not present a metered or estimated cost as a committed one
- Do not let a typed financial number survive a live business snapshot — live beats manual
- Do not count MRR as cash, mix sandbox with real money data, or let a WORK
  query return LIFE transactions (and vice versa)
- Do not count historical subscribers toward Growth Point 1 — only currently active ones
- Do not add Printware Supply Co., Stefania Vending, Elgin Sign & Banner, JoshOS
  or JobOS as Growth Point 1 generators; they are dissolved or not for sale this year

## Build Commands
```bash
cd desktop
npm install
npm start          # dev
npm run build      # production DMG
```

## iOS Deploy
```bash
cd ios
npx vercel@latest --prod --yes
```
