import { FastTravelManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { FastTravelGraph } from "../FastTravelGraph.js";

function manifest() {
  return FastTravelManifestSchema.parse({
    global: {
      enabled: true,
      blockedInCombat: true,
      blockedInInstancedContent: true,
      globalCooldownSec: 5,
      channelTimeSec: 10,
      cancelChannelOnDamage: true,
    },
    nodes: [
      {
        id: "stormwind",
        name: "Stormwind",
        kind: "flightMaster",
        zoneId: "elwynn",
        position: { x: 0, y: 0, z: 0 },
        useCostCurrency: 10,
        unlock: { minCharacterLevel: 0 },
        factionAllowList: ["alliance"],
      },
      {
        id: "darnassus",
        name: "Darnassus",
        kind: "flightMaster",
        zoneId: "teldrassil",
        position: { x: 100, y: 0, z: 0 },
        useCostCurrency: 20,
        factionAllowList: ["alliance"],
      },
      {
        id: "ironforge",
        name: "Ironforge",
        kind: "flightMaster",
        zoneId: "dun-morogh",
        position: { x: 50, y: 0, z: 0 },
        useCostCurrency: 15,
        factionAllowList: ["alliance"],
      },
      {
        id: "orgrimmar",
        name: "Orgrimmar",
        kind: "flightMaster",
        zoneId: "durotar",
        position: { x: 1000, y: 0, z: 0 },
        useCostCurrency: 10,
        factionAllowList: ["horde"],
      },
    ],
    edges: [
      {
        id: "swToIf",
        fromNodeId: "stormwind",
        toNodeId: "ironforge",
        kind: "flightAnimated",
        pathAssetRef: "pathSwToIf",
        travelTimeSec: 60,
      },
      {
        id: "ifToDarn",
        fromNodeId: "ironforge",
        toNodeId: "darnassus",
        kind: "flightAnimated",
        pathAssetRef: "pathIfToDarn",
        travelTimeSec: 120,
      },
      {
        id: "swToDarnExpress",
        fromNodeId: "stormwind",
        toNodeId: "darnassus",
        kind: "flightAnimated",
        pathAssetRef: "pathExpress",
        travelTimeSec: 200,
      },
    ],
  });
}

function traveler(overrides: Record<string, unknown> = {}) {
  return {
    characterLevel: 50,
    factionId: "alliance",
    inCombat: false,
    pvpFlagged: false,
    inInstancedContent: false,
    discoveredNodeIds: new Set(["stormwind", "ironforge", "darnassus"]),
    ...overrides,
  } as const;
}

describe("FastTravelGraph — lookup", () => {
  it("indexes nodes + edges", () => {
    const g = new FastTravelGraph(manifest());
    expect(g.nodeCount).toBe(4);
    expect(g.edgeCount).toBe(3);
    expect(g.hasNode("stormwind")).toBe(true);
  });

  it("neighbors expands bidirectional edges", () => {
    const g = new FastTravelGraph(manifest());
    // stormwind has 2 outgoing edges
    const fromSw = g.neighbors("stormwind");
    expect(fromSw.length).toBe(2);
    // darnassus has incoming from ironforge + stormwind (bidirectional both)
    const fromDarn = g.neighbors("darnassus");
    expect(fromDarn.length).toBe(2);
  });
});

describe("FastTravelGraph — usability", () => {
  it("usable for valid traveler", () => {
    const g = new FastTravelGraph(manifest());
    expect(g.usability("stormwind", traveler()).usable).toBe(true);
  });

  it("blocked in combat", () => {
    const g = new FastTravelGraph(manifest());
    const out = g.usability("stormwind", traveler({ inCombat: true }));
    expect(out.reason).toBe("blocked-combat");
  });

  it("blocked when not discovered", () => {
    const g = new FastTravelGraph(manifest());
    const out = g.usability(
      "stormwind",
      traveler({ discoveredNodeIds: new Set() }),
    );
    expect(out.reason).toBe("not-discovered");
  });

  it("blocked by faction allow list", () => {
    const g = new FastTravelGraph(manifest());
    const out = g.usability(
      "stormwind",
      traveler({
        factionId: "horde",
        discoveredNodeIds: new Set(["stormwind"]),
      }),
    );
    expect(out.reason).toBe("faction-gate");
  });
});

describe("FastTravelGraph — shortestPath", () => {
  it("picks the faster transitive route over the direct express", () => {
    const g = new FastTravelGraph(manifest());
    const p = g.shortestPath("stormwind", "darnassus");
    expect(p).not.toBeNull();
    // stormwind→ironforge (60) + ironforge→darnassus (120) = 180 vs direct 200
    expect(p?.totalSec).toBe(180);
    expect(p?.steps.length).toBe(2);
    expect(p?.steps[0].toNodeId).toBe("ironforge");
    expect(p?.steps[1].toNodeId).toBe("darnassus");
  });

  it("returns zero-length path when source = destination", () => {
    const g = new FastTravelGraph(manifest());
    const p = g.shortestPath("stormwind", "stormwind");
    expect(p?.totalSec).toBe(0);
    expect(p?.steps).toEqual([]);
  });

  it("returns null for unreachable destination", () => {
    const g = new FastTravelGraph(manifest());
    const p = g.shortestPath("stormwind", "orgrimmar");
    expect(p).toBeNull();
  });

  it("sums travel cost across edges using node fallback", () => {
    const g = new FastTravelGraph(manifest());
    const p = g.shortestPath("stormwind", "darnassus");
    // edges have travelCostCurrency=0, so falls back to from-node's useCostCurrency
    // stormwind (10) + ironforge (15) = 25
    expect(p?.totalCost).toBe(25);
  });
});
