import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { generate } = await import("@/lib/gemini");

const reply = (text: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => "boom", json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });

describe("generate", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns null without calling out when there is no key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the model's text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("hello")));
    expect(await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" })).toBe("hello");
  });

  it("sends system, schema and thinking only when given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" });
    const plain = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(plain.systemInstruction).toBeUndefined();
    expect(plain.generationConfig).toEqual({ temperature: 0, maxOutputTokens: 10 });

    await generate({ prompt: "p", system: "s", schema: { type: "object" }, thinking: 0, temperature: 0.4, maxTokens: 400, label: "t" });
    const full = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(full.systemInstruction).toEqual({ parts: [{ text: "s" }] });
    expect(full.generationConfig).toEqual({
      temperature: 0.4,
      maxOutputTokens: 400,
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: { type: "object" },
    });
  });

  it("returns null on an HTTP error, a network error, or an empty reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("x", false)));
    expect(await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" })).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" })).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(undefined)));
    expect(await generate({ prompt: "p", temperature: 0, maxTokens: 10, label: "t" })).toBeNull();
  });
});
