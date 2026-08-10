# LifeOS

The personal-life context inside JoshOS. **Not** a collection of mini-apps —
every screen reads/writes the shared JoshOS primitives.

## Domains (`src/masters/lifeos/domains/`)

| Domain | State |
|--------|-------|
| `timelog` | **Real** — hourly check-ins, :15 native alerts 7 AM–8 PM, Pull-Phone sync. Own `timelog` table adapter. |
| `scorecard` | **Real** — two blocks, exact S–D scoring. Own `daily_scorecard` adapter. |
| `tasks` | **Real** — personal tasks over the JoshOS `Task` primitive (add / complete / focus / delete). |
| `goals` | **Real** — Vision → Goal → Project → Milestone rollup over JoshOS primitives. |
| `health` / `money` / `habits` | Placeholders (meds, gym, nutrition, water; debt, Rochester Fund; Spanish, streaks). |

## Ownership

LifeOS owns the *personal* slice of the shared primitives (`context: 'life'`):
tasks, goals, routines, meals, breaks, personal projects, personal media,
reminders. It reuses Task / Event / ScheduleBlock / Goal / Project / Milestone —
new life features should extend those, not invent parallel models.

## Boundaries

- Desktop-only. The whole LifeOS subtree + the `joshos/` layer it uses are gated
  behind `__LIFEOS_ENABLED__` and never reach the web bundle.
- Personal finance/health data must never be served from the business web build.

## Meals & breaks

Personal scheduling objects live here (CalendarEvent `kind: 'meal' | 'break'`),
**not** in JobOS. Notifications ("Lunch in 15 minutes", "Break time") are planned
on the notification engine and must be user-configurable — no hardcoded health
assumptions.
