import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStreamingAccessToken,
  primeStreamingAccessTokenFromWindow,
  resetStreamingAccessTokenForTests,
  resolveStreamingAccessTokenFromHref,
} from "../../../src/lib/streamingAccessToken";

afterEach(() => {
  resetStreamingAccessTokenForTests();
});

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

  it("scrubs sessionToken from the URL without treating it as a streaming token", () => {
    const resolved = resolveStreamingAccessTokenFromHref(
      "https://example.com/stream?sessionToken=session-secret&foo=bar#mode=stream",
    );

    expect(resolved.token).toBeNull();
    expect(resolved.nextUrl).toBe("/stream?foo=bar#mode=stream");
  });

  it("does nothing when no token is present", () => {
    const resolved = resolveStreamingAccessTokenFromHref(
      "https://example.com/stream?foo=bar#mode=stream",
    );

    expect(resolved.token).toBeNull();
    expect(resolved.nextUrl).toBeNull();
  });

  it("falls back to the runtime viewer token when the URL is not tokenized", () => {
    const replaceState = vi.fn();
    const fakeWindow = {
      env: {
        PUBLIC_STREAMING_VIEWER_ACCESS_TOKEN: "viewer-token",
      },
      location: {
        href: "https://example.com/stream?foo=bar#mode=stream",
      },
      history: {
        state: { page: "stream" },
        replaceState,
      },
    } as unknown as Window;

    expect(primeStreamingAccessTokenFromWindow(fakeWindow)).toBe(
      "viewer-token",
    );
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("primes from window state, scrubs the URL, and caches the token", () => {
    const replaceState = vi.fn();
    const fakeWindow = {
      location: {
        href: "https://example.com/stream?foo=bar&streamToken=query-token#mode=stream",
      },
      history: {
        state: { page: "stream" },
        replaceState,
      },
    } as unknown as Window;

    expect(primeStreamingAccessTokenFromWindow(fakeWindow)).toBe("query-token");
    expect(replaceState).toHaveBeenCalledWith(
      fakeWindow.history.state,
      "",
      "/stream?foo=bar#mode=stream",
    );
    expect(primeStreamingAccessTokenFromWindow(fakeWindow)).toBe("query-token");
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("reads the cached token without rereading window state", () => {
    const replaceState = vi.fn();
    const fakeWindow = {
      location: {
        href: "https://example.com/stream#streamToken=hash-token",
      },
      history: {
        state: null,
        replaceState,
      },
    } as unknown as Window;

    primeStreamingAccessTokenFromWindow(fakeWindow);
    const originalWindow = globalThis.window;
    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          location: {
            href: "https://example.com/stream",
          },
          history: {
            state: null,
            replaceState: vi.fn(),
          },
        },
      });

      expect(getStreamingAccessToken()).toBe("hash-token");
      expect(replaceState).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("resets the cached token for later calls", () => {
    const fakeWindow = {
      location: {
        href: "https://example.com/stream#streamToken=hash-token",
      },
      history: {
        state: null,
        replaceState: vi.fn(),
      },
    } as unknown as Window;

    expect(primeStreamingAccessTokenFromWindow(fakeWindow)).toBe("hash-token");
    resetStreamingAccessTokenForTests();

    const freshWindow = {
      location: {
        href: "https://example.com/stream#streamToken=fresh-token",
      },
      history: {
        state: null,
        replaceState: vi.fn(),
      },
    } as unknown as Window;

    expect(primeStreamingAccessTokenFromWindow(freshWindow)).toBe(
      "fresh-token",
    );
  });
});
