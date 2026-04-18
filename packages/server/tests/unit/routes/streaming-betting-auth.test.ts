import { describe, expect, it } from "vitest";
import {
  extractBettingFeedToken,
  hasValidBettingFeedToken,
  resolveBettingFeedAccessToken,
  resolveOracleProofAccessToken,
  shouldSkipBettingFeedAuth,
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
    expect(extractBettingFeedToken({})).toBeNull();
  });

  it("prefers BETTING_FEED_ACCESS_TOKEN over the viewer token", () => {
    expect(
      resolveBettingFeedAccessToken({
        BETTING_FEED_ACCESS_TOKEN: "bet-secret",
        STREAMING_VIEWER_ACCESS_TOKEN: "viewer-secret",
      }),
    ).toEqual({
      token: "bet-secret",
      source: "betting-feed",
    });
  });

  it("does not fall back to STREAMING_VIEWER_ACCESS_TOKEN when needed", () => {
    expect(
      resolveBettingFeedAccessToken({
        BETTING_FEED_ACCESS_TOKEN: "",
        STREAMING_VIEWER_ACCESS_TOKEN: "viewer-secret",
      }),
    ).toEqual({
      token: null,
      source: null,
    });
  });

  it("reports missing auth when neither token is configured", () => {
    expect(resolveBettingFeedAccessToken({})).toEqual({
      token: null,
      source: null,
    });
  });

  it("allows skip-auth only in development", () => {
    expect(
      shouldSkipBettingFeedAuth({
        NODE_ENV: "development",
        BETTING_FEED_SKIP_AUTH: "true",
      }),
    ).toBe(true);
    expect(
      shouldSkipBettingFeedAuth({
        NODE_ENV: "staging",
        BETTING_FEED_SKIP_AUTH: "true",
      }),
    ).toBe(false);
  });

  it("prefers STREAMING_ORACLE_PROOF_TOKEN over the betting feed token for oracle proof retrieval", () => {
    expect(
      resolveOracleProofAccessToken({
        STREAMING_ORACLE_PROOF_TOKEN: "oracle-secret",
        BETTING_FEED_ACCESS_TOKEN: "bet-secret",
      }),
    ).toEqual({
      token: "oracle-secret",
      source: "oracle-proof",
    });
  });

  it("falls back to BETTING_FEED_ACCESS_TOKEN when the oracle-proof token is unset", () => {
    expect(
      resolveOracleProofAccessToken({
        BETTING_FEED_ACCESS_TOKEN: "bet-secret",
      }),
    ).toEqual({
      token: "bet-secret",
      source: "betting-feed",
    });
  });

  it("reports missing auth when neither oracle-proof nor betting feed token is configured", () => {
    expect(resolveOracleProofAccessToken({})).toEqual({
      token: null,
      source: null,
    });
  });
});
