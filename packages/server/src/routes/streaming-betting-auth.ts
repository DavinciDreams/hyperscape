import { createHash, timingSafeEqual } from "node:crypto";

type BettingFeedTokenParams = {
  authorizationHeader?: string | string[];
  streamToken?: string | null;
  allowQueryToken?: boolean;
};

export type BettingFeedAccessTokenResolution = {
  token: string | null;
  source: "betting-feed" | "viewer-fallback" | null;
};

export function shouldSkipBettingFeedAuth(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.NODE_ENV !== "production" &&
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

  if (!params.allowQueryToken) {
    return null;
  }

  return params.streamToken?.trim() || null;
}

export function hasValidBettingFeedToken(
  requiredToken: string,
  providedToken: string | null | undefined,
): boolean {
  const expected = requiredToken.trim();
  const presented = providedToken?.trim() ?? "";
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

  const viewerToken = env.STREAMING_VIEWER_ACCESS_TOKEN?.trim() || null;
  if (viewerToken) {
    return {
      token: viewerToken,
      source: "viewer-fallback",
    };
  }

  return {
    token: null,
    source: null,
  };
}
