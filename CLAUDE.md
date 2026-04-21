# CLAUDE.md — Instructions for Claude Code

This is joshOS, a personal daily operating system for Josh Sonnenberg.

## Architecture

**Single-file design.** The entire desktop app lives in `desktop/src/index.html` (~110KB). All CSS, all JavaScript, all HTML pages are in this one file. Do not split it into separate files unless explicitly asked.

The iOS app lives entirely in `ios/index.html`. Same principle.

## Key Patterns

### Global State
All data is stored in a single `appData` object:
```javascript
let appData = {
  checks: {},        // checkbox states, keyed by data-id
  notes: {},         // check-in journal notes
  journal: {},       // end-of-day journal entries
  wins: [],          // wins log array
  morning: {},       // morning routine data
  settings: {},      // CSS vars, API keys, Supabase creds
  streak: 0,
  lastDate: null,
  timerSessions: 0,
  timeLog: {},       // { 'YYYY-MM-DD': { hour: entry } }
  scorecard: {},     // { 'Day Mon DD YYYY': { dials, connects, ... } }
  visionBoard: [],
  history: {},       // archived daily data
  aiHistory: []
}
```

### Saving Data
Always call `saveData()` after mutating `appData`. It's async but fire-and-forget is fine for most UI interactions.
```javascript
appData.someField = newValue;
saveData(); // no need to await in event handlers
```

### Adding a New Page
1. Add nav item in the `<nav id="sb">` sidebar
2. Add `<div class="page" id="page-yourpage">` in `#content`
3. Handle any init in the `goTo()` function switch

### CSS Variables (Theming)
Never hardcode colors. Always use CSS vars:
- `var(--bg)` — main background
- `var(--surface)` — card backgrounds  
- `var(--border)` — borders/dividers
- `var(--text)` — primary text
- `var(--text-dim)` — secondary text
- `var(--text-muted)` — tertiary/disabled text
- `var(--accent)` — primary accent (default: #c8f535 lime green)
- `var(--accent2)` — secondary accent (default: #ff5c1a orange)
- `var(--font-display)` — Bebas Neue
- `var(--font-mono)` — IBM Plex Mono
- `var(--font-body)` — IBM Plex Sans

### Supabase
Credentials are baked in as constants at the top of the JS:
```javascript
const SB_URL = 'https://fxhwqnojrcjetpcyhdwa.supabase.co';
const SB_KEY = 'eyJ...'; // anon key
```

Tables: `timelog`, `daily_scorecard`, `joshos_theme`

All Supabase calls are fire-and-forget with `.catch(()=>{})` — offline resilience is built in.

## Do Not
- Do not use React, Vue, or any framework
- Do not split index.html into multiple files
- Do not use `localStorage` directly — always go through `appData` + `saveData()`
- Do not remove the `window._flushSave` or `beforeunload` handler — critical for data persistence
- Do not change the Supabase credentials
- Do not add `node_modules` to git

## Build Commands
```bash
cd desktop
npm install
npm start          # dev
npm run build      # production DMG
```

## iOS Deploy
```bash
cd ios
npx vercel@latest --prod --yes
```
