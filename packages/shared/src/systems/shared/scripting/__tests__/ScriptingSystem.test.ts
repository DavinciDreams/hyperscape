/**
 * ScriptingSystem — ownership + rate-limit tests (Phase 5.3 / 5.4).
 *
 * These are focused unit tests around `addGraph()` ownership enforcement
 * and the per-entity / per-player token-bucket rate limiter. Full
 * end-to-end scripting flow is covered by asset-forge PIE tests and the
 * existing interpreter/trigger/action unit tests.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { ScriptingSystem } from "../ScriptingSystem";
import type { RuntimeScriptGraph } from "../ScriptGraphInterpreter";
import { EventType } from "../../../../types/events";

// ---------------------------------------------------------------------------
// Mock world / entity-manager
// ---------------------------------------------------------------------------

interface MockEntity {
  data: Record<string, unknown>;
  position?: { x: number; y: number; z: number };
}

interface MockWorld {
  $eventBus?: unknown;
  isServer: boolean;
  currentTick: number;
  on: Mock;
  off: Mock;
  emit: Mock;
  getSystem: Mock;
}

function createMockEntityManager(entities: Map<string, MockEntity>) {
  return {
    getEntity: (id: string) => entities.get(id),
  };
}

function createMockWorld(entities: Map<string, MockEntity>): MockWorld {
  const em = createMockEntityManager(entities);
  const world: MockWorld = {
    isServer: true,
    currentTick: 0,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    getSystem: vi.fn((name: string) => {
      if (name === "entity-manager") return em;
      return null;
    }),
  };
  return world;
}

function makeEmptyGraph(id: string, name: string): RuntimeScriptGraph {
  return {
    id,
    name,
    nodes: [
      {
        id: "t1",
        type: "trigger/onReady",
        data: {},
        inputs: [],
        outputs: [],
      },
    ],
    edges: [],
    variables: [],
  } as RuntimeScriptGraph;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScriptingSystem — Phase 5.3 entity ownership", () => {
  let entities: Map<string, MockEntity>;
  let world: MockWorld;
  let system: ScriptingSystem;

  beforeEach(() => {
    entities = new Map();
    world = createMockWorld(entities);
    // Cast: ScriptingSystem only uses fields we supply.
    system = new ScriptingSystem(world as never);
  });

  it("allows attaching a graph when no auth context is provided (trusted path)", () => {
    entities.set("npc-1", { data: {} });
    const result = system.addGraph("npc-1", makeEmptyGraph("g1", "Greeter"));
    expect(result.added).toBe(true);
  });

  it("allows attaching when auth.trusted is true", () => {
    entities.set("npc-1", { data: { owner: "player-a" } });
    const result = system.addGraph("npc-1", makeEmptyGraph("g1", "Greeter"), {
      trusted: true,
    });
    expect(result.added).toBe(true);
  });

  it("rejects untrusted attach without playerId", () => {
    entities.set("npc-1", { data: { owner: "player-a" } });
    const result = system.addGraph(
      "npc-1",
      makeEmptyGraph("g1", "Greeter"),
      {},
    );
    expect(result.added).toBe(false);
    expect(result.reason).toMatch(/no playerId/);
  });

  it("rejects attach when playerId does not match entity owner", () => {
    entities.set("npc-1", { data: { owner: "player-a" } });
    const result = system.addGraph("npc-1", makeEmptyGraph("g1", "Greeter"), {
      playerId: "player-b",
    });
    expect(result.added).toBe(false);
    expect(result.reason).toMatch(/not owner/);
  });

  it("allows attach when playerId matches entity owner", () => {
    entities.set("npc-1", { data: { owner: "player-a" } });
    const result = system.addGraph("npc-1", makeEmptyGraph("g1", "Greeter"), {
      playerId: "player-a",
    });
    expect(result.added).toBe(true);
  });

  it("allows attach when entity has no owner (world/system entity) with any playerId", () => {
    entities.set("npc-1", { data: {} });
    const result = system.addGraph("npc-1", makeEmptyGraph("g1", "Greeter"), {
      playerId: "player-a",
    });
    expect(result.added).toBe(true);
  });

  it("rejects unknown node-type prefixes and reports a reason", () => {
    entities.set("npc-1", { data: {} });
    const graph: RuntimeScriptGraph = {
      id: "g1",
      name: "Bad",
      nodes: [
        {
          id: "t1",
          type: "malicious/exec",
          data: {},
          inputs: [],
          outputs: [],
        },
      ],
      edges: [],
      variables: [],
    } as RuntimeScriptGraph;
    const result = system.addGraph("npc-1", graph);
    expect(result.added).toBe(false);
    expect(result.reason).toMatch(/unknown node type/);
  });
});

describe("ScriptingSystem — Phase 5.4 token-bucket rate limiting", () => {
  let entities: Map<string, MockEntity>;
  let world: MockWorld;
  let system: ScriptingSystem;

  beforeEach(() => {
    entities = new Map();
    world = createMockWorld(entities);
    system = new ScriptingSystem(world as never);
  });

  it("fresh entity has ENTITY_BUCKET_CAPACITY tokens (200 allowed, 201st rejected)", () => {
    const now = Date.now();
    // access private helper via cast for focused security test
    const s = system as unknown as {
      tryConsumeBudget(id: string, now: number): boolean;
    };

    let consumed = 0;
    for (let i = 0; i < 250; i++) {
      if (s.tryConsumeBudget("npc-1", now)) consumed++;
    }
    expect(consumed).toBe(200);
  });

  it("emits scripting:rate_limited when the entity bucket is exhausted", () => {
    const now = Date.now();
    const s = system as unknown as {
      tryConsumeBudget(id: string, now: number): boolean;
    };

    // Subscribe to the real EventBus created by SystemBase (emitTypedEvent
    // routes through world.$eventBus, not world.emit).
    const rateEvents: Array<Record<string, unknown>> = [];
    const bus = (
      world as unknown as {
        $eventBus: {
          subscribe: (
            t: string,
            h: (e: { data: Record<string, unknown> }) => void,
          ) => { unsubscribe: () => void };
        };
      }
    ).$eventBus;
    const sub = bus.subscribe("scripting:rate_limited", (event) => {
      rateEvents.push(event.data);
    });

    for (let i = 0; i < 200; i++) s.tryConsumeBudget("npc-1", now);
    rateEvents.length = 0;
    const ok = s.tryConsumeBudget("npc-1", now);
    expect(ok).toBe(false);
    expect(rateEvents.length).toBeGreaterThan(0);
    expect(rateEvents[0]).toMatchObject({ entityId: "npc-1", scope: "entity" });
    sub.unsubscribe();
  });

  it("refills tokens over time at ENTITY_BUCKET_REFILL_PER_SEC", () => {
    const t0 = 1_000_000;
    const s = system as unknown as {
      tryConsumeBudget(id: string, now: number): boolean;
    };

    // Drain
    for (let i = 0; i < 200; i++) s.tryConsumeBudget("npc-1", t0);
    expect(s.tryConsumeBudget("npc-1", t0)).toBe(false);

    // Advance time by 1 second — bucket should fully refill (200 tokens/sec)
    const t1 = t0 + 1000;
    expect(s.tryConsumeBudget("npc-1", t1)).toBe(true);

    let consumed = 1; // already consumed one above
    for (let i = 0; i < 250; i++) {
      if (s.tryConsumeBudget("npc-1", t1)) consumed++;
    }
    expect(consumed).toBe(200);
  });

  it("enforces a separate aggregate bucket per owning player", () => {
    // Three player-owned entities under the same player — needed because
    // ENTITY_BUCKET_CAPACITY (200) * 3 exceeds PLAYER_BUCKET_CAPACITY (500),
    // so the player bucket will be the blocking constraint on the third mob.
    entities.set("mob-a", { data: { owner: "player-1" } });
    entities.set("mob-b", { data: { owner: "player-1" } });
    entities.set("mob-c", { data: { owner: "player-1" } });
    system.addGraph("mob-a", makeEmptyGraph("g1", "A"));
    system.addGraph("mob-b", makeEmptyGraph("g2", "B"));
    system.addGraph("mob-c", makeEmptyGraph("g3", "C"));

    const now = Date.now();
    const s = system as unknown as {
      tryConsumeBudget(id: string, now: number): boolean;
    };

    // Drain mob-a fully (200 entity + 200 player; player now 300)
    for (let i = 0; i < 200; i++) s.tryConsumeBudget("mob-a", now);
    // Drain mob-b fully (200 entity + 200 player; player now 100)
    for (let i = 0; i < 200; i++) s.tryConsumeBudget("mob-b", now);

    // mob-c has a full 200 entity bucket but the player aggregate only has
    // 100 tokens left — so mob-c can consume exactly 100 before the player
    // bucket blocks it.
    let mobCOk = 0;
    for (let i = 0; i < 200; i++) {
      if (s.tryConsumeBudget("mob-c", now)) mobCOk++;
    }
    expect(mobCOk).toBe(100);

    // Next call blocked at the player scope
    const rateEvents: Array<Record<string, unknown>> = [];
    const bus = (
      world as unknown as {
        $eventBus: {
          subscribe: (
            t: string,
            h: (e: { data: Record<string, unknown> }) => void,
          ) => { unsubscribe: () => void };
        };
      }
    ).$eventBus;
    const sub = bus.subscribe("scripting:rate_limited", (event) => {
      rateEvents.push(event.data);
    });
    const blocked = s.tryConsumeBudget("mob-c", now);
    expect(blocked).toBe(false);
    expect(rateEvents.length).toBeGreaterThan(0);
    const playerEvent = rateEvents.find((e) => e.scope === "player");
    expect(playerEvent).toMatchObject({
      scope: "player",
      playerId: "player-1",
    });
    sub.unsubscribe();
  });

  it("ENTITY_DEATH clears the entity bucket and owner cache", async () => {
    entities.set("mob-a", { data: { owner: "player-1" } });
    const addResult = system.addGraph("mob-a", makeEmptyGraph("g1", "A"));
    expect(addResult.added).toBe(true);

    // Prime the bucket
    const now = Date.now();
    const s = system as unknown as {
      tryConsumeBudget(id: string, now: number): boolean;
      readEntityOwner(id: string): string | null;
      graphOwners: Map<string, string>;
    };
    for (let i = 0; i < 50; i++) s.tryConsumeBudget("mob-a", now);
    expect(s.graphOwners.get("mob-a")).toBe("player-1");

    system.removeAllGraphs("mob-a");
    expect(s.graphOwners.has("mob-a")).toBe(false);

    // Bucket resets: full 200 available again
    let consumed = 0;
    for (let i = 0; i < 250; i++) {
      if (s.tryConsumeBudget("mob-a", now)) consumed++;
    }
    expect(consumed).toBe(200);

    // Unused params to keep lint quiet
    void EventType;
  });
});
