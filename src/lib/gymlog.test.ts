import { describe, expect, it } from "vitest";
import { collapseHistory, type HistoryExerciseRow, type HistorySetRow } from "@/lib/gymlog";

const ex = (id: string, name: string, muscle_group = "Legs"): HistoryExerciseRow => ({
  id,
  name,
  muscle_group,
  is_compound: false,
});
const set = (over: Partial<HistorySetRow>): HistorySetRow => ({
  exercise_id: "e1",
  session_id: "s1",
  weight: 100,
  reps: 5,
  rpe: null,
  felt_note: null,
  date: "2026-11-09",
  ...over,
});

describe("collapseHistory", () => {
  it("collapses one session's sets into one entry carrying the heaviest set", () => {
    const out = collapseHistory([ex("e1", "Back Squat")], [set({ weight: 80, reps: 12 }), set({ weight: 100, reps: 9 })]);
    expect(out["Back Squat"].hist).toMatchObject([{ date: "9 Nov", w: 100, sets: 2, reps: 9, rpe: null, note: "" }]);
  });
});
