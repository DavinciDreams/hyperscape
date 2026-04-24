/**
 * Faithfulness + defensiveness tests for `FastTravelManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  FastTravelManifestSchema,
  type FastTravelManifest,
} from "./fast-travel.js";

const reference: FastTravelManifest = {
  global: {
    enabled: true,
    blockedInCombat: true,
    blockedWhilePvPFlagged: false,
    blockedInInstancedContent: true,
    globalCooldownSec: 5,
    channelTimeSec: 10,
    cancelChannelOnDamage: true,
    maxHearthBindings: 1,
    allowDestinationSummon: false,
  },
  nodes: [
    {
      id: "stormwindFM",
      name: "Stormwind Flight Master",
      description: "",
      iconId: "",
      kind: "flightMaster",
      customKey: "",
      zoneId: "stormwindCity",
      position: { x: 100, y: 10, z: 0 },
      continentTag: "easternKingdoms",
      unlock: {
        requiresVisit: true,
        requiresQuestId: "",
        requiresAchievementId: "",
        minCharacterLevel: 5,
        requiresReputation: { factionId: "", minStanding: 0 },
      },
      neutralToAllFactions: false,
      factionAllowList: ["alliance"],
      perUseCooldownSec: 0,
      useCostCurrency: 50,
      useCostCurrencyId: "gold",
      shareDiscoveryWithParty: false,
      discoveryXpReward: 100,
    },
    {
      id: "ironforgeFM",
      name: "Ironforge Flight Master",
      description: "",
      iconId: "",
      kind: "flightMaster",
      customKey: "",
      zoneId: "ironforge",
      position: { x: 500, y: 200, z: -100 },
      continentTag: "easternKingdoms",
      unlock: {
        requiresVisit: true,
        requiresQuestId: "",
        requiresAchievementId: "",
        minCharacterLevel: 0,
        requiresReputation: { factionId: "", minStanding: 0 },
      },
      neutralToAllFactions: false,
      factionAllowList: ["alliance"],
      perUseCooldownSec: 0,
      useCostCurrency: 80,
      useCostCurrencyId: "gold",
      shareDiscoveryWithParty: false,
      discoveryXpReward: 100,
    },
  ],
  edges: [
    {
      id: "swToIf",
      fromNodeId: "stormwindFM",
      toNodeId: "ironforgeFM",
      kind: "flightAnimated",
      direction: "bidirectional",
      travelTimeSec: 180,
      travelCostCurrency: 0,
      pathAssetRef: "pathSwIfScenic",
      factionAllowList: ["alliance"],
      requiresWorldStateFlag: "",
    },
  ],
};

describe("FastTravelManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = FastTravelManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty manifest", () => {
    const parsed = FastTravelManifestSchema.parse({});
    expect(parsed.global.enabled).toBe(true);
    expect(parsed.global.blockedInCombat).toBe(true);
    expect(parsed.global.globalCooldownSec).toBe(5);
    expect(parsed.global.channelTimeSec).toBe(10);
    expect(parsed.global.maxHearthBindings).toBe(1);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it("rejects duplicate node ids", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "n",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate edge ids", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "instantTeleport" },
        { id: "e", fromNodeId: "b", toNodeId: "a", kind: "instantTeleport" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects edge with unknown node ids", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "e",
          fromNodeId: "a",
          toNodeId: "ghost",
          kind: "instantTeleport",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects self-loop edge", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "a", kind: "instantTeleport" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate (fromNode, toNode, direction) edges", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "instantTeleport",
          direction: "bidirectional",
        },
        {
          id: "e2",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "flightAnimated",
          direction: "bidirectional",
          pathAssetRef: "path",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts same (fromNode, toNode) with different directions", () => {
    const ok = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "wormhole",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "wormhole",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "e1",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "instantTeleport",
          direction: "oneWayForward",
        },
        {
          id: "e2",
          fromNodeId: "b",
          toNodeId: "a",
          kind: "instantTeleport",
          direction: "oneWayForward",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown node kind", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "dragonback",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts all 7 node kinds", () => {
    const kinds = [
      "flightMaster",
      "portalStone",
      "hearthBindPoint",
      "wormhole",
      "teleportAnchor",
      "mountBoard",
      "custom",
    ];
    for (const kind of kinds) {
      const ok = {
        nodes: [
          {
            id: "n",
            name: "N",
            kind,
            zoneId: "z",
            position: { x: 0, y: 0, z: 0 },
            ...(kind === "custom" ? { customKey: "airship" } : {}),
          },
        ],
      };
      expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects custom node kind without customKey", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "custom",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown edge kind", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "rollercoaster" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects flightAnimated edge without pathAssetRef", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "flightAnimated" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects vehicleControlled edge without pathAssetRef", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "mountBoard",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "mountBoard",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "vehicleControlled" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts instantTeleport edge without pathAssetRef", () => {
    const ok = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "instantTeleport" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts loadingScreen edge without pathAssetRef", () => {
    const ok = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        { id: "e", fromNodeId: "a", toNodeId: "b", kind: "loadingScreen" },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts all 2 edge directions", () => {
    const directions = ["bidirectional", "oneWayForward"];
    for (const direction of directions) {
      const ok = {
        nodes: [
          {
            id: "a",
            name: "A",
            kind: "wormhole",
            zoneId: "z",
            position: { x: 0, y: 0, z: 0 },
          },
          {
            id: "b",
            name: "B",
            kind: "wormhole",
            zoneId: "z",
            position: { x: 1, y: 0, z: 0 },
          },
        ],
        edges: [
          {
            id: "e",
            fromNodeId: "a",
            toNodeId: "b",
            kind: "instantTeleport",
            direction,
          },
        ],
      };
      expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects bad node id format", () => {
    const bad = {
      nodes: [
        {
          id: "Has Spaces",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad edge id format", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "Has Spaces",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "instantTeleport",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects travelTimeSec > 600", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "e",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "instantTeleport",
          travelTimeSec: 9999,
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects globalCooldownSec > 3600", () => {
    const bad = { global: { globalCooldownSec: 9999 } };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects channelTimeSec=0 with cancelChannelOnDamage=true", () => {
    const bad = { global: { channelTimeSec: 0, cancelChannelOnDamage: true } };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts channelTimeSec=0 with cancelChannelOnDamage=false", () => {
    const ok = { global: { channelTimeSec: 0, cancelChannelOnDamage: false } };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts maxHearthBindings=0 (no hearthstone binding)", () => {
    const ok = { global: { maxHearthBindings: 0 } };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects maxHearthBindings > 10", () => {
    const bad = { global: { maxHearthBindings: 999 } };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects perUseCooldownSec > 86400 (1 day)", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "hearthBindPoint",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          perUseCooldownSec: 999999,
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects bad zoneId format", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "flightMaster",
          zoneId: "Has Spaces",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts unlock with reputation gate", () => {
    const ok = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          unlock: {
            requiresReputation: {
              factionId: "argentCrusade",
              minStanding: 42000,
            },
          },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts unlock with quest + achievement gates", () => {
    const ok = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "portalStone",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          unlock: {
            requiresQuestId: "openedPortal",
            requiresAchievementId: "masterTraveler",
            minCharacterLevel: 50,
          },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown top-level field (strict mode)", () => {
    const bad = { extra: "nope" };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown global field (strict mode)", () => {
    const bad = { global: { extra: "nope" } };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown node field (strict mode)", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          extra: "nope",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown edge field (strict mode)", () => {
    const bad = {
      nodes: [
        {
          id: "a",
          name: "A",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
        },
        {
          id: "b",
          name: "B",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 1, y: 0, z: 0 },
        },
      ],
      edges: [
        {
          id: "e",
          fromNodeId: "a",
          toNodeId: "b",
          kind: "instantTeleport",
          extra: "nope",
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown unlock field (strict mode)", () => {
    const bad = {
      nodes: [
        {
          id: "n",
          name: "N",
          kind: "flightMaster",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          unlock: { extra: "nope" },
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts hearthBindPoint with perUseCooldownSec 3600 (1h)", () => {
    const ok = {
      nodes: [
        {
          id: "hearth",
          name: "Hearthstone",
          kind: "hearthBindPoint",
          zoneId: "z",
          position: { x: 0, y: 0, z: 0 },
          perUseCooldownSec: 3600,
        },
      ],
    };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts blockedWhilePvPFlagged=true (hardcore PvP)", () => {
    const ok = { global: { blockedWhilePvPFlagged: true } };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts allowDestinationSummon=true (convenience feature)", () => {
    const ok = { global: { allowDestinationSummon: true } };
    expect(FastTravelManifestSchema.safeParse(ok).success).toBe(true);
  });
});
