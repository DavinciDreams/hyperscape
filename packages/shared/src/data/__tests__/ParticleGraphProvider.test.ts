/**
 * Tests for the ParticleGraphProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { particleGraphProvider } from "../ParticleGraphProvider";

beforeEach(() => {
  particleGraphProvider.unload();
});
afterEach(() => {
  particleGraphProvider.unload();
});

const validSystem = {
  id: "sparkle",
  name: "Sparkle",
  emitter: {
    rate: 10,
    maxParticles: 100,
  },
  initializers: [
    {
      kind: "velocity-cone",
      angleDeg: 30,
      speed: { min: 1, max: 2 },
    },
  ],
  renderer: {
    kind: "billboard",
    textureId: "sparkleTex",
  },
};

describe("ParticleGraphProvider", () => {
  it("starts unloaded", () => {
    expect(particleGraphProvider.isLoaded()).toBe(false);
    expect(particleGraphProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array as baseline", () => {
    const parsed = particleGraphProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(particleGraphProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid single-system manifest", () => {
    const parsed = particleGraphProvider.loadRaw([validSystem]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("sparkle");
  });

  it("loadRaw() rejects duplicate system ids", () => {
    expect(() =>
      particleGraphProvider.loadRaw([validSystem, { ...validSystem }]),
    ).toThrow();
  });

  it("loadRaw() rejects system with no velocity initializer", () => {
    expect(() =>
      particleGraphProvider.loadRaw([
        {
          ...validSystem,
          initializers: [{ kind: "initial-color", color: "#ffffff", alpha: 1 }],
        },
      ]),
    ).toThrow();
  });

  it("loadRaw() rejects emitter with rate=0 and burstCount=0", () => {
    expect(() =>
      particleGraphProvider.loadRaw([
        {
          ...validSystem,
          emitter: { rate: 0, burstCount: 0, maxParticles: 100 },
        },
      ]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = particleGraphProvider.loadRaw([validSystem]);
    particleGraphProvider.unload();
    particleGraphProvider.load(parsed);
    expect(particleGraphProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    particleGraphProvider.loadRaw([validSystem]);
    particleGraphProvider.hotReload(null);
    expect(particleGraphProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    particleGraphProvider.loadRaw([validSystem]);
    particleGraphProvider.unload();
    expect(particleGraphProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    const a = particleGraphProvider;
    const b = particleGraphProvider;
    expect(a).toBe(b);
  });
});
