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

## Calendar surface (`src/joshos/calendar/`) — built

Unified day + week views at `/life/calendar` (desktop). `model.ts` interleaves
events + blocks + timed JobOS deadlines + due tasks into one `CalItem` stream and
lane-packs overlaps; `DayView` is a positioned time grid with a "now" line and a
due-tasks strip; `WeekView` is a 7-day agenda; `NewEventForm` (SlideOver) creates
events. ALL/LIFE/WORK is a filter across everything. Linked from the Command
Center and the LifeOS nav.

## Next build-out

- Routines (Part XX) that generate ScheduleBlocks.
- Drag-to-reschedule and duration/availability-aware auto-fit of flexible tasks
  into open time (evolving `recommendNext` toward the scheduler).
- Optional `Task.scheduledStart` so flexible tasks can be placed on the grid, not
  only shown as due chips.
