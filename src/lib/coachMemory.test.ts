import { describe, expect, it } from "vitest";
import { checkinDue, noteWrites, readConversation, saveCoachLine, saveTurn } from "@/lib/coachMemory";

/** Records every call made through the Supabase query chain. */
function recorder(result: { data?: unknown; error?: unknown } = { data: [], error: null }) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "insert", "update", "in"]) {
    chain[m] = (...args: unknown[]) => (calls.push([m, ...args]), chain);
  }
  chain.then = (f: (v: unknown) => unknown) => Promise.resolve(result).then(f);
  const client = { from: (t: string) => (calls.push(["from", t]), chain) } as never;
  return { client, calls };
}

describe("readConversation", () => {
  it("reads newest first with the question-before-reply tiebreak, and returns oldest first", async () => {
    const { client, calls } = recorder({ data: [{ who: "coach", text: "b" }, { who: "user", text: "a" }], error: null });
    expect(await readConversation(client, 12)).toEqual([
      { who: "user", text: "a" },
      { who: "coach", text: "b" },
    ]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(calls).toContainEqual(["order", "who", { ascending: true }]);
    expect(calls).toContainEqual(["limit", 12]);
  });

  it("throws when the read fails", async () => {
    const { client } = recorder({ data: null, error: new Error("down") });
    await expect(readConversation(client, 30)).rejects.toThrow("down");
  });
});

describe("saveTurn", () => {
  it("stamps the reply one millisecond after the question", async () => {
    const { client, calls } = recorder();
    await saveTurn(client, "q", "r", Date.UTC(2026, 10, 12));
    expect(calls).toContainEqual([
      "insert",
      [
        { who: "user", text: "q", created_at: "2026-11-12T00:00:00.000Z" },
        { who: "coach", text: "r", created_at: "2026-11-12T00:00:00.001Z" },
      ],
    ]);
  });
});

describe("saveCoachLine", () => {
  it("saves a receipt without a kind, and a check-in with one", async () => {
    const { client, calls } = recorder();
    await saveCoachLine(client, "Logged.");
    await saveCoachLine(client, "Week done.", "checkin");
    expect(calls).toContainEqual(["insert", { who: "coach", text: "Logged." }]);
    expect(calls).toContainEqual(["insert", { who: "coach", kind: "checkin", text: "Week done." }]);
  });
});

describe("noteWrites", () => {
  it("writes nothing when the reply asked for no note changes", () => {
    expect(noteWrites(recorder().client, null, [])).toEqual([]);
  });
  it("adds and resolves notes", () => {
    expect(noteWrites(recorder().client, "watch the knee", ["n1"])).toHaveLength(2);
  });
});

describe("checkinDue", () => {
  const now = Date.UTC(2026, 10, 12);
  it("is due with no check-in yet", () => expect(checkinDue(null, now)).toBe(true));
  it("is due after a week", () => expect(checkinDue("2026-11-04T00:00:00Z", now)).toBe(true));
  it("is not due within the week", () => expect(checkinDue("2026-11-06T00:00:00Z", now)).toBe(false));
});
