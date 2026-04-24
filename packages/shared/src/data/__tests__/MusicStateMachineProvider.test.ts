/**
 * Tests for the MusicStateMachineProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { musicStateMachineProvider } from "../MusicStateMachineProvider";

beforeEach(() => {
  musicStateMachineProvider.unload();
});
afterEach(() => {
  musicStateMachineProvider.unload();
});

const validManifest = [
  {
    id: "overworld",
    name: "Overworld FSM",
    initial: "explore",
    states: [
      {
        id: "explore",
        name: "Exploration",
        musicId: "music.overworld.loop",
        transitions: [
          { to: "combat", when: "inCombat", priority: 10, fadeSec: 1 },
        ],
      },
      {
        id: "combat",
        name: "Combat",
        musicId: "music.combat.loop",
        transitions: [
          { to: "explore", when: "combatEnded", priority: 5, fadeSec: 2 },
        ],
      },
    ],
  },
];

describe("MusicStateMachineProvider", () => {
  it("starts unloaded", () => {
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
    expect(musicStateMachineProvider.getManifest()).toBeNull();
    expect(musicStateMachineProvider.getMachines()).toEqual([]);
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = musicStateMachineProvider.loadRaw(validManifest);
    expect(parsed.length).toBe(1);
    expect(parsed[0].states[0].volume).toBe(1);
    expect(parsed[0].states[0].loop).toBe(true);
    expect(parsed[0].states[0].transitions[0].curve).toBe("equal-power");
    expect(parsed[0].states[0].transitions[0].quantizeToBar).toBe(false);
    expect(musicStateMachineProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts an empty array", () => {
    const parsed = musicStateMachineProvider.loadRaw([]);
    expect(parsed).toEqual([]);
    expect(musicStateMachineProvider.isLoaded()).toBe(true);
    expect(musicStateMachineProvider.getMachines()).toEqual([]);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = musicStateMachineProvider.loadRaw(validManifest);
    musicStateMachineProvider.unload();
    musicStateMachineProvider.load(parsed);
    expect(musicStateMachineProvider.isLoaded()).toBe(true);
    expect(musicStateMachineProvider.getMachines().length).toBe(1);
  });

  it("loadRaw() rejects duplicate state-machine ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        initial: "s",
        states: [{ id: "s", name: "S" }],
      },
      {
        id: "dup",
        name: "B",
        initial: "s",
        states: [{ id: "s", name: "S" }],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate state ids within a machine", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "s",
        states: [
          { id: "s", name: "S" },
          { id: "s", name: "S2" },
        ],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects initial referencing a missing state", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "ghost",
        states: [{ id: "s", name: "S" }],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects transitions to unknown states", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "s",
        states: [
          {
            id: "s",
            name: "S",
            transitions: [{ to: "ghost", when: "x", priority: 1 }],
          },
        ],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects default (empty-when) transitions with non-zero priority", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "s",
        states: [
          {
            id: "s",
            name: "S",
            transitions: [{ to: "s", when: "", priority: 5 }],
          },
        ],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate (when,to) transition pairs in a state", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "s",
        states: [
          {
            id: "s",
            name: "S",
            transitions: [
              { to: "s", when: "p", priority: 1 },
              { to: "s", when: "p", priority: 2 },
            ],
          },
        ],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects empty states array", () => {
    const bad = [{ id: "m", name: "M", initial: "s", states: [] }];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed state ids", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "Uppercase",
        states: [{ id: "Uppercase", name: "S" }],
      },
    ];
    expect(() => musicStateMachineProvider.loadRaw(bad)).toThrow();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    musicStateMachineProvider.loadRaw(validManifest);
    const replacement = musicStateMachineProvider.loadRaw([
      {
        id: "only",
        name: "Only",
        initial: "s",
        states: [{ id: "s", name: "S" }],
      },
    ]);
    musicStateMachineProvider.hotReload(replacement);
    expect(musicStateMachineProvider.getMachines().length).toBe(1);
    expect(musicStateMachineProvider.getMachines()[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    musicStateMachineProvider.loadRaw(validManifest);
    musicStateMachineProvider.hotReload(null);
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    musicStateMachineProvider.loadRaw(validManifest);
    musicStateMachineProvider.unload();
    expect(musicStateMachineProvider.isLoaded()).toBe(false);
    expect(musicStateMachineProvider.getMachines()).toEqual([]);
  });
});
