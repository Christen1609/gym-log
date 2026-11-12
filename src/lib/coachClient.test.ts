import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCoachProposal, COACH_FALLBACK, requestCoachReply, type LogWriter } from "@/lib/coachClient";
import type { CoachProposal } from "@/lib/coachActions";

const TODAY = "2026-11-12";

function fakeWriter() {
  const calls: string[] = [];
  const writer: LogWriter = {
    logSets: async (i) => void calls.push(`logSets ${i.exercise} ${i.date}`),
    logCardio: async (i) => void calls.push(`logCardio ${i.kind}`),
    correctSets: async (i) => (calls.push(`correctSets ${i.exercise}`), 1),
    removeSets: async (i) => (calls.push(`removeSets ${i.exercise}`), 1),
    loadHistory: async () => (calls.push("loadHistory"), {}),
    loadCardio: async () => (calls.push("loadCardio"), []),
    appendCoachMessage: async (t) => void calls.push(`appendCoachMessage ${t}`),
  };
  return { writer, calls };
}

const logSets = (date: string): CoachProposal => ({
  id: "1",
  type: "log_sets",
  exercise: "Bench Press",
  newExercise: false,
  muscleGroup: "Chest",
  date,
  weightKg: 80,
  reps: 5,
  sets: 3,
  rpe: 8,
});

describe("applyCoachProposal", () => {
  it("logs sets for today, reloads history, and adds a line to Logged today", async () => {
    const { writer, calls } = fakeWriter();
    const out = await applyCoachProposal(logSets(TODAY), { today: TODAY, units: "kg", signedIn: true, writer });
    expect(calls.slice(0, 2)).toEqual([`logSets Bench Press ${TODAY}`, "loadHistory"]);
    expect(out.loggedToday).toEqual({ name: "Bench Press", summary: "80 kg × 3×5 · RPE 8" });
    expect(out.history).toEqual({});
    expect(out.receipt).toMatch(/^Logged Bench Press/);
  });

  it("leaves Logged today alone for a past date", async () => {
    const { writer } = fakeWriter();
    const out = await applyCoachProposal(logSets("2026-11-01"), { today: TODAY, units: "kg", signedIn: true, writer });
    expect(out.loggedToday).toBeUndefined();
  });

  it("switches the day without touching the log, even signed out", async () => {
    const { writer, calls } = fakeWriter();
    const out = await applyCoachProposal({ id: "2", type: "set_next_day", day: "Legs" }, { today: TODAY, units: "kg", signedIn: false, writer });
    expect(out.pickDay).toBe("Legs");
    expect(calls).toEqual([]);
  });

  it("refuses to write the log signed out", async () => {
    const { writer, calls } = fakeWriter();
    await expect(applyCoachProposal(logSets(TODAY), { today: TODAY, units: "kg", signedIn: false, writer })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("reloads cardio after logging cardio", async () => {
    const { writer, calls } = fakeWriter();
    const out = await applyCoachProposal(
      { id: "3", type: "log_cardio", date: TODAY, kind: "Run", minutes: 30, distanceKm: null, note: null },
      { today: TODAY, units: "kg", signedIn: true, writer }
    );
    expect(calls.slice(0, 2)).toEqual(["logCardio Run", "loadCardio"]);
    expect(out.loggedToday?.name).toBe("Cardio");
  });
});

describe("requestCoachReply", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("falls back to the stock reply when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await requestCoachReply("hi", {}, true)).toEqual({ text: COACH_FALLBACK, proposals: [] });
  });

  it("returns the coach's text and proposals", async () => {
    const proposal = logSets(TODAY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "Nice.", proposals: [proposal] }) }));
    expect(await requestCoachReply("did 3x5 bench", {}, true)).toEqual({ text: "Nice.", proposals: [proposal] });
  });
});

describe("applyCoachProposal after the write succeeds", () => {
  it("still reports Logged today when the history reload fails, so the lifter doesn't confirm twice", async () => {
    const { writer } = fakeWriter();
    writer.loadHistory = async () => {
      throw new Error("blip");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await applyCoachProposal(logSets(TODAY), { today: TODAY, units: "kg", signedIn: true, writer });
    expect(out.loggedToday?.name).toBe("Bench Press");
    expect(out.history).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("doesn't reload set history after a cardio write", async () => {
    const { writer, calls } = fakeWriter();
    await applyCoachProposal(
      { id: "3", type: "log_cardio", date: TODAY, kind: "Run", minutes: 30, distanceKm: null, note: null },
      { today: TODAY, units: "kg", signedIn: true, writer }
    );
    expect(calls).not.toContain("loadHistory");
  });

  it("saves the receipt to the conversation when signed in", async () => {
    const { writer, calls } = fakeWriter();
    const out = await applyCoachProposal(logSets(TODAY), { today: TODAY, units: "kg", signedIn: true, writer });
    expect(calls).toContain(`appendCoachMessage ${out.receipt}`);
  });

  it("doesn't save a receipt signed out", async () => {
    const { writer, calls } = fakeWriter();
    await applyCoachProposal({ id: "2", type: "set_next_day", day: "Legs" }, { today: TODAY, units: "kg", signedIn: false, writer });
    expect(calls.some((c) => c.startsWith("appendCoachMessage"))).toBe(false);
  });
});
