import { describe, expect, it } from "vitest";
import {
  cacheKey,
  dequeue,
  enqueue,
  isNetworkError,
  itemsForUser,
  offlineFallback,
  readCache,
  readQueue,
  type QueueItem,
} from "./offline";

const set = (id: string, userId = "u1"): QueueItem => ({
  id,
  userId,
  clientId: `c-${id}`,
  kind: "set",
  payload: { exercise: "Squat", date: "2026-11-10", weightKg: 100, reps: 5, sets: 3, rpe: null, note: null },
});

describe("queue", () => {
  it("enqueue appends without mutating", () => {
    const q: QueueItem[] = [set("a")];
    const next = enqueue(q, set("b"));
    expect(next.map((i) => i.id)).toEqual(["a", "b"]);
    expect(q).toHaveLength(1);
  });
  it("dequeue removes by id", () => {
    expect(dequeue([set("a"), set("b")], "a").map((i) => i.id)).toEqual(["b"]);
  });
  it("readQueue tolerates bad input", () => {
    expect(readQueue(null)).toEqual([]);
    expect(readQueue("{nope")).toEqual([]);
    expect(readQueue('{"a":1}')).toEqual([]);
    expect(readQueue(JSON.stringify([set("a"), { bogus: true }]))).toEqual([set("a")]);
  });
});

describe("isNetworkError", () => {
  it("recognises fetch failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"), true)).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch"), true)).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch" }, true)).toBe(true);
  });
  it("treats any error as network when offline", () => {
    expect(isNetworkError(new Error("boom"), false)).toBe(true);
  });
  it("does not treat other errors as network when online", () => {
    expect(isNetworkError(new Error("duplicate key"), true)).toBe(false);
    expect(isNetworkError(null, true)).toBe(false);
  });
});

describe("cache", () => {
  it("keys per user", () => expect(cacheKey("u1")).toBe("gymlog:cache:u1"));
  it("reads a valid cache", () => {
    const c = { history: { Squat: { sessions: [] } }, cardio: [], savedAt: 5 };
    expect(readCache(JSON.stringify(c))).toEqual(c);
  });
  it("rejects bad shapes", () => {
    expect(readCache(null)).toBeNull();
    expect(readCache("x")).toBeNull();
    expect(readCache(JSON.stringify({ history: [], cardio: [], savedAt: 1 }))).toBeNull();
    expect(readCache(JSON.stringify({ history: {}, cardio: {}, savedAt: 1 }))).toBeNull();
    expect(readCache(JSON.stringify({ history: {}, cardio: [] }))).toBeNull();
  });
});

describe("itemsForUser", () => {
  it("keeps only the signed-in user's items, in order", () => {
    const q = [set("a", "u1"), set("b", "u2"), set("c", "u1")];
    expect(itemsForUser(q, "u1").map((i) => i.id)).toEqual(["a", "c"]);
    expect(itemsForUser(q, "u3")).toEqual([]);
  });
  it("readQueue drops items without a user or client id", () => {
    const bad = { id: "x", kind: "set", payload: {} };
    expect(readQueue(JSON.stringify([set("a"), bad]))).toEqual([set("a")]);
  });
});

describe("offlineFallback", () => {
  const base = { hasSession: false, online: false, native: true, lastUserRaw: JSON.stringify({ id: "u1" }) };
  it("returns the last user when native, offline and sessionless", () => {
    expect(offlineFallback(base)).toBe("u1");
  });
  it("returns null when a session exists, online, or not native", () => {
    expect(offlineFallback({ ...base, hasSession: true })).toBeNull();
    expect(offlineFallback({ ...base, online: true })).toBeNull();
    expect(offlineFallback({ ...base, native: false })).toBeNull();
  });
  it("returns null for missing or malformed lastUser", () => {
    expect(offlineFallback({ ...base, lastUserRaw: null })).toBeNull();
    expect(offlineFallback({ ...base, lastUserRaw: "{x" })).toBeNull();
    expect(offlineFallback({ ...base, lastUserRaw: JSON.stringify({ id: "" }) })).toBeNull();
    expect(offlineFallback({ ...base, lastUserRaw: JSON.stringify({ id: 5 }) })).toBeNull();
    expect(offlineFallback({ ...base, lastUserRaw: "null" })).toBeNull();
  });
});
