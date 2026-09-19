# JoshOS — production launch checklist

For the Cost Center release, 2026-09-19.

## Infrastructure — already in place, nothing new required

- [x] Supabase project `joshos-sync` (`lavbxjegicshhfvytapb`) live
- [x] `joshos_state` table exists, RLS-scoped to `auth.uid()`, holds the real
      user's row
- [x] Supabase Auth (GoTrue) working in production
- [x] Vercel project `joshos-timelog` connected to `precisionvinylandink/joshos`
- [x] Production deploys on push to `main`
- [x] HTTPS automatic on the Vercel domain
- [x] Security headers set in `vercel.json`
- [ ] Custom domain — **none attached, by choice.** `josh-os.com` is not
      registered. Production runs on `joshos-timelog.vercel.app`.

**No migration was needed or run.** The Cost Center stores state in
`appData.costs` inside the existing `joshos_state.data` JSONB column. No table
was created, altered or dropped. No production data was touched.

## Application — done this release

- [x] `COST-CENTER:BEGIN … END` engine block — pure, DOM-free, clock-injectable
- [x] Business entity model: PVI, CPG, Dynamic QR, Shared/JoshOS (ids shared
      with the Financial Engine's `businessId`)
- [x] 23 seeded cost categories, extensible at runtime
- [x] 14 cost types
- [x] Expense model with integer-cents money and string-parsed decimals
- [x] Allocation engine — single / percent / fixed, exact to the cent
- [x] Allocation validation surfaced in the UI and enforced at save
- [x] Recurrence engine — weekly, biweekly, monthly, quarterly, semiannual,
      annual, custom-day, with month-end clamping and leap-year handling
- [x] Expected vs actual with snapshotted history
- [x] Status model — planned / expected / due / paid / overdue / cancelled /
      archived
- [x] Deterministic forecasting at 30 / 60 / 90 / 180 / 365 days
- [x] 12-month forward chart, committed vs estimated
- [x] "What does it cost to keep this running?" — per business and total
- [x] Dashboard driven entirely by stored records; honest empty state
- [x] Fast single-row expense entry that remembers the last shape
- [x] Vendor view with monthly/annualized roll-up
- [x] History with filters and in-place variance
- [x] CSV export (expenses, history, forecast)
- [x] CSV import with row-by-row validation and a dry run by default
- [x] Cost Center reachable from the main navigation and command palette
- [x] Home surface showing run rate, annualized and overdue
- [x] `localHasContent()` taught about costs so a cost-only device cannot
      overwrite the cloud row
- [x] `CLAUDE.md` documents the module and its rules

## Verified in a real browser

Driven through the actual UI controls, against real records:

1. [x] Cost Center opens from the sidebar
2. [x] Empty state explains what to enter — no demo numbers
3. [x] Expense created through the fast-entry row
4. [x] Appears in the expense list
5. [x] Opened and edited in the full form
6. [x] Reassigned category and cost type
7. [x] Split 50 / 30 / 20 across PVI, CPG and Dynamic QR
8. [x] Allocation editor showed "exact" and the save succeeded
9. [x] A 90% split was refused with "Shares total 90%, not 100%" and nothing
       was written
10. [x] Actual payment recorded ($35.10 against $30.00 expected)
11. [x] Variance computed: +$5.10, +17%
12. [x] Dashboard updated — run rate $30.00/mo, annualized $360, actual $35.10,
        per-business $15 / $9 / $6 / $0
13. [x] Forecast shows the charge at 30/60/90/180/365; totals scale correctly
14. [x] History shows the occurrence with expected, actual and variance
15. [x] CSV export produced correct bytes, including the exact allocation
        split (`PVI:17.55; CPG:10.53; DQR:7.02` = $35.10)
16. [x] CSV import dry run reported 1 valid / 1 invalid and wrote nothing
17. [x] Reload — expenses, payments, vendors and allocation all survived
18. [x] `cloudPayload()` confirmed to carry `costs` to Supabase
19. [x] `CC.integrity()` clean
20. [x] Zero console errors throughout
21. [x] Mobile layout (375×812) verified
22. [x] Production verified after deploy: HTTPS, Cost Center shipped, four
        business entities and 23 categories present, nav reachable, auth gate
        holding, and RLS confirmed to refuse anonymous reads and writes

## Quality gates

```
237 tests passed, 0 failed
  workos-bridge      30
  order-execution    36
  growth-point-1     36
  financial-engine   58
  cost-center        77

Plus a live, networked authorization suite against the real database:

  authorization       8   (RLS enforcement, anonymous read/write, forged JWT)
```

All three `<script>` blocks in the shipped file parse cleanly under Node.

This repository has **no lint and no typecheck configuration** — no ESLint
config, no client TypeScript, no `lint`/`typecheck` npm scripts. Nothing was
disabled or silenced to reach green; those gates do not exist here. Adding them
is listed under future work.

## Remaining human actions

These need credentials or account access that only the owner has:

1. **Sign in to production and confirm.** Open
   https://joshos-timelog.vercel.app, sign in, open Cost Center and add a real
   cost. Authentication could not be exercised on the owner's behalf — entering
   a password is not something the agent does. Everything up to the auth gate,
   and everything behind it using the same load/save code path, was verified.
2. **Plaid (optional).** To enable bank ingestion, set `PLAID_CLIENT_ID`,
   `PLAID_SECRET` and `PLAID_TOKEN_KEY` as Supabase edge-function secrets on
   `joshos-sync`, then `supabase functions deploy joshos-plaid`.
3. **Stripe/finance (optional).** Set `FINANCE_SECRET_KEY` to activate the
   already-deployed `joshos-finance` function.
4. **Custom domain (optional).** If a domain is wanted, register it, add it in
   Vercel → `joshos-timelog` → Domains, point the record Vercel specifies, and
   add the new origin to the Supabase Auth redirect allow-list — otherwise
   signup confirmation links will keep landing on `APP_URL`.

## Rollback

Deployment is a Vercel build from `main`. To roll back, promote the previous
production deployment in the Vercel dashboard, or revert the commit and push.

Data rollback is not needed and not possible in the usual sense: no migration
ran. The Cost Center only *adds* an `appData.costs` key. Reverting the code
leaves that key sitting unread in the user's `joshos_state` row, harming
nothing; redeploying picks it back up.

## Future work

- Wire the Cost Center's `FIXED` recurring expenses into `FIN`'s expected
  payments so a bank transaction can settle a cost automatically. The payment
  record already carries `vendorId`, `categoryId` and an allocation snapshot,
  which is the matching key that flow needs.
- Bank-transaction → candidate-expense confirmation flow (schema already
  supports it; no fake "bank connected" UI was built).
- Pull real infrastructure spend over the bridge instead of typing estimates.
- Add ESLint and a `test` npm script so CI has a single gate to run.
