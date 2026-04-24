/**
 * Tests for the StatusEffectsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { statusEffectsProvider } from "../StatusEffectsProvider";

beforeEach(() => {
  statusEffectsProvider.unload();
});
afterEach(() => {
  statusEffectsProvider.unload();
});

const validManifest = [
  {
    id: "bleed",
    name: "Bleed",
    category: "harmful" as const,
    durationSec: 8,
    tickIntervalSec: 2,
    perTickDamage: 5,
    damageTypeId: "physical",
    stackRule: "stack-count" as const,
    maxStacks: 5,
  },
  {
    id: "rage",
    name: "Rage",
    category: "beneficial" as const,
    durationSec: 12,
    modifiers: [
      { stat: "strength" as const, op: "multiply" as const, value: 1.25 },
      { stat: "defense" as const, op: "multiply" as const, value: 0.85 },
    ],
  },
  {
    id: "mark-of-death",
    name: "Marked",
    category: "neutral" as const,
    durationSec: 30,
    tags: ["marked"],
  },
];

describe("StatusEffectsProvider", () => {
  it("starts unloaded", () => {
    expect(statusEffectsProvider.isLoaded()).toBe(false);
    expect(statusEffectsProvider.getEffects()).toEqual([]);
    expect(statusEffectsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest", () => {
    const parsed = statusEffectsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(3);
    expect(statusEffectsProvider.getEffects().length).toBe(3);
    expect(statusEffectsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty array", () => {
    expect(statusEffectsProvider.loadRaw([])).toEqual([]);
    expect(statusEffectsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate effect ids", () => {
    const bad = [
      { id: "bleed", name: "A", category: "harmful" as const, durationSec: 5 },
      { id: "bleed", name: "B", category: "harmful" as const, durationSec: 5 },
    ];
    expect(() => statusEffectsProvider.loadRaw(bad)).toThrow();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects tick damage without tick interval", () => {
    const bad = [
      {
        id: "bad-bleed",
        name: "Bad",
        category: "harmful" as const,
        durationSec: 5,
        tickIntervalSec: 0,
        perTickDamage: 10,
      },
    ];
    expect(() => statusEffectsProvider.loadRaw(bad)).toThrow();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects stack-count rule with maxStacks<2", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "harmful" as const,
        durationSec: 5,
        stackRule: "stack-count" as const,
        maxStacks: 1,
      },
    ];
    expect(() => statusEffectsProvider.loadRaw(bad)).toThrow();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects multiply modifier with value <= 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial" as const,
        durationSec: 5,
        modifiers: [
          { stat: "strength" as const, op: "multiply" as const, value: 0 },
        ],
      },
    ];
    expect(() => statusEffectsProvider.loadRaw(bad)).toThrow();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects invalid stat enum", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "beneficial" as const,
        durationSec: 5,
        modifiers: [{ stat: "luck", op: "add", value: 10 }],
      },
    ];
    expect(() => statusEffectsProvider.loadRaw(bad)).toThrow();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    statusEffectsProvider.loadRaw(validManifest);
    const replacement = statusEffectsProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        category: "beneficial" as const,
        durationSec: 1,
      },
    ]);
    statusEffectsProvider.hotReload(replacement);
    expect(statusEffectsProvider.getEffects().length).toBe(1);
  });

  it("hotReload(null) clears", () => {
    statusEffectsProvider.loadRaw(validManifest);
    statusEffectsProvider.hotReload(null);
    expect(statusEffectsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    statusEffectsProvider.loadRaw(validManifest);
    statusEffectsProvider.unload();
    expect(statusEffectsProvider.isLoaded()).toBe(false);
    expect(statusEffectsProvider.getManifest()).toBeNull();
  });
});
