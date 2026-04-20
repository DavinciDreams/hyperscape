import { describe, expect, it } from "vitest";
import {
  allocateNextStreamingSseClientId,
  buildStreamingResultNotFoundPayload,
  normalizeStreamingThoughtLimit,
} from "../../../src/routes/streaming.js";
import { normalizeGameAssetPath } from "../../../src/startup/http-server.js";

describe("streaming route helpers", () => {
  it("normalizes monologue limits with finite bounded fallbacks", () => {
    expect(normalizeStreamingThoughtLimit(undefined)).toBe(20);
    expect(normalizeStreamingThoughtLimit("abc")).toBe(20);
    expect(normalizeStreamingThoughtLimit("-5")).toBe(1);
    expect(normalizeStreamingThoughtLimit("0")).toBe(1);
    expect(normalizeStreamingThoughtLimit("55")).toBe(50);
    expect(normalizeStreamingThoughtLimit("12")).toBe(12);
  });

  it("allocates SSE client ids with wraparound and collision skipping", () => {
    const clients = new Map<number, unknown>([
      [Number.MAX_SAFE_INTEGER, {}],
      [1, {}],
      [2, {}],
    ]);

    const wrapped = allocateNextStreamingSseClientId(
      Number.MAX_SAFE_INTEGER,
      clients,
    );
    expect(wrapped).toEqual({
      clientId: 3,
      nextClientId: 4,
    });
  });

  it("builds a generic results lookup 404 payload", () => {
    expect(buildStreamingResultNotFoundPayload()).toEqual({
      error: "Not found",
      message: "Resolved duel not found",
    });
  });

  it("rejects game asset paths containing a null byte", () => {
    expect(normalizeGameAssetPath("/assets/world.glb")).toBe(
      "assets/world.glb",
    );
    expect(normalizeGameAssetPath("/assets/%00world.glb")).toBeNull();
  });
});
