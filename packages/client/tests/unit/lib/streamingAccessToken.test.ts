import { describe, expect, it } from "vitest";
import { resolveStreamingAccessTokenFromHref } from "../../../src/lib/streamingAccessToken";

describe("streamingAccessToken", () => {
  it("prefers the hash token and scrubs it from both hash and query", () => {
    const resolved = resolveStreamingAccessTokenFromHref(
      "https://example.com/stream?page=1&streamToken=query-token#streamToken=hash-token&mode=stream",
    );

    expect(resolved.token).toBe("hash-token");
    expect(resolved.nextUrl).toBe("/stream?page=1#mode=stream");
  });

  it("scrubs a query-only token while preserving the rest of the URL", () => {
    const resolved = resolveStreamingAccessTokenFromHref(
      "https://example.com/stream?streamToken=query-token&foo=bar",
    );

    expect(resolved.token).toBe("query-token");
    expect(resolved.nextUrl).toBe("/stream?foo=bar");
  });

  it("does nothing when no token is present", () => {
    const resolved = resolveStreamingAccessTokenFromHref(
      "https://example.com/stream?foo=bar#mode=stream",
    );

    expect(resolved.token).toBeNull();
    expect(resolved.nextUrl).toBeNull();
  });
});
