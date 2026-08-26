-- ═══════════════════════════════════════════════════════════════════════════
-- Major Goals — read-only bank linking (Plaid)
--
-- PROJECT: joshos-sync (lavbxjegicshhfvytapb) — the same project that already
-- holds joshos_state. Reuses the existing auth.users identity; no new user
-- model, no new auth, no duplicate state table.
--
-- WHAT LIVES WHERE
--   The GOALS themselves are not here. They ride in the existing
--   joshos_state.data blob, already RLS-scoped to auth.uid(). Only the things
--   that must not touch a browser live in Postgres:
--     plaid_items     the encrypted Plaid access token, per institution
--     plaid_accounts  the last balance we were told, per account
--     plaid_syncs     an audit trail for debugging connections
--
-- OWNERSHIP IS ENFORCED HERE, NOT IN THE CLIENT
--   Every table is RLS-enabled and keyed on user_id -> auth.users. The edge
--   function additionally scopes every query by the authenticated uid, but the
--   database is the backstop: even a compromised client key cannot read
--   another account's rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── plaid_items ────────────────────────────────────────────────────────────
-- One row per linked institution. Holds the Plaid access token, encrypted with
-- AES-GCM using a key that exists only as an edge-function environment
-- variable (PLAID_TOKEN_KEY) and is never stored in this database. A dump of
-- this table therefore does not yield usable bank access.
create table if not exists public.plaid_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  item_id             text not null,
  institution_id      text,
  institution_name    text,
  -- base64(iv) || '.' || base64(ciphertext). Never selected by any client.
  access_token_enc    text not null,
  -- ok | reauth | error — mirrors the Plaid item status so the UI can say
  -- "bank connection needs attention" instead of showing a stale number.
  status              text not null default 'ok',
  error_code          text,
  transactions_cursor text,
  last_webhook_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.plaid_items enable row level security;

-- DELIBERATELY NO POLICIES.
-- RLS with zero policies denies everything to anon and authenticated roles.
-- Only the edge function's service role reaches this table, and service role
-- bypasses RLS. This is what keeps the access token out of every client.
comment on table public.plaid_items is
  'Encrypted Plaid access tokens. RLS-enabled with NO policies: unreachable from any client key. Service role (edge function) only.';
comment on column public.plaid_items.access_token_enc is
  'AES-GCM ciphertext. Key lives only in the PLAID_TOKEN_KEY edge-function secret, never in this database.';

-- ── plaid_accounts ─────────────────────────────────────────────────────────
-- The last balance the bank reported, per account. Nothing sensitive: a
-- display name, the last four digits Plaid already masks, and a number. No
-- full account number, no routing number, ever.
create table if not exists public.plaid_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_id        text not null,
  account_id     text not null,
  name           text,
  mask           text,             -- last four only, as Plaid supplies it
  type           text,
  subtype        text,
  -- Integer cents. Never a float: money is not a floating-point quantity.
  balance_cents  bigint,
  currency       text default 'USD',
  balance_at     timestamptz,      -- when the BANK's figure was taken
  last_synced_at timestamptz,      -- when we last tried, success or not
  last_error_code text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, account_id)
);

alter table public.plaid_accounts enable row level security;

-- Read-only to the owner. Writes come from the edge function alone, so a
-- client cannot fabricate a balance it did not get from the bank.
drop policy if exists plaid_accounts_select_own on public.plaid_accounts;
create policy plaid_accounts_select_own on public.plaid_accounts
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.plaid_accounts is
  'Last known balance per linked account. Owner-readable; written only by the edge function.';

-- ── plaid_syncs ────────────────────────────────────────────────────────────
-- Audit trail. Enough to debug a connection and nothing a bank would consider
-- secret: no tokens, no transaction detail, no account numbers.
create table if not exists public.plaid_syncs (
  id                       bigint generated always as identity primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  item_id                  text,
  account_id               text,
  goal_id                  text,          -- JoshOS-side goal id, free text
  sync_started_at          timestamptz not null,
  sync_completed_at        timestamptz,
  status                   text not null, -- ok | error | partial
  error_code               text,
  last_known_balance_cents bigint,
  created_at               timestamptz not null default now()
);

alter table public.plaid_syncs enable row level security;

drop policy if exists plaid_syncs_select_own on public.plaid_syncs;
create policy plaid_syncs_select_own on public.plaid_syncs
  for select to authenticated
  using (auth.uid() = user_id);

comment on table public.plaid_syncs is
  'Bank sync audit trail for debugging. No credentials, no account numbers, no transaction detail.';

-- ── indexes ────────────────────────────────────────────────────────────────
create index if not exists plaid_items_user_idx     on public.plaid_items (user_id);
create index if not exists plaid_accounts_user_idx  on public.plaid_accounts (user_id);
create index if not exists plaid_accounts_item_idx  on public.plaid_accounts (user_id, item_id);
create index if not exists plaid_syncs_user_idx     on public.plaid_syncs (user_id, created_at desc);

-- ── updated_at ─────────────────────────────────────────────────────────────
-- Trigger helper. NOTE: this shipped as SECURITY DEFINER and was hardened in
-- the follow-up migration 20260813200808 — see that file for the reasoning.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plaid_items_touch on public.plaid_items;
create trigger plaid_items_touch before update on public.plaid_items
  for each row execute function public.touch_updated_at();

drop trigger if exists plaid_accounts_touch on public.plaid_accounts;
create trigger plaid_accounts_touch before update on public.plaid_accounts
  for each row execute function public.touch_updated_at();
