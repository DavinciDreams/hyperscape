/**
 * @hyperforge/hyperscape — meta-plugin for the Hyperia game.
 *
 * Phase I4 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md. The "all of
 * Hyperia" loadable: depends on every constituent gameplay plugin
 * (combat first; skills, gathering, prayer, banking, …) and
 * exposes them as a single composed surface so a host can load
 * one entry point to get the full game.
 *
 * Acceptance criterion (Plan §I4):
 *   "Engine core has zero Hyperia-specific imports — everything
 *    game-specific is contributed through this package."
 *
 * Today's surface (cut #1):
 *   - Re-export the constituent plugin's public API so callers can
 *     work with one import (`import { combatPluginFactory } from
 *     "@hyperforge/hyperscape"`)
 *   - Provide a default factory that, when the host instantiates it,
 *     opt-ins to the same lifecycle hooks the constituent plugins
 *     declare. The default is intentionally a no-op for now —
 *     constituent plugins are loaded directly by the host via the
 *     dependency graph (manifest declares `dependencies: [combat]`).
 *
 * Future cuts will compose more plugins (skills, gathering, prayer,
 * banking, etc.) as those packages land. Each addition is a
 * dependency add to plugin.json + a re-export here.
 */

import type {
  HyperforgePlugin,
  PluginContextBase,
  PluginFactory,
} from "@hyperforge/gameplay-framework";
import type { World } from "@hyperforge/shared";

import { MobDeathSystem } from "./systems/MobDeathSystem.js";

// Re-export combat surface so callers have one import path.
export {
  type CombatAbility,
  type CombatAbilityKind,
  type CombatAbilityService,
  type CombatContext,
  combatPluginFactory,
  createCombatAbilityService,
  DEFAULT_COMBAT_ABILITIES,
} from "@hyperforge/combat";

// Re-export skills surface so callers have one import path.
export {
  type SkillCategory,
  type SkillDefinition,
  type SkillsContext,
  type SkillsService,
  createSkillsService,
  DEFAULT_SKILLS,
  skillsPluginFactory,
} from "@hyperforge/skills";

export { manifest } from "./manifest.js";

/**
 * Per-plugin context for the meta-plugin. Empty today — the
 * meta-plugin's lifecycle hooks don't need any handles, since the
 * constituent plugins (loaded by the host via the dependency graph)
 * own their own context shapes. Extends `PluginContextBase` to keep
 * the lifecycle-typing contract consistent.
 */
export interface HyperscapeContext extends PluginContextBase {
  /**
   * The host's world instance. Required so the plugin's `onEnable`
   * can `world.register(...)` the gameplay systems migrated out of
   * `@hyperforge/shared` (first cut: MobDeathSystem). Hosts that
   * don't have a world (e.g. some unit tests) can pass a stub.
   */
  readonly world: World;
}

/**
 * Default plugin factory. Today this is intentionally a no-op
 * lifecycle:
 *   - The constituent plugins (combat for now) are declared as
 *     `dependencies` in plugin.json. The host's load-order resolver
 *     loads them BEFORE this meta-plugin and runs THEIR lifecycle
 *     hooks against THEIR contexts.
 *   - The meta-plugin's onEnable does NOT re-register the
 *     constituent contributions — that would double-register and
 *     conflict with the host's normal lifecycle. The meta-plugin
 *     exists primarily to bundle the dependency graph + provide a
 *     single import surface for callers.
 *
 * Future cuts may add cross-plugin orchestration (e.g. a quest
 * system that references combat abilities + gathering resources +
 * dialogue trees in one bound expression).
 */
const defaultFactory: PluginFactory<HyperscapeContext> = () => {
  const plugin: HyperforgePlugin<HyperscapeContext> = {
    onLoad(_ctx) {
      // No-op. Composition is via dependency graph, not lifecycle.
    },
    onEnable(ctx) {
      // Register migrated gameplay systems on the host world. Each
      // `world.register(name, Ctor)` is mirrored by a scope disposer
      // so `session.stop()` cleanly tears the registration down.
      //
      // First cut (2026-04-24): MobDeathSystem. Future migrations add
      // more `world.register(...)` calls here, one per system moved
      // out of `@hyperforge/shared/src/systems/`. The end-state has
      // every Hyperscape-specific system registered through this
      // hook — `@hyperforge/shared` then contains zero
      // Hyperscape-specific identifiers (master plan criterion #2).
      ctx.world.register("mob-death", MobDeathSystem);
      ctx.scope.register(() => {
        const w = ctx.world as { unregister?: (name: string) => void };
        w.unregister?.("mob-death");
      });
    },
    onDisable(_ctx) {
      // Scope disposers (registered in onEnable) handle teardown.
    },
  };
  return plugin;
};

export default defaultFactory;
