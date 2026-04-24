/**
 * Shooter-demo plugin tests.
 *
 * Two layers of evidence:
 *
 * 1. Unit: manifest parses, factory produces a valid plugin, the
 *    shoot ability makes it through onEnable → service.
 *
 * 2. Acceptance: THE CRITICAL PROOF. Boot two independent plugin
 *    sessions side-by-side — one with the Hyperscape meta-plugin
 *    stack (combat + skills + hyperscape), one with the shooter
 *    demo (combat + shooter-demo). Assert:
 *      - Both sessions run to completion with no failures.
 *      - They produce DIFFERENT ability sets in their respective
 *        CombatAbilityService instances.
 *      - Neither session leaks into the other — session.stop() on
 *        one doesn't touch the other's state.
 *      - The shooter demo does NOT register Hyperscape's abilities,
 *        and Hyperscape does NOT register the shoot ability.
 *
 *    This is the master-plan criterion #4 acceptance test: "a new
 *    game can be built in World Studio by loading plugins." Today
 *    we prove it at the framework level (two plugin sessions
 *    coexist); the in-editor Play-button UX comes later.
 */

import { describe, expect, it } from "vitest";

import {
  PluginManifestSchema,
  startPluginSessionFromModules,
  type LoadedPluginModule,
  type PluginContextBase,
} from "@hyperforge/gameplay-framework";
import {
  combatPluginFactory,
  createCombatAbilityService,
  DEFAULT_COMBAT_ABILITIES,
  manifest as combatManifest,
  type CombatAbilityService,
  type CombatContext,
} from "@hyperforge/combat";

import {
  manifest as shooterManifest,
  SHOOT_ABILITY,
  shooterDemoPluginFactory,
} from "../index.js";

describe("@hyperforge/plugin-shooter-demo — unit", () => {
  it("ships a plugin.json that parses through PluginManifestSchema", () => {
    const parsed = PluginManifestSchema.parse(shooterManifest);
    expect(parsed.id).toBe("com.hyperforge.plugin-shooter-demo");
    expect(parsed.version).toBe("0.1.0");
    expect(parsed.hyperforgeApi).toBe("0.1.0");
    expect(parsed.enabledByDefault).toBe(false);
  });

  it("declares dependency on @hyperforge/combat (ability registry)", () => {
    expect(shooterManifest.dependencies).toContainEqual(
      expect.objectContaining({ id: "com.hyperforge.combat" }),
    );
  });

  it("does NOT declare dependency on @hyperforge/skills", () => {
    // Whole point of the acceptance test: a different game has a
    // different dependency graph. Shooter doesn't use skills.
    for (const dep of shooterManifest.dependencies) {
      expect(dep.id).not.toBe("com.hyperforge.skills");
    }
  });

  it("default ability set contains 'demo-shoot'", () => {
    expect(SHOOT_ABILITY.id).toBe("demo-shoot");
    expect(SHOOT_ABILITY.kind).toBe("ranged");
  });
});

describe("@hyperforge/plugin-shooter-demo — acceptance (second-game proof)", () => {
  it("shooter-demo plugin stack produces a different ability set than Hyperscape", async () => {
    // Stack A: combat + shooter-demo (a non-Hyperscape game).
    const shooterService = createCombatAbilityService();
    const shooterModules: ReadonlyArray<LoadedPluginModule<PluginContextBase>> =
      [
        {
          manifest: combatManifest,
          factory: combatPluginFactory([]),
          // ^ combat plugin with NO default abilities — shooter demo
          //   owns the ability set. Mirrors how a real alternate
          //   game would configure the constituent plugin.
        },
        {
          manifest: shooterManifest,
          factory: shooterDemoPluginFactory(),
        },
      ];

    const shooterSession = await startPluginSessionFromModules(shooterModules, {
      contextFactory: ({ pluginId, scope }) => {
        if (pluginId === combatManifest.id || pluginId === shooterManifest.id) {
          const ctx: CombatContext = {
            pluginId,
            scope,
            registerAbility(ability) {
              shooterService.registerAbility(ability);
              scope.register(() =>
                shooterService.unregisterAbility(ability.id),
              );
            },
          };
          return ctx as PluginContextBase;
        }
        return { pluginId, scope };
      },
    });

    // Stack B: combat + hyperscape default pack (Hyperscape's existing
    // gameplay). We simulate the Hyperscape side by loading combat
    // with the DEFAULT_COMBAT_ABILITIES starter pack — same as
    // packages/server/src/startup/plugins.ts does in production.
    const hyperscapeService = createCombatAbilityService();
    const hyperscapeModules: ReadonlyArray<
      LoadedPluginModule<PluginContextBase>
    > = [
      {
        manifest: combatManifest,
        factory: combatPluginFactory(DEFAULT_COMBAT_ABILITIES),
      },
    ];

    const hyperscapeSession = await startPluginSessionFromModules(
      hyperscapeModules,
      {
        contextFactory: ({ pluginId, scope }) => {
          const ctx: CombatContext = {
            pluginId,
            scope,
            registerAbility(ability) {
              hyperscapeService.registerAbility(ability);
              scope.register(() =>
                hyperscapeService.unregisterAbility(ability.id),
              );
            },
          };
          return ctx as PluginContextBase;
        },
      },
    );

    // ────────── PROOF ──────────

    // Both sessions ran to completion, no failures.
    expect(shooterSession.failedPackages).toEqual([]);
    expect(shooterSession.unresolvable).toEqual([]);
    expect(hyperscapeSession.failedPackages).toEqual([]);
    expect(hyperscapeSession.unresolvable).toEqual([]);

    // Shooter stack: shoot ability is registered.
    expect(shooterService.getAbility("demo-shoot")).toBeDefined();
    expect(shooterService.getAbility("demo-shoot")?.kind).toBe("ranged");

    // Hyperscape stack: does NOT have the demo-shoot ability.
    expect(hyperscapeService.getAbility("demo-shoot")).toBeUndefined();

    // Hyperscape stack: has its default starter pack (3 abilities).
    expect(hyperscapeService.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);

    // Shooter stack: has ONLY the shoot ability.
    expect(shooterService.list().size).toBe(1);

    // No cross-contamination: Hyperscape's abilities are not in the
    // shooter service, and vice versa.
    for (const ability of DEFAULT_COMBAT_ABILITIES) {
      expect(shooterService.getAbility(ability.id)).toBeUndefined();
    }

    // ────────── TEARDOWN ISOLATION ──────────

    // Stopping the shooter session must not touch hyperscape state.
    await shooterSession.stop();
    expect(shooterService.list().size).toBe(0);
    expect(hyperscapeService.list().size).toBe(DEFAULT_COMBAT_ABILITIES.length);

    // Stopping hyperscape after shooter also cleans up.
    await hyperscapeSession.stop();
    expect(hyperscapeService.list().size).toBe(0);
  });

  it("toposort resolves shooter-demo to load AFTER its combat dependency", async () => {
    const service: CombatAbilityService = createCombatAbilityService();
    const modules: ReadonlyArray<LoadedPluginModule<PluginContextBase>> = [
      // Deliberately pass shooter-demo FIRST — the resolver must
      // reorder so combat starts before it.
      {
        manifest: shooterManifest,
        factory: shooterDemoPluginFactory(),
      },
      {
        manifest: combatManifest,
        factory: combatPluginFactory([]),
      },
    ];

    const session = await startPluginSessionFromModules(modules, {
      contextFactory: ({ pluginId, scope }) => {
        const ctx: CombatContext = {
          pluginId,
          scope,
          registerAbility(ability) {
            service.registerAbility(ability);
            scope.register(() => service.unregisterAbility(ability.id));
          },
        };
        return ctx as PluginContextBase;
      },
    });

    const indexOf = (id: string) =>
      session.records.findIndex((r) => r.manifest.id === id);

    expect(indexOf(combatManifest.id)).toBeLessThan(
      indexOf(shooterManifest.id),
    );

    await session.stop();
  });
});
