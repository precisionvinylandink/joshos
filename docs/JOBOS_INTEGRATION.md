# JobOS Integration

JobOS is a **separate repository and a separately sellable product**. JoshOS
integrates with it through a narrow, typed contract and **must never**:

- import JoshOS logic *into* JobOS,
- require JoshOS auth / databases / services inside JobOS,
- duplicate the JobOS database, or
- make JobOS impossible to deploy independently.

JoshOS **may consume** JobOS information; the dependency arrow points one way.

## The contract (`src/joshos/integration/jobos/`)

- `types.ts` — `JobOSReference` (a pointer: source/entityType/entityId/title/url +
  urgency/dueDate), `JobOSBusinessSummary`, and the `JobOSIntegration` interface
  (`getBusinessSummaries`, `getAttention`).
- `devAdapter.ts` — a **dev** provider. Every payload is `live: false` and must be
  rendered as clearly-labelled sample data. No fabricated production data.
- `index.ts` — `jobosIntegration` (currently the dev provider) + React Query hooks
  `useJobOSSummaries` / `useJobOSAttention`. Swap the provider for a real JobOS API
  client without touching any consumer.

## How JoshOS uses it

WorkOS / Command Center render references and deep-link into JobOS
(`url`, e.g. `joshos://jobos/job/PVI-1044`). Tasks may carry a `jobosRef` to
associate personal planning with a business entity — still just a reference.

## Going live

Implement `JobOSIntegration` against the JobOS public API (in the JobOS repo's
integration surface), point `jobosIntegration` at it, and the UI flips from
"sample" to real once `live: true`. No JoshOS consumer changes required.
