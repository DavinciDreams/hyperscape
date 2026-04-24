/**
 * Tests for the FastTravelProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { fastTravelProvider } from "../FastTravelProvider";

beforeEach(() => {
  fastTravelProvider.unload();
});
afterEach(() => {
  fastTravelProvider.unload();
});

const nodeA = {
  id: "stormwindFlight",
  name: "Stormwind Flight Master",
  kind: "flightMaster" as const,
  zoneId: "stormwind",
  position: { x: 0, y: 0, z: 0 },
};
const nodeB = {
  id: "ironforgeFlight",
  name: "Ironforge Flight Master",
  kind: "flightMaster" as const,
  zoneId: "ironforge",
  position: { x: 100, y: 0, z: 100 },
};
const validEdge = {
  id: "stormToIron",
  fromNodeId: "stormwindFlight",
  toNodeId: "ironforgeFlight",
  kind: "flightAnimated" as const,
  pathAssetRef: "flightPathStormIron",
};

const validManifest = {
  nodes: [nodeA, nodeB],
  edges: [validEdge],
};

describe("FastTravelProvider", () => {
  it("starts unloaded", () => {
    expect(fastTravelProvider.isLoaded()).toBe(false);
    expect(fastTravelProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts valid manifest and fills defaults", () => {
    const parsed = fastTravelProvider.loadRaw(validManifest);
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
    expect(parsed.edges[0].direction).toBe("bidirectional");
    expect(parsed.global.enabled).toBe(true);
    expect(parsed.global.channelTimeSec).toBe(10);
    expect(parsed.global.cancelChannelOnDamage).toBe(true);
    expect(fastTravelProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts empty manifest {}", () => {
    const parsed = fastTravelProvider.loadRaw({});
    expect(parsed.nodes.length).toBe(0);
    expect(parsed.edges.length).toBe(0);
    expect(fastTravelProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = fastTravelProvider.loadRaw(validManifest);
    fastTravelProvider.unload();
    fastTravelProvider.load(parsed);
    expect(fastTravelProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate node ids", () => {
    const bad = { ...validManifest, nodes: [nodeA, { ...nodeA }] };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate edge ids", () => {
    const bad = {
      ...validManifest,
      edges: [validEdge, { ...validEdge }],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects edge with unknown fromNodeId", () => {
    const bad = {
      ...validManifest,
      edges: [{ ...validEdge, fromNodeId: "ghostNode" }],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects edge with unknown toNodeId", () => {
    const bad = {
      ...validManifest,
      edges: [{ ...validEdge, toNodeId: "ghostNode" }],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects edge self-loop", () => {
    const bad = {
      ...validManifest,
      edges: [
        {
          ...validEdge,
          toNodeId: "stormwindFlight",
          kind: "instantTeleport" as const,
          pathAssetRef: "",
        },
      ],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate (from,to,direction) edges", () => {
    const bad = {
      ...validManifest,
      edges: [validEdge, { ...validEdge, id: "stormToIron2" }],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects flightAnimated edge without pathAssetRef", () => {
    const bad = {
      ...validManifest,
      edges: [{ ...validEdge, pathAssetRef: "" }],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects vehicleControlled edge without pathAssetRef", () => {
    const bad = {
      ...validManifest,
      edges: [
        {
          ...validEdge,
          kind: "vehicleControlled" as const,
          pathAssetRef: "",
        },
      ],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts instantTeleport edge without pathAssetRef", () => {
    const parsed = fastTravelProvider.loadRaw({
      ...validManifest,
      edges: [
        {
          ...validEdge,
          kind: "instantTeleport" as const,
          pathAssetRef: "",
        },
      ],
    });
    expect(parsed.edges[0].kind).toBe("instantTeleport");
  });

  it("loadRaw() rejects custom node without customKey", () => {
    const bad = {
      ...validManifest,
      nodes: [{ ...nodeA, kind: "custom" as const, customKey: "" }, nodeB],
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts custom node with customKey", () => {
    const parsed = fastTravelProvider.loadRaw({
      ...validManifest,
      nodes: [
        { ...nodeA, kind: "custom" as const, customKey: "npcMagicBoat" },
        nodeB,
      ],
    });
    expect(parsed.nodes[0].customKey).toBe("npcMagicBoat");
  });

  it("loadRaw() rejects global cancelOnDamage=true with channelTime=0", () => {
    const bad = {
      ...validManifest,
      global: {
        channelTimeSec: 0,
        cancelChannelOnDamage: true,
      },
    };
    expect(() => fastTravelProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts channelTime=0 with cancelOnDamage=false", () => {
    const parsed = fastTravelProvider.loadRaw({
      ...validManifest,
      global: {
        channelTimeSec: 0,
        cancelChannelOnDamage: false,
      },
    });
    expect(parsed.global.channelTimeSec).toBe(0);
  });

  it("loadRaw() accepts oneWayForward parallel with bidirectional (different direction)", () => {
    const parsed = fastTravelProvider.loadRaw({
      ...validManifest,
      edges: [
        validEdge,
        {
          ...validEdge,
          id: "ironToStormOneWay",
          direction: "oneWayForward" as const,
        },
      ],
    });
    expect(parsed.edges.length).toBe(2);
  });

  it("hotReload() replaces the manifest", () => {
    fastTravelProvider.loadRaw(validManifest);
    const parsed = fastTravelProvider.loadRaw({});
    fastTravelProvider.hotReload(parsed);
    expect(fastTravelProvider.getManifest()?.nodes.length).toBe(0);
  });

  it("hotReload(null) clears the manifest", () => {
    fastTravelProvider.loadRaw(validManifest);
    fastTravelProvider.hotReload(null);
    expect(fastTravelProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    fastTravelProvider.loadRaw(validManifest);
    fastTravelProvider.unload();
    expect(fastTravelProvider.isLoaded()).toBe(false);
  });
});
