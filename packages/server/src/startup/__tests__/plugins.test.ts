/**
 * Plugin boot smoke test.
 *
 * Proves that the in-binary plugin set (combat + skills + hyperscape
 * meta-plugin) actually starts through `@hyperforge/gameplay-framework`
 * when `bootServerPlugins()` is called — i.e. the same code path
 * `initializeWorld` runs in production.
 *
 * No game-state coupling — this is purely a "did the framework boot
 * the plugins it was supposed to" assertion. Migrations that move
 * Hyperscape systems into the meta-plugin's `onLoad` will add their
 * own assertions here for the side-effects they expect.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  _peekCombatService,
  _peekSkillsService,
  _resetServerPluginServicesForTests,
  bootServerPlugins,
  getServerPluginModules,
} from "../plugins.js";

/**
 * Stub world that records every `register`/`unregister` call so we
 * can assert the hyperscape meta-plugin's `onEnable` actually
 * attached its migrated systems. Mirrors the noop stub
 * `bootServerPlugins()` builds when no world is supplied.
 */
function createRecordingWorld() {
  const registered: string[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    register(name: string, _ctor: unknown) {
      registered.push(name);
    },
    unregister(name: string) {
      unregistered.push(name);
    },
  };
}

beforeEach(() => {
  _resetServerPluginServicesForTests();
});

describe("server plugin boot — in-binary set", () => {
  it("module set contains combat, skills, and the hyperscape meta-plugin", () => {
    const modules = getServerPluginModules();
    const ids = modules.map((m) => m.manifest.id).sort();
    expect(ids).toEqual(
      [
        "com.hyperforge.combat",
        "com.hyperforge.hyperscape",
        "com.hyperforge.skills",
      ].sort(),
    );
  });

  it("startPluginSessionFromModules runs all three plugins to onEnable", async () => {
    const session = await bootServerPlugins();

    // Every plugin we handed in must show up in the session's
    // started-records — no unresolvable, no failed packages.
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);

    const startedIds = session.records.map((r) => r.manifest.id).sort();
    expect(startedIds).toEqual(
      [
        "com.hyperforge.combat",
        "com.hyperforge.hyperscape",
        "com.hyperforge.skills",
      ].sort(),
    );

    // Toposort by manifest dependencies should run combat + skills
    // before hyperscape (which depends on both). Verify ordering.
    const indexOf = (id: string) =>
      session.records.findIndex((r) => r.manifest.id === id);
    expect(indexOf("com.hyperforge.hyperscape")).toBeGreaterThan(
      indexOf("com.hyperforge.combat"),
    );
    expect(indexOf("com.hyperforge.hyperscape")).toBeGreaterThan(
      indexOf("com.hyperforge.skills"),
    );

    // Each record carries a real context with its own scope — proves
    // the contextFactory wired correctly.
    for (const record of session.records) {
      expect(record.ctx.pluginId).toBe(record.manifest.id);
      expect(record.scope.pluginId).toBe(record.manifest.id);
    }

    // Combat + skills `onEnable` registered the default starter packs
    // against the per-server services. Verify each shows up.
    const combatService = _peekCombatService();
    const skillsService = _peekSkillsService();
    expect(combatService).not.toBeNull();
    expect(skillsService).not.toBeNull();
    if (combatService === null || skillsService === null) return;

    expect(combatService.list().size).toBeGreaterThan(0);
    expect(skillsService.list().size).toBeGreaterThan(0);

    // Stop runs `onDisable` + scope disposers (LIFO). Each disposer
    // unregisters the ability/skill it registered, so post-stop the
    // services should be back to empty.
    await session.stop();
    expect(combatService.list().size).toBe(0);
    expect(skillsService.list().size).toBe(0);
  });

  it("session.stop() is idempotent — calling twice does not throw", async () => {
    const session = await bootServerPlugins();
    await session.stop();
    await session.stop();
  });

  it("hyperscape meta-plugin onEnable registers MobDeathSystem on the host world", async () => {
    const world = createRecordingWorld();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await bootServerPlugins(world as any);

    // First migrated system: MobDeathSystem (out of
    // packages/shared/src/systems/shared/combat/ → into
    // @hyperforge/hyperscape on 2026-04-24).
    expect(world.registered).toContain("mob-death");
    expect(world.unregistered).toEqual([]);

    // session.stop() runs scope disposers in LIFO order — the
    // disposer registered alongside the world.register call should
    // call world.unregister.
    await session.stop();
    expect(world.unregistered).toContain("mob-death");
  });
});
