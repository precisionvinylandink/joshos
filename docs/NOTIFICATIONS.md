# Notification Engine

Centralized, useful-not-noisy notifications (Part XXI). Desktop-only, gated —
never in the web bundle.

## Model (`src/joshos/notifications/`)

- `AppNotification` — `category, title, body?, actionLabel?, actionHref?, read,
  createdAt, snoozedUntil?`. Categories: now / important / reminder / schedule /
  life / work / jobos / progress / system.
- Actions (`joshos/store/actions.ts`): `pushNotification`, `markNotificationRead`,
  `markAllNotificationsRead`, `snoozeNotification(id, mins)`, `dismissNotification`,
  and `emitOnce(key, …)` — idempotent (persisted keys in `joshos.notifKeys`) and
  mirrored to a **native OS notification** on desktop via `window.joshOS.showNotification`.

## Scheduler

- `scheduler.ts` `candidates(now, events, tasks)` — pure: meals/breaks & next
  commitments ~15 min out ("Lunch in 15 minutes"), once-a-day overdue-task nudges.
  Each has a stable `key` so it fires exactly once.
- `NotificationScheduler` — mounted app-wide (like the timelog `HourlyAlerts`),
  ticks each minute, emits in-app + native.

## UI

- `NotificationBell` — replaces the shell's static bell via TopBar's
  `notificationSlot` (desktop supplies it; web keeps the static fallback so the
  shared shell carries no personal-notification code). Unread badge, category
  dots, mark-all-read, per-item action link / snooze (10 min) / dismiss, and a
  calm "You're all caught up." empty state.

## Boundary

The shared `TopBar` stays target-agnostic; the live bell + scheduler are pulled in
only through `__LIFEOS_ENABLED__`-gated dynamic imports in `AppShell`, so Rollup
strips them from `build:web` (verified: no `emitOnce`/`NotificationScheduler` in
the web bundle).

## Next

Snooze presets + a "snoozed" view; per-category mute; "you have N min available →
suggested task" nudges (wire `recommendNext`); automation-driven notifications
(Part XXXIV).
