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

import { BFSPathDebugSystem } from "./systems/BFSPathDebugSystem.js";
import { CraftingSystem } from "./systems/CraftingSystem.js";
import { DamageSplatSystem } from "./systems/DamageSplatSystem.js";
import { DuelCountdownSplatSystem } from "./systems/DuelCountdownSplatSystem.js";
import { FletchingSystem } from "./systems/FletchingSystem.js";
import { GravestoneLootSystem } from "./systems/GravestoneLootSystem.js";
import { HealthBars } from "./systems/HealthBars.js";
import { HealthRegenSystem } from "./systems/HealthRegenSystem.js";
import { MobDeathSystem } from "./systems/MobDeathSystem.js";
import { ProjectileRenderer } from "./systems/ProjectileRenderer.js";
import { ResourceTileDebugSystem } from "./systems/ResourceTileDebugSystem.js";
import { RunecraftingSystem } from "./systems/RunecraftingSystem.js";
import { SmeltingSystem } from "./systems/SmeltingSystem.js";
import { SmithingSystem } from "./systems/SmithingSystem.js";
import { TanningSystem } from "./systems/TanningSystem.js";
import { WalkableTileDebugSystem } from "./systems/WalkableTileDebugSystem.js";
import { WaterfallVisualsSystem } from "./systems/WaterfallVisualsSystem.js";
import { ZoneVisualsSystem } from "./systems/ZoneVisualsSystem.js";

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
      // The end-state has EVERY Hyperscape-specific system registered
      // through this hook — `@hyperforge/shared` then contains zero
      // Hyperscape-specific identifiers (master plan criterion #2).
      const w = ctx.world as { unregister?: (name: string) => void };
      const register = (name: string, Ctor: unknown) => {
        ctx.world.register(name, Ctor as never);
        ctx.scope.register(() => w.unregister?.(name));
      };

      // Cross-cutting systems that run on both server + client.
      register("mob-death", MobDeathSystem);
      register("gravestone-loot", GravestoneLootSystem);

      // OSRS skill processing systems — all self-gate their init()
      // on world.isServer. Safe to register on both sides.
      register("tanning", TanningSystem);
      register("smithing", SmithingSystem);
      register("smelting", SmeltingSystem);
      register("crafting", CraftingSystem);
      register("fletching", FletchingSystem);
      register("runecrafting", RunecraftingSystem);

      // Server-only systems — original SystemLoader gated registration
      // itself on `isServerEnvironment`. Preserve that behavior so
      // client builds don't pay the registration cost.
      if (ctx.world.isServer) {
        register("health-regen", HealthRegenSystem);
      }

      // Client-only visual feedback systems. Original SystemLoader
      // gated these on `if (world.isClient)`. Mirror that here so the
      // server boot doesn't try to instantiate THREE.Sprite-based
      // visual systems.
      if (!ctx.world.isServer) {
        register("damage-splat", DamageSplatSystem);
        register("duel-countdown-splat", DuelCountdownSplatSystem);
        register("projectile-renderer", ProjectileRenderer);
        // Procedural-river TSL waterfall renderer — purely visual,
        // self-no-op when there are no river-derived definitions.
        register("waterfall-visuals", WaterfallVisualsSystem);
        // Per-entity HP bars — single instanced TSL mesh keyed by
        // entity id. OSRS pattern (right-click menus carry names;
        // bars carry HP percent).
        register("healthbars", HealthBars);
        // Zone overlays (skull / home / swords) + chat warnings on
        // wilderness/town/arena boundary crossings. Reads
        // ZoneDetectionSystem live from world (which still lives
        // in shared because combat consumes it).
        register("zone-visuals", ZoneVisualsSystem);
        // Debug overlays — toggled via F5 panel keys (B / W).
        register("bfsPathDebug", BFSPathDebugSystem);
        register("walkableDebug", WalkableTileDebugSystem);
        // Resource tile occupancy debug — opt-in via
        // world.resourceTileDebug.setEnabled(true).
        register("resource-tile-debug", ResourceTileDebugSystem);
      }
    },
    onDisable(_ctx) {
      // Scope disposers (registered in onEnable) handle teardown.
    },
  };
  return plugin;
};

export default defaultFactory;
