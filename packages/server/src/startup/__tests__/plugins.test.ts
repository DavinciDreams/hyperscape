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
  resolveGamePluginSetIdFromEnv,
} from "../plugins.js";

/**
 * Stub world that records every `register`/`unregister` call so we
 * can assert the hyperscape meta-plugin's `onEnable` actually
 * attached its migrated systems. Mirrors the noop stub
 * `bootServerPlugins()` builds when no world is supplied.
 */
function createRecordingWorld(opts: { isServer?: boolean } = {}) {
  const registered: string[] = [];
  const unregistered: string[] = [];
  return {
    registered,
    unregistered,
    isServer: opts.isServer ?? true,
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

  it("hyperscape meta-plugin onEnable registers migrated systems on the host world", async () => {
    const world = createRecordingWorld({ isServer: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await bootServerPlugins(world as any);

    // Migrated systems (2026-04-24 wave):
    // - MobDeathSystem (combat/ → meta-plugin)
    // - HealthRegenSystem (character/ → meta-plugin, server-only)
    // - TanningSystem (interaction/ → meta-plugin)
    // 9 server-side systems registered (10 total migrated; the 10th
    // is DamageSplatSystem which is client-only).
    const expected = [
      "mob-death",
      "gravestone-loot",
      "health-regen",
      "tanning",
      "smithing",
      "smelting",
      "crafting",
      "fletching",
      "runecrafting",
    ];
    for (const name of expected) {
      expect(world.registered).toContain(name);
    }
    // Client-only systems must NOT appear on server.
    expect(world.registered).not.toContain("damage-splat");
    expect(world.registered).not.toContain("duel-countdown-splat");
    expect(world.registered).not.toContain("projectile-renderer");
    expect(world.registered).not.toContain("bfsPathDebug");
    expect(world.registered).not.toContain("walkableDebug");
    expect(world.unregistered).toEqual([]);

    await session.stop();
    for (const name of expected) {
      expect(world.unregistered).toContain(name);
    }
  });

  it("HealthRegenSystem is NOT registered when world.isServer === false", async () => {
    const world = createRecordingWorld({ isServer: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await bootServerPlugins(world as any);

    // MobDeathSystem registers on both server and client (no gate).
    expect(world.registered).toContain("mob-death");
    // HealthRegenSystem is server-only — preserves the SystemLoader
    // behavior pre-migration, which gated registration on
    // `isServerEnvironment`.
    expect(world.registered).not.toContain("health-regen");

    await session.stop();
  });
});

describe("server plugin boot — alternate game id (shooter-demo)", () => {
  it('bootServerPlugins("shooter-demo") starts only combat + shooter-demo, not hyperscape', async () => {
    _resetServerPluginServicesForTests();
    const world = createRecordingWorld({ isServer: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await bootServerPlugins(world as any, "shooter-demo");

    // Runs to completion cleanly.
    expect(session.failedPackages).toEqual([]);
    expect(session.unresolvable).toEqual([]);

    const startedIds = session.records.map((r) => r.manifest.id).sort();
    expect(startedIds).toEqual(
      ["com.hyperforge.combat", "com.hyperforge.plugin-shooter-demo"].sort(),
    );

    // Shooter-demo's ability registered via shared CombatAbilityService.
    // Combat's default starter pack was NOT loaded (empty pack when
    // gameId is "shooter-demo"), so the service holds ONLY "demo-shoot".
    const combatService = _peekCombatService();
    expect(combatService).not.toBeNull();
    if (combatService === null) return;
    expect(combatService.getAbility("demo-shoot")).toBeDefined();
    expect(combatService.list().size).toBe(1);

    // Skills service was never constructed (no skills plugin in this set).
    const skillsService = _peekSkillsService();
    expect(skillsService).toBeNull();

    // Hyperscape-specific systems (mob-death, health-regen, etc.) are
    // NOT registered when the active game is shooter-demo.
    expect(world.registered).not.toContain("mob-death");
    expect(world.registered).not.toContain("health-regen");
    expect(world.registered).not.toContain("gravestone-loot");

    await session.stop();
    expect(combatService.list().size).toBe(0);
  });

  it("getServerPluginModules returns different module sets per game id", () => {
    const hyperscapeSet = getServerPluginModules("hyperscape").map(
      (m) => m.manifest.id,
    );
    const shooterSet = getServerPluginModules("shooter-demo").map(
      (m) => m.manifest.id,
    );

    expect(hyperscapeSet).toContain("com.hyperforge.hyperscape");
    expect(hyperscapeSet).toContain("com.hyperforge.skills");
    expect(shooterSet).not.toContain("com.hyperforge.hyperscape");
    expect(shooterSet).not.toContain("com.hyperforge.skills");
    expect(shooterSet).toContain("com.hyperforge.plugin-shooter-demo");
  });

  it("resolveGamePluginSetIdFromEnv respects HYPERSCAPE_GAME_PLUGIN", () => {
    const save = process.env.HYPERSCAPE_GAME_PLUGIN;
    try {
      process.env.HYPERSCAPE_GAME_PLUGIN = "shooter-demo";
      expect(resolveGamePluginSetIdFromEnv()).toBe("shooter-demo");

      process.env.HYPERSCAPE_GAME_PLUGIN = "";
      expect(resolveGamePluginSetIdFromEnv()).toBe("hyperscape");

      process.env.HYPERSCAPE_GAME_PLUGIN = "bogus-unknown-id";
      expect(resolveGamePluginSetIdFromEnv()).toBe("hyperscape");

      delete process.env.HYPERSCAPE_GAME_PLUGIN;
      expect(resolveGamePluginSetIdFromEnv()).toBe("hyperscape");
    } finally {
      if (save === undefined) delete process.env.HYPERSCAPE_GAME_PLUGIN;
      else process.env.HYPERSCAPE_GAME_PLUGIN = save;
    }
  });
});
