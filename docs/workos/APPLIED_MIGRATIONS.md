# precision-vinyl — applied bridge migrations

**Status: APPLIED** to `siwotzlqfwgmhhnnnppc`.

| Version | Name | Applied |
|---|---|---|
| `20260811215554` | `joshos_bridge_lifecycle_columns` | 2026-08-11 |
| `20260811215631` | `joshos_bridge_projection_and_outbox` | 2026-08-11 |
| `20260811215645` | `joshos_bridge_event_triggers` | 2026-08-11 |
| `20260812000003` | `order_execution_handoff` | 2026-08-12 |
| `20260812000004` | `joshos_bridge_orders` | 2026-08-12 |

The last two are the **order execution handoff** and live in the PVI repo at
`supabase/migrations/`. See §4 below.

All three are **additive**. No existing column was dropped, retyped or backfilled;
no RLS policy was changed; no existing table's behaviour was altered except by the
two new triggers described below.

> The earlier draft `001_joshos_bridge.sql` was deleted rather than kept: it
> contained a real modelling bug (it joined `pvi_quotes.client_id` to `clients.id`,
> when that column actually references `profiles.id`) and predated the
> `quote_requests` lifecycle columns. Keeping a wrong file next to a right one
> invites someone to run the wrong one.

---

## 1. `joshos_bridge_lifecycle_columns`

`quote_requests` is the only entry point carrying real inbound work, but it could
not express the customer clock — there was no timestamp for "we sent them the
quote" — and had no link to the formal quote it becomes.

**Added to `public.quote_requests`:**

| Column | Type | Why |
|---|---|---|
| `quoted_at` | `timestamptz` | The customer clock. Distinct from when Josh started work. |
| `approved_at` | `timestamptz` | Won timestamp |
| `declined_at` | `timestamptz` | Lost timestamp |
| `completed_at` | `timestamptz` | Terminal timestamp |
| `updated_at` | `timestamptz not null default now()` | The table had none |
| `company` | `text` | Organisation. The portal form does not collect it. |
| `pvi_quote_id` | `uuid → pvi_quotes(id)` | The missing link between request and formal quote |

**Added trigger** `quote_requests_stamp_lifecycle` (BEFORE UPDATE): maintains
`updated_at` and stamps the lifecycle timestamp when `status` changes. These are
business facts owned by the business database — JoshOS never writes them.

## 2. `joshos_bridge_projection_and_outbox`

- `public.joshos_canonical_status(text)` — normalises each table's vocabulary.
  Note **`quoted` → `sent`**: PVI's `quote_status` enum calls the send step
  "quoted". Unknown values pass through unchanged so an unrecognised status can
  never masquerade as a known one.
- `public.joshos_work_items` — the read projection, `security_invoker = true`
  (matching the existing `cpg_views_security_invoker` convention on this project,
  and avoiding a third `SECURITY DEFINER` view). Unions `quote_requests`,
  `pvi_quotes`, `cpg_opportunities`, `cpg_quotes`, `jobs`, `invoices`,
  `promo_quote_requests`. Excludes costs, margins, the IMS split, pricing
  internals and internal notes.
- `public.joshos_work_events` — outbox of business transitions.
- `public.joshos_inbound_events` — idempotency ledger for JoshOS → business
  events. **Dedupe only**; the business record of an activity goes to the
  existing `activity_log`.
- `public.joshos_bridge_tokens` — scoped tokens, SHA-256 hashed, revocable.

All three tables have RLS enabled and **no policies** — service role only. This
project enables anonymous sign-ins, so anything reachable by `anon` or
`authenticated` must be treated as publicly reachable.

## 3. `joshos_bridge_event_triggers`

`public.joshos_emit_work_event()` + an `joshos_emit` AFTER INSERT OR UPDATE
trigger on the seven business tables above. It reads the changed row back through
`joshos_work_items`, so the outbox payload and the `GET /work` response are
guaranteed to be the same shape, and derives the event type from the canonical
status transition.

## 4. Order execution handoff (2026-08-12)

The bridge as shipped projected seven tables. **`orders` was not one of them**,
so the order that "Convert to Order" creates was invisible to JoshOS — the one
gap that mattered, because that order is the actual production work.

These two migrations close it without a second integration: same view, same
outbox, same trigger function, same endpoint, same `(source, external_id)`
identity.

### `20260812000003_order_execution_handoff` (PVI repo)

**Added to `public.orders`:**

| Column | Type | Why |
|---|---|---|
| `due_date` | `timestamptz` | **The CUSTOMER production due date.** Nothing in the workflow held one. It is not `pvi_quotes.valid_until` (quote expiry), not `estimated_completion` (our internal estimate) and not `estimated_delivery` (a shipping estimate). |
| `quote_id` | `uuid → pvi_quotes(id)` | Forward link; mirrors `pvi_quotes.converted_to_order_id` |

`orders.priority` (`normal` \| `rush` \| `urgent`) **already existed** and is
used as-is. No rush column was added — the conversion path simply stopped
hardcoding `'normal'`.

**`public.production_stage_config`** — the backward-scheduling lead times, six
stages (artwork_proof → purchasing → production → qc → packaging → delivery).
PVI owns the durations; JoshOS does the scheduling. `lead_days_* = NULL` means
*unconfigured* and JoshOS refuses to guess; `is_confirmed = false` means
*provisional* and JoshOS builds the plan but flags it. Admin-only RLS both ways
(this project enables anonymous sign-ins, so `authenticated` is effectively
public).

**`public.convert_quote_to_order(quote_id, due_date, priority)`** — conversion
moved off the client. One transaction, totals recomputed from the quote row,
server-side admin check, a due date required, and **idempotent**: a quote that
is already converted returns its existing order rather than creating a second.

### `20260812000004_joshos_bridge_orders` (PVI repo)

- `joshos_canonical_status` gained the orders vocabulary: `payment_received →
  scheduled`, `quality_check → in_production`, `refunded → closed`.
- `joshos_stage_plan()` — serialises the lead-time config for the payload.
- `joshos_work_items` rebuilt with an **eighth branch for `orders`**, typed
  `job` (the existing canonical vocabulary for production work with a due
  date — no new enum value for any consumer), plus three new columns on every
  branch: `priority`, `rush`, `stages`.
- `joshos_emit` trigger on `orders`, argument `'job'`.
- `public.pvi_order_execution` — a derived view PVI's own UI reads to show
  whether the handoff happened (`not_synced` → `queued` → `synced` →
  `execution_active` / `at_risk` / `complete`). **Derived, never stored**: sync
  state lives in the outbox and execution activity in `activity_log`, so it can
  never claim a sync that did not occur.

> **`delivered` means two different things.** On a quote it is "we sent it to
> the customer" (→ `sent`); on an order it is "the goods arrived" (→
> `completed`). The shared SQL function keeps the quote reading and the orders
> branch overrides it; JoshOS carries the same override in `STATUS_BY_TABLE`,
> because the bridge sends the RAW status and JoshOS re-normalises it.

Tests: `supabase/tests/order_execution_handoff_test.sql` (PVI, transactional
and rolls back) and `desktop/test/order-execution.test.js` (this repo).

---

## Rollback

Removes only what these migrations added. Touches no business data.

```sql
do $$ declare t text; begin
  foreach t in array array['quote_requests','pvi_quotes','cpg_opportunities',
                           'cpg_quotes','jobs','invoices','promo_quote_requests',
                           'orders']
  loop execute format('drop trigger if exists joshos_emit on public.%I', t); end loop;
end $$;
drop view  if exists public.pvi_order_execution;
drop function if exists public.joshos_stage_plan();
drop function if exists public.convert_quote_to_order(uuid, timestamptz, text);
drop trigger if exists orders_touch_updated_at on public.orders;
drop function if exists public.orders_touch_updated_at();
drop table if exists public.production_stage_config;
-- orders.due_date / orders.quote_id are harmless if left; to remove them:
-- alter table public.orders drop column if exists due_date, drop column if exists quote_id;
drop trigger if exists quote_requests_stamp_lifecycle on public.quote_requests;
drop function if exists public.joshos_emit_work_event();
drop function if exists public.quote_requests_stamp_lifecycle();
drop view  if exists public.joshos_work_items;
drop table if exists public.joshos_work_events;
drop table if exists public.joshos_inbound_events;
drop table if exists public.joshos_bridge_tokens;
drop function if exists public.joshos_canonical_status(text);

-- The added columns are harmless if left, but to remove them:
-- alter table public.quote_requests
--   drop column if exists quoted_at, drop column if exists approved_at,
--   drop column if exists declined_at, drop column if exists completed_at,
--   drop column if exists updated_at, drop column if exists company,
--   drop column if exists pvi_quote_id;
```
