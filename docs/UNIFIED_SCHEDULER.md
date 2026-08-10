# Unified Calendar & Scheduler

## Three distinct primitives (Part VI)

- **CalendarEvent** — something happening at a time (event / meal / break /
  deadline).
- **Task** — something to complete (status, priority, due date, estimate, links to
  goal/project/milestone).
- **ScheduleBlock** — time intentionally allocated to a task/project/routine/focus.

They are separate but connected (a ScheduleBlock or a scheduling Event can point
at a `taskId`). All three interleave on one chronological spine; ALL/LIFE/WORK is
a **filter**, not separate calendars.

Defined in `src/joshos/primitives/types.ts`; created via `joshos.addEvent` /
`addBlock` / `addTask`.

## Recommendation foundation (`src/joshos/scheduler/recommend.ts`)

`recommendNext(tasks, events, goals, now)` returns ONE next action with
transparent reasons — reducing decision fatigue (Parts VII, XXVIII). v1 scoring:
priority, due-today, fits-available-time, advances-a-goal.
`availableMinutesUntilNext` computes the gap to the next fixed commitment.

This is **not** autonomous scheduling. The architecture is deliberately simple so
it can grow toward: "You have 45 minutes before your next commitment — finish the
CPG proposal?", "You've been working 2 hours — take a break?", "Your afternoon is
overloaded — move this to tomorrow?".

## Next build-out

- A real calendar surface (day/week) rendering events + blocks + JobOS deadlines +
  meals/breaks with the ALL/LIFE/WORK filter.
- Routines (Part XX) that generate ScheduleBlocks.
- Duration/availability-aware auto-fit of flexible tasks into open time.
