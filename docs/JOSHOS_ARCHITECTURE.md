# JoshOS Architecture

JoshOS is the **master personal operating system**. It orchestrates the user's
whole life through shared primitives; LifeOS and WorkOS are *contexts* (lenses)
over those primitives, not separate apps. JobOS is a **separate, independently
sellable** business product that JoshOS *integrates with* but never depends on.

See the root [`CLAUDE.md`](../CLAUDE.md) for shell/build-target/persistence law.
This folder documents the **product** layer built on top of it.

```
                         JOSHOS  (master OS, desktop)
                            |
              +-------------+-------------+
            LIFE                         WORK
              |                           |
           LifeOS                       WorkOS ──▶ JobOS (separate repo)
              \___________________________/
                          |
        UNIFIED PRIMITIVES: Task · Event · ScheduleBlock ·
        Goal · Project · Milestone · Progress · Motivation ·
        Notification · JobOSReference
```

## Layers

| Path | Role |
|------|------|
| `src/shell/` | Chrome: sidebar, top bar, master switcher, command palette. Shared, **no LifeOS literals**. |
| `src/joshos/` | **The master-OS orchestration core** (desktop-only): primitives, store, progress + motivation engines, scheduler, Command Center, Focus, JobOS integration. |
| `src/masters/lifeos/` | LifeOS domains (timelog, scorecard, tasks, goals, …). Desktop-only. |
| `src/masters/jobos/` | JobOS admin surface for the **web** target (JobOS-only build). Independent of `joshos/`. |
| `src/shared/` | UI kit, auth, theme, persistence, lib. Target-agnostic. |

## Hard boundaries

- **JobOS independence.** `joshos/integration/jobos` holds only a typed *contract*
  + references + a dev provider. Nothing in `masters/jobos` imports `joshos/`.
  JoshOS may consume JobOS; JobOS never depends on JoshOS.
- **LifeOS / personal data never ships to web.** The entire `joshos/` layer is
  reached only through the `__LIFEOS_ENABLED__`-gated Today + `/life/*` routes, so
  Rollup strips it from `build:web`. Verified: `grep -riE
  "lifeos|timelog|scorecard|rochester" dist/` prints nothing.

## Source of truth

- **JoshOS owns** personal identity, tasks, goals, routines, schedule, progress,
  motivation, media, notifications.
- **JobOS owns** customers, jobs, quotes, production, inventory, invoices.
- **WorkOS aggregates** business context from JobOS (via references) — it is a
  *view*, never a competing store.

## Persistence decision (current)

New primitives persist through the ported **three-layer local store**
(`shared/persistence`, slice namespaces in `joshos/store/keys.ts`), which on
desktop syncs the whole document to `joshos_data` (id=2). No new Supabase tables
were created — the `joshos-sync` project is paused and infra changes are out of
scope. Every store read/write goes through `joshos/store`, so a real Supabase
schema can back these later without touching feature code.

## The core loop (Part XLIII)

`open → Command Center shows what matters → Focus → complete → progress event →
goal/project rollup → motivation/garden grows → next action recommended`. This is
implemented end-to-end in `joshos/store/actions.ts` + `today/CommandCenter.tsx` +
`focus/FocusMode.tsx`.

## Docs

- [JOSHOS_COMMAND_CENTER.md](JOSHOS_COMMAND_CENTER.md)
- [LIFEOS.md](LIFEOS.md) · [WORKOS.md](WORKOS.md) · [JOBOS_INTEGRATION.md](JOBOS_INTEGRATION.md)
- [MOTIVATION_SYSTEM.md](MOTIVATION_SYSTEM.md) · [UNIFIED_SCHEDULER.md](UNIFIED_SCHEDULER.md)
- [MEDIA_BANK.md](MEDIA_BANK.md) *(planned)*
