-- ═══════════════════════════════════════════════════════════════════════════
-- joshos_finance_snapshot() — the business-finance projection for JoshOS.
-- APPLIED to precision-vinyl (siwotzlqfwgmhhnnnppc) as migration
-- 20260826013520_joshos_finance_snapshot. Keep identical to what is applied.
--
-- Called only by the joshos-bridge edge function (GET /finance, scope
-- finance:read). Returns the CASH VIEW of the business: open receivables,
-- recent settled payments, active subscriptions (MRR — run rate, never cash),
-- and committed obligations. JoshOS turns these into financial events; it
-- never mutates them and never receives an invoice body, a customer name or
-- an email — identity is (externalTable, externalId) plus a document number.
--
-- Definitions live here, beside the tables, for the same reason
-- joshos_gp1_metrics does: each predicate is a business-metric definition.
-- Shares gp1's dedupe rule: an order that became a PVI invoice is counted by
-- the invoice, not twice.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.joshos_finance_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result jsonb;
begin
  with
  -- ── Receivables (a): formal PVI invoices with an outstanding balance ─────
  recv_inv as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'externalId',     i.id,
      'externalTable',  'pvi_invoices',
      'business',       'PVI',
      'label',          i.invoice_number,
      'number',         i.invoice_number,
      'totalCents',     round(i.total * 100)::bigint,
      'paidCents',      round(i.amount_paid * 100)::bigint,
      'remainingCents', round((i.total - i.amount_paid) * 100)::bigint,
      'status',         i.status,
      'issuedAt',       i.issued_at,
      'dueDate',        i.due_date,
      'paidAt',         i.paid_at
    ) order by i.issued_at desc), '[]'::jsonb) as j
    from pvi_invoices i
    where i.status not in ('void','draft','cancelled')
      and (i.total - i.amount_paid) > 0.005
  ),
  -- ── Receivables (b): storefront orders not fully paid ────────────────────
  -- An order whose quote already produced a PVI invoice is that invoice's
  -- receivable, not a second one.
  recv_ord as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'externalId',     o.id,
      'externalTable',  'orders',
      'business',       'PVI',
      'label',          coalesce(o.order_number, 'Order'),
      'number',         o.order_number,
      'totalCents',     coalesce(o.total_cents, round(o.total * 100))::bigint,
      'paidCents',      coalesce(o.amount_paid_cents, 0)::bigint,
      'remainingCents', (coalesce(o.total_cents, round(o.total * 100)) - coalesce(o.amount_paid_cents, 0))::bigint,
      'status',         coalesce(o.payment_status, o.status),
      'issuedAt',       o.created_at,
      'dueDate',        (o.due_date)::date,
      'paidAt',         o.paid_at
    ) order by o.created_at desc), '[]'::jsonb) as j
    from orders o
    where lower(coalesce(o.payment_status, '')) in ('unpaid','partial','partially_paid','pending')
      and (coalesce(o.total_cents, round(o.total * 100)) - coalesce(o.amount_paid_cents, 0)) > 0
      and lower(coalesce(o.status, '')) not in ('cancelled','refunded','draft')
      and (o.quote_id is null
           or not exists (select 1 from pvi_invoices i where i.quote_id = o.quote_id))
  ),
  -- ── Settled payments, last 90 days ───────────────────────────────────────
  pays as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'externalId',        p.id,
      'externalTable',     'payments',
      'business',          'PVI',
      'amountCents',       coalesce(p.amount_cents, round(p.amount * 100))::bigint,
      'method',            p.provider,
      'status',            p.status,
      'paidAt',            coalesce(p.paid_at, p.created_at),
      'invoiceExternalId', p.invoice_id
    ) order by coalesce(p.paid_at, p.created_at) desc), '[]'::jsonb) as j
    from payments p
    where lower(coalesce(p.status, '')) in ('completed','succeeded','paid')
      and coalesce(p.paid_at, p.created_at) > now() - interval '90 days'
  ),
  -- ── Active subscriptions — MRR is run rate, never cash ───────────────────
  -- Same sources and predicates as joshos_gp1_metrics: print_club reads the
  -- product's own billing table; cpg_subscriptions is CPG's recurring rollup
  -- (which also carries Dynamic QR as plan qr_monthly).
  subs as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'externalId',    s.id,
      'externalTable', s.t,
      'business',      s.b,
      'label',         s.plan,
      'plan',          s.plan,
      'mrrCents',      round(s.rate * 100)::bigint,
      'status',        s.status,
      'renewalDate',   s.renewal
    )), '[]'::jsonb) as j
    from (
      select id, 'print_club_subscriptions' as t, 'PVI' as b, plan_type as plan,
             coalesce(monthly_rate, 0) as rate, status, null::date as renewal
        from print_club_subscriptions
       where lower(coalesce(status, '')) in ('active','trialing') and cancelled_at is null
      union all
      select id, 'cpg_subscriptions', 'CPG', plan,
             coalesce(mrr_amount, price, 0), status, renewal_date
        from cpg_subscriptions
       where status = 'active'
    ) s
  ),
  -- ── Committed obligations ────────────────────────────────────────────────
  obs as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'externalId',       c.id,
      'externalTable',    'cpg_cash_obligations',
      'business',         'CPG',
      'label',            c.label,
      'amountCents',      round(c.amount * 100)::bigint,
      'dueDate',          c.due_date,
      'recurringMonthly', c.recurring_monthly,
      'active',           c.active
    ) order by c.due_date nulls last), '[]'::jsonb) as j
    from cpg_cash_obligations c
    where c.active
  )
  select jsonb_build_object(
    'serverTime',    now(),
    'receivables',   recv_inv.j || recv_ord.j,
    'payments',      pays.j,
    'subscriptions', subs.j,
    'obligations',   obs.j
  )
  into result
  from recv_inv, recv_ord, pays, subs, obs;

  return result;
end;
$$;

-- SECURITY DEFINER + this project's anonymous sign-ins means anything callable
-- by anon/authenticated is effectively public. Only the service role (the
-- bridge) may execute this.
revoke all on function public.joshos_finance_snapshot() from public;
revoke all on function public.joshos_finance_snapshot() from anon;
revoke all on function public.joshos_finance_snapshot() from authenticated;

comment on function public.joshos_finance_snapshot() is
  'Business cash view for JoshOS (bridge scope finance:read): open receivables, settled payments (90d), active subscription MRR, obligations. No customer PII — identity is externalId + document number. Service role only.';
