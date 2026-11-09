import { describe, expect, it } from "vitest";
import {
  collapseHistory,
  entryE1rm,
  loadSummary,
  readOut,
  unnotedGaps,
  type ExerciseData,
  type HistoryExerciseRow,
  type HistorySetRow,
} from "@/lib/gymlog";

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

describe("unnoted numbers", () => {
  it("collapseHistory keeps a set whose reps weren't noted", () => {
    const out = collapseHistory([ex("e1", "Calf Raises")], [set({ weight: 20, reps: null }), set({ weight: 20, reps: null })]);
    expect(out["Calf Raises"].hist).toMatchObject([{ w: 20, reps: null, sets: 2 }]);
  });

  it("collapseHistory keeps an unnoted weight as unnoted, not zero", () => {
    const out = collapseHistory([ex("e1", "Hamstring Curls")], [set({ weight: null, reps: null })]);
    expect(out["Hamstring Curls"].hist).toMatchObject([{ w: null, reps: null, sets: 1 }]);
  });

  it("collapseHistory reports a known weight over an unnoted one as the load", () => {
    const out = collapseHistory([ex("e1", "Leg Curls")], [set({ weight: null, reps: null }), set({ weight: 90, reps: 13 })]);
    expect(out["Leg Curls"].hist).toMatchObject([{ w: 90, reps: 13, sets: 2 }]);
  });

  it("readOut leaves unnoted entries out of the strength maths but keeps them in history", () => {
    const data = {
      "Back Squat": {
        group: "Legs · compound",
        hist: [
          { date: "Nov 1", w: 100, sets: 3, reps: 5, rpe: null },
          { date: "Nov 5", w: 110, sets: 3, reps: 5, rpe: null },
          { date: "Nov 9", w: 120, sets: 3, reps: null, rpe: null },
        ],
      },
    };
    const ro = readOut("Back Squat", data);
    expect(ro.hist).toHaveLength(3);
    expect(ro.e1rm).toBeCloseTo(110 * (1 + 5 / 30));
    expect(ro.pct).toBeCloseTo(10);
    expect(ro.spark(40)).not.toContain("NaN");
  });

  it("readOut with only unnoted entries has no est 1RM rather than a zero", () => {
    const data = { "Calf Raises": { group: "Legs", hist: [{ date: "Nov 9", w: 20, sets: 3, reps: null, rpe: null }] } };
    const ro = readOut("Calf Raises", data);
    expect(ro).toMatchObject({ e1rm: null, pct: 0, status: "flat" });
    expect(ro.hist).toHaveLength(1);
  });

  it("loadSummary says which number wasn't noted", () => {
    expect(loadSummary({ w: 20, sets: 3, reps: null }, "kg")).toBe("20 kg × 3 sets · reps not noted");
    expect(loadSummary({ w: null, sets: 3, reps: 12 }, "kg")).toBe("3×12 · weight not noted");
    expect(loadSummary({ w: null, sets: 3, reps: null }, "kg")).toBe("3 sets · not noted");
    expect(loadSummary({ w: 85, sets: 5, reps: 5 }, "kg")).toBe("85 kg × 5×5");
  });
});

describe("entryE1rm", () => {
  it("is Epley for a fully noted entry and null when a number is missing", () => {
    expect(entryE1rm({ w: 90, reps: 3 })).toBeCloseTo(99);
    expect(entryE1rm({ w: 20, reps: null })).toBeNull();
    expect(entryE1rm({ w: null, reps: 12 })).toBeNull();
  });
});

describe("unnotedGaps", () => {
  const legs = (hist: ExerciseData["hist"]): ExerciseData => ({ group: "Legs · accessory", hist });
  const history: Record<string, ExerciseData> = {
    "Back Squat": { group: "Legs · compound", hist: [{ date: "9 Nov", w: 100, sets: 1, reps: 9, rpe: null }] },
    "Calf Raises": legs([{ date: "9 Nov", w: 20, sets: 3, reps: null, rpe: null }]),
    "Hamstring Curls": legs([{ date: "9 Nov", w: null, sets: 3, reps: null, rpe: null }]),
    "Bench Press": { group: "Chest · compound", hist: [{ date: "10 Nov", w: null, sets: 3, reps: null, rpe: null }] },
  };

  it("lists what wasn't noted at the last session of that day", () => {
    expect(unnotedGaps("Legs", history, "2026-11-12")).toEqual({
      iso: "2026-11-09",
      date: "9 Nov",
      items: [
        { exercise: "Calf Raises", missing: ["reps"] },
        { exercise: "Hamstring Curls", missing: ["weight", "reps"] },
      ],
    });
  });

  it("ignores other day types", () => {
    expect(unnotedGaps("Back", history, "2026-11-12")).toBeNull();
  });

  it("is null once a later session of that day was fully noted", () => {
    const later = {
      ...history,
      "Calf Raises": legs([...history["Calf Raises"].hist, { date: "16 Nov", w: 20, sets: 3, reps: 15, rpe: null }]),
      "Hamstring Curls": legs([...history["Hamstring Curls"].hist]),
    };
    expect(unnotedGaps("Legs", later, "2026-11-20")).toBeNull();
  });

  it("looks at the session before today, not today's own", () => {
    const today = {
      ...history,
      "Back Squat": { group: "Legs · compound", hist: [...history["Back Squat"].hist, { date: "16 Nov", w: 100, sets: 1, reps: null, rpe: null }] },
    };
    expect(unnotedGaps("Legs", today, "2026-11-16")?.iso).toBe("2026-11-09");
  });
});
