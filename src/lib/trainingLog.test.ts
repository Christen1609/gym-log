import { describe, expect, it } from "vitest";
import { expandSetRows, fetchHistory } from "@/lib/trainingLog";

describe("expandSetRows", () => {
  const base = { sessionId: "s1", exerciseId: "e1", weight: 80, reps: 5, rpe: 8 };

  it("writes one row per set, numbered from 1, with the note on the last set only", () => {
    const rows = expandSetRows({ ...base, count: 3, note: "heavy" });
    expect(rows.map((r) => r.set_no)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.felt_note)).toEqual([null, null, "heavy"]);
    expect(rows[0]).toMatchObject({ session_id: "s1", exercise_id: "e1", weight: 80, reps: 5, rpe: 8 });
  });

  it("continues numbering when sets are appended to a session", () => {
    expect(expandSetRows({ ...base, count: 2, startAt: 4 }).map((r) => r.set_no)).toEqual([4, 5]);
  });

  it("stores an empty note as no note", () => {
    expect(expandSetRows({ ...base, count: 1, note: "" })[0].felt_note).toBeNull();
  });

  it("writes nothing for zero sets", () => {
    expect(expandSetRows({ ...base, count: 0 })).toEqual([]);
  });
});

/** A stand-in Supabase client that answers the two history queries. */
function fakeClient(tables: Record<string, { data: unknown[] | null; error: unknown }>) {
  return {
    from(table: string) {
      const res = tables[table];
      const chain = { select: () => chain, order: () => Promise.resolve(res), then: (f: (v: unknown) => unknown) => Promise.resolve(res).then(f) };
      return chain;
    },
  } as never;
}

describe("fetchHistory", () => {
  it("joins each set to its session's ISO date and collapses per exercise", async () => {
    const history = await fetchHistory(
      fakeClient({
        exercises: { data: [{ id: "e1", name: "Back Squat", muscle_group: "Legs", is_compound: true }], error: null },
        sets: {
          data: [
            { exercise_id: "e1", session_id: "s1", set_no: 1, weight: 100, reps: 5, rpe: null, felt_note: null, sessions: { date: "2026-11-01" } },
            { exercise_id: "e1", session_id: "s1", set_no: 2, weight: 100, reps: 5, rpe: 8, felt_note: "ok", sessions: { date: "2026-11-01" } },
          ],
          error: null,
        },
      })
    );
    expect(history["Back Squat"]).toMatchObject({ group: "Legs · compound", hist: [{ iso: "2026-11-01", sets: 2, w: 100, rpe: 8, note: "ok" }] });
  });

  it("throws when a query fails", async () => {
    await expect(
      fetchHistory(fakeClient({ exercises: { data: null, error: new Error("down") }, sets: { data: [], error: null } }))
    ).rejects.toThrow("down");
  });
});
