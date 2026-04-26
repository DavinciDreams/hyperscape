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
import {
  lootTablesProvider,
  mobLootTableMappingsProvider,
  registerEntityType,
  type World,
} from "@hyperforge/shared";
import { createDropConditionDispatcher } from "./systems/economy/DropConditionDispatcher.js";
import { installWorldDropConditions } from "./systems/economy/WorldDropConditionEvaluators.js";
import { MobEntity } from "./entities/npc/MobEntity.js";
import { PlayerEntity } from "./entities/player/PlayerEntity.js";
import { PlayerLocal } from "./entities/player/PlayerLocal.js";
import { PlayerRemote } from "./entities/player/PlayerRemote.js";
// Entity classes that migrated to plugin (2026-04-26 follow-up to
// the Entities decoupling refactor).
import { AltarEntity } from "./entities/world/AltarEntity.js";
import { AnvilEntity } from "./entities/world/AnvilEntity.js";
import { BankEntity } from "./entities/world/BankEntity.js";
import { FurnaceEntity } from "./entities/world/FurnaceEntity.js";
import { HeadstoneEntity } from "./entities/world/HeadstoneEntity.js";
import { ItemEntity } from "./entities/world/ItemEntity.js";
import { NPCEntity } from "./entities/npc/NPCEntity.js";
import { RangeEntity } from "./entities/world/RangeEntity.js";
import { ResourceEntity } from "./entities/world/ResourceEntity.js";
import { RunecraftingAltarEntity } from "./entities/world/RunecraftingAltarEntity.js";

import { AggroSystem } from "./systems/AggroSystem.js";
import { BankingSystem } from "./systems/BankingSystem.js";
import { BFSPathDebugSystem } from "./systems/BFSPathDebugSystem.js";
import { ClientTeleportEffectsSystem } from "./systems/ClientTeleportEffectsSystem.js";
import { CoinPouchSystem } from "./systems/CoinPouchSystem.js";
import { DialogueSystem } from "./systems/DialogueSystem.js";
import { CraftingSystem } from "./systems/CraftingSystem.js";
import { DamageSplatSystem } from "./systems/DamageSplatSystem.js";
import { DuelArenaVisualsSystem } from "./systems/DuelArenaVisualsSystem.js";
import { DuelCountdownSplatSystem } from "./systems/DuelCountdownSplatSystem.js";
import { EquipmentVisualSystem } from "./systems/EquipmentVisualSystem.js";
import { FletchingSystem } from "./systems/FletchingSystem.js";
import { GravestoneLootSystem } from "./systems/GravestoneLootSystem.js";
import { GroundItemSystem } from "./systems/GroundItemSystem.js";
import { ZoneDetectionSystem } from "./systems/ZoneDetectionSystem.js";
import { PlayerDeathSystem } from "./systems/PlayerDeathSystem.js";
import { SkillsSystem } from "./systems/SkillsSystem.js";
import { EquipmentSystem } from "./systems/EquipmentSystem.js";
import { InventorySystem } from "./systems/InventorySystem.js";
import { PlayerSystem } from "./systems/PlayerSystem.js";
import { CombatSystem } from "./systems/combat/CombatSystem.js";
import { PathfindingDebugSystem } from "./systems/PathfindingDebugSystem.js";
import { PrayerSystem } from "./systems/PrayerSystem.js";
import { ProcessingSystem } from "./systems/ProcessingSystem.js";
import { StationSpawnerSystem } from "./systems/StationSpawnerSystem.js";
import { HealthBars } from "./systems/HealthBars.js";
import { HealthRegenSystem } from "./systems/HealthRegenSystem.js";
import { ItemSpawnerSystem } from "./systems/ItemSpawnerSystem.js";
import { BridgeSystem } from "./systems/BridgeSystem.js";
import { BuildingRenderingSystem } from "./systems/BuildingRenderingSystem.js";
import { POISystem } from "./systems/POISystem.js";
import { ProceduralDocks } from "./systems/ProceduralDocks.js";
import { ProceduralGrassSystem } from "./systems/ProceduralGrass.js";
import { ResourceSystem } from "./systems/ResourceSystem.js";
import { TownSystem } from "./systems/TownSystem.js";
import { VegetationSystem } from "./systems/VegetationSystem.js";
import { ScriptingSystem } from "./systems/ScriptingSystem.js";
import { LootSystem } from "./systems/LootSystem.js";
import { InventoryInteractionSystem } from "./systems/InventoryInteractionSystem.js";
import { MusicSystem } from "./systems/MusicSystem.js";
import { MobDeathSystem } from "./systems/MobDeathSystem.js";
import { MobNPCSpawnerSystem } from "./systems/MobNPCSpawnerSystem.js";
import { MobNPCSystem } from "./systems/MobNPCSystem.js";
import { NPCSystem } from "./systems/NPCSystem.js";
import { ProjectileRenderer } from "./systems/ProjectileRenderer.js";
import { QuestSystem } from "./systems/QuestSystem.js";
import { ResourceTileDebugSystem } from "./systems/ResourceTileDebugSystem.js";
import { StoreSystem } from "./systems/StoreSystem.js";
import { RunecraftingSystem } from "./systems/RunecraftingSystem.js";
import { SmeltingSystem } from "./systems/SmeltingSystem.js";
import { SmithingSystem } from "./systems/SmithingSystem.js";
import { TanningSystem } from "./systems/TanningSystem.js";
import { TradingSystem } from "./systems/TradingSystem/index.js";
import { DuelSystem } from "./systems/DuelSystem/index.js";
import { PendingTradeManager } from "./systems/PendingTradeManager.js";
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

// TradingSystem + DuelSystem — consumed by `@hyperforge/server` via
// re-export shims (and DuelSystem also by integration tests).
// Migrated from `@hyperforge/shared` (2026-04-26).
export { TradingSystem } from "./systems/TradingSystem/index.js";
export { DuelSystem } from "./systems/DuelSystem/index.js";

// ScriptQueue — tile-based action priority queue, consumed by
// `@hyperforge/server`'s GameTickProcessor. Migrated from
// `@hyperforge/shared` (2026-04-26).
export {
  PlayerScriptQueue,
  NPCScriptQueue,
  ScriptPriority,
  ScriptType,
  type QueuedScript,
  type ModalState,
} from "./systems/ScriptQueue.js";

// PendingTradeManager — consumed by `@hyperforge/server`'s
// PendingTradeManager re-export shim. Migrated from
// `@hyperforge/shared` (Phase D1, 2026-04-26).
export { PendingTradeManager } from "./systems/PendingTradeManager.js";

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

      // Register Hyperia entity types with the engine ECS. Pre-2026-04-26
      // the registry hardcoded these in shared `Entities.ts` —
      // decoupled so the engine no longer imports game classes.
      // Order doesn't matter; lookup is by string key.
      registerEntityType("player", PlayerEntity as never);
      registerEntityType("playerLocal", PlayerLocal as never);
      registerEntityType("playerRemote", PlayerRemote as never);
      registerEntityType("item", ItemEntity as never);
      registerEntityType("mob", MobEntity as never);
      registerEntityType("npc", NPCEntity as never);
      registerEntityType("resource", ResourceEntity as never);
      registerEntityType("headstone", HeadstoneEntity as never);
      registerEntityType("bank", BankEntity as never);
      registerEntityType("furnace", FurnaceEntity as never);
      registerEntityType("anvil", AnvilEntity as never);
      registerEntityType("altar", AltarEntity as never);
      registerEntityType("range", RangeEntity as never);
      registerEntityType(
        "runecrafting_altar",
        RunecraftingAltarEntity as never,
      );

      // Cross-cutting systems that run on both server + client.
      register("mob-death", MobDeathSystem);
      register("gravestone-loot", GravestoneLootSystem);

      // Coin pouch — OSRS-style separate-from-inventory currency.
      // Lazy-looked-up by InventorySystem (in shared) at
      // PLAYER_REGISTERED time, so plugin onEnable's later
      // registration order is fine.
      register("coin-pouch", CoinPouchSystem);

      // Prayer — OSRS prayer points / drain / bonus calculations.
      // CombatSystem (in shared) duck-types the surface it needs
      // and looks up via getSystem at runtime. Self-gates internally
      // on world.isServer for server-only branches.
      register("prayer", PrayerSystem);

      // Banking — one bank per starter town, unlimited slots,
      // drag-to-store interface. No in-shared callers reference the
      // class type; SystemMap downgraded to `unknown`.
      register("banking", BankingSystem);

      // Stores — OSRS general stores. Per-player open/close session
      // handler; reads catalog from `storesRegistry` + `GENERAL_STORES`.
      register("store", StoreSystem);

      // NPC dialogue — tree processor + authored-dialogue runner.
      // PIE + WorldDialogueConditionEvaluators (in shared) duck-type
      // the surface they need.
      register("dialogue", DialogueSystem);

      // Quests — manifest-driven quest tracking with kill objectives,
      // stage progression, item rewards. PIE + dialogue + drop-condition
      // evaluators + the server quest handler all duck-type the surface
      // they need from this system.
      register("quest", QuestSystem);

      // Aggro — mob aggression detection + chase + tile-based 21x21
      // region spatial index. Only MobEntity touches it directly (via
      // a duck-typed `getPlayersInNearbyRegions` call).
      register("aggro", AggroSystem);

      // Processing — firemaking + cooking interaction handler.
      // Per-skill processing systems already registered above.
      register("processing", ProcessingSystem);

      // Mob NPC core — owns mob lifecycle (spawn, despawn, leash,
      // respawn timer). Migrated 2026-04-25 (Wave 3a). Must register
      // before "mob-npc-spawner" so the spawner's lookup hits.
      register("mob-npc", MobNPCSystem);

      // NPC interactions — banker + shopkeeper handlers. Server-only
      // logically (it answers PLAYER_INTERACT events) but registered
      // cross-cutting so client-side `getSystem("npc")` lookups don't
      // null-out in the legacy code paths still expecting it.
      register("npc", NPCSystem);

      // Station spawner — places banks/furnaces/anvils/altars/ranges
      // from world-areas.json + stations.json. Static spawn at boot.
      register("station-spawner", StationSpawnerSystem);

      // Mob spawner — reads world-areas.json + npcs.json, spawns
      // MobEntity instances via EntityManager + handles respawn after
      // death. Cross-cutting registration so client-side `getSystem
      // ("mob-npc-spawner")` lookups don't null in legacy paths.
      register("mob-npc-spawner", MobNPCSpawnerSystem);

      // Item spawner — places ground items from world-areas.json.
      // Same EntityManager-driven pattern as mob spawner.
      register("item-spawner", ItemSpawnerSystem);

      // Ground items — tile-based pile manager for dropped items.
      // Migrated 2026-04-25 (Wave 1 follow-up). LootSystem +
      // PlayerDeathSystem + InventorySystem all reach this via
      // `world.getSystem("ground-items")` so it must register before
      // `loot`.
      register("ground-items", GroundItemSystem);

      // Zone detection — single source of truth for safe / pvp /
      // wilderness lookups. Migrated 2026-04-25. CombatSystem
      // (still in shared) looks it up via
      // `world.getSystem("zone-detection")`, so it must register
      // before SystemLoader runs.
      register("zone-detection", ZoneDetectionSystem);

      // Player — central player lifecycle, stats, health, attack
      // styles, persistence. Migrated 2026-04-26 (Wave 5d) with
      // EatDelayManager + BuryDelayManager helpers. Many plugin and
      // shared systems look this up via `world.getSystem("player")`,
      // so it registers FIRST in the cluster.
      register("player", PlayerSystem);

      // Inventory — slot-based item storage with stack management
      // + DB persistence. Migrated 2026-04-26 (Wave 5c). Many
      // plugin systems (PlayerDeathSystem, EquipmentSystem,
      // QuestSystem, LootSystem, …) depend on it, so it registers
      // before player-death.
      register("inventory", InventorySystem);

      // Combat — full melee/ranged/magic engine + handlers + state
      // services + anti-cheat. Migrated 2026-04-26 (Wave 6) — last
      // big migration. ~9000 LOC across 25 files
      // (CombatSystem, AmmunitionService, RuneService, SpellService,
      // CombatAnimationManager, CombatAntiCheat, CombatStateService,
      // PidManager, etc.).
      register("combat", CombatSystem);

      // Player death — handles inventory drop, gravestone spawn,
      // respawn timer. Migrated 2026-04-26 with its 3 internal
      // helpers (DeathStateManager, SafeAreaDeathHandler,
      // WildernessDeathHandler). Depends on zone-detection +
      // ground-items + inventory so registers after them.
      register("player-death", PlayerDeathSystem);

      // Skills — XP table + skill data + combat-level calculation.
      // Migrated 2026-04-26 (Wave 5a). CombatSystem +
      // WorldDropConditionEvaluators + WorldDialogueConditionEvaluators
      // (still in shared) all duck-type-lookup `world.getSystem("skills")`.
      register("skills", SkillsSystem);

      // Equipment — slot-based wear / unequip + stat bonus
      // computation + DB persistence. Migrated 2026-04-26 (Wave 5b).
      // CombatSystem + AttackContext (still in shared) duck-type
      // lookup `world.getSystem("equipment")`. Depends on
      // InventorySystem (still in shared).
      register("equipment", EquipmentSystem);

      // Loot system — drops mob loot to the ground via
      // GroundItemSystem on `NPC_DIED`. Boot-time DropCondition
      // dispatcher install + authored manifest seeding lives below
      // in the server-only `if (ctx.world.isServer)` branch.
      register("loot", LootSystem);

      // Resource system — gathering nodes (trees, rocks, fishing
      // spots). Wave 1 of the heavy-cluster migration; the
      // gathering/ subdirectory co-migrated.
      register("resource", ResourceSystem);

      // Town system — procedural town generation, building layout,
      // safe-zone resolution, and building collision. Wave 2 of
      // the heavy-cluster migration. Cross-cutting: TerrainSystem,
      // GrassExclusionGrid, ZoneDetectionSystem, and mob tile
      // movement all duck-type-lookup `world.getSystem("towns")`.
      register("towns", TownSystem);

      // Bridges — collision + procedural deck/fence geometry.
      // Both client and server register it: server computes
      // walkable bridge tiles + WATER overrides; client adds the
      // procedural mesh.
      register("bridges", BridgeSystem);

      // Docks — same shape as bridges (collision + procedural
      // deck/fence). Server computes walkable dock tiles +
      // WATER overrides; client adds the procedural mesh.
      register("docks", ProceduralDocks);

      // POIs — procedural points-of-interest (dungeons, shrines,
      // landmarks). Read by RoadNetworkSystem (still in shared)
      // via duck-typed `getConfig()` lookup.
      register("pois", POISystem);

      // Scripting — visual scripting runtime. Subscribes to
      // trigger events, auto-loads entity behaviorGraphs on spawn,
      // processes delayed continuations. Interpreter engine +
      // sibling helpers stay in shared so PIEScriptRunner can
      // consume them directly at PIE-bundle time.
      register("scripting", ScriptingSystem);

      // Duel arena visuals — procedural arena geometry + PhysX wall
      // collision. System self-gates mesh logic on `world.isClient`;
      // server-side stays headless. Original env-gating on
      // DUEL_ARENA_VISUALS_ENABLED preserved (SystemLoader → here,
      // 2026-04-26).
      if (process.env.DUEL_ARENA_VISUALS_ENABLED !== "false") {
        try {
          register("duel-arena-visuals", DuelArenaVisualsSystem);
        } catch (err) {
          console.error(
            "[hyperscape-plugin] Failed to register DuelArenaVisualsSystem:",
            err,
          );
        }
      }

      // Tile-based skill processing systems — all self-gate their
      // init() on world.isServer. Safe to register on both sides.
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

        // Wire pluggable DropCondition evaluator + boot-time
        // authored loot-tables / mob→table mappings seed.
        // Originally lived in shared SystemLoader.init(); migrated
        // here 2026-04-26 alongside DropConditionDispatcher /
        // WorldDropConditionEvaluators / LootTableService /
        // LootPermissionService.
        const lootSystem = ctx.world.getSystem("loot") as unknown as {
          setDropConditionEvaluator(evaluator: unknown): void;
          setAuthoredLootTables(manifest: unknown): void;
          setMobLootTableMappings(
            mappings: ReadonlyMap<string, string> | Record<string, string>,
          ): void;
        } | null;
        if (lootSystem) {
          const dispatcher = createDropConditionDispatcher();
          installWorldDropConditions(dispatcher, ctx.world);
          lootSystem.setDropConditionEvaluator(dispatcher.evaluate);

          if (lootTablesProvider.isLoaded()) {
            lootSystem.setAuthoredLootTables(lootTablesProvider.getManifest());
          }
          if (mobLootTableMappingsProvider.isLoaded()) {
            lootSystem.setMobLootTableMappings(
              mobLootTableMappingsProvider.getMappings(),
            );
          }
        }

        // Trading system — instantiation + init + destroy lifecycle
        // owned by the plugin (migrated from `ServerNetwork.start()` /
        // `.destroy()` 2026-04-26). The instance is pinned to
        // `world.tradingSystem` so the existing
        // `getTradingSystem(world)` lookup helper used by trade
        // network handlers resolves unchanged.
        const tradingSystem = new TradingSystem(ctx.world);
        tradingSystem.init();
        (ctx.world as { tradingSystem?: TradingSystem }).tradingSystem =
          tradingSystem;
        ctx.scope.register(() => {
          tradingSystem.destroy();
          delete (ctx.world as { tradingSystem?: TradingSystem }).tradingSystem;
        });

        // PendingTradeManager — server-authoritative
        // "walk to player and trade" state machine. Migrated to plugin
        // 2026-04-26 (PLAN_ENGINE_API_EXTRACTION.md Phase D1) once
        // the substrate ITileMovementService was pinned to
        // `world.tileMovement` from ServerNetwork's constructor
        // (Phase B4). Constructor reads `world.tileMovement` directly
        // — by the time onEnable runs, it's populated in both server
        // and PIE boot orders. ServerNetwork resolves
        // `world.pendingTradeManager` lazily in its tick callback +
        // disconnect handler.
        const pendingTradeManager = new PendingTradeManager(ctx.world);
        (
          ctx.world as { pendingTradeManager?: PendingTradeManager }
        ).pendingTradeManager = pendingTradeManager;
        ctx.scope.register(() => {
          delete (ctx.world as { pendingTradeManager?: PendingTradeManager })
            .pendingTradeManager;
        });

        // Duel system — same manual-lifecycle pattern as
        // TradingSystem (migrated 2026-04-26). MUST register BEFORE
        // ServerNetwork.init() since ServerNetwork now resolves the
        // instance via `world.duelSystem` at start time and throws if
        // missing. ServerNetwork's tick processor + onPlayerDisconnect
        // / onPlayerReconnect handlers also resolve via this property.
        // The `systemsByName.set("duel", ...)` registration mirrors
        // the previous ServerNetwork.start() behavior so combat.ts
        // can `world.getSystem("duel")` to detect duel combat.
        const duelSystem = new DuelSystem(ctx.world);
        (ctx.world as { duelSystem?: DuelSystem }).duelSystem = duelSystem;
        (
          ctx.world as { systemsByName: Map<string, unknown> }
        ).systemsByName.set("duel", duelSystem);
        duelSystem.init();
        ctx.scope.register(() => {
          duelSystem.destroy();
          delete (ctx.world as { duelSystem?: DuelSystem }).duelSystem;
          (
            ctx.world as { systemsByName: Map<string, unknown> }
          ).systemsByName.delete("duel");
        });
      }

      // Client-only visual feedback systems. Original SystemLoader
      // gated these on `if (world.isClient)`. Mirror that here so the
      // server boot doesn't try to instantiate THREE.Sprite-based
      // visual systems.
      if (!ctx.world.isServer) {
        register("damage-splat", DamageSplatSystem);
        register("duel-countdown-splat", DuelCountdownSplatSystem);
        // VRM bone-attached weapons / armor / accessories. Helpers
        // (`attachEquipmentVisualToVRM` etc.) stay in shared because
        // asset-forge consumes them as part of the public API.
        register("equipment-visual", EquipmentVisualSystem);
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
        // Home-teleport blue-helix VFX. Driven by `home_teleport:start`
        // / `:cancel` events from PlayerSystem. OSRS teleport feel.
        register("teleport-effects", ClientTeleportEffectsSystem);
        // Debug overlays — toggled via F5 panel keys (B / W) and 'P'.
        register("bfsPathDebug", BFSPathDebugSystem);
        register("walkableDebug", WalkableTileDebugSystem);
        // Building-pathfinding debug overlay (P key). Opt-in via
        // world.pathfindingDebug.setEnabled(true).
        register("pathfindingDebug", PathfindingDebugSystem);
        // Resource tile occupancy debug — opt-in via
        // world.resourceTileDebug.setEnabled(true).
        register("resource-tile-debug", ResourceTileDebugSystem);
        // Background music with combat-aware crossfade. Web Audio
        // API + ClientAudio + ClientLoader — strictly client-side.
        register("music", MusicSystem);
        // GPU-instanced vegetation rendering (trees/bushes/grass/
        // flowers/rocks). Uses biome vegetation config and listens
        // to TerrainSystem tile events for generation triggers.
        // Strictly client-side (purely visual).
        register("vegetation", VegetationSystem);
        // Procedural town buildings — LOD batching, dynamic
        // impostor atlas, lazy collision. Reads building placement
        // data from TownSystem (still in shared).
        register("building-rendering", BuildingRenderingSystem);
        // Procedural grass — GPU instanced + heightmap fallback.
        // Mutable shader state (grid exclusion, character bending)
        // owned by `GrassSharedRegistry` in shared so in-shared
        // sibling modules (`GrassExclusionGrid`,
        // `CharacterInfluenceManager`) can push updates.
        register("grass", ProceduralGrassSystem);
        // Drag-and-drop + right-click context menus. Originally
        // registered inside `if (world.isClient)` in SystemLoader.
        // Stats reader (`getSystemInfo`) is duck-typed at the
        // SystemLoader callsite.
        register("inventory-interaction", InventoryInteractionSystem);
      }
    },
    onDisable(_ctx) {
      // Scope disposers (registered in onEnable) handle teardown.
    },
  };
  return plugin;
};

export default defaultFactory;
