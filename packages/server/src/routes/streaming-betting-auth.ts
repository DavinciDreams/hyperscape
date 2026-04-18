import { createHash, timingSafeEqual } from "node:crypto";

type BettingFeedTokenParams = {
  authorizationHeader?: string | string[];
};

export type BettingFeedAccessTokenResolution = {
  token: string | null;
  source: "betting-feed" | null;
};

export type OracleProofAccessTokenResolution = {
  token: string | null;
  source: "oracle-proof" | "betting-feed" | null;
};

export function shouldSkipBettingFeedAuth(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.NODE_ENV === "development" &&
    (env.BETTING_FEED_SKIP_AUTH || "").trim().toLowerCase() === "true"
  );
}

function digestToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function extractBettingFeedToken(
  params: BettingFeedTokenParams,
): string | null {
  const authHeader = Array.isArray(params.authorizationHeader)
    ? params.authorizationHeader[0]
    : params.authorizationHeader;
  const headerToken =
    authHeader && /^Bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^Bearer\s+/i, "").trim()
      : null;
  if (headerToken) {
    return headerToken;
  }
  return null;
}

export function hasValidBettingFeedToken(
  requiredToken: string,
  providedToken: string | null | undefined,
): boolean {
  const expected = requiredToken.trim();
  const presented = providedToken?.trim() ?? "";
  // Early return for missing/empty tokens is intentional: whether a token was
  // provided is already observable from the request headers and is not a secret.
  // Timing-safe comparison only matters when comparing two non-empty values.
  if (!expected || !presented) {
    return false;
  }

  return timingSafeEqual(digestToken(expected), digestToken(presented));
}

export function resolveBettingFeedAccessToken(
  env: Record<string, string | undefined>,
): BettingFeedAccessTokenResolution {
  const bettingFeedToken = env.BETTING_FEED_ACCESS_TOKEN?.trim() || null;
  if (bettingFeedToken) {
    return {
      token: bettingFeedToken,
      source: "betting-feed",
    };
  }

  return {
    token: null,
    source: null,
  };
}

// Oracle-proof retrieval (`/api/streaming/results/:duelId`) exposes
// `duelKeyHex` + `seed` + `replayHash` — the material needed to submit a
// Solana resolution. This secret must be scopable narrower than the general
// betting feed token. STREAMING_ORACLE_PROOF_TOKEN is the dedicated secret;
// if it is unset we fall back to BETTING_FEED_ACCESS_TOKEN so existing
// deployments keep working during rollout.
export function resolveOracleProofAccessToken(
  env: Record<string, string | undefined>,
): OracleProofAccessTokenResolution {
  const oracleToken = env.STREAMING_ORACLE_PROOF_TOKEN?.trim() || null;
  if (oracleToken) {
    return { token: oracleToken, source: "oracle-proof" };
  }
  const bettingFeedToken = env.BETTING_FEED_ACCESS_TOKEN?.trim() || null;
  if (bettingFeedToken) {
    return { token: bettingFeedToken, source: "betting-feed" };
  }
  return { token: null, source: null };
}
