# Gym Log

A personal workout logger with an AI coaching layer. Log lifts by typing plain text, ask what's on today, get honest progress read-outs.

Built from two specs in `Core app md files/`:

- `SWE_S.tracker_App.md` — what to build (features, data model, AI rules)
- `mobile-app-design-request/project/Gym Log - Design.md` — what it looks like, with `Gym Log.dc.html` as the visual source of truth

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It works with **zero configuration** — seeded history, a local coach, and localStorage persistence. Every environment variable below upgrades one piece; none are required.

## Configuration

Copy `.env.local.example` to `.env.local` and fill in what you have.

| Variable | What it unlocks | Without it |
| --- | --- | --- |
| `GEMINI_API_KEY` | Real AI coach judgment | Fixed coach copy from the design prototype |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Postgres + Google auth | Sets persist to localStorage only |
| `SPOTIFY_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | Real playback control | Spotify screen runs on mock state |

## The one architectural rule

**Code computes. The LLM only judges and phrases.**

`src/lib/gymlog.ts` owns every number — est 1RM (Epley: `weight × (1 + reps/30)`), percent change, RPE trend, and the status thresholds that decide Progressing / Grinding / Stalling / Regressing. It is plain, deterministic TypeScript.

`src/lib/coach.ts` sends those already-computed numbers to Gemini with instructions to reason freely but never state a figure it wasn't given. When no API key is set it falls back to fixed copy. The date comes from the system clock and is passed in as a fact — the model is never asked to work out what day it is.

The UI keeps the split visible: computed figures sit under a `COMPUTED` label in tabular figures, the coach's read sits below a rule next to an avatar. You should be able to see which half the model wrote without reading it.

## Layout

```
src/
  app/
    page.tsx              screen router
    layout.tsx            fonts, PWA metadata
    globals.css           design tokens, both themes, all component classes
    api/coach/route.ts    server-only Gemini calls
  components/
    IconSprite.tsx        Lucide sprite + <Icon> helper
    Island.tsx            Dynamic Island now-playing
    screens/              the 8 screens
    sheets/               menu + parse confirmation
  lib/
    gymlog.ts             seed data, compute, text parser
    coach.ts              LLM judgment layer (server-only)
    useGymLog.ts          app state
    supabase.ts           client scaffold, not yet wired to the UI
supabase/migrations/      schema with RLS
```

## Logging by typing

The composer routes itself. A question goes to the coach; a recognizable set goes to a confirmation sheet; anything else falls back to the coach rather than erroring.

```
bench 85 5x5 @9, last set heavy
  → Bench Press · 85 kg · 5×5 · RPE 9 · "last set heavy"
```

Nothing is written until you confirm. One bad number poisons a trend, so there is no auto-commit path.

## Status

Working: all 8 screens, both themes, text parsing, logging, the coach (with and without Gemini), progress read-outs, settings, PWA install.

Not yet wired: Supabase reads/writes (schema and client are ready — `useGymLog.ts` still uses localStorage), Google sign-in, real Spotify, real Notion import.
