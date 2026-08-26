-- ═══════════════════════════════════════════════════════════════════════════
-- Harden touch_updated_at()
--
-- Flagged by the Supabase security linter (0028/0029) right after the previous
-- migration landed: a SECURITY DEFINER function is published as a callable RPC
-- at /rest/v1/rpc/touch_updated_at for both anon and authenticated.
--
-- This function only stamps new.updated_at, so it never needed elevated rights.
-- Drop to SECURITY INVOKER and revoke EXECUTE so it leaves the REST surface
-- entirely — it is only ever fired by its own triggers.
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER deliberately. This only stamps new.updated_at, so it needs
-- no elevated rights — and SECURITY DEFINER would additionally expose it as a
-- callable RPC at /rest/v1/rpc/touch_updated_at. The revokes take it off the
-- REST surface entirely: it is only ever fired by its own triggers.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_updated_at() from public;
revoke all on function public.touch_updated_at() from anon;
revoke all on function public.touch_updated_at() from authenticated;

comment on function public.touch_updated_at() is
  'Trigger helper for plaid_items/plaid_accounts. SECURITY INVOKER and not executable via REST — it is only ever fired by its triggers.';
