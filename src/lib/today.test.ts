import { describe, expect, it } from "vitest";
import type { ExerciseData } from "@/lib/gymlog";
import { coachContext, loggedLine, nudgeDue, resolveToday, type NudgeInputs } from "@/lib/today";

const TODAY = "2026-11-12";
const history: Record<string, ExerciseData> = {
  "Bench Press": { group: "Chest · compound", hist: [{ date: "10 Nov", iso: "2026-11-10", w: 80, sets: 5, reps: 5, rpe: 8 }] },
};
const base = { history, cardio: [], dayOverride: null, dayOverrideOn: "", todayISO: TODAY };

describe("resolveToday", () => {
  it("advances the rotation after the last session", () => {
    const t = resolveToday(base);
    expect(t).toMatchObject({ day: "Back", dayIsAuto: true, dayTitle: "Back day", daysSinceLast: 2, workoutUnlogged: true, lastTrainingISO: "2026-11-10" });
  });

  it("uses a day picked by hand today", () => {
    expect(resolveToday({ ...base, dayOverride: "Legs", dayOverrideOn: TODAY })).toMatchObject({ day: "Legs", dayIsAuto: false });
  });

  it("forgets a hand-picked day once the calendar rolls over", () => {
    expect(resolveToday({ ...base, dayOverride: "Legs", dayOverrideOn: "2026-11-11" })).toMatchObject({ day: "Back", dayIsAuto: true });
  });

  it("counts cardio as training for the nudge", () => {
    const t = resolveToday({ ...base, cardio: [{ date: TODAY, kind: "Run", minutes: 30, distanceKm: null, note: null }] });
    expect(t.workoutUnlogged).toBe(false);
  });

  it("treats an empty log as unlogged with no last training", () => {
    expect(resolveToday({ ...base, history: {} })).toMatchObject({ day: "Chest", daysSinceLast: null, workoutUnlogged: true, lastTrainingISO: null });
  });
});

describe("nudgeDue", () => {
  const due: NudgeInputs = {
    hydrated: true,
    todayISO: TODAY,
    syncing: false,
    authed: true,
    workoutUnlogged: true,
    loggedPromptOn: "",
    sheetOpen: false,
    onToday: true,
  };

  it("is due when nothing blocks it", () => expect(nudgeDue(due)).toBe(true));
  it.each<[string, Partial<NudgeInputs>]>([
    ["already answered today", { loggedPromptOn: TODAY }],
    ["still syncing the real history", { syncing: true }],
    ["signed out", { authed: false }],
    ["a sheet is open", { sheetOpen: true }],
    ["not on Today", { onToday: false }],
    ["trained already", { workoutUnlogged: false }],
    ["before the clock is read", { todayISO: "" }],
  ])("is not due when %s", (_, over) => expect(nudgeDue({ ...due, ...over })).toBe(false));
});

describe("loggedLine", () => {
  it("summarises a set with its RPE", () => {
    expect(loggedLine("Bench Press", { weight: 80, sets: 5, reps: 5, rpe: 8 }, "kg")).toEqual({ name: "Bench Press", summary: "80 kg × 5×5 · RPE 8" });
  });
});

describe("coachContext", () => {
  it("tells the coach the day the screen shows, including a hand-picked one", () => {
    const ctx = coachContext(history, "Legs", new Date(`${TODAY}T12:00:00`));
    expect(ctx).toMatchObject({ todayISO: TODAY, nextDay: "Legs", lastSessionDay: "Chest", lastSessionDate: "10 Nov" });
  });
});
