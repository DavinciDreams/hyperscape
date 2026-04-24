/**
 * Faithfulness + defensiveness tests for `MusicStateMachineManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  MusicStateMachineManifestSchema,
  type MusicStateMachineManifest,
} from "./music-state-machine.js";

const reference: MusicStateMachineManifest = [
  {
    id: "overworld-combat",
    name: "Overworld / Combat",
    description: "Default overworld loop with combat stinger.",
    initial: "explore",
    states: [
      {
        id: "explore",
        name: "Exploring",
        description: "Ambient overworld bed",
        musicId: "music_overworld_calm",
        volume: 0.7,
        loop: true,
        transitions: [
          {
            to: "combat",
            when: "inCombat",
            priority: 10,
            fadeSec: 0.5,
            curve: "equal-power",
            quantizeToBar: false,
            stingerId: "stinger_combat_start",
          },
        ],
      },
      {
        id: "combat",
        name: "Combat",
        description: "High-energy combat loop",
        musicId: "music_combat_theme",
        volume: 1,
        loop: true,
        transitions: [
          {
            to: "victory",
            when: "combatVictory",
            priority: 5,
            fadeSec: 1,
            curve: "ease-out",
            quantizeToBar: true,
            stingerId: "stinger_victory",
          },
          {
            to: "explore",
            when: "combatOver",
            priority: 0,
            fadeSec: 3,
            curve: "equal-power",
            quantizeToBar: false,
            stingerId: "",
          },
        ],
      },
      {
        id: "victory",
        name: "Victory",
        description: "One-shot fanfare then return",
        musicId: "music_victory_fanfare",
        volume: 1,
        loop: false,
        transitions: [
          {
            to: "explore",
            when: "",
            priority: 0,
            fadeSec: 2,
            curve: "ease-in",
            quantizeToBar: false,
            stingerId: "",
          },
        ],
      },
    ],
  },
];

describe("MusicStateMachineManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = MusicStateMachineManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal state machine", () => {
    const parsed = MusicStateMachineManifestSchema.parse([
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [{ id: "a", name: "A" }],
      },
    ]);
    const s = parsed[0].states[0];
    expect(s.volume).toBe(1);
    expect(s.loop).toBe(true);
    expect(s.transitions).toEqual([]);
    expect(s.musicId).toBe("");
  });

  it("rejects non-camelCase state id", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "A",
        states: [{ id: "A", name: "A" }],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects initial pointing at unknown state", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "nope",
        states: [{ id: "a", name: "A" }],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects transition `to` pointing at unknown state", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          {
            id: "a",
            name: "A",
            transitions: [{ to: "ghost", when: "x" }],
          },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate state ids", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          { id: "a", name: "A" },
          { id: "a", name: "A2" },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate (when,to) transitions within a state", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          {
            id: "a",
            name: "A",
            transitions: [
              { to: "b", when: "x", priority: 5, fadeSec: 1 },
              { to: "b", when: "x", priority: 3, fadeSec: 2 },
            ],
          },
          { id: "b", name: "B" },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects default (empty when) transition with non-zero priority", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          {
            id: "a",
            name: "A",
            transitions: [{ to: "b", when: "", priority: 5 }],
          },
          { id: "b", name: "B" },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fadeSec out of range", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          {
            id: "a",
            name: "A",
            transitions: [{ to: "b", when: "x", fadeSec: 200 }],
          },
          { id: "b", name: "B" },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects volume > 1", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [{ id: "a", name: "A", volume: 2 }],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown fade curve", () => {
    const bad = [
      {
        id: "m",
        name: "M",
        initial: "a",
        states: [
          {
            id: "a",
            name: "A",
            transitions: [{ to: "b", when: "x", curve: "bouncy" }],
          },
          { id: "b", name: "B" },
        ],
      },
    ];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty states array", () => {
    const bad = [{ id: "m", name: "M", initial: "a", states: [] }];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate state-machine ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(MusicStateMachineManifestSchema.safeParse(bad).success).toBe(false);
  });
});
