# Unnoted sets + next-time reminder — plan

Spec: the conversation of 2026-11-09 (no spec file). The lifter asked:
1. The coach must log an exercise even when reps and/or weight weren't
   remembered. Missing numbers are stored as "not noted" and left out of the
   strength maths (est 1RM, % change, status), so trends stay honest.
2. The app remembers those gaps. At the next workout of the same day type
   (e.g. the next Legs day) it shows a list — "Last legs day you didn't note:
   Calf Raises (reps), Hamstring Curls (reps, weight)" — once; the lifter
   dismisses it and it doesn't come back for that session.

Global constraints
- Code computes every number; the LLM only phrases (HANDOFF.md).
- Zero-config must still work (no Supabase / no Gemini).
- Never put refs in the useGymLog return; never read localStorage in a
  useState initializer (HANDOFF.md gotchas).
- Gates: `npx tsc --noEmit`, `npx eslint src`, `npm run build`, `npm test`.

## Task 1: Test runner

- Add vitest (devDependency), `vitest.config.ts` resolving `@/` → `src/`,
  `"test": "vitest run"` script. Ignore `.superpowers/` in .gitignore.
- Test: `src/lib/gymlog.test.ts` — `collapseHistory` collapses two set rows of
  one session into one entry with sets=2 and the heavier weight.
- Expected: `npm test` → 1 passed.

## Task 2: Compute layer tolerates unnoted numbers

Interfaces: `SetRow.w: number | null`, `SetRow.reps: number | null`;
`HistorySetRow.weight/reps: number | null`.
Tests (gymlog.test.ts), each RED first:
- `collapseHistory` keeps a row with null reps, reporting reps null.
- `collapseHistory` prefers a set with a known weight over a null-weight set
  as the session's load.
- `readOut` computes e1rm/pct only from entries with both weight and reps;
  `hist` still contains the unnoted entry.
- `readOut` with only unnoted entries → e1rm 0, status flat, hist length 1.
- `loadSummary` → "20 kg × 3×?" style: weight known, reps unknown renders
  "20 kg × 3 sets · reps not noted"; both unknown → "3 sets · not noted".
Expected: `npm test` all green.

## Task 3: Coach proposes unnoted sets

Interfaces: `CoachProposal` log_sets `weightKg: number | null`,
`reps: number | null`.
Tests (`src/lib/coachActions.test.ts`):
- `sanitizeActions(["log_sets | exercise=Calf Raises | weight_kg=20 | sets=3"])`
  → one proposal, reps null, weightKg 20, sets 3.
- with neither weight nor reps → proposal with both null.
- `proposalText` for reps null → contains "reps not noted".
- `ACTIONS_PROMPT` no longer tells the coach to skip unknown reps (asserts the
  new rule text: "still log it").
Expected: green.

## Task 4: Gap finder

Interface: `unnotedGaps(day, history, todayISO) → { date: string; items: { exercise: string; missing: ("reps" | "weight")[] }[] } | null`
in gymlog.ts. Looks at the latest session of that day type dated before today;
lists exercises from that session missing reps and/or weight; null when none.
Tests:
- legs session on 2026-11-09 with Calf Raises reps null, Back Squat complete;
  asked on 2026-11-12 for Legs → items [Calf Raises: reps], date "Nov 9" label.
- a later complete legs session supersedes an older gappy one → null.
- today's own session is ignored (asked on the same day → uses the previous).
- other day types ignored.
Expected: green.

## Task 5: Wire DB, coach and UI

- Migration `supabase/migrations/0003_unnoted_sets.sql`: drop NOT NULL on
  `gymlog.sets.weight` and `gymlog.sets.reps`. Views already yield null est_1rm.
- db.ts `LogSetsInput.weightKg/reps` nullable.
- coach.ts history summary prints "not noted" instead of null.
- useGymLog: compute `unnotedGaps(currentNextDay, history, todayISO)`; persist
  `gapsDismissed` (key `${day}:${date}`) alongside loggedPromptOn; expose
  `gaps` + `dismissGaps`.
- TodayScreen: card above "Planned · last time" listing the gaps, "Got it".
- ExerciseScreen/other renderers null-safe (compiler finds them).
Expected: tsc clean, eslint clean, build OK, npm test green.

## Task 6: Apply the migration to the live project

Run 0003 inside a transaction, verify `is_nullable = YES` for both columns,
commit. Expected: both columns nullable, set count unchanged.
