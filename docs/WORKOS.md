# WorkOS

The user's business **command layer** inside JoshOS — the professional context
(`context: 'work'`). WorkOS is a *view* that aggregates business activity; it is
**never** the operational source of truth. JobOS is.

## Current state

WorkOS presently surfaces inside the Command Center's **WORK** section:
open work-context tasks + JobOS attention items (via the integration contract).
A dedicated WorkOS home (today's work, priorities, follow-ups, jobs, quotes,
production, invoices, sales, deadlines, campaigns, business goals) is the next
build-out, reusing the same primitives + the JobOS integration.

## Workspace abstraction

Business names are **not** hardcoded permanently. Business identity flows through
`JobOSBusinessSummary.businessId` / `businessName`, so WorkOS supports multiple
businesses/workspaces and future ones without code changes.

## Ownership

- WorkOS **aggregates**: business context, priorities, deadlines, recommendations.
- WorkOS **owns** nothing operational — every job/quote/invoice is a
  `JobOSReference` back into JobOS.
- Work-context JoshOS primitives (a `Task` with `context: 'work'`, a business
  `Goal`/`Project`) are owned by JoshOS and represent the *user's* planning layer
  over the business, distinct from JobOS's operational records.

See [JOBOS_INTEGRATION.md](JOBOS_INTEGRATION.md).
