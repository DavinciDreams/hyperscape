/**
 * Faithfulness + defensiveness tests for `WorldEventsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  WorldEventsManifestSchema,
  type WorldEventsManifest,
} from "./world-events.js";

const reference: WorldEventsManifest = [
  {
    id: "orcInvasion",
    name: "Orc Invasion",
    description: "Orcs are attacking the Lumbridge farms!",
    iconId: "icon.orcInvasion",
    category: "invasion",
    markerColor: "#cc0000",
    trigger: {
      kind: "schedule",
      intervalMinutes: 120,
      jitterMinutes: 20,
    },
    minPlayers: 5,
    maxPlayers: 40,
    minLevel: 10,
    maxLevel: 50,
    zoneId: "lumbridgeFarms",
    phases: [
      {
        id: "waveOne",
        name: "Wave 1",
        description: "Kill the scouts.",
        objectiveText: "Defeat 10 orc scouts",
        durationSec: 300,
        nextOnSuccess: "waveTwo",
        nextOnFailure: "",
        spawnNpcIds: ["orcScout"],
        cinematicId: "",
      },
      {
        id: "waveTwo",
        name: "Wave 2",
        description: "Defeat the warband.",
        objectiveText: "Defeat the orc warband",
        durationSec: 600,
        nextOnSuccess: "bossFight",
        nextOnFailure: "",
        spawnNpcIds: ["orcWarrior", "orcArcher"],
        cinematicId: "",
      },
      {
        id: "bossFight",
        name: "Boss",
        description: "Slay Gruul the Warboss.",
        objectiveText: "Defeat Gruul",
        durationSec: 900,
        nextOnSuccess: "",
        nextOnFailure: "",
        spawnNpcIds: ["gruulWarboss"],
        cinematicId: "cin.gruulArrives",
      },
    ],
    startPhaseId: "waveOne",
    participationTiers: [
      {
        id: "bronze",
        name: "Bronze",
        minContribution: 0.05,
        lootTableId: "orcInvasionBronze",
        xpReward: 500,
      },
      {
        id: "silver",
        name: "Silver",
        minContribution: 0.2,
        lootTableId: "orcInvasionSilver",
        xpReward: 1500,
      },
      {
        id: "gold",
        name: "Gold",
        minContribution: 0.5,
        lootTableId: "orcInvasionGold",
        xpReward: 5000,
      },
    ],
    rewardLockoutHours: 24,
    crossServer: false,
    broadcastToWorld: true,
  },
  {
    id: "dragonEmerges",
    name: "The Dragon Emerges",
    description: "A world boss awakens after the invasion.",
    iconId: "icon.dragon",
    category: "boss",
    markerColor: "#aa00aa",
    trigger: {
      kind: "chain",
      sourceEventId: "orcInvasion",
      delaySec: 600,
    },
    minPlayers: 20,
    maxPlayers: 100,
    minLevel: 40,
    maxLevel: 100,
    zoneId: "dragonsLair",
    phases: [
      {
        id: "engage",
        name: "Engage",
        description: "Fight the dragon.",
        objectiveText: "Defeat the dragon",
        durationSec: 1800,
        nextOnSuccess: "",
        nextOnFailure: "",
        spawnNpcIds: ["ancientDragon"],
        cinematicId: "cin.dragonRoar",
      },
    ],
    startPhaseId: "engage",
    participationTiers: [
      {
        id: "participant",
        name: "Participant",
        minContribution: 0.01,
        lootTableId: "dragonBossLoot",
        xpReward: 10_000,
      },
    ],
    rewardLockoutHours: 168,
    crossServer: true,
    broadcastToWorld: true,
  },
  {
    id: "mushroomHunt",
    name: "Mushroom Hunt",
    description: "Seasonal gather event.",
    iconId: "icon.mushroom",
    category: "gather",
    markerColor: "",
    trigger: {
      kind: "random",
      chancePerRoll: 0.05,
      rollIntervalSec: 60,
    },
    minPlayers: 1,
    maxPlayers: 20,
    minLevel: 1,
    maxLevel: 100,
    zoneId: "mistyGlade",
    phases: [
      {
        id: "gather",
        name: "Gather",
        description: "Collect mushrooms.",
        objectiveText: "Collect 50 rare mushrooms",
        durationSec: 900,
        nextOnSuccess: "",
        nextOnFailure: "",
        spawnNpcIds: [],
        cinematicId: "",
      },
    ],
    startPhaseId: "gather",
    participationTiers: [
      {
        id: "contributor",
        name: "Contributor",
        minContribution: 0.1,
        lootTableId: "mushroomHuntLoot",
        xpReward: 200,
      },
    ],
    rewardLockoutHours: 6,
    crossServer: false,
    broadcastToWorld: false,
  },
];

describe("WorldEventsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = WorldEventsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal entry", () => {
    const parsed = WorldEventsManifestSchema.parse([
      {
        id: "simple",
        name: "Simple",
        category: "puzzle",
        trigger: { kind: "manual" },
        zoneId: "townSquare",
        phases: [
          {
            id: "only",
            name: "Only",
          },
        ],
        startPhaseId: "only",
        participationTiers: [
          {
            id: "t",
            name: "T",
            minContribution: 0,
            lootTableId: "lt",
          },
        ],
      },
    ]);
    expect(parsed[0].minPlayers).toBe(1);
    expect(parsed[0].maxPlayers).toBe(40);
    expect(parsed[0].minLevel).toBe(1);
    expect(parsed[0].maxLevel).toBe(100);
    expect(parsed[0].rewardLockoutHours).toBe(0);
    expect(parsed[0].crossServer).toBe(false);
    expect(parsed[0].broadcastToWorld).toBe(false);
    expect(parsed[0].markerColor).toBe("");
    expect(parsed[0].phases[0].durationSec).toBe(0);
    expect(parsed[0].phases[0].nextOnSuccess).toBe("");
  });

  it("accepts empty manifest", () => {
    expect(WorldEventsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate event ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
      {
        id: "dup",
        name: "B",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty phases array", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty participationTiers array", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minPlayers > maxPlayers", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        minPlayers: 50,
        maxPlayers: 10,
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects minLevel > maxLevel", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        minLevel: 60,
        maxLevel: 40,
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate phase ids within an event", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [
          { id: "p", name: "P1" },
          { id: "p", name: "P2" },
        ],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects startPhaseId that does not resolve", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "ghost",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects phase nextOnSuccess that does not resolve", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P", nextOnSuccess: "ghost" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts phase with empty nextOnSuccess (event-end)", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P", nextOnSuccess: "", nextOnFailure: "" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects duplicate participation tier ids", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T1", minContribution: 0, lootTableId: "lt" },
          { id: "t", name: "T2", minContribution: 0.5, lootTableId: "lt2" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects participation tiers with duplicate minContribution", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "a", name: "A", minContribution: 0.1, lootTableId: "lt" },
          { id: "b", name: "B", minContribution: 0.1, lootTableId: "lt2" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects chain trigger referencing unknown event", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: {
          kind: "chain",
          sourceEventId: "ghost",
          delaySec: 0,
        },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects schedule trigger with intervalMinutes = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "schedule", intervalMinutes: 0 },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects random trigger with chancePerRoll > 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "random", chancePerRoll: 1.5, rollIntervalSec: 60 },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown trigger kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "telepathic" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "mystery",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects malformed markerColor (non-hex)", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        markerColor: "red",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid event id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rewardLockoutHours > 720", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
        rewardLockoutHours: 1000,
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects proximity trigger minPlayers = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "boss",
        trigger: {
          kind: "proximity",
          volumeTag: "squareCenter",
          minPlayers: 0,
        },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts chain trigger referencing another event in same manifest", () => {
    const ok = [
      {
        id: "first",
        name: "First",
        category: "boss",
        trigger: { kind: "manual" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
      {
        id: "second",
        name: "Second",
        category: "boss",
        trigger: { kind: "chain", sourceEventId: "first" },
        zoneId: "z",
        phases: [{ id: "p", name: "P" }],
        startPhaseId: "p",
        participationTiers: [
          { id: "t", name: "T", minContribution: 0, lootTableId: "lt" },
        ],
      },
    ];
    expect(WorldEventsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
