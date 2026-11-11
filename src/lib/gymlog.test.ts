import { describe, expect, it } from "vitest";
import {
  aiAllowed,
  cardioBlock,
  cardioSummary,
  collapseHistory,
  daysSinceTraining,
  entryE1rm,
  loadSummary,
  nextReminderAt,
  readOut,
  reminderCopy,
  toCardioEntry,
  unnotedGaps,
  type CardioEntry,
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

describe("cardio", () => {
  const c = (over: Partial<CardioEntry>): CardioEntry => ({
    date: "2026-11-10",
    kind: "Treadmill",
    minutes: 30,
    distanceKm: null,
    note: null,
    ...over,
  });

  it("cardioSummary lists what was noted", () => {
    expect(cardioSummary(c({ distanceKm: 5 }))).toBe("Treadmill · 30 min · 5 km");
    expect(cardioSummary(c({ kind: "Bike", minutes: null }))).toBe("Bike · time not noted");
    expect(cardioSummary(c({ note: "easy" }))).toBe("Treadmill · 30 min · easy");
  });

  it("daysSinceTraining counts cardio as training", () => {
    expect(daysSinceTraining(3, [c({ date: "2026-11-10" })], "2026-11-10")).toBe(0);
    expect(daysSinceTraining(3, [], "2026-11-10")).toBe(3);
    expect(daysSinceTraining(null, [c({ date: "2026-11-08" })], "2026-11-10")).toBe(2);
    expect(daysSinceTraining(null, [], "2026-11-10")).toBeNull();
    expect(daysSinceTraining(1, [c({ date: "2026-11-12" })], "2026-11-10")).toBe(1);
  });
});

describe("cardioBlock", () => {
  it("lists recent cardio for the coach, newest first", () => {
    const entries: CardioEntry[] = [
      { date: "2026-11-08", kind: "Bike", minutes: 20, distanceKm: null, note: null },
      { date: "2026-11-10", kind: "Treadmill", minutes: 30, distanceKm: 5, note: null },
    ];
    expect(cardioBlock(entries)).toBe("10 Nov: Treadmill · 30 min · 5 km\n8 Nov: Bike · 20 min");
    expect(cardioBlock([])).toBe("None logged.");
  });
});

describe("toCardioEntry", () => {
  it("reads a cardio row, turning numeric strings into numbers", () => {
    expect(toCardioEntry({ date: "2026-11-10", kind: "Run", minutes: 25, distance_km: "4.20", note: null })).toEqual({
      date: "2026-11-10",
      kind: "Run",
      minutes: 25,
      distanceKm: 4.2,
      note: null,
    });
  });
});

describe("reminderCopy", () => {
  it("counts days since any training and names the last lifting session separately", () => {
    expect(reminderCopy({ days: 2, lastLiftDay: "Legs", lastLiftDate: "5 Nov", dayTitle: "Chest day" })).toEqual({
      gap: "It has been 2 days since you last trained.",
      detail: "Last lifting session: legs on 5 Nov. Today reads as chest day.",
    });
  });

  it("handles yesterday and an empty log", () => {
    expect(reminderCopy({ days: 1, lastLiftDay: null, lastLiftDate: null, dayTitle: "Chest day" })).toEqual({
      gap: "You last trained yesterday.",
      detail: "Log a set and the rotation starts tracking itself. Today reads as chest day.",
    });
    expect(reminderCopy({ days: null, lastLiftDay: null, lastLiftDate: null, dayTitle: "Chest day" }).gap).toBe(
      "Nothing is in the log yet."
    );
  });
});

describe("aiAllowed", () => {
  it("allows only an explicit ai: true flag", () => {
    expect(aiAllowed({ ai: true })).toBe(true);
    expect(aiAllowed({ ai: "true" })).toBe(false);
    expect(aiAllowed({})).toBe(false);
    expect(aiAllowed(null)).toBe(false);
    expect(aiAllowed("x")).toBe(false);
  });
});

describe("nextReminderAt", () => {
  const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

  it("schedules 18:00 local on last training plus the gap, when that is still ahead", () => {
    expect(nextReminderAt("2026-11-10", new Date(2026, 10, 11, 9, 0))?.getTime()).toBe(at(2026, 11, 12, 18));
  });

  it("falls back to today 18:00 when the due day is already past, and tomorrow once 18:00 has passed", () => {
    expect(nextReminderAt("2026-11-01", new Date(2026, 10, 11, 9, 0))?.getTime()).toBe(at(2026, 11, 11, 18));
    expect(nextReminderAt("2026-11-01", new Date(2026, 10, 11, 19, 0))?.getTime()).toBe(at(2026, 11, 12, 18));
  });

  it("with no training yet, uses today 18:00 before 18:00 and tomorrow after", () => {
    expect(nextReminderAt(null, new Date(2026, 10, 11, 9, 0))?.getTime()).toBe(at(2026, 11, 11, 18));
    expect(nextReminderAt(null, new Date(2026, 10, 11, 19, 0))?.getTime()).toBe(at(2026, 11, 12, 18));
  });
});
