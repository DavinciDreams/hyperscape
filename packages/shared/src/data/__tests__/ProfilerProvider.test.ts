/**
 * Tests for the ProfilerProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { profilerProvider } from "../ProfilerProvider";

beforeEach(() => {
  profilerProvider.unload();
});
afterEach(() => {
  profilerProvider.unload();
});

describe("ProfilerProvider", () => {
  it("starts unloaded", () => {
    expect(profilerProvider.isLoaded()).toBe(false);
    expect(profilerProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline — all fields default", () => {
    const parsed = profilerProvider.loadRaw({});
    expect(parsed.enabled).toBe(false);
    expect(parsed.anchor).toBe("top-left");
    expect(parsed.refreshMs).toBe(250);
    expect(parsed.groups).toEqual([]);
  });

  it("loadRaw() accepts a valid group + metric", () => {
    const parsed = profilerProvider.loadRaw({
      enabled: true,
      groups: [
        {
          id: "render",
          title: "Render",
          metrics: [
            {
              id: "fps",
              label: "FPS",
              kind: "fps" as const,
              unit: "",
              source: "engine.fps",
            },
          ],
        },
      ],
    });
    expect(parsed.groups.length).toBe(1);
    expect(parsed.groups[0].metrics[0].id).toBe("fps");
  });

  it("loadRaw() rejects duplicate group ids", () => {
    expect(() =>
      profilerProvider.loadRaw({
        groups: [
          {
            id: "a",
            title: "A",
            metrics: [{ id: "m1", label: "M1", unit: "", source: "s" }],
          },
          {
            id: "a",
            title: "A2",
            metrics: [{ id: "m2", label: "M2", unit: "", source: "s" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects duplicate metric ids across groups", () => {
    expect(() =>
      profilerProvider.loadRaw({
        groups: [
          {
            id: "g1",
            title: "g1",
            metrics: [{ id: "dup", label: "a", unit: "", source: "s" }],
          },
          {
            id: "g2",
            title: "g2",
            metrics: [{ id: "dup", label: "b", unit: "", source: "s" }],
          },
        ],
      }),
    ).toThrow();
  });

  it("loadRaw() rejects refreshMs below 16", () => {
    expect(() => profilerProvider.loadRaw({ refreshMs: 15 })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = profilerProvider.loadRaw({});
    profilerProvider.unload();
    profilerProvider.load(parsed);
    expect(profilerProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    profilerProvider.loadRaw({});
    profilerProvider.hotReload(null);
    expect(profilerProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(profilerProvider).toBe(profilerProvider);
  });
});
