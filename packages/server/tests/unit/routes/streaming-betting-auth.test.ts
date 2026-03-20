import { describe, expect, it } from "vitest";
import {
  extractBettingFeedToken,
  hasValidBettingFeedToken,
} from "../../../src/routes/streaming-betting-auth.js";

describe("streaming-betting-auth", () => {
  it("accepts a matching token", () => {
    expect(hasValidBettingFeedToken("secret-token", "secret-token")).toBe(true);
  });

  it("rejects a missing token", () => {
    expect(hasValidBettingFeedToken("secret-token", null)).toBe(false);
  });

  it("rejects a mismatched token", () => {
    expect(hasValidBettingFeedToken("secret-token", "secret-token-2")).toBe(
      false,
    );
  });

  it("rejects a token with a different length", () => {
    expect(hasValidBettingFeedToken("secret-token", "short")).toBe(false);
  });

  it("extracts a bearer token case-insensitively from the authorization header", () => {
    expect(
      extractBettingFeedToken({
        authorizationHeader: "bearer secret-token",
      }),
    ).toBe("secret-token");
  });

  it("does not accept query tokens unless the route explicitly allows them", () => {
    expect(
      extractBettingFeedToken({
        streamToken: "secret-token",
        allowQueryToken: false,
      }),
    ).toBeNull();
  });

  it("accepts streamToken query params for SSE-style callers when allowed", () => {
    expect(
      extractBettingFeedToken({
        streamToken: "secret-token",
        allowQueryToken: true,
      }),
    ).toBe("secret-token");
  });
});
