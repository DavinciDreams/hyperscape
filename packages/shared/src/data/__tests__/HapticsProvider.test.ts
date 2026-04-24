/**
 * Tests for the HapticsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hapticsProvider } from "../HapticsProvider";

beforeEach(() => {
  hapticsProvider.unload();
});
afterEach(() => {
  hapticsProvider.unload();
});

const validManifest = [
  {
    id: "hitHeavy",
    name: "Heavy Hit",
    category: "combat" as const,
    stages: [
      {
        channel: "both" as const,
        durationMs: 80,
        startAmplitude: 1,
        endAmplitude: 0,
        envelope: "ease-out" as const,
      },
    ],
    priority: 80,
    cancellable: false,
  },
  {
    id: "ambientEngine",
    name: "Engine Rumble",
    category: "ambient" as const,
    stages: [
      {
        channel: "low-frequency" as const,
        durationMs: 500,
        startAmplitude: 0.2,
        endAmplitude: 0.2,
        envelope: "constant" as const,
      },
    ],
    loop: true,
    loopGapMs: 0,
    intensityScale: 0.6,
  },
];

describe("HapticsProvider", () => {
  it("starts unloaded with safe-empty default", () => {
    expect(hapticsProvider.isLoaded()).toBe(false);
    expect(hapticsProvider.getManifest()).toBeNull();
    expect(hapticsProvider.getPatterns()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = hapticsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(2);
    expect(parsed[0].loop).toBe(false);
    expect(parsed[0].intensityScale).toBe(1);
    expect(parsed[1].priority).toBe(10);
    expect(hapticsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty array", () => {
    const parsed = hapticsProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(hapticsProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = hapticsProvider.loadRaw(validManifest);
    hapticsProvider.unload();
    hapticsProvider.load(parsed);
    expect(hapticsProvider.isLoaded()).toBe(true);
    expect(hapticsProvider.getPatterns().length).toBe(2);
  });

  it("loadRaw() rejects duplicate pattern ids", () => {
    const bad = [validManifest[0], validManifest[0]];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects empty stages array", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "ui" as const,
        stages: [],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects constant envelope with mismatched amplitudes", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "ui" as const,
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 0.2,
            endAmplitude: 0.8,
            envelope: "constant" as const,
          },
        ],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects loopGapMs>0 when loop=false", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "ambient" as const,
        loop: false,
        loopGapMs: 100,
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant" as const,
          },
        ],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts loop=true with loopGapMs=0 (seamless)", () => {
    const parsed = hapticsProvider.loadRaw([
      {
        id: "p",
        name: "P",
        category: "ambient" as const,
        loop: true,
        loopGapMs: 0,
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant" as const,
          },
        ],
      },
    ]);
    expect(parsed[0].loop).toBe(true);
    expect(parsed[0].loopGapMs).toBe(0);
  });

  it("loadRaw() rejects amplitude > 1", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "ui" as const,
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 1.5,
            endAmplitude: 0,
            envelope: "linear" as const,
          },
        ],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed pattern id", () => {
    const bad = [
      {
        id: "Bad-Id",
        name: "P",
        category: "ui" as const,
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant" as const,
          },
        ],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid category enum", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "invalidCat",
        stages: [
          {
            channel: "both" as const,
            durationMs: 100,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant" as const,
          },
        ],
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts all six channel kinds", () => {
    const parsed = hapticsProvider.loadRaw([
      {
        id: "allChannels",
        name: "All",
        category: "custom" as const,
        stages: [
          {
            channel: "low-frequency" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
          {
            channel: "high-frequency" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
          {
            channel: "both" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
          {
            channel: "left-trigger" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
          {
            channel: "right-trigger" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
          {
            channel: "mobile-default" as const,
            durationMs: 10,
            startAmplitude: 0.1,
            endAmplitude: 0.1,
            envelope: "constant" as const,
          },
        ],
      },
    ]);
    expect(parsed[0].stages.length).toBe(6);
  });

  it("loadRaw() rejects stages.length > 32", () => {
    const tooMany = Array.from({ length: 33 }, () => ({
      channel: "both" as const,
      durationMs: 10,
      startAmplitude: 0.5,
      endAmplitude: 0.5,
      envelope: "constant" as const,
    }));
    const bad = [
      {
        id: "tooMany",
        name: "Too Many",
        category: "combat" as const,
        stages: tooMany,
      },
    ];
    expect(() => hapticsProvider.loadRaw(bad)).toThrow();
    expect(hapticsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    hapticsProvider.loadRaw(validManifest);
    const replacement = hapticsProvider.loadRaw([]);
    hapticsProvider.hotReload(replacement);
    expect(hapticsProvider.getPatterns().length).toBe(0);
  });

  it("hotReload(null) clears", () => {
    hapticsProvider.loadRaw(validManifest);
    hapticsProvider.hotReload(null);
    expect(hapticsProvider.isLoaded()).toBe(false);
    expect(hapticsProvider.getPatterns()).toEqual([]);
  });

  it("unload() resets", () => {
    hapticsProvider.loadRaw(validManifest);
    hapticsProvider.unload();
    expect(hapticsProvider.isLoaded()).toBe(false);
    expect(hapticsProvider.getManifest()).toBeNull();
  });
});
