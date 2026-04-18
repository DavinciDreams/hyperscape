/**
 * PIE bridge registration tests.
 *
 * Asserts that `registerPIEBridges` installs all 8 `SystemBase` adapters
 * under their canonical names on a bare `World`, and that each adapter
 * implements its expected interface method set.
 *
 * This covers the wiring contract consumed by `PIEServerSession.start()`
 * without dragging in the full `createServerWorld()` pipeline (which
 * boots terrain, towns, POIs, pathfinding validation, etc., and is
 * exercised by higher-level integration tests).
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9.
 */

import { describe, expect, it } from "vitest";

import { World } from "../../../core/World";
import { PIE_BRIDGE_NAMES, registerPIEBridges } from "../PIEBridgeSystems";

describe("registerPIEBridges", () => {
  it("installs all 8 bridges under canonical names", () => {
    const world = new World();
    registerPIEBridges(world);

    for (const name of Object.values(PIE_BRIDGE_NAMES)) {
      const system = world.getSystem(name);
      expect(system, `bridge missing: ${name}`).toBeTruthy();
    }
  });

  it("is idempotent — existing bridges are preserved", () => {
    const world = new World();
    registerPIEBridges(world);
    const firstDatabase = world.getSystem(PIE_BRIDGE_NAMES.database);
    const firstAuth = world.getSystem(PIE_BRIDGE_NAMES.auth);

    // Second call should not replace bridges.
    registerPIEBridges(world);

    expect(world.getSystem(PIE_BRIDGE_NAMES.database)).toBe(firstDatabase);
    expect(world.getSystem(PIE_BRIDGE_NAMES.auth)).toBe(firstAuth);
  });

  it("database bridge exposes repository + player lookup methods", () => {
    const world = new World();
    registerPIEBridges(world);
    const db = world.getSystem(PIE_BRIDGE_NAMES.database) as unknown as {
      getCharacterRepository: () => unknown;
      getBankRepository: () => unknown;
      getInventoryRepository: () => unknown;
      getFriendRepository: () => unknown;
      getPlayerAsync: (id: string) => Promise<unknown>;
    };
    expect(typeof db.getCharacterRepository).toBe("function");
    expect(typeof db.getBankRepository).toBe("function");
    expect(typeof db.getInventoryRepository).toBe("function");
    expect(typeof db.getFriendRepository).toBe("function");
    expect(typeof db.getPlayerAsync).toBe("function");
  });

  it("packet-handlers bridge exposes register/unregister/getHandler", () => {
    const world = new World();
    registerPIEBridges(world);
    const registry = world.getSystem(
      PIE_BRIDGE_NAMES.packetHandlers,
    ) as unknown as {
      register: (name: string, handler: unknown) => void;
      unregister: (name: string) => void;
      getHandler: (name: string) => unknown;
      listPackets: () => string[];
    };
    const noopHandler = () => Promise.resolve();
    registry.register("pie.ping", noopHandler);
    expect(registry.getHandler("pie.ping")).toBe(noopHandler);
    expect(registry.listPackets()).toContain("pie.ping");
    registry.unregister("pie.ping");
    expect(registry.getHandler("pie.ping")).toBeUndefined();
  });

  it("auth bridge createJWT/verifyJWT roundtrip works in-memory", async () => {
    const world = new World();
    registerPIEBridges(world);
    const auth = world.getSystem(PIE_BRIDGE_NAMES.auth) as unknown as {
      createJWT: (data: Record<string, unknown>) => Promise<string>;
      verifyJWT: (token: string) => Promise<Record<string, unknown> | null>;
    };
    const token = await auth.createJWT({ userId: "pie-user" });
    expect(typeof token).toBe("string");
    const decoded = await auth.verifyJWT(token);
    expect(decoded).toMatchObject({ userId: "pie-user" });
  });

  it("agent bridges default to no-op behavior", () => {
    const world = new World();
    registerPIEBridges(world);
    const manager = world.getSystem(
      PIE_BRIDGE_NAMES.agentManager,
    ) as unknown as { hasAgent: (id: string) => boolean };
    expect(manager.hasAgent("anyone")).toBe(false);

    const lookup = world.getSystem(
      PIE_BRIDGE_NAMES.agentRuntimeLookup,
    ) as unknown as { getAgentRuntimeByCharacterId: (id: string) => unknown };
    expect(lookup.getAgentRuntimeByCharacterId("anyone")).toBeNull();
  });
});
