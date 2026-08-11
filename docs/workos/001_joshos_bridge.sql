-- ============================================================================
-- JoshOS bridge — WorkOS-side schema
--
--   Target project : precision-vinyl (siwotzlqfwgmhhnnnppc)
--   Status         : ** NOT APPLIED **  — review, then run deliberately.
--   Written        : 2026-08-11, against the live schema as it stood that day.
--
-- What this adds:
--   1. joshos_work_items      — a narrow, read-only projection of business work
--   2. joshos_work_events     — an outbox of business transitions
--   3. joshos_inbound_events  — idempotency ledger for JoshOS -> WorkOS events
--   4. joshos_bridge_tokens   — scoped, revocable tokens (hashed)
--   5. triggers that populate (2) from the real business tables
--
-- What this does NOT do:
--   * It does not modify, drop or reshape any existing business table.
--   * It does not relax RLS anywhere.
--   * It does not grant anon or authenticated any new access — the new tables
--     have RLS enabled with NO policies, so only the service role (which
--     bypasses RLS) can read them. That is deliberate: this project already
--     allows anonymous sign-ins with privileged policies, so anything reachable
--     by `anon` must be assumed publicly reachable.
--
-- Safe to run more than once (all DDL is IF NOT EXISTS / OR REPLACE).
-- ============================================================================

begin;

-- ── 1. Canonical status ─────────────────────────────────────────────────────
-- Mirrors STATUS_MAP in the JoshOS engine. Unknown values pass through
-- unchanged so that an unrecognised status can never masquerade as a known one.
create or replace function public.joshos_canonical_status(raw text)
returns text language sql immutable as $$
  select case lower(regexp_replace(coalesce(raw,''), '[\s-]+', '_', 'g'))
    when 'new' then 'new' when 'request' then 'new' when 'requested' then 'new'
    when 'open' then 'new' when 'pending' then 'new'
    when 'draft' then 'in_progress' when 'working' then 'in_progress'
    when 'in_progress' then 'in_progress' when 'preparing' then 'in_progress'
    when 'prepared' then 'prepared' when 'ready' then 'prepared'
    when 'sent' then 'sent' when 'emailed' then 'sent' when 'delivered' then 'sent'
    when 'awaiting_customer' then 'sent'
    when 'accepted' then 'won' when 'approved' then 'won' when 'won' then 'won'
    when 'converted' then 'won'
    when 'declined' then 'lost' when 'rejected' then 'lost' when 'lost' then 'lost'
    when 'cancelled' then 'lost' when 'canceled' then 'lost'
    when 'scheduled' then 'scheduled'
    when 'in_production' then 'in_production' when 'production' then 'in_production'
    when 'complete' then 'completed' when 'completed' then 'completed'
    when 'shipped' then 'completed' when 'fulfilled' then 'completed'
    when 'invoiced' then 'invoiced' when 'partial' then 'invoiced'
    when 'paid' then 'paid' when 'closed' then 'closed'
    else nullif(lower(regexp_replace(coalesce(raw,''), '[\s-]+', '_', 'g')), '')
  end;
$$;

-- ── 2. The projection ───────────────────────────────────────────────────────
-- Exactly the fields the contract (§4.2) allows JoshOS to see. Deliberately
-- excludes costs, margins, IMS split, internal notes and pricing internals.
--
-- NOTE: `security_invoker = true` keeps this view running with the caller's
-- privileges rather than the definer's — the opposite of the two SECURITY
-- DEFINER views the linter already flags on this project.
create or replace view public.joshos_work_items
with (security_invoker = true) as

  -- PVI quotes ---------------------------------------------------------------
  select
    q.id::text                            as external_id,
    'pvi_quotes'                          as external_table,
    'PVI'                                 as business,
    'quote'                               as type,
    coalesce(nullif(q.quote_number,''), 'Quote') ||
      coalesce(' — ' || nullif(q.client_company,''), '') as title,
    public.joshos_canonical_status(q.status) as status,
    q.status                              as raw_status,
    q.client_id::text                     as customer_id,
    null::text                            as contact_id,
    null::text                            as company_id,
    q.client_name                         as customer_label,
    coalesce(nullif(q.client_company,''), c.company) as company_label,
    q.total                               as amount,
    q.created_at, q.sent_at,
    q.approved_at                         as won_at,
    null::timestamptz                     as lost_at,
    q.converted_at                        as completed_at,
    q.valid_until::timestamptz            as due_at,
    q.updated_at                          as last_activity_at,
    null::text                            as next_action,
    null::timestamptz                     as next_action_due_at
  from public.pvi_quotes q
  left join public.clients c on c.id = q.client_id

  union all
  -- CPG quotes ---------------------------------------------------------------
  select
    q.id::text, 'cpg_quotes', 'CPG', 'quote',
    coalesce(nullif(q.quote_number,''), 'Quote') ||
      coalesce(' — ' || nullif(q.account_name,''), ''),
    public.joshos_canonical_status(q.status), q.status,
    q.client_id::text, null, q.opportunity_id::text,
    q.contact_name, q.account_name,
    null::numeric,
    q.created_at, q.sent_at,
    null::timestamptz, null::timestamptz, null::timestamptz,
    q.valid_until::timestamptz, q.updated_at,
    q.next_step, null::timestamptz
  from public.cpg_quotes q

  union all
  -- CPG opportunities --------------------------------------------------------
  select
    o.id::text, 'cpg_opportunities', 'CPG', 'opportunity',
    coalesce(nullif(o.title,''), o.account_name, 'Opportunity'),
    public.joshos_canonical_status(o.stage), o.stage,
    o.client_id::text, null, null,
    o.contact_name, o.account_name,
    o.value_estimate,
    o.created_at,
    null::timestamptz,                    -- opportunities carry no send time
    o.won_at,
    case when lower(coalesce(o.stage,'')) in ('lost','closed_lost')
         then o.stage_changed_at end,
    null::timestamptz,
    o.expected_close_date::timestamptz,
    coalesce(o.updated_at, o.stage_changed_at),
    o.next_action, o.next_action_date::timestamptz
  from public.cpg_opportunities o

  union all
  -- Jobs ---------------------------------------------------------------------
  select
    j.id::text, 'jobs', 'PVI', 'job',
    coalesce(nullif(j.title,''), nullif(j.job_number,''), 'Job'),
    public.joshos_canonical_status(j.status), j.status,
    j.client_id::text, null, null,
    c.name, c.company,
    j.total_price,
    j.created_at, null::timestamptz, null::timestamptz, null::timestamptz,
    case when public.joshos_canonical_status(j.status) = 'completed'
         then j.updated_at end,
    j.due_date::timestamptz, j.updated_at,
    null, null::timestamptz
  from public.jobs j
  left join public.clients c on c.id = j.client_id

  union all
  -- Invoices -----------------------------------------------------------------
  select
    i.id::text, 'invoices', 'PVI', 'invoice',
    coalesce(nullif(i.invoice_number,''), 'Invoice') ||
      coalesce(' — ' || nullif(i.client_name,''), ''),
    public.joshos_canonical_status(i.status), i.status,
    i.client_id::text, null, null,
    i.client_name, c.company,
    i.total,
    i.created_at,
    case when public.joshos_canonical_status(i.status) in ('sent','invoiced')
         then i.updated_at end,           -- best available proxy for sent_at
    null::timestamptz, null::timestamptz,
    i.paid_date::timestamptz,
    i.due_date::timestamptz, i.updated_at,
    null, null::timestamptz
  from public.invoices i
  left join public.clients c on c.id = i.client_id

  union all
  -- Inbound PVI quote requests (the "online request" entry point) -------------
  select
    r.id::text, 'quote_requests', 'PVI', 'quote_request',
    coalesce(nullif(r.category,''), 'Quote request') ||
      coalesce(' — ' || nullif(r.contact_name,''), ''),
    public.joshos_canonical_status(r.status::text), r.status::text,
    null, null, null,
    r.contact_name, null,
    null::numeric,
    r.created_at, null::timestamptz, null::timestamptz, null::timestamptz,
    null::timestamptz, null::timestamptz,
    r.created_at,                         -- table has no updated_at
    null, null::timestamptz
  from public.quote_requests r

  union all
  -- Inbound CPG quote requests -----------------------------------------------
  select
    r.id::text, 'promo_quote_requests', 'CPG', 'quote_request',
    'Promo quote request' ||
      coalesce(' — ' || nullif(r.company_name,''), ''),
    public.joshos_canonical_status(r.status), r.status,
    null, null, null,
    nullif(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
    r.company_name,
    r.quoted_amount,
    r.created_at, null::timestamptz, null::timestamptz, null::timestamptz,
    null::timestamptz, r.needed_by::timestamptz, r.updated_at,
    null, null::timestamptz
  from public.promo_quote_requests r;

comment on view public.joshos_work_items is
  'Read-only projection consumed by the JoshOS bridge. Narrow by design: no costs, margins or internal notes.';

-- ── 3. Outbox: business transitions ─────────────────────────────────────────
create table if not exists public.joshos_work_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text        not null,
  external_id   text        not null,
  external_table text       not null,
  payload       jsonb       not null,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
create index if not exists joshos_work_events_created_idx
  on public.joshos_work_events (created_at);
create index if not exists joshos_work_events_undelivered_idx
  on public.joshos_work_events (created_at) where delivered_at is null;
alter table public.joshos_work_events enable row level security;
-- Intentionally NO policies: service role only.

-- ── 4. Inbound idempotency ledger ───────────────────────────────────────────
-- JoshOS retries, so duplicates WILL arrive. The primary key is the guarantee.
create table if not exists public.joshos_inbound_events (
  id           text primary key,          -- JoshOS event id ("jos_…")
  event_type   text        not null,
  external_id  text,
  payload      jsonb       not null,
  received_at  timestamptz not null default now()
);
alter table public.joshos_inbound_events enable row level security;

-- ── 5. Scoped bridge tokens ─────────────────────────────────────────────────
-- Store only a SHA-256 hash. Revocable and rotatable without touching auth.
create table if not exists public.joshos_bridge_tokens (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  token_hash  text        not null unique,
  scopes      text[]      not null default array['work:read','events:write'],
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);
alter table public.joshos_bridge_tokens enable row level security;

-- ── 6. Emit transitions into the outbox ─────────────────────────────────────
-- Reads the row back through the projection so the outbox payload and the
-- /work response are guaranteed to have the same shape.
create or replace function public.joshos_emit_work_event()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v          public.joshos_work_items%rowtype;
  kind       text := tg_argv[0];
  old_status text;
  new_status text;
  ev         text;
begin
  select * into v from public.joshos_work_items
   where external_table = tg_table_name and external_id = new.id::text;
  if not found then return new; end if;

  new_status := v.status;

  if tg_op = 'INSERT' then
    ev := kind || '.created';
  else
    -- Read the previous status without dynamic SQL: cpg_opportunities calls it
    -- `stage`, every other table calls it `status`.
    old_status := public.joshos_canonical_status(
      coalesce(to_jsonb(old) ->> 'status', to_jsonb(old) ->> 'stage'));
    if old_status is not distinct from new_status then
      ev := kind || '.updated';
    else
      ev := kind || '.' || case new_status
              when 'sent'  then 'sent'
              when 'won'   then 'won'
              when 'lost'  then 'lost'
              when 'paid'  then 'paid'
              when 'completed' then 'completed'
              else 'updated' end;
    end if;
  end if;

  insert into public.joshos_work_events (event_type, external_id, external_table, payload)
  values (ev, v.external_id, v.external_table, to_jsonb(v));

  return new;
end;
$$;

-- This project's linter already flags SECURITY DEFINER functions that anon and
-- authenticated can execute. Do not add another one.
revoke all on function public.joshos_emit_work_event() from public, anon, authenticated;
revoke all on function public.joshos_canonical_status(text) from anon;

-- Attach. DROP-then-CREATE keeps this migration re-runnable.
do $$
declare t record;
begin
  for t in
    select * from (values
      ('pvi_quotes','quote'), ('cpg_quotes','quote'),
      ('cpg_opportunities','quote'), ('jobs','job'),
      ('invoices','invoice'), ('quote_requests','work'),
      ('promo_quote_requests','work')
    ) as x(tbl, kind)
  loop
    execute format('drop trigger if exists joshos_emit on public.%I', t.tbl);
    execute format(
      'create trigger joshos_emit after insert or update on public.%I
         for each row execute function public.joshos_emit_work_event(%L)',
      t.tbl, t.kind);
  end loop;
end $$;

commit;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Removes only what this migration added; touches no business data.
--
--   do $$ declare t text; begin
--     foreach t in array array['pvi_quotes','cpg_quotes','cpg_opportunities',
--                              'jobs','invoices','quote_requests','promo_quote_requests']
--     loop execute format('drop trigger if exists joshos_emit on public.%I', t); end loop;
--   end $$;
--   drop function if exists public.joshos_emit_work_event();
--   drop view  if exists public.joshos_work_items;
--   drop table if exists public.joshos_work_events;
--   drop table if exists public.joshos_inbound_events;
--   drop table if exists public.joshos_bridge_tokens;
--   drop function if exists public.joshos_canonical_status(text);
