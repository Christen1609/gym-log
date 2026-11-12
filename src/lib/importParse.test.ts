import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseWorkoutText } from "@/lib/importParse";

describe("parseWorkoutText consent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never calls Gemini without AI consent, even with a key set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await parseWorkoutText("Nov 10\nbench 80 5x5", "2026-11-11", false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
