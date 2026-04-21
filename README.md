# joshOS

Personal daily operating system for Josh Sonnenberg. macOS Electron desktop app + iOS PWA companion.

## Project Structure

```
joshos/
├── desktop/              # macOS Electron app
│   ├── main.js           # Electron main process
│   ├── preload.js        # Context bridge
│   ├── package.json      # Build config
│   ├── src/
│   │   └── index.html    # Full app (single file — all CSS, JS, HTML)
│   └── assets/
│       └── icon.png      # App icon
├── ios/                  # iPhone PWA (deployed to Vercel)
│   ├── index.html        # Full iOS app (single file)
│   └── vercel.json       # Vercel deployment config
└── .github/
    └── workflows/        # CI/CD (optional)
```

## Desktop App

### Features
- **Dashboard** — 6 ADHD system cards (Clarity, Prioritization, Execution, Consistency, Bounce-Back, Mastery), 24 daily checkboxes
- **Scorecard** — Nick's Block (Dials/Connects/Follow-Ups/Closes) + PVI Block (Touches/Signups/Quotes), S–D grade system, Supabase sync
- **Morning Routine** — 8 activation checks, mood tracker, daily business intention
- **Focus Timer** — Pomodoro with 4 modes (25/5, 50/10, 15/3, 90/20), full-screen focus mode
- **Time Log** — Hourly check-ins, :15 alerts, syncs with iPhone via Supabase, Pull Phone button
- **Check-In** — 6 journal prompts, wins log
- **Growth & Habits** — Day-by-day history, completion tracking
- **Calendar** — Weekly view, smart focus block schedule
- **Vision Board** — Goals by category
- **Reader** — RSS feed reader
- **ADHD Consultant** — AI chat via Anthropic API
- **Settings** — 8 theme presets, custom colors, typography, data management

### Data
- All data stored locally at `~/Library/Application Support/josh-os/joshos-data.json`
- Syncs to Supabase (`joshos-timelog` project) for iOS bridge
- Supabase project: `fxhwqnojrcjetpcyhdwa` (us-east-1)

### Build & Run

```bash
cd desktop
npm install
npm start           # Run in dev mode
npm run build       # Build DMG for current arch
npm run build:x64   # Build for Intel Mac
npm run build:arm64 # Build for Apple Silicon
```

Built app appears in `desktop/dist/`.

### Data Persistence
Three-layer save system:
1. `saveData()` — async save on every change
2. `saveDataSync()` — synchronous save on window close via `beforeunload`
3. `main.js` caches last state, flushes on `close`, `before-quit`, `window-all-closed`

---

## iOS App

Minimal PWA — shows current time, text field, submit button. Syncs entries to Supabase timelog table.

### Deploy to Vercel

```bash
cd ios
npx vercel@latest --prod --yes
```

Live at: `https://joshos-timelog.vercel.app`

### Add to iPhone Home Screen
1. Open URL in Safari
2. Share → Add to Home Screen
3. Name it **joshOS**

### Features
- Current time display (big, left-aligned)
- Text field + Submit button
- Today's log list
- Supabase sync (credentials baked in)
- Push notification support (fires at :15 past each hour when app is open)
- Theme mirroring from desktop via Supabase `joshos_theme` table

---

## Supabase

Project: `joshos-timelog`  
URL: `https://fxhwqnojrcjetpcyhdwa.supabase.co`  
Region: us-east-1

### Tables

**timelog** — hourly check-in entries from iOS and desktop
```sql
create table timelog (
  id bigserial primary key,
  date_key text not null,
  hour integer not null,
  text text,
  category text default 'ios-entry',
  timestamp timestamptz default now(),
  source text default 'ios',
  constraint timelog_unique unique (date_key, hour)
);
```

**daily_scorecard** — scorecard entries per day
```sql
create table daily_scorecard (
  date text primary key,
  scores jsonb not null default '{}',
  updated_at timestamptz default now()
);
```

**joshos_theme** — desktop theme pushed here, iOS reads it to mirror
```sql
create table joshos_theme (
  id integer primary key default 1,
  data jsonb default '{}',
  constraint single_row check (id = 1)
);
```

---

## Scorecard Metrics

| Block | Metric | Goal |
|-------|--------|------|
| Nick's Block (9AM–1PM) | Dials | 60 |
| Nick's Block | Connects | 15 |
| Nick's Block | Follow-Ups Set | 5 |
| Nick's Block | Closes | 1 |
| PVI Block (1:30–3:30PM) | PVI Touches | 10 |
| PVI Block | Print Club Signups | 6 |
| PVI Block | Quotes Sent | 3 |

**Grade System:** S (≥90%) · A (≥75%) · B (≥55%) · C (≥35%) · D (<35%)

---

## Hourly Alerts

Desktop banner fires at **:15 past each hour**:  
7:15 · 8:15 · 9:15 · 10:15 · 11:15 · 12:15 · 1:15 · 2:15 · 3:15 · 4:15 · 5:15 · 6:15 · 7:15 · 8:15

---

## Tech Stack

- **Desktop:** Electron 28, vanilla JS, single-file HTML (no framework)
- **iOS:** Vanilla HTML/CSS/JS PWA, Vercel static hosting
- **Backend:** Supabase (PostgreSQL + REST API)
- **AI:** Anthropic Claude API (ADHD Consultant feature)
- **Build:** electron-builder 24
- **Fonts:** Bebas Neue, IBM Plex Mono, IBM Plex Sans (Google Fonts)

---

## Working with Claude Code

When giving this repo to Claude Code, key files to reference:

- `desktop/src/index.html` — The entire app. All pages, all JS, all CSS in one file.
- `desktop/main.js` — Electron main process, IPC handlers, data persistence
- `desktop/preload.js` — Context bridge exposing `electronAPI` to renderer
- `ios/index.html` — Entire iOS PWA

The app uses `appData` as a single global state object. All sections read/write to it and call `saveData()`. To add a new feature: add HTML page, add JS functions, call `goTo('yourpage', el)` from a nav item.
