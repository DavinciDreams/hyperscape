/**
 * Combat reference-plugin smoke tests.
 *
 * Scope: prove an external package built on `@hyperforge/gameplay-framework`
 * can (a) ship a valid `plugin.json` that parses through the manifest schema,
 * (b) produce a factory whose `onLoad` rejects malformed configuration
 * BEFORE any registration, (c) produce a factory whose `onEnable` mutates
 * author-defined service state with scope-tracked teardown, and (d)
 * exercise all three lifecycle hooks (`onLoad`, `onEnable`, `onDisable`).
 *
 * This test does NOT exercise `shared`'s `PluginHost` runtime — it drives
 * the lifecycle by hand using the canonical `createPluginContextScope`
 * from `@hyperforge/gameplay-framework`. The point is to prove the facade
 * is sufficient for authoring. Integration with the real host lives
 * elsewhere.
 */

import { describe, expect, it } from "vitest";

import { createPluginContextScope } from "@hyperforge/gameplay-framework";

import {
  DEFAULT_COMBAT_ABILITIES,
  combatPluginFactory,
  createCombatAbilityService,
  manifest,
  type CombatAbility,
  type CombatAbilityService,
  type CombatContext,
} from "../index.js";

function makeContext(
  pluginId: string,
  service: CombatAbilityService,
): CombatContext {
  const scope = createPluginContextScope(pluginId);
  return {
    pluginId,
    scope,
    registerAbility(ability) {
      service.registerAbility(ability);
      scope.register(() => service.unregisterAbility(ability.id));
    },
  };
}

describe("@hyperforge/combat", () => {
  it("ships a plugin.json that parses through PluginManifestSchema", () => {
    expect(manifest.id).toBe("com.hyperforge.combat");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.entry).toBe("./dist/index.js");
    expect(manifest.author.name).toBe("Hyperforge");
    expect(manifest.hyperforgeApi).toBe("0.1.0");
    expect(manifest.enabledByDefault).toBe(false);
    expect(manifest.tags).toContain("combat");
    expect(manifest.tags).toContain("reference");
  });

  it("declares contributions across multiple buckets (Phase I3 surface)", () => {
    // Phase I3: plugins declare WHAT they contribute via the manifest;
    // the actual contribution OBJECTS are exposed at runtime via the
    // plugin module. Editor / host bootstrap walks
    // `manifest.contributions.<bucket>` to know which ids to expect
    // from the runtime module.
    expect(manifest.contributions.systems).toEqual([
      "com.hyperforge.combat.ability-system",
    ]);
    expect(manifest.contributions.widgets).toEqual([
      "com.hyperforge.combat.ability-bar",
    ]);
    expect(manifest.contributions.manifestSchemas).toEqual([
      "com.hyperforge.combat.abilities",
    ]);
    expect(manifest.contributions.paletteCategories).toEqual([
      "com.hyperforge.combat.palette",
    ]);
    expect(manifest.contributions.commands).toEqual([
      "com.hyperforge.combat.commands.swap-ability",
    ]);
    // Buckets we don't (yet) contribute to are explicit empty arrays:
    expect(manifest.contributions.entities).toEqual([]);
    expect(manifest.contributions.toolbarTools).toEqual([]);
  });

  it("ships a default starter pack covering each ability kind", () => {
    expect(DEFAULT_COMBAT_ABILITIES).toHaveLength(3);
    const ids = DEFAULT_COMBAT_ABILITIES.map((a) => a.id);
    expect(ids).toContain("com.hyperforge.combat.slash");
    expect(ids).toContain("com.hyperforge.combat.stab");
    expect(ids).toContain("com.hyperforge.combat.fire_bolt");
    const kinds = new Set(DEFAULT_COMBAT_ABILITIES.map((a) => a.kind));
    expect(kinds.has("melee")).toBe(true);
    expect(kinds.has("magic")).toBe(true);
  });

  it("registers all configured abilities on enable and unregisters them via scope drain", async () => {
    const service = createCombatAbilityService();
    const ctx = makeContext("com.hyperforge.combat", service);

    const factory = combatPluginFactory(DEFAULT_COMBAT_ABILITIES);
    const plugin = factory();

    // Before any hook runs, the service is empty.
    expect(service.list().size).toBe(0);

    // onLoad does NOT register — it only validates.
    await plugin.onLoad?.(ctx);
    expect(service.list().size).toBe(0);

    // onEnable registers the full pack.
    await plugin.onEnable?.(ctx);
    expect(service.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);
    expect(service.getAbility("com.hyperforge.combat.slash")?.displayName).toBe(
      "Slash",
    );
    expect(service.getAbility("com.hyperforge.combat.fire_bolt")?.kind).toBe(
      "magic",
    );

    // onDisable is a no-op; teardown happens via scope drain after.
    await plugin.onDisable?.(ctx);
    expect(service.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);

    // Scope drain (simulating host post-disable) unregisters everything.
    await ctx.scope.dispose();
    expect(service.list().size).toBe(0);
  });

  it("rejects a duplicate-id ability list during onLoad before any registration", async () => {
    const service = createCombatAbilityService();
    const ctx = makeContext("com.hyperforge.combat#dup", service);

    const malformed: readonly CombatAbility[] = [
      {
        id: "x",
        displayName: "X1",
        kind: "melee",
        baseDamage: 1,
        accuracy: 0.5,
      },
      {
        id: "x",
        displayName: "X2",
        kind: "ranged",
        baseDamage: 2,
        accuracy: 0.6,
      },
    ];
    const plugin = combatPluginFactory(malformed)();

    await expect(async () => plugin.onLoad?.(ctx)).rejects.toThrow(
      /duplicate ability id "x"/,
    );

    // Critical invariant: nothing should have been registered.
    expect(service.list().size).toBe(0);
  });

  it("supports multiple independent factory calls (each produces a fresh instance)", () => {
    const a = combatPluginFactory(DEFAULT_COMBAT_ABILITIES)();
    const b = combatPluginFactory(DEFAULT_COMBAT_ABILITIES)();
    expect(a).not.toBe(b);
    expect(typeof a.onLoad).toBe("function");
    expect(typeof a.onEnable).toBe("function");
    expect(typeof a.onDisable).toBe("function");
    expect(typeof b.onLoad).toBe("function");
    expect(typeof b.onEnable).toBe("function");
    expect(typeof b.onDisable).toBe("function");
  });

  it("refuses duplicate ability registration across plugin instances (service invariant holds)", async () => {
    const service = createCombatAbilityService();
    const ctxA = makeContext("com.hyperforge.combat#a", service);
    const ctxB = makeContext("com.hyperforge.combat#b", service);

    // First plugin instance registers the default pack.
    const pluginA = combatPluginFactory(DEFAULT_COMBAT_ABILITIES)();
    await pluginA.onLoad?.(ctxA);
    await pluginA.onEnable?.(ctxA);
    expect(service.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);

    // Second plugin instance tries to re-register the same abilities.
    const pluginB = combatPluginFactory(DEFAULT_COMBAT_ABILITIES)();
    await pluginB.onLoad?.(ctxB);
    await expect(async () => pluginB.onEnable?.(ctxB)).rejects.toThrow(
      /already registered/,
    );
  });

  it("isolates scope teardown to the disposing plugin instance", async () => {
    const service = createCombatAbilityService();
    const ctxA = makeContext("com.hyperforge.combat#scope-a", service);
    const ctxB = makeContext("com.hyperforge.combat#scope-b", service);

    // A registers the default pack.
    const pluginA = combatPluginFactory(DEFAULT_COMBAT_ABILITIES)();
    await pluginA.onEnable?.(ctxA);

    // B registers a single extra ability.
    const extra: CombatAbility = {
      id: "com.hyperforge.combat.kick",
      displayName: "Kick",
      kind: "melee",
      baseDamage: 2,
      accuracy: 0.95,
    };
    const pluginB = combatPluginFactory([extra])();
    await pluginB.onEnable?.(ctxB);
    expect(service.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length + 1);

    // Disposing B's scope should remove only B's contribution.
    await ctxB.scope.dispose();
    expect(service.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);
    expect(service.getAbility(extra.id)).toBeUndefined();
    expect(service.getAbility("com.hyperforge.combat.slash")).toBeDefined();

    // Disposing A's scope removes the rest.
    await ctxA.scope.dispose();
    expect(service.list().size).toBe(0);
  });
});
