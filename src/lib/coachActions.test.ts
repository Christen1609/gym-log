import { describe, expect, it } from "vitest";
import { ACTIONS_PROMPT, proposalText, sanitizeActions, type CoachProposal } from "@/lib/coachActions";
import type { ExerciseData } from "@/lib/gymlog";

const TODAY = "2026-11-09";
const history: Record<string, ExerciseData> = {
  "Back Squat": { group: "Legs · compound", hist: [{ date: "Nov 9", w: 100, sets: 1, reps: 9, rpe: null }] },
};

describe("coach logs sets with numbers that weren't noted", () => {
  it("proposes a log_sets with reps unnoted when the lifter didn't remember them", () => {
    const [p] = sanitizeActions(["log_sets | exercise=Calf Raises | weight_kg=20 | sets=3 | muscle_group=Legs"], history, TODAY);
    expect(p).toMatchObject({ type: "log_sets", exercise: "Calf Raises", weightKg: 20, reps: null, sets: 3, date: TODAY });
  });

  it("proposes a log_sets with neither weight nor reps noted", () => {
    const [p] = sanitizeActions(["log_sets | exercise=Hamstring Curls | sets=3"], history, TODAY);
    expect(p).toMatchObject({ type: "log_sets", exercise: "Hamstring Curls", weightKg: null, reps: null, sets: 3 });
  });

  it("still drops a log_sets with no exercise name", () => {
    expect(sanitizeActions(["log_sets | weight_kg=20 | sets=3"], history, TODAY)).toEqual([]);
  });

  it("describes an unnoted number on the confirm card", () => {
    const p: CoachProposal = {
      id: "x",
      type: "log_sets",
      exercise: "Calf Raises",
      newExercise: true,
      muscleGroup: "Legs",
      date: TODAY,
      weightKg: 20,
      reps: null,
      sets: 3,
      rpe: null,
    };
    expect(proposalText(p, "kg", TODAY, "propose")).toBe("Log Calf Raises (new exercise): 20 kg × 3 sets · reps not noted, today.");
  });

  it("tells the coach to log unknown reps instead of skipping them", () => {
    expect(ACTIONS_PROMPT).not.toMatch(/unknown reps → do not log it/);
    expect(ACTIONS_PROMPT).toMatch(/still log it/);
  });
});

describe("coach says it doesn't know a number", () => {
  it.each(["unknown", "?", "not noted", "don't remember", "to failure"])("keeps the set when reps=%s", (v) => {
    const [p] = sanitizeActions([`log_sets | exercise=Calf Raises | weight_kg=20 | reps=${v} | sets=3`], history, TODAY);
    expect(p).toMatchObject({ exercise: "Calf Raises", weightKg: 20, reps: null, sets: 3 });
  });

  it("keeps a bodyweight set with its weight not noted", () => {
    const [p] = sanitizeActions(["log_sets | exercise=Pull Up | weight_kg=bodyweight | reps=8 | sets=3"], history, TODAY);
    expect(p).toMatchObject({ exercise: "Pull Up", weightKg: null, reps: 8 });
  });
});
