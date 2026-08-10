# joshOS — Legacy Prototype (Archived)

This directory is the **original working prototype** of joshOS: the vanilla-JS,
single-file Electron desktop app (`desktop/`) and the iOS PWA (`ios/`). It proved
the concept and carried real user data. It is preserved here **for reference**.

It has been **superseded** by the new architecture described in the root
[`CLAUDE.md`](../CLAUDE.md) — a Vite + React + TypeScript codebase organized as the
JoshOS shell hosting two masters (JobOS + LifeOS).

## Rules

- **Do not extend this code.** New features go in the new architecture at the repo root.
- **Do not modify it** except to keep it running. It is the fallback if the rebuild stalls.
- The old project instructions live in [`CLAUDE.legacy.md`](CLAUDE.legacy.md) and are
  **superseded** — they describe the prototype's "single-file, no-framework" rules,
  which are deliberately *not* the rules of the new system.

## What's here

| Path | What it is |
|------|------------|
| `desktop/` | Electron app — entire UI in `src/index.html` (~110KB), `main.js`, `preload.js` |
| `ios/` | iOS capture PWA — entire app in `index.html`, deployed to Vercel |
| `CLAUDE.legacy.md` | The prototype's original Claude instructions (superseded) |

## Backend

Both legacy apps talk to the same Supabase project the new app uses:

- **joshos-sync** — `https://lavbxjegicshhfvytapb.supabase.co`

> Note: the old `CLAUDE.legacy.md`/README referenced `fxhwqnojrcjetpcyhdwa`
> (project *joshos-timelog*). That was stale — the live code was migrated to
> **joshos-sync** in prototype commit `f279eba`. No URL edit was needed during
> archival; the code already points at the correct project.

Tables used: `timelog`, `daily_scorecard`, `joshos_theme`, and `joshos_data`
(the last holds multi-device full-state sync + the iOS summary card; it is **not**
in the old README but is load-bearing).

## Running the legacy desktop app

```bash
cd legacy/desktop
npm install
npm start
```

## Redeploying the legacy iOS PWA

The PWA is live at `joshos-timelog.vercel.app`. Because the files moved from
`ios/` to `legacy/ios/`, the Vercel project's **Root Directory must be repointed
to `legacy/ios`** (or deploy manually from this folder). See root `CLAUDE.md`
→ "Known debt / Vercel" before the next push to `main`.

```bash
cd legacy/ios
npx vercel@latest --prod --yes
```

## Full snapshot

An untouched snapshot of the prototype (before this relocation) is preserved on the
`legacy/prototype` git branch.
