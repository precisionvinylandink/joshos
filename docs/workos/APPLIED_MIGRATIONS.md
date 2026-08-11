# precision-vinyl — applied bridge migrations

**Status: APPLIED** to `siwotzlqfwgmhhnnnppc` on 2026-08-11.

| Version | Name |
|---|---|
| `20260811215554` | `joshos_bridge_lifecycle_columns` |
| `20260811215631` | `joshos_bridge_projection_and_outbox` |
| `20260811215645` | `joshos_bridge_event_triggers` |

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

---

## Rollback

Removes only what these migrations added. Touches no business data.

```sql
do $$ declare t text; begin
  foreach t in array array['quote_requests','pvi_quotes','cpg_opportunities',
                           'cpg_quotes','jobs','invoices','promo_quote_requests']
  loop execute format('drop trigger if exists joshos_emit on public.%I', t); end loop;
end $$;
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
