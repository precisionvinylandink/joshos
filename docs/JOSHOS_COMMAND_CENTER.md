# Command Center (Today)

`src/joshos/today/CommandCenter.tsx` — the default screen and most important view.
It answers "what is happening, what matters, what should I do next?" with
**progressive disclosure**, never a wall of cards.

## Sections (top → bottom)

1. **Header** — greeting by time of day + date/clock, and the **ALL / LIFE / WORK**
   lens (Part V filter). The lens narrows everything below.
2. **NOW** — the single recommended next action (see
   [UNIFIED_SCHEDULER](UNIFIED_SCHEDULER.md)) with transparent reasons + a **Start**
   button that opens Focus Mode. Falls back to a calm line when nothing is urgent.
3. **UP NEXT** — the next timed commitment (event / block / JobOS deadline).
4. **TODAY · priorities** — open tasks for the lens, sorted by priority; inline
   quick-add; complete + focus per row.
5. **LATER TODAY** — the rest of the day's timed schedule, chronological.
6. **PROGRESS** — today / week completion counts + xp, streak, level, and top goal
   bars.
7. **LIFE / WORK** — compact open-item counts; WORK shows JobOS attention items,
   clearly badged **"JobOS: sample"** until a live connection exists.
8. **WORLD** — the [pixel garden](MOTIVATION_SYSTEM.md).

## Principles

- **No liminal UI** (Part XVIII): empty states read "You're clear.", "Your top
  priorities are complete.", never "No tasks."
- **Interleave, don't segregate**: Life and Work items share one chronological
  spine; the lens filters rather than splitting the screen.
- **Real state only**: everything derives from the JoshOS store + the timelog /
  scorecard domains + JobOS references. Sample data is opt-in ("Load sample day")
  and labelled.

## Data in

`useTasks / useEvents / useGoals / useProgressEvents / useMotivation` (from
`joshos/store`) + `useJobOSAttention` (integration) + `recommendNext` (scheduler).
Writes go through `joshos.*` actions.
