/**
 * MobDeathSystem Unit Tests
 *
 * Migrated 2026-04-24 alongside the system itself from
 * `packages/shared/src/systems/shared/combat/__tests__/`. Imports
 * updated to match the new home in `@hyperforge/hyperscape`.
 *
 * Behavior unchanged from the pre-migration version.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobDeathSystem } from "../MobDeathSystem";

function createMockWorld() {
  const entitiesMap = new Map<string, Record<string, unknown>>();
  const emitFn = vi.fn();
  const onFn = vi.fn();
  const offFn = vi.fn();
  const removeFn = vi.fn();

  return {
    entities: {
      get: (id: string) => entitiesMap.get(id),
      set: (id: string, entity: Record<string, unknown>) =>
        entitiesMap.set(id, entity),
      remove: removeFn,
      _map: entitiesMap,
    },
    emit: emitFn,
    on: onFn,
    off: offFn,
    getSystem: vi.fn(),
    _emit: emitFn,
    _remove: removeFn,
    addEntity: (id: string, data: Record<string, unknown> = {}) => {
      entitiesMap.set(id, data);
    },
  };
}

describe("MobDeathSystem (migrated to @hyperforge/hyperscape)", () => {
  let world: ReturnType<typeof createMockWorld>;
  let system: MobDeathSystem;

  beforeEach(() => {
    world = createMockWorld();
    system = new MobDeathSystem(world as never);
  });

  afterEach(() => {
    system.destroy();
  });

  describe("handleMobDeath", () => {
    it("only processes mob deaths, not player deaths", () => {
      const privateSystem = system as unknown as {
        handleMobDeath: (data: {
          entityId: string;
          killedBy: string;
          entityType: "player" | "mob";
        }) => void;
        despawnMob: (mobId: string) => void;
      };

      const despawnSpy = vi.spyOn(privateSystem, "despawnMob");

      privateSystem.handleMobDeath({
        entityId: "player1",
        killedBy: "mob1",
        entityType: "player",
      });

      expect(despawnSpy).not.toHaveBeenCalled();

      world.addEntity("mob1", { type: "mob" });
      privateSystem.handleMobDeath({
        entityId: "mob1",
        killedBy: "player1",
        entityType: "mob",
      });

      expect(despawnSpy).toHaveBeenCalledWith("mob1");
    });

    it("calls despawnMob for mob deaths", () => {
      const privateSystem = system as unknown as {
        handleMobDeath: (data: {
          entityId: string;
          killedBy: string;
          entityType: "player" | "mob";
        }) => void;
        despawnMob: (mobId: string) => void;
      };

      const despawnSpy = vi.spyOn(privateSystem, "despawnMob");

      world.addEntity("mob1", { type: "mob", health: 0 });

      privateSystem.handleMobDeath({
        entityId: "mob1",
        killedBy: "player1",
        entityType: "mob",
      });

      expect(despawnSpy).toHaveBeenCalledWith("mob1");
    });
  });

  describe("despawnMob", () => {
    it("removes mob entity via entities.remove", () => {
      const privateSystem = system as unknown as {
        despawnMob: (mobId: string) => void;
      };

      world.addEntity("mob1", { type: "mob" });

      privateSystem.despawnMob("mob1");

      expect(world._remove).toHaveBeenCalledWith("mob1");
    });

    it("handles non-existent mob gracefully", () => {
      const privateSystem = system as unknown as {
        despawnMob: (mobId: string) => void;
      };

      expect(() => privateSystem.despawnMob("nonexistent")).not.toThrow();
      expect(world._remove).not.toHaveBeenCalled();
    });
  });

  describe("destroy", () => {
    it("is safe to call multiple times", () => {
      expect(() => {
        system.destroy();
        system.destroy();
      }).not.toThrow();
    });
  });
});
