import * as dnsPromises from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probePlaybackUrl } from "../../../src/streaming/destination-probe.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe("probePlaybackUrl", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
  });

  it("rejects unsupported playback protocols before fetching", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await probePlaybackUrl("file:///tmp/stream.m3u8");

    expect(result.ready).toBe(false);
    expect(result.lastError).toBe("unsupported_playback_protocol");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks private hosts in production by default", async () => {
    process.env.NODE_ENV = "production";
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await probePlaybackUrl("http://127.0.0.1/live.m3u8");

    expect(result.ready).toBe(false);
    expect(result.lastError).toBe("private_playback_host_blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks public hostnames that resolve to private addresses in production", async () => {
    process.env.NODE_ENV = "production";
    const lookupSpy = vi
      .spyOn(dnsPromises, "lookup")
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await probePlaybackUrl("https://example.com/live.m3u8");

    expect(result.ready).toBe(false);
    expect(result.lastError).toBe("private_playback_host_blocked");
    expect(lookupSpy).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows private hosts when explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.STREAM_ALLOW_PRIVATE_PLAYBACK_PROBES = "true";
    vi.spyOn(dnsPromises, "lookup").mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ]);
    const response = new Response("#EXTM3U", { status: 200 });
    const fetchSpy = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await probePlaybackUrl("http://127.0.0.1/live.m3u8");

    expect(result.ready).toBe(true);
    expect(result.manifestStatus).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("probes with redirect following disabled", async () => {
    const response = new Response("", {
      status: 302,
      headers: { location: "https://elsewhere.example/live.m3u8" },
    });
    const fetchSpy = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await probePlaybackUrl("https://stream.example/live.m3u8");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        redirect: "manual",
      }),
    );
  });
});
