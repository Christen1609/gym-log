# Cardio days — plan

Spec: docs/superpowers/specs/2026-11-10-cardio-days-design.md
Builds on branch feat/unnoted-sets (same files; not yet merged to main).
Gates: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.

## Task 1: Cardio domain helpers (gymlog.ts)

Interface: `CardioEntry { date: string /* ISO */; kind: string; minutes: number | null; distanceKm: number | null; note: string | null }`,
`cardioSummary(e) → string`, `daysSinceTraining(liftingDays: number | null, cardio: CardioEntry[], todayISO) → number | null`.
Tests (gymlog.test.ts), RED first:
- cardioSummary: "Treadmill · 30 min · 5 km"; minutes null → "Bike · time not noted"; note appended " · easy".
- daysSinceTraining: cardio today beats lifting 3 days ago → 0; no cardio → lifting days; no lifting, cardio 2 days ago → 2; neither → null; future-dated cardio ignored.
Expected: green.

## Task 2: Coach action log_cardio (coachActions.ts)

Interface: CoachProposal `{ type: "log_cardio"; kind; date; minutes: number | null; distanceKm: number | null; note: string | null }`.
Tests (coachActions.test.ts):
- "log_cardio | kind=treadmill | minutes=30 | distance_km=5" → proposal kind "Treadmill", minutes 30, distance 5, date today.
- minutes unknown → minutes null, still proposed. No kind → kind "Cardio".
- minutes out of range (0, 1000) → dropped.
- proposalText propose/done: "Log cardio: Treadmill · 30 min · 5 km, today." / "Logged cardio: …".
- ACTIONS_PROMPT documents log_cardio and says cardio doesn't change the rotation.
Expected: green.

## Task 3: Storage, coach context

- Migration 0004_cardio.sql: `gymlog.cardio` (id, user_id default auth.uid(), date, kind, minutes int null check 1..600, distance_km numeric null, note, created_at) + RLS "own cardio" + index (user_id, date desc) + grants.
- db.ts `logCardio(entry)`, `loadCardio(limit)`.
- coachData loads recent cardio (last 14); coach prompt gets a "Recent cardio" block built by `cardioBlock(entries)` in gymlog.ts (tested: empty → "None logged."; lines use cardioSummary with date).
Expected: green, tsc clean.

## Task 4: UI wiring (useGymLog, Progress)

- useGymLog: `cardio` state loaded on sign-in; applyProposal handles log_cardio (logCardio, reload cardio, "Logged today" line when dated today, mark loggedPromptOn).
- Reminder: `daysSinceLast` → `daysSinceTraining(resolved.daysSinceLast, cardio, today)`; rotation untouched.
- Progress screen: "Recent cardio" list (latest 5) when any exist.
Expected: tsc, eslint, build clean; tests green.

## Task 5: Apply 0004 to the live project

Transaction; verify table + policy exist; commit.
