# Motivation System

A calm, non-punishing feedback layer — **premium productivity with subtle retro
mechanics**, never a childish game. The productivity system is fully functional
without any of it.

## Progress engine (`src/joshos/progress/`)

Progress represents *meaningful advancement*, weighted by importance (not clicks):

- `ProgressEvent` — `task_completed | milestone_completed | project_completed |
  goal_progressed | focus_block_completed | routine_completed`, each with a weight.
- `PRIORITY_WEIGHT` (critical 25 … low 5) and `EVENT_WEIGHT` (milestone 30,
  project 60, goal 100, focus 12, routine 8).
- `engine.ts` — `projectProgress` / `goalProgress` roll completion **upward**
  (task → milestone → project → goal); `summarize` gives day/week totals;
  `streakFromEvents` is **non-punishing** (a gap just ends the count — never
  subtracts or shames).

Emitted from `joshos/store/actions.ts` on completion; rollups write the cached
`progress` field on Projects and Goals.

## Motivation state (`src/joshos/motivation/`)

- `MotivationState { xp, unlocked[], lastGrowthAt }` — small, only ever grows.
- `GARDEN_STAGES` soil → seed → sprout → plant → flower → garden → grove, by xp
  threshold. `levelForXp` is cosmetic.

## Pixel garden (`PixelGarden.tsx`)

An **original**, state-driven SVG (no external assets, no copied game). Garden
*maturity* tracks lifetime xp; the number of *grown plots* tracks **today's**
completions, so acting fills it in. Reduced-motion friendly, never mandatory,
never anxiety-inducing. Uses `var(--accent)` so it follows the theme.

## Design guardrails (Parts XV–XVI)

No neon/confetti/mascots/gambling/streak-pressure. Small animations, visible
growth, subtle collectibles. The retro character/world (clothing, tools,
environments) is a future extension of `unlocked[]` — architecture only for now.
