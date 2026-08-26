# JoshOS Financial Engine — architecture and contract

_Written 2026-08-26 after a full ecosystem audit (Phase 0 of the Financial
Operating System brief). Authoritative for the JoshOS side. Companion to
[`WORKOS_BRIDGE_CONTRACT.md`](WORKOS_BRIDGE_CONTRACT.md) (§4.6 is the finance
endpoint this engine consumes)._

---

## 1. What the audit found, and what this build did about it

The brief assumes JoshOS / LifeOS / WorkOS / AdOS are separable systems that
each might host financial logic. The audit established what actually exists:

| Brief concept | Reality (verified live, 2026-08-25/26) |
|---|---|
| **JoshOS** | The single-file app (`desktop/src/index.html`) — the master experience. Live. |
| **LifeOS** | Not a repo. The personal domains *inside* JoshOS (per `ARCHITECTURE.md` on the workos-finalization branch). |
| **WorkOS** | Three meanings historically. As of 2026-08-25 there is a real WorkOS business-finance build in the **JobOS repo** (branch `claude/workos-jobos-transformation-ff64ba`, pushed): a `workos` schema on the `jobos` Supabase project with `revenue_records`, `revenue_payments`, `revenue_reconciliation`, master identity, an event bus, and PVI/CPG/AdOS/DynamicQR adapters. It consumes the same PVI bridge (token `workos-sync`). |
| **Business SoR** | Still `precision-vinyl` (`siwotzlqfwgmhhnnnppc`): `pvi_invoices`, `payments`, `orders`, subscriptions, Stripe/Square/PayPal rails. It also carries a designed-but-empty canonical-transaction module (`financial_transactions`, `transaction_source_records`, `transaction_links`, `finance_categories`, `qb_sync_log`) belonging to the PVI admin portal. |
| **Personal bank data** | `joshos-sync` already holds an applied (unused) Plaid schema — `plaid_items` (AES-GCM-sealed tokens, RLS with zero policies), `plaid_accounts`, `plaid_syncs` — from unmerged branch `claude/joshos-vehicle-goals-plaid-eb110e`, which also holds a complete 717-line `joshos-plaid` edge function that was never deployed. |
| **DynamicQR** | Its own Supabase project with real Stripe billing. Its revenue is invisible to `precision-vinyl` aggregates (GP1's Dynamic QR figure reads `cpg_subscriptions`, which is empty). |

**Consequences the design follows:**

1. **Do not build a second business-finance system.** WorkOS (JobOS repo) and
   the PVI admin both have claims on business bookkeeping. JoshOS *consumes*
   business cash facts over the existing bridge and owns nothing business.
2. **Do not put financial ingestion in the client.** JoshOS has no server, no
   cron, no webhook URL. Bank ingestion belongs to `joshos-sync` edge
   functions + tables (the Plaid schema is already there); business facts
   arrive over the bridge.
3. **Own the personal domain fully.** No personal-finance code existed
   anywhere. That is the greenfield this engine fills.

## 2. Architecture

```
        LIFE (personal)                    WORK (business)
  Plaid → joshos-plaid fn → plaid_*   pvi_invoices/payments/orders/subs
  (not yet deployed — §7)   tables    in precision-vinyl (authoritative)
        │        │                                │
        │  manual entry · CSV import      joshos_finance_snapshot()  [SQL]
        │        │                                │
        └────────┴─────────┐            joshos-bridge  GET /finance
                           │            (scope finance:read)
                           ▼                      │
                ┌─────────────────────────────────▼─┐
                │   FIN-ENGINE  (desktop/src/index.html)   │
                │   pure · DOM-free · clock-injectable     │
                │   state: appData.finance (joshos_state)  │
                └───────────────┬──────────────────────────┘
             accounts · txns · categories · rules · splits ·
             transfers · recurring · expected payments ·
             events · forecast · budgets · debts · goals ·
             net worth · what-if · inbox · alerts · briefing
                           │
        ┌──────────────────┼───────────────────────┐
        ▼                  ▼                       ▼
   Money page         Business Money page     Home briefing card
   (LifeOS lens +     (WorkOS lens:           (cash · 7 days ·
    command center)    receivables, checks,    30-day low · review)
                       obligations)
```

One engine, one domain model, two lenses. Every record carries
`domain: 'LIFE' | 'WORK'`, `businessId` (nullable), `source` and `sourceId`,
and every read API filters by domain — a WORK query can never return LIFE
transactions (tested). Cross-domain totals exist only in the explicitly
`combined` views of the command center, side by side, never pooled.

### Where state lives, and why

- **`appData.finance`** — created lazily by `FIN.ensure(app)`, rides the
  existing `joshos_state` row (RLS `auth.uid()`), keyed-map shaped so the
  shallow last-write-wins sync survives it. This holds Josh's *working state*:
  manual accounts and transactions, categorization decisions, rules, budgets,
  goals, debts, expected payments, business reference snapshots, audit trail.
  Bounded by `FIN.compact()` — posted history older than
  `CFG.RETENTION_MONTHS` collapses into monthly category archives.
- **`joshos-sync` Postgres** — everything that must never reach a browser:
  Plaid access tokens (sealed), provider balances, sync audit. Written only by
  the (future) edge function; the client sees narrow owner-scoped reads.
- **`precision-vinyl`** — all business records, forever. JoshOS holds
  reference + display snapshot, keyed by `(externalTable, externalId)`.

## 3. The engine block

`FIN-ENGINE:BEGIN … /* FIN-ENGINE:END */` in `desktop/src/index.html`,
exposing `var FIN`. Same discipline as `WORKOS-BRIDGE` and `GROWTH-POINT-1`:
DOM-free, network-free, storage-free, `now` injected into every entry point
(Date or ISO string), extracted and executed verbatim by
`desktop/test/financial-engine.test.js` (58 checks). Purity is itself tested:
the suite fails if the block ever mentions `fetch(`, `document.`,
`localStorage`, timers, `Date.now()` or bare `new Date()`.

**Canonical config.** Every threshold lives in `FIN.CFG` — retention,
transfer windows, pending-match tolerances, price-change gates, expected-
payment tolerance/grace, alert floors, scenario confidence cuts. No magic
numbers elsewhere (house rule, same as `GP1.GOAL`).

**Money is integer cents.** Dollars exist only inside `FIN.fmt`. Dates are
`YYYY-MM-DD` strings with UTC arithmetic, so a timezone can never move a
transaction across a day boundary (the trade-off: late-evening local entries
stamp the next UTC day — consistent across devices, documented here).

### Pipeline (one path for every source)

```
raw txns (plaid | import | manual | sandbox)
  → ingest: validate → idempotent upsert on (source, sourceId)
  → provider removals marked `removed`, never deleted
  → pending→posted reconciliation (explicit id, then bounded heuristic;
    the posted row inherits category/review/splits from its hold)
  → categorize (precedence: user override > user rule > system rule >
    provider hint > uncategorized; AI suggestions land as catBy:'ai'
    below every human decision, and retro rule runs NEVER touch a
    reviewed transaction)
  → transfer detection (exact-amount pairs auto-pair inside 2 days;
    anything looser is a Review suggestion, not a guess)
  → expected-payment matching (single unambiguous candidate auto-matches;
    ambiguity queues for review)
```

### Derived layers

- **Recurring streams** — cadence inference (weekly…yearly) with a
  confidence built from count, interval regularity and amount stability.
  Price change fires only when the *prior* price was stable — groceries
  varying is variance, not a hike (regression-tested after live QA caught
  exactly this).
- **Financial events** — the unified feed: open expected payments (incl.
  those derived from business receivables), recurring projections, business
  obligations, debt minimums. Every event carries date, signed cents,
  source, ref, **confidence**, domain.
- **Forecast** — opening cash (checking/savings/cash accounts) plus the
  event feed → balance curve with three scenarios (conservative ≥0.8 /
  expected ≥0.5 / optimistic ≥0.25 inflow confidence). **Outflows are
  included in every scenario** — optimism about income is a scenario;
  optimism about bills is a lie.
- **Expected payments** — the "check is in the mail" model: amount ±
  tolerance, window, method, confidence, `open → received | missed |
  cancelled`, auto-matched against deposits.
- **Business snapshot** — `applyBizFinance()` upserts receivable /
  subscription / obligation references and derives an expected inflow per
  open receivable (confidence 0.8 with a due date, 0.5 without). A fresh
  snapshot always overwrites local edits of derived items and closes
  expecteds whose receivable settled or vanished. MRR is carried separately
  and can never enter a cash forecast.
- **Budgets** (monthly, per-category, optional rollover) · **net worth**
  (by domain; account-linked debts never double-count) · **debts** (payoff
  simulation with interest-saved, and an honest "minimum never pays this
  off" answer) · **goals** (required-monthly from deadline) ·
  **what-if** (runs on a JSON clone; the test proves the real books are
  byte-identical after a simulation) · **inbox** (uncategorized, possible
  transfers, price changes, unmatched/missed expected payments, stale
  pendings, sync errors, integrity problems — each with actions) ·
  **alerts** (configurable; low balance, projected dip, price increase,
  overdue receivable, stale business read) · **briefing** (cash, week
  in/out, 30-day low, attention) · **sandbox** (deterministic fake dataset;
  entering stashes the real subtree untouched and exiting restores it
  exactly — tested byte-for-byte) · **integrity** (split sums, transfer
  pairs cancel, references resolve — surfaced in Review).

### UI

- **Money** (`page-money`, Life group) — tabs: Overview (the command center:
  personal + business side by side, alerts, review count), Transactions
  (filters, inline categorize/review/split, manual add, CSV import),
  Cash Flow (30/60/90 curve + scenarios + expected-payment entry + what-if),
  Budget, Recurring (monthly/annual totals, price-change chips, mute),
  Balance Sheet (accounts/debts/goals/net worth), Review (the inbox).
- **Business Money** (`page-bizmoney`, Work group) — receivables with aging
  and overdue flags, expected checks, recent payments, obligations, MRR
  labeled "run rate, not cash".
- **Home** — a Money briefing card between Growth Point 1 and the metric
  strip; hidden until there is data.
- **Settings → Data & sync → Money & banking** — business-finance status,
  honest Plaid not-configured state, sandbox toggle.

Freshness is always shown ("Business synced 4 min ago"), a failed bridge
read keeps the last good figures on screen and says so, and sandbox mode is
loudly labeled everywhere.

## 4. Business integration (deployed)

- `joshos_finance_snapshot()` in `precision-vinyl` — migration
  `20260826013520`, exact SQL mirrored in
  [`workos/20260826013520_joshos_finance_snapshot.sql`](workos/20260826013520_joshos_finance_snapshot.sql).
  EXECUTE revoked from `public`/`anon`/`authenticated`; service-role only.
  Confirmed absent from the security advisors after deployment.
- `joshos-bridge` **v9** — one additive route `GET /finance` (scope
  `finance:read`); every pre-existing route byte-identical and re-verified
  live after deployment (`/work`, `/metrics`, `/outbox`, 401/403/404 paths).
  Source mirrored in [`workos/joshos-bridge.ts`](workos/joshos-bridge.ts).
  The JobOS repo's copy (`integrations/pvi/joshos-bridge/index.ts`) is now
  one route behind and should be synced from a JobOS session.
- Scopes: `joshos-desktop` token gained `finance:read` (no re-pasting
  needed). `workos-sync` deliberately did not.
- Verified end-to-end: live payload (INV-1003, $1,166.37 remaining, three
  settled payments) → `applyBizFinance` → receivable + derived expected
  payment rendered in Business Money. The temporary verification token was
  revoked immediately after (`finance-verify-temp`, revoked 2026-08-26).

## 5. Domain separation, ownership, precedence

| Rule | Where enforced |
|---|---|
| JoshOS never writes business state | No write path exists; bridge finance is GET-only |
| Business records identified only by `(externalTable, externalId)` | engine `bizKey`, bridge payload, tested |
| No customer names/emails cross the finance endpoint | `joshos_finance_snapshot()` selects document numbers only |
| Live beats manual | derived expecteds are `source:'business'`; snapshot overwrite tested |
| MRR ≠ cash | separate field, never an event; tested |
| LIFE/WORK isolation | domain filter on every read API; cross-domain only via explicit combined views; tested |
| User classification is never silently changed | `applyRulesRetro` skips reviewed/user rows; tested |
| Nothing financial is silently lost | removals/reconciliations mark rows and write the audit ring; integrity check surfaces violations |
| Forecasts are scenarios, not promises | per-event confidence + three scenario cuts; outflows always included |

## 6. Security

- No new secrets exist anywhere in this repo (public repo rule). The bridge
  token stays where it was: pasted into Settings, stored in
  `appData.settings.workosBridgeToken`, RLS-scoped cloud row.
- `joshos_finance_snapshot`: SECURITY DEFINER with pinned `search_path`,
  EXECUTE revoked from every client role — verified against the advisors.
- Plaid design (ported, not yet active): tokens AES-GCM-sealed with a key
  that exists only as an edge-function secret; `plaid_items` has RLS enabled
  with **zero policies** (service-role only); read-only Plaid endpoint
  allowlist; webhooks verified (ES256 + body hash + replay window).
- Pre-existing `precision-vinyl` advisor findings (315: anonymous sign-ins
  enabled with anon-privileged policies, 4 SECURITY DEFINER view errors,
  definer functions executable by authenticated) are **not** caused or
  extended by this work — and the 2026-08-25 migrations
  (`credit_and_membership_function_security`,
  `lock_down_remaining_definer_functions`, `close_definer_view_leaks`) show
  active remediation on the PVI side. The boundary here assumes that project
  is hostile territory anyway: JoshOS holds no key to it.

## 7. Activating live bank sync (the one missing credentialed piece)

Everything is staged; nothing can be faked without the credentials, so this
remains honestly manual:

1. Create a Plaid account → get `PLAID_CLIENT_ID` / `PLAID_SECRET`
   (start with `PLAID_ENV=sandbox`).
2. Generate a token key: `openssl rand -base64 32` → `PLAID_TOKEN_KEY`.
3. Deploy `supabase/functions/joshos-plaid/index.ts` (in this repo, ported
   intact from branch `claude/joshos-vehicle-goals-plaid-eb110e`) to
   `joshos-sync` with those secrets. The DB side is **already applied**
   (`plaid_link` migrations, mirrored in `supabase/migrations/`).
4. Wire the client: the engine ingests via
   `FIN.upsertProviderAccounts(app,'plaid',…)` +
   `FIN.ingest(app,'plaid',…)`; the function's `/transactions` route
   returns id/date/amount today and should move to `/transactions/sync`
   (cursor column already exists on `plaid_items`) and carry
   name/merchant/pending for categorization — that widening of retention is
   a deliberate policy change from the goals branch's minimal scope and
   must be made knowingly.
5. A JoshOS account must exist (`joshos-sync` still has **0 auth users** —
   the cloud row the finance state syncs into does not exist until Josh
   signs up in the deployed app).

Until then: manual entry, CSV import and the sandbox are fully functional,
and the business side is live.

## 8. Status vs. the 19-phase brief

| Phase | Status |
|---|---|
| 0 audit · 1 data model · 2 engine · 3 accounts | **done** |
| 4 provider integration | staged (function + schema ported; needs credentials + deploy — §7) |
| 5 ingestion/reconciliation · 6 categorization+rules · 7 recurring+subscriptions · 8 events · 9 forecasting | **done** (engine, tested) |
| 10 LifeOS experience · 11 WorkOS experience · 12 business integration · 13 calendar (event feed) · 14 inbox · 15 goals/debt/net worth · 16 what-if | **done** (v1 UI; calendar is the Cash Flow event list, not a month grid yet) |
| 17 AI financial reasoning | not started (the Assistant can be given `FIN.briefing`/`forecast`/`spendingReport` outputs as grounded context — engine returns cite-able records; do not let it invent numbers) |
| 18 hardening · 19 production audit | this document + the test suite are the current state; live-bank paths re-audit when Phase 4 activates |

## 9. Invariants for future work

- Never split `index.html`; the engine grows inside its markers.
- Never hardcode a threshold outside `FIN.CFG`.
- Never write business state from JoshOS; never store a business key.
- Never let a typed number survive a live snapshot ("live beats manual").
- Never render a failed read as a zero.
- Never auto-change a classification a human confirmed.
- Sandbox data and real data must never mix.
- `node desktop/test/financial-engine.test.js` (with the other three suites)
  before every commit that touches the block.
