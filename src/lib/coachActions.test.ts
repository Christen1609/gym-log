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

describe("coach logs cardio", () => {
  it("proposes a cardio session", () => {
    const [p] = sanitizeActions(["log_cardio | kind=treadmill | minutes=30 | distance_km=5"], history, TODAY);
    expect(p).toMatchObject({ type: "log_cardio", kind: "Treadmill", minutes: 30, distanceKm: 5, note: null, date: TODAY });
  });

  it("keeps cardio whose time wasn't noted, and names unnamed cardio 'Cardio'", () => {
    const [p] = sanitizeActions(["log_cardio | minutes=unknown | date=2026-11-08"], history, TODAY);
    expect(p).toMatchObject({ type: "log_cardio", kind: "Cardio", minutes: null, date: "2026-11-08" });
  });

  it("drops cardio with an impossible time", () => {
    expect(sanitizeActions(["log_cardio | kind=bike | minutes=0"], history, TODAY)).toEqual([]);
    expect(sanitizeActions(["log_cardio | kind=bike | minutes=1000"], history, TODAY)).toEqual([]);
  });

  it("describes cardio on the card and the receipt", () => {
    const p: CoachProposal = { id: "x", type: "log_cardio", kind: "Treadmill", date: TODAY, minutes: 30, distanceKm: 5, note: null };
    expect(proposalText(p, "kg", TODAY, "propose")).toBe("Log cardio: Treadmill · 30 min · 5 km, today.");
    expect(proposalText(p, "kg", TODAY, "done")).toBe("Logged cardio: Treadmill · 30 min · 5 km, today.");
  });

  it("tells the coach how to log cardio and that it leaves the rotation alone", () => {
    expect(ACTIONS_PROMPT).toMatch(/log_cardio \|/);
    expect(ACTIONS_PROMPT).toMatch(/does not change the rotation/);
  });
});

describe("cardio numbers written loosely", () => {
  it.each([
    ["30 min", 30],
    ["45 mins", 45],
    ["1h", 60],
    ["1.5 hours", 90],
    ["45-60", 45],
  ])("reads minutes=%s as %d", (v, want) => {
    const [p] = sanitizeActions([`log_cardio | kind=bike | minutes=${v}`], history, TODAY);
    expect(p).toMatchObject({ type: "log_cardio", minutes: want });
  });

  it("keeps the card with time not noted when minutes can't be read", () => {
    const [p] = sanitizeActions(["log_cardio | kind=bike | minutes=a while"], history, TODAY);
    expect(p).toMatchObject({ type: "log_cardio", minutes: null });
  });

  it("reads distance with units, converting miles", () => {
    expect(sanitizeActions(["log_cardio | kind=run | distance_km=5 km"], history, TODAY)[0]).toMatchObject({ distanceKm: 5 });
    expect(sanitizeActions(["log_cardio | kind=run | distance_km=3 mi"], history, TODAY)[0]).toMatchObject({ distanceKm: 4.83 });
  });
});

describe("coach fixes a session more than a year old", () => {
  // History loaded from the log carries the session's full ISO date; the
  // "20 Oct" label alone would be read back as 20 Oct of this year.
  const old: Record<string, ExerciseData> = {
    "Back Squat": { group: "Legs · compound", hist: [{ date: "20 Oct", iso: "2025-10-20", w: 100, sets: 3, reps: 5, rpe: 8 }] },
  };

  it("keeps a correct_sets aimed at that session", () => {
    const [p] = sanitizeActions(["correct_sets | exercise=Back Squat | date=2025-10-20 | reps=6"], old, TODAY);
    expect(p).toMatchObject({ type: "correct_sets", date: "2025-10-20", reps: 6 });
  });

  it("defaults a remove_sets with no date to that session, not this year's 20 Oct", () => {
    const [p] = sanitizeActions(["remove_sets | exercise=Back Squat"], old, TODAY);
    expect(p).toMatchObject({ type: "remove_sets", date: "2025-10-20" });
  });
});
