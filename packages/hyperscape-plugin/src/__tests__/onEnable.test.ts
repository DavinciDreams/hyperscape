/**
 * Contract tests for `defaultFactory().onEnable(ctx)`.
 *
 * Locks in *which* systems the meta-plugin registers against the
 * host world, on the server side vs the client side. Each migration
 * (one more system pulled out of `@hyperforge/shared`) adds to one
 * of these expected lists; renames or accidental deletions blow up
 * here with an obvious diff in CI.
 *
 * The test fakes a `World` shape with just the surface the plugin's
 * `register(name, Ctor)` helper touches — `register(...)`,
 * `unregister?(...)`, and `isServer`. Keeps the test fast and
 * decoupled from the real ECS construction.
 */

import { describe, expect, it } from "vitest";

import defaultFactory from "../index.js";
import type { HyperscapeContext } from "../index.js";

interface FakeWorld {
  isServer: boolean;
  register: (name: string, Ctor: unknown) => void;
  unregister?: (name: string) => boolean;
  registered: Array<{ name: string; ctorName: string }>;
}

function makeFakeWorld(opts: { isServer: boolean }): FakeWorld {
  const w: FakeWorld = {
    isServer: opts.isServer,
    registered: [],
    register(name, Ctor) {
      const ctorName =
        typeof Ctor === "function" && "name" in Ctor
          ? String((Ctor as { name?: string }).name ?? "")
          : "";
      w.registered.push({ name, ctorName });
    },
    unregister(_name) {
      return true;
    },
  };
  return w;
}

interface FakeScope {
  disposers: Array<() => void>;
  register: (fn: () => void) => void;
}

function makeFakeScope(): FakeScope {
  const s: FakeScope = {
    disposers: [],
    register(fn) {
      s.disposers.push(fn);
    },
  };
  return s;
}

function buildContext(world: FakeWorld, scope: FakeScope): HyperscapeContext {
  return {
    pluginId: "com.hyperforge.hyperscape",
    scope: scope as unknown as HyperscapeContext["scope"],
    world: world as unknown as HyperscapeContext["world"],
  };
}

// Cross-cutting (both server + client) — driven by the meta-plugin's
// onEnable head section before the `if (isServer)` / `if (!isServer)`
// gates fire. Each new entry here lands in the same insertion order
// the plugin registers them.
const CROSS_CUTTING_REGISTRATIONS = [
  "mob-death",
  "gravestone-loot",
  "coin-pouch",
  "prayer",
  "banking",
  "store",
  "dialogue",
  "quest",
  "aggro",
  "processing",
  "npc",
  "station-spawner",
  "mob-npc-spawner",
  "item-spawner",
  "loot",
  "bridges",
  "docks",
  "tanning",
  "smithing",
  "smelting",
  "crafting",
  "fletching",
  "runecrafting",
];

const SERVER_ONLY_REGISTRATIONS = ["health-regen"];

const CLIENT_ONLY_REGISTRATIONS = [
  "damage-splat",
  "duel-countdown-splat",
  "equipment-visual",
  "projectile-renderer",
  "waterfall-visuals",
  "healthbars",
  "zone-visuals",
  "teleport-effects",
  "bfsPathDebug",
  "walkableDebug",
  "pathfindingDebug",
  "resource-tile-debug",
  "music",
  "inventory-interaction",
];

describe("HyperscapePlugin.onEnable — registration contract", () => {
  it("registers cross-cutting + server-only systems on the server world", () => {
    const world = makeFakeWorld({ isServer: true });
    const scope = makeFakeScope();
    const plugin = defaultFactory(buildContext(world, scope));
    plugin.onEnable?.(buildContext(world, scope));

    const names = world.registered.map((r) => r.name);
    expect(names).toEqual([
      ...CROSS_CUTTING_REGISTRATIONS,
      ...SERVER_ONLY_REGISTRATIONS,
    ]);
    // Every registration paired with a scope disposer (so
    // session.stop() unwinds them via world.unregister).
    expect(scope.disposers.length).toBe(world.registered.length);
  });

  it("registers cross-cutting + client-only systems on the client world", () => {
    const world = makeFakeWorld({ isServer: false });
    const scope = makeFakeScope();
    const plugin = defaultFactory(buildContext(world, scope));
    plugin.onEnable?.(buildContext(world, scope));

    const names = world.registered.map((r) => r.name);
    expect(names).toEqual([
      ...CROSS_CUTTING_REGISTRATIONS,
      ...CLIENT_ONLY_REGISTRATIONS,
    ]);
    expect(scope.disposers.length).toBe(world.registered.length);
    // Server-only systems are NOT on the client.
    for (const serverOnly of SERVER_ONLY_REGISTRATIONS) {
      expect(names).not.toContain(serverOnly);
    }
  });

  it("does not double-register when onEnable is invoked once per plugin instance", () => {
    const world = makeFakeWorld({ isServer: true });
    const scope = makeFakeScope();
    const plugin = defaultFactory(buildContext(world, scope));
    plugin.onEnable?.(buildContext(world, scope));
    const firstCount = world.registered.length;
    expect(firstCount).toBe(
      CROSS_CUTTING_REGISTRATIONS.length + SERVER_ONLY_REGISTRATIONS.length,
    );
    // Calling onEnable a second time would double-register — the
    // plugin lifecycle driver only calls it once per session.
    // This test asserts the count after a single call so the
    // contract is unambiguous.
  });

  it("each registered Ctor's class name matches the registration key (catches rename drift)", () => {
    const world = makeFakeWorld({ isServer: false });
    const scope = makeFakeScope();
    const plugin = defaultFactory(buildContext(world, scope));
    plugin.onEnable?.(buildContext(world, scope));

    // Spot-check a handful — full coverage isn't necessary, just
    // enough that an accidental "register('foo', Bar)" mistake
    // (where Bar is a different class) trips the test.
    const byName = new Map(world.registered.map((r) => [r.name, r.ctorName]));
    expect(byName.get("mob-death")).toBe("MobDeathSystem");
    expect(byName.get("waterfall-visuals")).toBe("WaterfallVisualsSystem");
    expect(byName.get("resource-tile-debug")).toBe("ResourceTileDebugSystem");
    expect(byName.get("projectile-renderer")).toBe("ProjectileRenderer");
    expect(byName.get("damage-splat")).toBe("DamageSplatSystem");
  });
});
