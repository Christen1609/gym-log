# Gym Log — Project Spec (v1)

**What it is:** A personal workout logger with an AI coaching layer.
One user (you). Log lifts by typing plain text, ask what's on today, get honest progress read-outs.

**Success = one thing:**
You open it instead of Notion, it saves you time, and it sharpens your training calls.
Nothing else counts.

---

## Stack

- **Next.js + TypeScript** — app + API routes, one codebase.
  API routes run server-side → your Gemini key lives there, never in the browser.
- **Supabase** — Postgres + auth (Google sign-in). RLS so only your data is yours.
- **Gemini API** — the AI layer. Called only from server-side API routes.
- **Vercel** — hosting, free tier.
- **PWA** — "Add to Home Screen" gives you a fullscreen app icon on your phone.
  No App Store, no Mac, no review.

**Dropped, on purpose:** Capacitor, App Store wrapper, Vite.
Reason: personal tool, no Mac, web + PWA is enough. Revisit only if you use it for weeks.

---

## Core features (v1)

1. **"What's today?"** → today's split + planned exercises + last time's numbers.
2. **Log by typing** → "bench 80 5x5, last set heavy" becomes clean rows.
   Always shows the parse before saving.
3. **"Last time" lookup** → per exercise, what you lifted and how it felt.
4. **Progress read-out** → AI judges: progressing, stalling, or deload.
5. **Coach voice** → direct, evidence-based style.
6. **Import my Notion (once)** → AI parses your history, infers your split,
   you confirm, it saves to Supabase.
7. **Spotify** → now-playing, start playlist, next / skip.
   Premium confirmed → playback control works (needs Spotify open on a device).

---

## RPE — what it is

**Rate of Perceived Exertion.** How hard a set felt, 0–10. "Reps left in the tank."
- 10 = nothing left (failure) · 9 = 1 left · 8 = 2 left · 7 = 3 left.

**Optional per set.** Log it when you want a sharper trend; skip it when you're moving fast.
When it's there, the AI can tell "same weight × reps, but easier = you got stronger."
When it's not, trends fall back to est-1RM and volume — coarser, still useful.

---

## How the AI actually works

Two jobs, kept separate on purpose.

**Compute (code, deterministic — never the LLM):**
- Estimated 1RM per set: Epley → `weight × (1 + reps / 30)`.
  Estimate only; unreliable above ~10 reps.
- Trend per exercise: 1RM over last N sessions, fit a line → up / flat / down.
- Volume (sets × reps × weight) and, when logged, RPE trend.
- No RPE on a set → trend uses weight / reps / volume only. Degrades gracefully.

**Judge + phrase (the LLM):**
- Takes the computed numbers, not raw guesses.
- Interprets: "Bench up 4%, but RPE climbing — you're grinding. Deload."
- Answers questions in plain English.
- Coaches in an evidence-based style.

**The rule:**
The LLM reasons and judges freely. It never invents the numbers.
Trust comes from that line.

**Parsing (both freeform logging and the Notion import):**
Gemini turns messy text into typed fields (exercise, weight, reps, sets, rpe, note).
Always shows the parse before saving. Never auto-commits — one bad number poisons the trend.

---

## Coach persona

- A system prompt defines the voice: direct, no fluff, evidence-first.
- Informed by mainstream evidence-based training
  (progressive overload, RPE, rep-range effects).
  Gemini already knows this — nothing to "train."
- **Not** a clone of any named person. Not their content. Style only.

---

## Data model (Supabase)

- `exercises` — id, name, muscle_group, is_compound.
- `split` — ordered rotation (e.g. chest → back → arms → legs). Defines what "next" is.
- `sessions` — id, date, day_label, notes.
- `sets` — id, session_id, exercise_id, set_no, weight, reps, rpe (nullable), felt_note.
- Views / queries for last-performance and trend.

**Split source:** established by the Notion import.
AI infers your rotation + default exercises from your dated history; you confirm.

**"Today" logic:** rotation-based, not calendar-based.
Today = next in the rotation after your last session. Survives missed days. Manual override allowed.

**Units:** kg default (configurable).
**Auth:** Supabase Google sign-in + RLS, so the data stays yours.

---

## Build notes (for Claude Code)

- **Keys are server-only.** Gemini and Spotify calls go through Next.js route handlers
  (App Router `/app/api/...`). Never call these from the client.
- **Env vars:** `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
  `SPOTIFY_REDIRECT_URI`. No secrets in the repo.
- **Two separate auth flows.** Supabase Google sign-in (app login) and Spotify OAuth
  (music access) are different. Store Spotify tokens per user in Supabase; don't conflate them.
- **Spotify needs an active device** for playback control — handle "no active device" gracefully.
- **PWA:** add a `manifest.json` + service worker so "Add to Home Screen" works.
- **Import is idempotent-ish:** let the user re-run it without duplicating sessions.

---

## Roadmap

- **v1:** everything above.
- **v2 (only if you actually use it for weeks):**
  App Store wrapper (needs a Mac or paid cloud CI), richer analytics,
  deeper Spotify (log tracks per session).

---

**Status: build-ready.** Take it to Claude Design for the look, then Claude Code to build.
