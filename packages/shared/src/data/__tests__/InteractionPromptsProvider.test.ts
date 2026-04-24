/**
 * Tests for the InteractionPromptsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { interactionPromptsProvider } from "../InteractionPromptsProvider";

beforeEach(() => {
  interactionPromptsProvider.unload();
});
afterEach(() => {
  interactionPromptsProvider.unload();
});

const validManifest = [
  {
    id: "chest.open",
    interactionKind: "openChest",
    actionId: "interact",
    labelKey: "prompt.chest.open",
  },
  {
    id: "chest.loot",
    interactionKind: "lootChest",
    actionId: "interact",
    mode: "hold" as const,
    durationSec: 1.5,
    labelKey: "prompt.chest.loot",
    priority: 1,
  },
  {
    id: "chest.lootFast",
    interactionKind: "lootChest",
    actionId: "interact",
    mode: "rapid-tap" as const,
    durationSec: 0.5,
    labelKey: "prompt.chest.lootFast",
    priority: 2,
  },
];

describe("InteractionPromptsProvider", () => {
  it("starts unloaded", () => {
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
    expect(interactionPromptsProvider.getManifest()).toBeNull();
    expect(interactionPromptsProvider.getPrompts()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = interactionPromptsProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(3);
    expect(parsed[0].mode).toBe("tap");
    expect(parsed[0].durationSec).toBe(0);
    expect(parsed[0].style).toBe("default");
    expect(parsed[0].anchor).toBe("screen-center");
    expect(parsed[0].autoHideDistanceMeters).toBe(3);
    expect(parsed[0].fadeInSec).toBeCloseTo(0.15);
    expect(parsed[0].fadeOutSec).toBeCloseTo(0.2);
    expect(interactionPromptsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = interactionPromptsProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(interactionPromptsProvider.isLoaded()).toBe(true);
    expect(interactionPromptsProvider.getPrompts()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = interactionPromptsProvider.loadRaw(validManifest);
    interactionPromptsProvider.unload();
    interactionPromptsProvider.load(parsed);
    expect(interactionPromptsProvider.isLoaded()).toBe(true);
    expect(interactionPromptsProvider.getPrompts().length).toBe(3);
  });

  it("loadRaw() rejects duplicate prompt ids", () => {
    const bad = [
      {
        id: "dup",
        interactionKind: "openChest",
        actionId: "interact",
        labelKey: "prompt.a",
      },
      {
        id: "dup",
        interactionKind: "lootChest",
        actionId: "interact",
        labelKey: "prompt.b",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate priorities within the same interactionKind", () => {
    const bad = [
      {
        id: "a",
        interactionKind: "lootChest",
        actionId: "interact",
        labelKey: "prompt.a",
        priority: 1,
      },
      {
        id: "b",
        interactionKind: "lootChest",
        actionId: "interact",
        labelKey: "prompt.b",
        priority: 1,
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects hold mode without positive durationSec", () => {
    const bad = [
      {
        id: "x",
        interactionKind: "lootChest",
        actionId: "interact",
        mode: "hold",
        durationSec: 0,
        labelKey: "prompt.x",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects rapid-tap mode without positive durationSec", () => {
    const bad = [
      {
        id: "x",
        interactionKind: "lootChest",
        actionId: "interact",
        mode: "rapid-tap",
        durationSec: 0,
        labelKey: "prompt.x",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects tap mode with non-zero durationSec", () => {
    const bad = [
      {
        id: "x",
        interactionKind: "openChest",
        actionId: "interact",
        mode: "tap",
        durationSec: 1,
        labelKey: "prompt.x",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects toggle mode with non-zero durationSec", () => {
    const bad = [
      {
        id: "x",
        interactionKind: "openChest",
        actionId: "interact",
        mode: "toggle",
        durationSec: 1,
        labelKey: "prompt.x",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed prompt id", () => {
    const bad = [
      {
        id: "Not-CamelCase",
        interactionKind: "openChest",
        actionId: "interact",
        labelKey: "prompt.x",
      },
    ];
    expect(() => interactionPromptsProvider.loadRaw(bad)).toThrow();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() allows same priority across DIFFERENT interactionKinds", () => {
    const ok = [
      {
        id: "a",
        interactionKind: "openChest",
        actionId: "interact",
        labelKey: "prompt.a",
        priority: 5,
      },
      {
        id: "b",
        interactionKind: "lootChest",
        actionId: "interact",
        labelKey: "prompt.b",
        priority: 5,
      },
    ];
    const parsed = interactionPromptsProvider.loadRaw(ok);
    expect(parsed.length).toBe(2);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    interactionPromptsProvider.loadRaw(validManifest);
    const replacement = interactionPromptsProvider.loadRaw([
      {
        id: "only",
        interactionKind: "openChest",
        actionId: "interact",
        labelKey: "prompt.only",
      },
    ]);
    interactionPromptsProvider.hotReload(replacement);
    expect(interactionPromptsProvider.getPrompts().length).toBe(1);
    expect(interactionPromptsProvider.getPrompts()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    interactionPromptsProvider.loadRaw(validManifest);
    interactionPromptsProvider.hotReload(null);
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    interactionPromptsProvider.loadRaw(validManifest);
    interactionPromptsProvider.unload();
    expect(interactionPromptsProvider.isLoaded()).toBe(false);
    expect(interactionPromptsProvider.getPrompts()).toEqual([]);
  });
});
