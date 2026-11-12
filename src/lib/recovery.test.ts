import { describe, expect, it } from "vitest";
import { recoveryTokensFromHash } from "@/lib/recovery";

describe("recoveryTokensFromHash", () => {
  it("reads the tokens from a password-reset link", () => {
    expect(recoveryTokensFromHash("#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery")).toEqual({
      access_token: "abc",
      refresh_token: "def",
    });
  });

  it("ignores links that aren't password resets", () => {
    expect(recoveryTokensFromHash("#access_token=abc&refresh_token=def&type=signup")).toBeNull();
    expect(recoveryTokensFromHash("")).toBeNull();
    expect(recoveryTokensFromHash("#type=recovery&access_token=abc")).toBeNull();
  });
});
