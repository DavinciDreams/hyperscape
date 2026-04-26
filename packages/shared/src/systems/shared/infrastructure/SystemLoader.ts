/**
 * SystemLoader.ts - RPG Game Systems Registration
 *
 * Central registration point for all RPG gameplay systems. This module is responsible
 * for loading and configuring all game systems into a World instance in the correct order.
 *
 * Systems Registered:
 *
 * **Core Game Systems:**
 * - ActionRegistry: Registers all available player actions
 * - PersistenceSystem: Database save/load for player data
 * - PlayerSystem: Player lifecycle, stats, health, stamina
 * - InventorySystem: Item storage and management (28 slots)
 * - EquipmentSystem: Worn items and equipment bonuses
 * - SkillsSystem: Experience, levels, and skill progression
 * - BankingSystem: Bank storage across multiple locations
 *
 * **Combat Systems:**
 * - CombatSystem: Melee, ranged, and magic combat mechanics
 * - PlayerDeathSystem: Handles player death and respawning
 * - AggroSystem: Enemy threat and aggression management
 * - (MobDeathSystem moved to @hyperforge/hyperscape plugin 2026-04-24)
 *
 * **World Systems:**
 * - MobNPCSystem: Mob NPC (mob, boss, quest) lifecycle and behavior
 * - NPCSystem: Non-hostile character management
 * - MobNPCSpawnerSystem: Dynamic mob NPC population control
 * - ResourceSystem: Gathering nodes (trees, rocks, ore)
 * - ItemSpawnerSystem: Ground item management
 *
 * **Interaction Systems:**
 * - InteractionSystem: Player-entity interaction handling
 * - InventoryInteractionSystem: Item usage and consumption
 * - LootSystem: Item drops and loot tables
 * - StoreSystem: Shop management and trading
 *
 * **Processing:**
 * - ProcessingSystem: Background jobs and async tasks
 * - EntityManager: Entity spawning and management utilities
 *
 * API Flattening:
 * This module also "flattens" system APIs onto the World instance for easier access:
 * - world.getRPGPlayer() instead of world.getSystem('player')?.getPlayer()
 * - world.getInventory() instead of world.getSystem('inventory')?.getInventory()
 * - world.startCombat() instead of world.getSystem('combat')?.startCombat()
 *
 * This makes the API more discoverable and reduces boilerplate in game code.
 *
 * Usage:
 * Called by createClientWorld() and createServerWorld() during world initialization:
 * ```typescript
 * await registerSystems(world);
 * // All RPG systems are now registered and ready
 * ```
 *
 * Used by: createClientWorld.ts, createServerWorld.ts
 * References: All RPG system implementations
 */
import { Component, ComponentConstructor } from "../../../components";
import { CombatComponent } from "../../../components/CombatComponent";
import { DataComponent } from "../../../components/DataComponent";
import { registerComponent } from "../../../components/index";
import { InteractionComponent } from "../../../components/InteractionComponent";
import { StatsComponent } from "../../../components/StatsComponent";
import { UsageComponent } from "../../../components/UsageComponent";
import { VisualComponent } from "../../../components/VisualComponent";
import { dataManager } from "../../../data/DataManager";
import { Entity } from "../../../entities/Entity";
import * as THREE from "../../../extras/three/three";
import type {
  Inventory,
  InventorySlotItem,
  Item,
  PlayerInventory,
  Position3D,
  Skills,
} from "../../../types/core/core";
import type { PlayerRow } from "../../../types/network/database";
import type { EntityConfig } from "../../../types/entities";
import { EventType } from "../../../types/events";
import type { AppConfig, TerrainConfig } from "../../../types/core/settings";
import { getSystem } from "../../../utils/SystemUtils";
import type { World } from "../../../core/World";
import { System } from "./System";
import { MobInstancedRenderer } from "../../../utils/rendering/InstancedMeshManager";
import { ImpostorManager } from "../rendering";
import { MeshBasicNodeMaterial } from "three/webgpu";

// Helper function to check truthy values
function isTruthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

// Import systems
// AggroSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// BankingSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// CoinPouchSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// CombatSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 6).
import type { DatabaseSystem } from "../../../types/systems/system-interfaces";
// PlayerDeathSystem migrated to @hyperforge/hyperscape (2026-04-26).
import { EntityManager } from "..";
// EquipmentSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5b).
// InventoryInteractionSystem migrated to @hyperforge/hyperscape
// (2026-04-25). The lone external touchpoint is the
// `getSystemInfo()` stats reader below — duck-typed inline.
// InventorySystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5c).
// ItemSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// MobNPCSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// StationSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// MobNPCSystem migrated to @hyperforge/hyperscape (2026-04-25, Wave 3a).
import { PersistenceSystem } from "../../server/PersistenceSystem";
// PlayerSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5d).
// ProcessingSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// ResourceSystem migrated to @hyperforge/hyperscape (2026-04-25,
// Wave 1). Field downgraded to `unknown`.
// StoreSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.

// New MMO-style Systems
// NOTE: Import directly from specific files to avoid circular dependency through barrel file
// The barrel file (systems/client/index.ts) exports ClientNetwork which imports PlayerLocal
// which extends Entity, causing a circular dependency during module initialization
import { InteractionRouter } from "../../client/interaction";
// LootSystem migrated to @hyperforge/hyperscape (2026-04-25). The
// surface SystemLoader needs (3 setters used during boot-time
// dispatcher install + manifest seeding) is duck-typed locally
// below so we don't depend on the migrated class.
// GravestoneLootSystem migrated to @hyperforge/hyperscape (2026-04-24)
// GroundItemSystem migrated to @hyperforge/hyperscape (2026-04-25).
import { createDropConditionDispatcher } from "../economy/DropConditionDispatcher";
import { installWorldDropConditions } from "../economy/WorldDropConditionEvaluators";
import { installWorldDialogueConditions } from "../interaction/WorldDialogueConditionEvaluators";
import { dialogueConditionBindingsProvider } from "../../../data/DialogueConditionBindingsProvider";
import { lootTablesProvider } from "../../../data/LootTablesProvider";
import { mobLootTableMappingsProvider } from "../../../data/MobLootTableMappingsProvider";
import { dialogueProvider } from "../../../data/DialogueProvider";
import { npcDialogueBindingsProvider } from "../../../data/NpcDialogueBindingsProvider";
import { localizationProvider } from "../../../data/LocalizationProvider";
import { LocalizationCatalog } from "../../../localization";
import { generateKillToken } from "../../../utils/game/KillTokenUtils";
// Movement now handled by physics in PlayerLocal
// CameraSystem is ClientCameraSystem
// UI components are React-based in the client package

// World Content Systems
// NPCSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// DialogueSystem migrated to @hyperforge/hyperscape (2026-04-25).
// Local duck-typed shape for the surface SystemLoader's boot-time
// seeding code uses (3 setter methods + the
// `installWorldDialogueConditions` adapter signature).
import type { DialogueManifest } from "@hyperforge/manifest-schema";
interface DialogueSystem {
  setAuthoredDialogues(
    manifest: DialogueManifest | null,
    opts?: { preserveOpenSessionsByTreeId?: boolean },
  ): void;
  setAuthoredNpcDialogueBindings(bindings: Record<string, string> | null): void;
  setLocalizationCatalog(catalog: LocalizationCatalog | null): void;
  registerConditionEvaluator(
    name: string,
    evaluator: (args: {
      readonly playerId: string;
      readonly npcId: string;
      readonly npcEntityId?: string;
    }) => boolean,
  ): void;
  unregisterConditionEvaluator(name: string): void;
}
// — registered by the plugin's onEnable cross-cutting branch.
// ScriptingSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemsRegistry field downgraded to `unknown`; the plugin
// onEnable cross-cutting branch handles registration.

// Client-only visual systems
// NOTE: Import directly from specific files to avoid circular dependency
// DamageSplatSystem migrated to @hyperforge/hyperscape (2026-04-24)
// DuelCountdownSplatSystem migrated to @hyperforge/hyperscape (2026-04-24)
// ProjectileRenderer migrated to @hyperforge/hyperscape (2026-04-24)
import { SocialSystem } from "../../client/SocialSystem";
import { DuelArenaVisualsSystem } from "../../client/DuelArenaVisualsSystem";

// Zone systems
// ZoneDetectionSystem migrated to @hyperforge/hyperscape (2026-04-25).

import type { CameraSystem as CameraSystemInterface } from "../../../types/systems/physics";
import { ActionRegistry } from "..";
// SkillsSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5a).
// SmeltingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// SmithingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// CraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// FletchingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// RunecraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// TanningSystem migrated to @hyperforge/hyperscape (2026-04-24)
// HealthRegenSystem migrated to @hyperforge/hyperscape (2026-04-24)
// PrayerSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.
// QuestSystem migrated to @hyperforge/hyperscape (2026-04-25)
// — registered by the plugin's onEnable cross-cutting branch.

/** Minimal contract for the client-side movement system (physics-based in PlayerLocal) */
interface MovementSystemLike {
  teleportPlayer?(id: string, pos: Position3D): boolean | Promise<boolean>;
  isMoving?(id: string): boolean;
  movePlayer?(id: string, pos: Position3D): void;
}

// Interface for the systems collection
export interface Systems {
  actionRegistry?: ActionRegistry;
  database?: DatabaseSystem;
  // PlayerSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  player?: unknown;
  // InventorySystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  inventory?: unknown;
  // CombatSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  combat?: unknown;
  // SkillsSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  skills?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown` so
  // SystemLoader's bookkeeping object still compiles.
  banking?: unknown;
  interaction?: InteractionRouter;
  // MobNPCSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  mobNpc?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  store?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  resource?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  aggro?: unknown;
  // EquipmentSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  equipment?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  processing?: unknown;
  entityManager?: EntityManager;
  // PlayerDeathSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  playerDeath?: unknown;
  // mobDeath: registered by @hyperforge/hyperscape plugin (2026-04-24)
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  inventoryInteraction?: unknown;
  // GroundItemSystem migrated to @hyperforge/hyperscape — typed as `unknown`.
  groundItems?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`. Boot-time
  // dispatcher install + manifest seed below uses a local duck-type
  // for the surface SystemLoader actually touches.
  loot?: unknown;
  cameraSystem?: CameraSystemInterface;
  movementSystem?: MovementSystemLike;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  npc?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  mobNpcSpawner?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  stationSpawner?: unknown;
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  itemSpawner?: unknown;
  // healthRegen: registered by @hyperforge/hyperscape plugin (2026-04-24)
  // Migrated to @hyperforge/hyperscape — typed as `unknown`.
  scripting?: unknown;
}

/**
 * Register all systems with a Hyperia world
 * This is the main entry point called by the bootstrap
 */
export async function registerSystems(world: World): Promise<void> {
  // Use a centralized logger
  const _logger = (world as { logger?: { system: (msg: string) => void } })
    .logger;

  // Allow disabling all RPG registrations via env flag to debug core systems only
  // Supports both server-side (process.env) and client-side (globalThis.env) flags
  const disableRPGViaProcess =
    typeof process !== "undefined" && typeof process.env !== "undefined"
      ? process.env.DISABLE_RPG === "1" ||
        process.env.DISABLE_RPG === "true" ||
        process.env.DISABLE_RPG === "yes" ||
        process.env.DISABLE_RPG === "on"
      : false;
  const globalEnv =
    typeof globalThis !== "undefined"
      ? (globalThis as unknown as { env?: Record<string, string> }).env
      : undefined;
  const disableRPGViaGlobal = globalEnv
    ? isTruthy(globalEnv.DISABLE_RPG) || isTruthy(globalEnv.PUBLIC_DISABLE_RPG)
    : false;
  const disableRPG = disableRPGViaProcess || disableRPGViaGlobal;

  // Register -specific components FIRST, before any systems
  registerComponent("combat", CombatComponent as ComponentConstructor);
  registerComponent("visual", VisualComponent as ComponentConstructor);
  registerComponent(
    "interaction",
    InteractionComponent as ComponentConstructor,
  );
  registerComponent("usage", UsageComponent as ComponentConstructor);

  // Register specialized components first
  registerComponent("stats", StatsComponent as ComponentConstructor);

  // Register data components using the generic DataComponent class
  // Include commonly used pure-data components so entity construction never fails
  const dataComponents = [
    "inventory",
    "equipment",
    "movement",
    "stamina",
    "ai",
    "respawn",
  ];
  for (const componentType of dataComponents) {
    registerComponent(componentType, DataComponent as ComponentConstructor);
  }

  // Initialize centralized data manager
  const dataValidation = await dataManager.initialize();

  // Allow skipping validation via environment variable (useful for CI with incomplete manifests)
  const skipValidation =
    typeof process !== "undefined" &&
    typeof process.env !== "undefined" &&
    process.env.SKIP_VALIDATION === "true";

  if (!dataValidation.isValid && !skipValidation) {
    throw new Error(
      "Failed to initialize game data: " + dataValidation.errors.join(", "),
    );
  }

  const systems: Systems = {};

  // === FOUNDATIONAL SYSTEMS ===
  // These must be registered first as other systems depend on them

  // 1. Action Registry - Creates world.actionRegistry for action discovery
  world.register("action-registry", ActionRegistry);

  // 2. Entity Manager - Core entity management system
  world.register("entity-manager", EntityManager);

  // 3. Database system - For persistence (server only)
  // DatabaseSystem is now registered in createServerWorld(), so skip here
  // This prevents duplicate registration

  // 4. Persistence system - Core data management
  world.register("persistence", PersistenceSystem);

  // === CORE ENTITY SYSTEMS ===
  // These systems manage the primary game entities

  // 5. Player system - Core player management (depends on database & persistence)
  // "player" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-26, Wave 5d).

  systems.player = getSystem(world, "player");
  systems.entityManager = getSystem(world, "entity-manager") as EntityManager;

  if (world.isClient) {
    // InteractionRouter is now registered in createClientWorld.ts (before ClientCameraSystem)
    // so that ClientCameraSystem can access its RaycastService during initialization
    systems.interaction = getSystem(world, "interaction") as InteractionRouter;
    // Camera system API is accessed through world events, not direct system reference
    systems.cameraSystem = undefined;
    systems.movementSystem = getSystem(world, "client-movement-system") as
      | MovementSystemLike
      | undefined;
  }

  // ParticleSystem is registered synchronously in createClientWorld() alongside
  // other visual effects systems, so it's available before entities arrive.

  if (disableRPG) {
    // Skip registering any RPG systems/components/APIs
    return;
  }

  // 6. Mob NPC system: registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25, Wave 3a).

  // === INTERACTION SYSTEMS ===
  // These systems handle player-world interactions

  // 8. Combat system - Core combat mechanics (depends on player & mob systems)
  // "combat" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-26, Wave 6).

  // 9. Coin pouch system — registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25). The original
  // pre-init order constraint ("MUST register before InventorySystem")
  // was lazy-lookup based; both `getSystem("coin-pouch")` calls in
  // InventorySystem fire at PLAYER_REGISTERED time, well after both
  // systems have registered.

  // 10. Inventory system - Item management (depends on player, coin-pouch systems)
  // "inventory" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-26, Wave 5c).

  // 11. Equipment system - Item equipping (depends on inventory system)
  // "equipment" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-26, Wave 5b).

  // 12. XP system - Experience and leveling (depends on player system)
  // "skills" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-26, Wave 5a).

  // 12b. Prayer system - Prayer mechanics (depends on player, skills systems)
  // "prayer" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // 12a. Health regeneration system - Passive health regen (depends on combat system)
  // Server-only: handles RuneScape-style out-of-combat health regeneration
  // Note: world.isServer isn't reliable here because ServerNetwork registers later
  // Use Node.js/Bun environment check instead
  const isServerEnvironment =
    typeof process !== "undefined" &&
    process.versions &&
    (typeof process.versions.node === "string" ||
      typeof (process.versions as { bun?: string }).bun === "string");

  // HealthRegenSystem registered by @hyperforge/hyperscape plugin
  // onEnable (server-only via plugin's check). Migrated 2026-04-24.
  void isServerEnvironment;

  // === SPECIALIZED SYSTEMS ===
  // These systems provide specific game features

  // 13. Banking system - Item storage (depends on inventory system)
  // "banking" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // 14. Store system - Item trading (depends on inventory system)
  // "store" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // 15. Resource system - Gathering mechanics (depends on inventory system)
  // "resource" registered by @hyperforge/hyperscape plugin onEnable
  // (Wave 1 of heavy-cluster migration, 2026-04-25).

  // 18. Processing system - Crafting and item processing (depends on inventory system)
  // "processing" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // (Slots 18a–18f — the six OSRS skill processing systems —
  //  Smelting / Smithing / Crafting / Fletching / Tanning /
  //  Runecrafting — are all registered by the
  //  @hyperforge/hyperscape plugin onEnable. Migrated 2026-04-24.)

  // === GAMEPLAY SYSTEMS ===
  // These systems provide advanced gameplay mechanics

  // 19. Player death system - Player death and respawn mechanics (depends on player system)
  // "player-death" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-26).

  // (Slot 19b — GravestoneLootSystem — registered by
  //  @hyperforge/hyperscape plugin onEnable. Migrated 2026-04-24.)

  // (Slot 20 — MobDeathSystem — registered by @hyperforge/hyperscape
  //  plugin onEnable. Migrated 2026-04-24, first slice of the
  //  Hyperscape→meta-plugin extraction.)

  // 21. Aggro system - AI aggression management (depends on mob & combat systems)
  // "aggro" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // Duel Arena visual system - procedural arena geometry and physics collision
  const duelArenaVisualsEnabled =
    process.env.DUEL_ARENA_VISUALS_ENABLED !== "false";
  if (duelArenaVisualsEnabled) {
    try {
      world.register("duel-arena-visuals", DuelArenaVisualsSystem);
    } catch (err) {
      console.error(
        "[SystemLoader] Failed to register DuelArenaVisualsSystem:",
        err,
      );
    }
  } else if (isServerEnvironment) {
    console.log(
      "[SystemLoader] DuelArenaVisualsSystem skipped (DUEL_ARENA_VISUALS_ENABLED=false)",
    );
  }

  // Client-only visual combat feedback systems
  if (world.isClient) {
    // DamageSplatSystem + DuelCountdownSplatSystem + ProjectileRenderer
    // registered by @hyperforge/hyperscape plugin (client-side onEnable,
    // gated on !world.isServer). Migrated 2026-04-24.
    // "inventory-interaction" registered by @hyperforge/hyperscape
    // plugin onEnable cross-cutting branch (migrated 2026-04-25).
    // XP Drop System - 3D version disabled, using 2D screen-space drops in XPProgressOrb
    // The 2D approach is more like RS3 where XP floats up the screen toward the orb
    // Keep XPDropSystem.ts for potential future use or alternative mode
  }

  // Ground Item System - shared across loot and death systems
  // Must be registered before systems that depend on it
  // "ground-items" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25).

  // "loot" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // World Content Systems (server only for world management)
  if (world.isServer) {
    // "npc" registered by @hyperforge/hyperscape plugin onEnable
    // cross-cutting branch (migrated 2026-04-25).
  }

  // Dialogue system - handles NPC dialogue trees
  // "dialogue" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25).

  // "scripting" registered by @hyperforge/hyperscape plugin onEnable
  // cross-cutting branch (migrated 2026-04-25). The interpreter
  // engine + sibling helpers (ScriptGraphInterpreter,
  // ActionExecutor, ConditionRegistry, TriggerEvaluator) stay in
  // shared because PIEScriptRunner consumes them at PIE-bundle
  // time.

  // Quest system - handles quest progression (server only)
  // Note: world.isServer isn't reliable here because ServerNetwork registers later
  // Use Node.js environment check instead (isServerEnvironment defined above)
  if (isServerEnvironment) {
    // "quest" registered by @hyperforge/hyperscape plugin onEnable
    // cross-cutting branch (migrated 2026-04-25).
    console.log("[SystemLoader] ✅ QuestSystem registered (server-only)");
  }

  // DYNAMIC WORLD CONTENT SYSTEMS - FULL THREE.JS ACCESS, NO SANDBOX
  // "mob-npc-spawner" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25).
  // "station-spawner" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25).
  // "item-spawner" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25).

  // "zone-detection" registered by @hyperforge/hyperscape plugin
  // onEnable cross-cutting branch (migrated 2026-04-25). Both server
  // + client get it via the cross-cutting register call.

  // Get system instances after world initialization
  // Systems are directly available as properties on the world object after registration
  // Database system is only available on server
  const dbSystem = getSystem(world, "database");
  systems.database =
    dbSystem && "getPlayer" in dbSystem
      ? (dbSystem as DatabaseSystem)
      : undefined;
  systems.combat = getSystem(world, "combat");
  systems.inventory = getSystem(world, "inventory");
  systems.skills = getSystem(world, "skills");
  systems.mobNpc = getSystem(world, "mob-npc");
  systems.banking = getSystem(world, "banking");
  systems.store = getSystem(world, "store");
  // ResourceSystem migrated — `unknown` field; API adapter casts
  // to inline duck-types at each callsite below.
  systems.resource = getSystem(world, "resource");

  systems.aggro = getSystem(world, "aggro");
  systems.equipment = getSystem(world, "equipment");
  systems.processing = getSystem(world, "processing");
  // healthRegen registration moved to @hyperforge/hyperscape plugin —
  // no SystemReferences slot needed (no consumer reads it today).
  systems.playerDeath = getSystem(world, "player-death");
  // mobDeath registration moved to @hyperforge/hyperscape plugin —
  // no SystemReferences slot needed (no consumer reads it today).

  // Client-only systems
  if (world.isClient) {
    // InventoryInteractionSystem migrated — `unknown` field, duck-
    // typed at the stats-reader callsite below.
    systems.inventoryInteraction = getSystem(world, "inventory-interaction");
  }

  // Ground Item System
  systems.groundItems = getSystem(world, "ground-items");

  // LootSystem migrated to @hyperforge/hyperscape (2026-04-25). The
  // setter surface SystemLoader uses for boot-time dispatcher install
  // + manifest seeding is duck-typed inline so we don't import the
  // migrated class. Handlers re-resolve `getSystem` on every call,
  // so QuestSystem / InventorySystem / SkillsSystem registered later
  // in init still get picked up without re-installing.
  systems.loot = getSystem(world, "loot");
  const lootSystem = systems.loot as
    | {
        setDropConditionEvaluator(
          evaluator:
            | ReturnType<typeof createDropConditionDispatcher>["evaluate"]
            | null,
        ): void;
        setAuthoredLootTables(manifest: unknown): void;
        setMobLootTableMappings(
          mappings: ReadonlyMap<string, string> | Record<string, string>,
        ): void;
      }
    | undefined;

  // Wire pluggable DropCondition evaluator to the live world. The
  // dispatcher is server-authoritative — loot rolls happen on the
  // server only, so the install is gated on `isServer`.
  if (world.isServer && lootSystem) {
    const dropConditionDispatcher = createDropConditionDispatcher();
    installWorldDropConditions(dropConditionDispatcher, world);
    lootSystem.setDropConditionEvaluator(dropConditionDispatcher.evaluate);

    // Boot-time seed: install any authored loot-tables manifest that
    // DataManager already loaded from disk, plus the authored
    // mob→table mappings. Gated on `isLoaded()` so servers that don't
    // ship either manifest stay on the legacy `LootTableService` path
    // for every mob type. Subsequent edits flow through
    // `PIEEditorSession.updateManifests` → live `LootSystem` write.
    if (lootTablesProvider.isLoaded()) {
      lootSystem.setAuthoredLootTables(lootTablesProvider.getManifest());
    }
    if (mobLootTableMappingsProvider.isLoaded()) {
      lootSystem.setMobLootTableMappings(
        mobLootTableMappingsProvider.getMappings(),
      );
    }
  }

  // Install authored dialogue condition bindings if a manifest was
  // loaded via DataManager (or an equivalent pre-init hook). Gated on
  // `isLoaded()` so servers that don't ship a bindings manifest stay
  // on the empty default — DialogueSystem still treats unknown
  // predicate names as false, so authored `showIf` strings without a
  // matching binding safely hide gated choices rather than expose
  // them. Server-only: dialogue runs on the server-authoritative
  // world.
  if (world.isServer && dialogueConditionBindingsProvider.isLoaded()) {
    const dialogueSystem = world.getSystem(
      "dialogue",
    ) as unknown as DialogueSystem | null;
    if (dialogueSystem) {
      installWorldDialogueConditions(
        dialogueSystem,
        world,
        dialogueConditionBindingsProvider.getBindings(),
      );
    }
  }

  // Boot-time seed: install any authored dialogue manifest +
  // NPC→tree bindings that DataManager already loaded from disk.
  // Gated on `isLoaded()` so servers that don't ship either manifest
  // stay on the legacy `NPCDialogueTree` path for every NPC.
  // Subsequent edits flow through `PIEEditorSession.updateManifests`
  // → live `DialogueSystem` write + provider tee.
  if (world.isServer) {
    const dialogueSystem = world.getSystem(
      "dialogue",
    ) as unknown as DialogueSystem | null;
    if (dialogueSystem) {
      if (dialogueProvider.isLoaded()) {
        dialogueSystem.setAuthoredDialogues(dialogueProvider.getManifest());
      }
      if (npcDialogueBindingsProvider.isLoaded()) {
        dialogueSystem.setAuthoredNpcDialogueBindings(
          npcDialogueBindingsProvider.getBindings(),
        );
      }
      if (localizationProvider.isLoaded()) {
        const bundle = localizationProvider.getBundle();
        if (bundle !== null) {
          dialogueSystem.setLocalizationCatalog(
            new LocalizationCatalog(bundle),
          );
        }
      }
    }
  }

  // World Content Systems
  if (world.isServer) {
    systems.npc = getSystem(world, "npc");
  }

  // Scripting system
  // ScriptingSystem migrated — `unknown` field; consumers (none in
  // shared today) would need to duck-type if they reach for it.
  systems.scripting = getSystem(world, "scripting");

  // DYNAMIC WORLD CONTENT SYSTEMS
  systems.mobNpcSpawner = getSystem(world, "mob-npc-spawner");
  systems.stationSpawner = getSystem(world, "station-spawner");
  systems.itemSpawner = getSystem(world, "item-spawner");

  // Set up API for apps to access functionality
  setupAPI(world, systems);
}

/**
 * Set up global API for apps to use
 */
function setupAPI(world: World, systems: Systems): void {
  // Set up comprehensive API for apps
  const rpgAPI = {
    // Actions - convert to Record format expected by World interface
    rpgActions: (() => {
      const actionsRecord: Record<
        string,
        {
          name: string;
          execute: (params: Record<string, unknown>) => Promise<unknown>;
          [key: string]: unknown;
        }
      > = {};

      // Basic actions for compatibility
      actionsRecord["attack"] = {
        name: "attack",
        requiresAmmunition: false,
        execute: async (_params) => {
          return { success: true };
        },
      };

      actionsRecord["attack_ranged"] = {
        name: "attack",
        requiresAmmunition: true,
        execute: async (_params) => {
          return { success: true };
        },
      };

      actionsRecord["chop"] = {
        name: "chop",
        skillRequired: "woodcutting",
        execute: async (_params) => {
          return { success: true };
        },
      };

      actionsRecord["fish"] = {
        name: "fish",
        skillRequired: "fishing",
        execute: async (_params) => {
          return { success: true };
        },
      };

      return actionsRecord;
    })(),

    // Database API
    getRPGPlayer: (playerId: string) => systems.database?.getPlayer(playerId),
    savePlayer: (playerId: string, data: Partial<PlayerRow>) =>
      systems.database?.savePlayer(playerId, data),

    // Player API — PlayerSystem migrated to @hyperforge/hyperscape
    // (Wave 5d); duck-type the surface inline.
    getAllPlayers: () =>
      (
        systems.player as { getAllPlayers(): unknown[] } | undefined
      )?.getAllPlayers(),
    healPlayer: (playerId: string, amount: number) =>
      (
        systems.player as
          | { healPlayer(id: string, n: number): boolean }
          | undefined
      )?.healPlayer(playerId, amount),
    damagePlayer: (playerId: string, amount: number) =>
      (
        systems.player as
          | { damagePlayer(id: string, n: number): boolean }
          | undefined
      )?.damagePlayer(playerId, amount),
    isPlayerAlive: (playerId: string) =>
      (
        systems.player as { isPlayerAlive(id: string): boolean } | undefined
      )?.isPlayerAlive(playerId),
    getPlayerHealth: (playerId: string) => {
      return (
        (
          systems.player as
            | { getPlayerHealth(id: string): { current: number; max: number } }
            | undefined
        )?.getPlayerHealth(playerId) ?? { current: 100, max: 100 }
      );
    },
    teleportPlayer: (playerId: string, position: Position3D) =>
      systems.movementSystem?.teleportPlayer?.(playerId, position),

    // Combat API — CombatSystem migrated to @hyperforge/hyperscape
    // (Wave 6); duck-type the surface inline.
    startCombat: (attackerId: string, targetId: string) =>
      (
        systems.combat as
          | { startCombat(a: string, t: string): boolean }
          | undefined
      )?.startCombat(attackerId, targetId),
    stopCombat: (attackerId: string) =>
      (
        systems.combat as { forceEndCombat(id: string): void } | undefined
      )?.forceEndCombat(attackerId),
    canAttack: (_attackerId: string, _targetId: string) => true, // Combat system doesn't have canAttack method
    isInCombat: (entityId: string) =>
      (
        systems.combat as { isInCombat(id: string): boolean } | undefined
      )?.isInCombat(entityId),

    // Inventory API — InventorySystem migrated to
    // @hyperforge/hyperscape (Wave 5c); duck-type the surface inline.
    getInventory: (playerId: string) => {
      const inventory = (
        systems.inventory as
          | { getInventory(id: string): PlayerInventory | undefined }
          | undefined
      )?.getInventory(playerId);
      if (!inventory) return [];
      return inventory.items.map((item) => ({
        itemId: item.itemId,
        quantity: item.quantity,
        slot: item.slot,
        name: item.item?.name || item.itemId,
        stackable: item.item?.stackable || false,
      }));
    },
    getEquipment: (playerId: string) => {
      const equipment = (
        systems.equipment as
          | { getEquipmentData(id: string): unknown }
          | undefined
      )?.getEquipmentData(playerId);
      if (!equipment) return {};
      // Convert equipment data to expected format
      const result: Record<string, { itemId: string; [key: string]: unknown }> =
        {};
      for (const [slot, item] of Object.entries(equipment)) {
        if (item && typeof item === "object") {
          const itemObj = item as {
            id: unknown;
            name?: unknown;
            count?: unknown;
          };
          result[slot] = {
            itemId: String(itemObj.id),
            name: itemObj.name as string | undefined,
            count: (itemObj.count as number) || 1,
          };
        }
      }
      return result;
    },
    hasItem: (playerId: string, itemId: string | number, quantity?: number) =>
      (
        systems.inventory as
          | { hasItem(id: string, item: string, q?: number): boolean }
          | undefined
      )?.hasItem(playerId, String(itemId), quantity),
    getArrowCount: (playerId: string) => {
      const inventory = (
        systems.inventory as
          | { getInventory(id: string): PlayerInventory | undefined }
          | undefined
      )?.getInventory(playerId);
      if (!inventory) return 0;
      const arrows = inventory.items.find(
        (item: InventorySlotItem) =>
          item.itemId === "bronze_arrows" || item.itemId === "arrows",
      );
      return arrows?.quantity || 0;
    },
    canAddItem: (playerId: string, _item: Item | InventorySlotItem) => {
      const inventory = (
        systems.inventory as
          | { getInventory(id: string): PlayerInventory | undefined }
          | undefined
      )?.getInventory(playerId);
      return inventory ? inventory.items.length < 28 : false; // Default inventory capacity
    },

    getSkills: (playerId: string) => {
      // Get all skills for a player by getting the entity's stats component
      const entity = world.entities.get(playerId);
      if (!entity) return {};
      const stats = (entity as Entity).getComponent<Component>(
        "stats",
      ) as Skills | null;
      return stats || {};
    },
    getSkillLevel: (playerId: string, skill: string) => {
      const skillData = (
        systems.skills as
          | { getSkillData(id: string, s: keyof Skills): unknown }
          | undefined
      )?.getSkillData(playerId, skill as keyof Skills) as
        | { level: number; xp: number }
        | undefined;
      return skillData?.level || 1;
    },
    getSkillXP: (playerId: string, skill: string) => {
      const skillData = (
        systems.skills as
          | { getSkillData(id: string, s: keyof Skills): unknown }
          | undefined
      )?.getSkillData(playerId, skill as keyof Skills) as
        | { level: number; xp: number }
        | undefined;
      return skillData?.xp || 0;
    },
    getCombatLevel: (playerId: string) => {
      const entity = world.entities.get(playerId);
      if (!entity) return 1;
      const stats = (entity as Entity).getComponent<Component>(
        "stats",
      ) as StatsComponent | null;
      if (!stats) return 1;
      return (
        (
          systems.skills as
            | { getCombatLevel(s: StatsComponent): number }
            | undefined
        )?.getCombatLevel(stats) ?? 1
      );
    },
    getXPToNextLevel: (playerId: string, skill: string) => {
      const skillData = (
        systems.skills as
          | { getSkillData(id: string, s: keyof Skills): unknown }
          | undefined
      )?.getSkillData(playerId, skill as keyof Skills) as
        | { level: number; xp: number }
        | undefined;
      if (!skillData) return 0;
      return (
        (
          systems.skills as
            | {
                getXPToNextLevel(d: { level: number; xp: number }): number;
              }
            | undefined
        )?.getXPToNextLevel(skillData) ?? 0
      );
    },

    // UI API (handled via events, no UISystem)
    getPlayerUIState: (_playerId: string) => null,
    forceUIRefresh: (playerId: string) => {
      world.emit(EventType.UI_UPDATE, { playerId, force: true });
    },
    sendUIMessage: (
      playerId: string,
      message: string,
      type?: "info" | "warning" | "error",
    ) => {
      world.emit(EventType.UI_MESSAGE, {
        playerId,
        message,
        type: type || "info",
      });
    },

    // Mob API — MobNPCSystem migrated to @hyperforge/hyperscape
    // (Wave 3a). Duck-type the surface inline so SystemLoader's API
    // adapter doesn't need to import the concrete class.
    getMob: (mobId: string) =>
      (systems.mobNpc as { getMob(id: string): unknown } | undefined)?.getMob(
        mobId,
      ),
    getAllMobs: () =>
      (systems.mobNpc as { getAllMobs(): unknown } | undefined)?.getAllMobs(),
    getMobsInArea: (center: Position3D, radius: number) =>
      (
        systems.mobNpc as
          | {
              getMobsInArea(c: Position3D, r: number): unknown;
            }
          | undefined
      )?.getMobsInArea(center, radius),
    spawnMob: (type: string, position: Position3D) =>
      systems.mobNpc &&
      world.emit(EventType.MOB_NPC_SPAWN_REQUEST, { mobType: type, position }),
    getMobInstancedRendererStats: () => {
      // Client-side only - returns null on server
      if (world.isServer) return null;
      // Use the singleton renderer for this world
      const renderer = MobInstancedRenderer.get(world);
      return renderer.getStats();
    },
    getImpostorManagerStats: () => {
      // Client-side only - returns null on server
      if (world.isServer) return null;
      // Get the ImpostorManager singleton for this world
      const manager = ImpostorManager.getInstance(world);
      return manager.getStats();
    },

    // Banking API
    getBankData: (_playerId: string, _bankId: string) => null, // Banking system doesn't expose public methods
    getAllPlayerBanks: (_playerId: string) => [], // Banking system doesn't expose public methods
    getBankLocations: () => [], // Banking system doesn't expose public methods
    getItemCountInBank: (_playerId: string, _bankId: string, _itemId: number) =>
      0,
    getTotalItemCountInBanks: (_playerId: string, _itemId: number) => 0,

    // Store API — `systems.store` is `unknown` since StoreSystem
    // migrated to @hyperforge/hyperscape; cast to the surface this
    // adapter calls.
    getStore: (storeId: string) =>
      (
        systems.store as { getStore?(id: string): unknown } | undefined
      )?.getStore?.(storeId),
    getAllStores: () =>
      (
        systems.store as { getAllStores?(): unknown } | undefined
      )?.getAllStores?.(),
    getStoreLocations: () =>
      (
        systems.store as { getStoreLocations?(): unknown } | undefined
      )?.getStoreLocations?.(),
    getItemPrice: (_storeId: string, _itemId: number) => 0, // Store system doesn't expose this method
    isItemAvailable: (_storeId: string, _itemId: number, _quantity?: number) =>
      false, // Store system doesn't expose this method

    // Resource API — `systems.resource` is `unknown` since
    // ResourceSystem migrated; cast to inline duck-types at each
    // callsite.
    getResource: (resourceId: string) =>
      (
        systems.resource as { getResource?(id: string): unknown } | undefined
      )?.getResource?.(resourceId),
    getAllResources: () =>
      (
        systems.resource as { getAllResources?(): unknown } | undefined
      )?.getAllResources?.(),
    getResourcesByType: (type: "tree" | "fishing_spot" | "ore") =>
      (
        systems.resource as
          | { getResourcesByType?(t: string): unknown }
          | undefined
      )?.getResourcesByType?.(type),
    getResourcesInArea: (_center: Position3D, _radius: number) => [], // Resource system doesn't expose this method
    isPlayerGathering: (_playerId: string) => false, // Resource system doesn't expose this method

    // Movement API (Physics-based in PlayerLocal)
    isPlayerMoving: (playerId: string) =>
      systems.movementSystem?.isMoving?.(playerId),
    getPlayerStamina: (_playerId: string) => ({
      current: 100,
      max: 100,
      regenerating: true,
    }), // MovementSystem doesn't have stamina
    movePlayer: (playerId: string, targetPosition: Position3D) =>
      systems.movementSystem?.movePlayer?.(playerId, targetPosition),

    // Player Death API — PlayerDeathSystem migrated to
    // @hyperforge/hyperscape (Wave 4); duck-type the surface inline.
    getDeathLocation: (playerId: string) =>
      (
        systems.playerDeath as
          | { getDeathLocation(id: string): unknown }
          | undefined
      )?.getDeathLocation(playerId),
    getAllDeathLocations: () =>
      (
        systems.playerDeath as { getAllDeathLocations(): unknown } | undefined
      )?.getAllDeathLocations(),
    isPlayerDead: (playerId: string) =>
      (
        systems.playerDeath as { isPlayerDead(id: string): boolean } | undefined
      )?.isPlayerDead(playerId),
    getRemainingRespawnTime: (playerId: string) =>
      (
        systems.playerDeath as
          | { getRemainingRespawnTime(id: string): number }
          | undefined
      )?.getRemainingRespawnTime(playerId),
    getRemainingDespawnTime: (playerId: string) =>
      (
        systems.playerDeath as
          | { getRemainingDespawnTime(id: string): number }
          | undefined
      )?.getRemainingDespawnTime(playerId),
    forceRespawn: (playerId: string) =>
      (
        systems.playerDeath as { forceRespawn(id: string): void } | undefined
      )?.forceRespawn(playerId),

    // Terrain API (Terrain System)
    getHeightAtPosition: (_worldX: number, _worldZ: number) => 0, // Terrain system doesn't expose this method
    getBiomeAtPosition: (_worldX: number, _worldZ: number) => "plains", // Terrain system doesn't expose this method
    getTerrainStats: () => ({}), // Terrain system doesn't expose this method
    getHeightAtWorldPosition: (_x: number, _z: number) => 0, // Terrain system doesn't expose this method

    // Dynamic World Content API (Full THREE.js Access).
    // `systems.mobNpcSpawner` is `unknown` since MobNPCSpawnerSystem
    // migrated to @hyperforge/hyperscape; cast at each callsite.
    getSpawnedMobs: () =>
      (
        systems.mobNpcSpawner as { getSpawnedMobs?(): unknown } | undefined
      )?.getSpawnedMobs?.(),
    getMobCount: () =>
      (
        systems.mobNpcSpawner as { getMobCount?(): unknown } | undefined
      )?.getMobCount?.(),
    getMobsByType: (mobType: string) =>
      (
        systems.mobNpcSpawner as
          | { getMobsByType?(t: string): unknown }
          | undefined
      )?.getMobsByType?.(mobType),
    getMobStats: () =>
      (
        systems.mobNpcSpawner as { getMobStats?(): unknown } | undefined
      )?.getMobStats?.(),
    // `systems.itemSpawner` is `unknown` since ItemSpawnerSystem
    // migrated to @hyperforge/hyperscape; cast at each callsite.
    getSpawnedItems: () =>
      (
        systems.itemSpawner as { getSpawnedItems?(): unknown } | undefined
      )?.getSpawnedItems?.(),
    getItemCount: () =>
      (
        systems.itemSpawner as { getItemCount?(): unknown } | undefined
      )?.getItemCount?.(),
    getItemsByType: (itemType: string) =>
      (
        systems.itemSpawner as
          | { getItemsByType?(t: string): unknown }
          | undefined
      )?.getItemsByType?.(itemType),
    getShopItems: () =>
      (
        systems.itemSpawner as { getShopItems?(): unknown } | undefined
      )?.getShopItems?.(),
    getChestItems: () =>
      (
        systems.itemSpawner as { getChestItems?(): unknown } | undefined
      )?.getChestItems?.(),
    getItemStats: () =>
      (
        systems.itemSpawner as { getItemStats?(): unknown } | undefined
      )?.getItemStats?.(),

    // Loot API
    spawnLoot: (_mobType: string, _position: Position3D, _killerId?: string) =>
      null, // Loot system doesn't expose this method
    getLootTable: (_mobType: string) => [], // Loot system doesn't expose this method
    getDroppedItems: () => [], // Loot system doesn't expose this method

    // Equipment API — EquipmentSystem migrated to
    // @hyperforge/hyperscape (Wave 5b); duck-type the surface inline.
    getPlayerEquipment: (playerId: string) =>
      (
        systems.equipment as
          | { getPlayerEquipment(id: string): unknown }
          | undefined
      )?.getPlayerEquipment(playerId),
    getEquipmentData: (playerId: string) =>
      (
        systems.equipment as
          | { getEquipmentData(id: string): unknown }
          | undefined
      )?.getEquipmentData(playerId),
    getEquipmentStats: (playerId: string) =>
      (
        systems.equipment as
          | { getEquipmentStats(id: string): unknown }
          | undefined
      )?.getEquipmentStats(playerId),
    isItemEquipped: (playerId: string, itemId: number) =>
      (
        systems.equipment as
          | { isItemEquipped(id: string, n: number): boolean }
          | undefined
      )?.isItemEquipped(playerId, itemId),
    canEquipItem: (playerId: string, itemId: number) =>
      (
        systems.equipment as
          | { canEquipItem(id: string, n: number): boolean }
          | undefined
      )?.canEquipItem(playerId, itemId),
    consumeArrow: (playerId: string) =>
      (
        systems.equipment as { consumeArrow(id: string): boolean } | undefined
      )?.consumeArrow(playerId),

    // Item Drop API (via Loot System)
    dropItem: (item: Item, position: Position3D, droppedBy?: string) => {
      world.emit(EventType.ITEM_SPAWN, {
        itemId: item.id,
        quantity: item.quantity || 1,
        position,
        droppedBy,
      });
    },
    getItemsInRange: (_position: Position3D, _range?: number) => [], // Not exposed by current systems
    getGroundItem: (_itemId: string) => null, // Not exposed by current systems
    getAllGroundItems: () => [], // Not exposed by current systems
    clearAllItems: () => {}, // Not exposed by current systems

    // Item Actions API
    // registerItemAction removed - ItemActionSystem not available

    // Inventory Interaction API (client only) — migrated to
    // @hyperforge/hyperscape; duck-typed on the `getSystemInfo()`
    // shape this caller actually reads.
    isDragging: () =>
      (
        systems.inventoryInteraction as
          | { getSystemInfo?(): { isDragging?: boolean } | undefined }
          | undefined
      )?.getSystemInfo?.()?.isDragging || false,
    getDropTargetsCount: () =>
      (
        systems.inventoryInteraction as
          | { getSystemInfo?(): { dropTargetsCount?: number } | undefined }
          | undefined
      )?.getSystemInfo?.()?.dropTargetsCount || 0,

    // Processing API
    // Processing API — `systems.processing` is `unknown` since
    // ProcessingSystem migrated to @hyperforge/hyperscape; cast at
    // each callsite to the surface this adapter calls.
    getActiveFires: () =>
      (
        systems.processing as { getActiveFires?(): unknown } | undefined
      )?.getActiveFires?.(),
    getPlayerFires: (playerId: string) =>
      (
        systems.processing as
          | { getPlayerFires?(id: string): unknown }
          | undefined
      )?.getPlayerFires?.(playerId),
    isPlayerProcessing: (playerId: string) =>
      (
        systems.processing as
          | { isPlayerProcessing?(id: string): boolean }
          | undefined
      )?.isPlayerProcessing?.(playerId),
    getFiresInRange: (position: Position3D, range?: number) =>
      (
        systems.processing as
          | { getFiresInRange?(p: Position3D, r: number): unknown }
          | undefined
      )?.getFiresInRange?.(position, range || 5),

    // Attack Style API — PlayerSystem migrated; duck-type the surface.
    getPlayerAttackStyle: (playerId: string) =>
      (
        systems.player as
          | { getPlayerAttackStyle(id: string): unknown }
          | undefined
      )?.getPlayerAttackStyle(playerId),
    getAllAttackStyles: () =>
      (
        systems.player as { getAllAttackStyles(): unknown } | undefined
      )?.getAllAttackStyles(),
    forceChangeAttackStyle: (playerId: string, styleId: string) =>
      (
        systems.player as
          | { forceChangeAttackStyle(id: string, s: string): boolean }
          | undefined
      )?.forceChangeAttackStyle(playerId, styleId),
    getAttackStyleSystemInfo: () =>
      (
        systems.player as { getAttackStyleSystemInfo(): unknown } | undefined
      )?.getAttackStyleSystemInfo(),

    // App Manager API
    createApp: (_appType: string, _config: AppConfig) => null,
    destroyApp: (_appId: string) => {},
    getApp: (_appId: string) => null,
    getAllApps: () => [],
    getAppsByType: (_type: string) => [],
    getAppCount: () => 0,

    // Entity Manager API (Server-authoritative)
    spawnEntity: (config: EntityConfig) =>
      systems.entityManager?.spawnEntity(config),
    destroyEntity: (entityId: string) =>
      systems.entityManager?.destroyEntity(entityId),
    getEntity: (entityId: string) => systems.entityManager?.getEntity(entityId),
    getEntitiesByType: (type: string) =>
      systems.entityManager?.getEntitiesByType(type),
    getEntitiesInRange: (center: Position3D, range: number, type?: string) =>
      systems.entityManager?.getEntitiesInRange(center, range, type),
    getAllEntities: () => [], // Entity manager doesn't expose this method
    getEntityCount: () => 0, // Entity manager doesn't expose this method
    getEntityDebugInfo: () => systems.entityManager?.getDebugInfo(),

    // Player Spawn API (handled by PlayerSystem)
    hasPlayerCompletedSpawn: (_playerId: string) => true, // Handled by PlayerSystem
    getPlayerSpawnData: (_playerId: string) => null, // Handled by PlayerSystem
    forceTriggerAggro: (_playerId: string) => {}, // Handled by AggroSystem
    getAllSpawnedPlayers: () =>
      (
        systems.player as { getAllPlayers(): unknown[] } | undefined
      )?.getAllPlayers() || [],

    // Interaction API (Client only)
    registerInteractable: (data: Record<string, unknown>) =>
      systems.interaction && world.emit(EventType.INTERACTION_REGISTER, data),
    unregisterInteractable: (appId: string) =>
      systems.interaction &&
      world.emit(EventType.INTERACTION_UNREGISTER, { appId }),

    // Camera API (Core ClientCameraSystem)
    getCameraInfo: () => {
      const cameraSystem = world.getSystem("client-camera-system") as
        | { getCameraInfo?: () => unknown }
        | undefined;
      return cameraSystem?.getCameraInfo?.();
    },
    setCameraTarget: (_target: THREE.Object3D | null) => {}, // setTarget is private
    setCameraEnabled: (_enabled: boolean) => undefined,
    resetCamera: () => {}, // resetCamera is private

    // UI Components API (Client only)
    updateHealthBar: (data: { health: number; maxHealth: number }) =>
      world.emit(EventType.UI_UPDATE, { component: "health", data }),
    updateInventory: (data: Inventory) =>
      world.emit(EventType.UI_UPDATE, { component: "inventory", data }),
    addChatMessage: (message: string, type?: string) =>
      world.emit(EventType.UI_MESSAGE, {
        playerId: "system",
        message,
        type: (type || "info") as "info" | "warning" | "error" | "success",
      }),

    // World Content API (Server only)
    getWorldAreas: () => [], // World content system doesn't expose getAllWorldAreas method

    // NPC API (Server only) — `systems.npc` is `unknown` since
    // NPCSystem migrated to @hyperforge/hyperscape; cast at each
    // callsite to the surface this adapter calls.
    getPlayerBankContents: (playerId: string) =>
      (
        systems.npc as
          | { getPlayerBankContents?(id: string): unknown }
          | undefined
      )?.getPlayerBankContents?.(playerId),
    getStoreInventory: () =>
      (
        systems.npc as { getStoreInventory?(): unknown } | undefined
      )?.getStoreInventory?.(),
    getTransactionHistory: (playerId?: string) =>
      (
        systems.npc as
          | { getTransactionHistory?(id?: string): unknown }
          | undefined
      )?.getTransactionHistory?.(playerId),
    getNPCSystemInfo: () =>
      (
        systems.npc as { getSystemInfo?(): unknown } | undefined
      )?.getSystemInfo?.(),

    // System references for advanced usage - convert to Record format
    rpgSystems: Object.entries(systems).reduce(
      (acc, [key, system]) => {
        if (system) {
          acc[key] = {
            name: key,
            ...system,
          };
        }
        return acc;
      },
      {} as Record<string, { name: string; [key: string]: unknown }>,
    ),

    // Action methods for apps to trigger
    actionMethods: {
      // Player actions
      updatePlayer: (playerId: string, data: Partial<PlayerRow>) => {
        systems.database?.savePlayer(playerId, data);
        world.emit(EventType.PLAYER_UPDATED, { playerId, data });
      },

      // Combat actions
      startAttack: (
        attackerId: string,
        targetId: string,
        attackStyle?: string,
      ) => {
        world.emit(EventType.COMBAT_START_ATTACK, {
          attackerId,
          targetId,
          attackStyle,
        });
      },

      stopAttack: (attackerId: string) => {
        world.emit(EventType.COMBAT_STOP_ATTACK, { attackerId });
      },

      // XP actions
      grantXP: (playerId: string, skill: string, amount: number) => {
        world.emit(EventType.SKILLS_XP_GAINED, { playerId, skill, amount });
      },

      // Inventory actions
      giveItem: (
        playerId: string,
        item: Item | { itemId: string; quantity: number },
      ) => {
        const inventoryItem = {
          id: `${playerId}_${"itemId" in item ? item.itemId : item.id}_${Date.now()}`,
          itemId: "itemId" in item ? item.itemId : item.id,
          quantity: ("quantity" in item ? item.quantity : 1) ?? 1,
          slot: -1, // Let inventory system assign slot
          metadata: null,
        };
        world.emit(EventType.INVENTORY_ITEM_ADDED, {
          playerId,
          item: inventoryItem,
        });
      },

      equipItem: (playerId: string, itemId: number, slot: string) => {
        world.emit(EventType.EQUIPMENT_TRY_EQUIP, { playerId, itemId, slot });
      },

      unequipItem: (playerId: string, slot: string) => {
        world.emit(EventType.EQUIPMENT_UNEQUIP, { playerId, slot });
      },

      // Item pickup actions
      dropItemAtPosition: (
        item: Item,
        position: Position3D,
        _playerId?: string,
      ) => {
        // Emit ITEM_SPAWN directly instead of ITEM_DROP (which is for inventory operations)
        world.emit(EventType.ITEM_SPAWN, {
          itemId: item.id,
          quantity: item.quantity || 1,
          position,
        });
      },

      pickupItem: (playerId: string, itemId: string) => {
        world.emit(EventType.ITEM_PICKUP_REQUEST, { playerId, itemId });
      },

      // Item action triggers
      triggerItemAction: (
        playerId: string,
        actionId: string,
        _itemId: string,
        _slot?: number,
      ) => {
        world.emit(EventType.ITEM_ACTION_SELECTED, { playerId, actionId });
      },

      showItemContextMenu: (
        playerId: string,
        itemId: string,
        position: { x: number; y: number },
        slot?: number,
      ) => {
        world.emit(EventType.ITEM_RIGHT_CLICK, {
          playerId,
          itemId,
          position,
          slot,
        });
      },

      // Processing actions
      useItemOnItem: (
        playerId: string,
        primaryItemId: number,
        primarySlot: number,
        targetItemId: number,
        targetSlot: number,
      ) => {
        world.emit(EventType.ITEM_USE_ON_ITEM, {
          playerId,
          primaryItemId,
          primarySlot,
          targetItemId,
          targetSlot,
        });
      },

      useItemOnFire: (
        playerId: string,
        itemId: number,
        itemSlot: number,
        fireId: string,
      ) => {
        world.emit(EventType.ITEM_USE_ON_FIRE, {
          playerId,
          itemId,
          itemSlot,
          fireId,
        });
      },

      startFiremaking: (
        playerId: string,
        logsId: string,
        logsSlot: number,
        tinderboxSlot: number,
      ) => {
        world.emit(EventType.PROCESSING_FIREMAKING_REQUEST, {
          playerId,
          logsId,
          logsSlot,
          tinderboxSlot,
        });
      },

      startCooking: (playerId: string, fishSlot: number, fireId: string) => {
        world.emit(EventType.PROCESSING_COOKING_REQUEST, {
          playerId,
          fishSlot,
          fireId,
        });
      },

      // Attack style actions
      changeAttackStyle: (playerId: string, newStyle: string) => {
        // On client, send packet to server (server is authoritative)
        if (world.isClient && world.network) {
          (
            world.network as {
              send?: (method: string, data: unknown) => void;
            }
          ).send?.("changeAttackStyle", {
            playerId,
            newStyle,
          });
        }

        // On server, emit the event locally
        if (world.isServer) {
          world.emit(EventType.ATTACK_STYLE_CHANGED, {
            playerId,
            newStyle,
          });
        }
      },

      getAttackStyleInfo: (
        playerId: string,
        callback: (info: { style: string; cooldown?: number }) => void,
      ) => {
        world.emit(EventType.UI_ATTACK_STYLE_GET, { playerId, callback });
      },

      // Auto-retaliate actions
      setAutoRetaliate: (playerId: string, enabled: boolean) => {
        // On client, send packet to server
        if (world.isClient && world.network) {
          (
            world.network as {
              send?: (method: string, data: unknown) => void;
            }
          ).send?.("setAutoRetaliate", {
            playerId,
            enabled,
          });
        }

        // On server, emit the event locally (server will validate and apply)
        if (world.isServer) {
          world.emit(EventType.UI_AUTO_RETALIATE_UPDATE, {
            playerId,
            enabled,
          });
        }
      },

      getAutoRetaliate: (
        playerId: string,
        callback: (enabled: boolean) => void,
      ) => {
        world.emit(EventType.UI_AUTO_RETALIATE_GET, { playerId, callback });
      },

      // Player spawn actions
      respawnPlayerWithStarter: (playerId: string) => {
        world.emit(EventType.PLAYER_SPAWN_COMPLETE, { playerId });
      },

      forceAggroSpawn: (playerId: string) => {
        world.emit(EventType.AGGRO_FORCE_TRIGGER, { playerId });
      },

      // Mob actions
      spawnMobAtLocation: (type: string, position: Position3D) => {
        world.emit(EventType.MOB_NPC_SPAWN_REQUEST, {
          mobType: type,
          position,
        });
      },

      spawnGDDMob: (mobType: string, position: Position3D) => {
        world.emit(EventType.MOB_NPC_SPAWN_REQUEST, { mobType, position });
      },

      despawnMob: (mobId: string) => {
        world.emit(EventType.MOB_NPC_DESPAWN, mobId);
      },

      respawnAllMobs: () => {
        world.emit(EventType.MOB_NPC_RESPAWN_ALL);
      },

      // Item actions
      spawnItemAtLocation: (itemId: string, position: Position3D) => {
        world.emit(EventType.ITEM_SPAWN_REQUEST, { itemId, position });
      },

      spawnGDDItem: (
        itemId: string,
        position: Position3D,
        quantity?: number,
      ) => {
        world.emit(EventType.ITEM_SPAWN_REQUEST, {
          itemId,
          position,
          quantity,
        });
      },

      despawnItem: (itemId: string) => {
        world.emit(EventType.ITEM_DESPAWN, itemId);
      },

      respawnShopItems: () => {
        world.emit(EventType.ITEM_RESPAWN_SHOPS);
      },

      spawnLootItems: (position: Position3D, lootTable: string[]) => {
        world.emit(EventType.ITEM_SPAWN_LOOT, { position, lootTable });
      },

      // Banking actions
      openBank: (playerId: string, bankId: string, position: Position3D) => {
        world.emit(EventType.BANK_OPEN, { playerId, bankId, position });
      },

      closeBank: (playerId: string, bankId: string) => {
        world.emit(EventType.BANK_CLOSE, { playerId, bankId });
      },

      depositItem: (
        playerId: string,
        bankId: string,
        itemId: string,
        quantity: number,
      ) => {
        world.emit(EventType.BANK_DEPOSIT, {
          playerId,
          bankId,
          itemId,
          quantity,
        });
      },

      withdrawItem: (
        playerId: string,
        bankId: string,
        itemId: string,
        quantity: number,
      ) => {
        world.emit(EventType.BANK_WITHDRAW, {
          playerId,
          bankId,
          itemId,
          quantity,
        });
      },

      // Store actions
      openStore: (
        playerId: string,
        storeId: string,
        playerPosition: Position3D,
      ) => {
        world.emit(EventType.STORE_OPEN, { playerId, storeId, playerPosition });
      },

      // NOTE: buyItem removed - use network.send("storeBuy") for secure transactions

      // Resource actions
      startGathering: (
        playerId: string,
        resourceId: string,
        playerPosition: Position3D,
      ) => {
        world.emit(EventType.RESOURCE_GATHER, {
          playerId,
          resourceId,
          playerPosition,
        });
      },

      stopGathering: (playerId: string) => {
        world.emit(EventType.RESOURCE_GATHERING_STOPPED, { playerId });
      },

      // Movement actions (Physics-based in PlayerLocal)
      clickToMove: (
        playerId: string,
        targetPosition: Position3D,
        _currentPosition: Position3D,
        _isRunning?: boolean,
      ) => {
        systems.movementSystem?.movePlayer?.(playerId, targetPosition);
      },

      stopMovement: (playerId: string) => {
        world.emit(EventType.MOVEMENT_STOP, { playerId });
      },

      toggleRunning: (playerId: string, isRunning: boolean) => {
        world.emit(EventType.MOVEMENT_TOGGLE_RUN, { playerId, isRunning });
      },

      // Combat click-to-attack action
      clickToAttack: (attackerId: string, targetId: string) => {
        world.emit(EventType.COMBAT_START_ATTACK, { attackerId, targetId });
      },

      // Terrain actions
      configureTerrain: (config: TerrainConfig) => {
        world.emit(EventType.TERRAIN_CONFIGURE, config);
      },

      generateTerrain: (centerX: number, centerZ: number, radius: number) => {
        world.emit(EventType.TERRAIN_GENERATE_INITIAL, {
          centerX,
          centerZ,
          radius,
        });
      },

      spawnResource: (
        type: string,
        subType: string,
        position: Position3D,
        requestedBy: string,
      ) => {
        world.emit(EventType.TERRAIN_SPAWN_RESOURCE, {
          type,
          subType,
          position,
          requestedBy,
        });
      },

      // World Content actions
      loadWorldArea: (areaId: string) => {
        world.emit(EventType.WORLD_LOAD_AREA, { areaId });
      },

      unloadWorldArea: (areaId: string) => {
        world.emit(EventType.WORLD_UNLOAD_AREA, { areaId });
      },

      // NPC actions
      interactWithNPC: (playerId: string, npcId: string) => {
        world.emit(EventType.NPC_INTERACTION, { playerId, npcId });
      },

      bankDeposit: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_DEPOSIT, { playerId, itemId, quantity });
      },

      bankWithdraw: (playerId: string, itemId: string, quantity: number) => {
        world.emit(EventType.BANK_WITHDRAW, { playerId, itemId, quantity });
      },

      // NOTE: storeBuy and storeSell removed - use network.send() for secure transactions

      // Mob AI actions
      attackMob: (playerId: string, mobId: string, damage: number) => {
        world.emit(EventType.MOB_NPC_DAMAGED, {
          mobId,
          damage,
          attackerId: playerId,
        });
      },

      killMob: (mobId: string, killerId: string) => {
        const timestamp = Date.now();
        const killToken = generateKillToken(mobId, killerId, timestamp);
        world.emit(EventType.NPC_DIED, {
          mobId,
          mobType: "unknown",
          level: 1,
          killedBy: killerId,
          position: { x: 0, y: 0, z: 0 },
          timestamp,
          killToken,
        });
      },

      // App management actions
      createPlayerApp: (playerId: string, config: AppConfig) => {
        world.emit(EventType.PLAYER_CREATE, { playerId, config });
      },

      createMobApp: (mobId: string, mobType: string, config: AppConfig) => {
        world.emit(EventType.MOB_NPC_SPAWN_REQUEST, { mobId, mobType, config });
      },

      destroyPlayerApp: (playerId: string) => {
        world.emit(EventType.PLAYER_DESTROY, { playerId });
      },

      destroyMobApp: (mobId: string) => {
        world.emit(EventType.MOB_NPC_DESTROY, { mobId });
      },

      // Entity management actions (Server-authoritative)
      spawnEntityAtLocation: (type: string, config: EntityConfig) => {
        world.emit(EventType.ENTITY_SPAWNED, { type, config });
      },

      spawnItemEntity: (
        itemId: string,
        position: Position3D,
        quantity?: number,
      ) => {
        world.emit(EventType.ITEM_SPAWN, { itemId, position, quantity });
      },

      spawnMobEntity: (
        mobType: string,
        position: Position3D,
        _level?: number,
      ) => {
        world.emit(EventType.MOB_NPC_SPAWN_REQUEST, { mobType, position });
      },

      destroyEntityById: (entityId: string) => {
        world.emit(EventType.ENTITY_DEATH, { entityId });
      },

      interactWithEntity: (
        playerId: string,
        entityId: string,
        interactionType: string,
      ) => {
        world.emit(EventType.ENTITY_INTERACT_REQUEST, {
          playerId,
          entityId,
          interactionType,
          playerPosition: world.getPlayer?.(playerId)?.position,
        });
      },

      // Test helper functions for gameplay testing framework
      spawnTestPlayer: (x: number, z: number, color = "#FF0000") => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null;
        }

        // Use MeshBasicNodeMaterial for WebGPU compatibility
        const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
        const material = new MeshBasicNodeMaterial();
        material.color = new THREE.Color(color);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `TestPlayer_${Date.now()}`;
        mesh.position.set(x, 0.9, z);
        mesh.userData = {
          type: "player",
          health: 100,
          maxHealth: 100,
          level: 1,
          inventory: [],
          equipment: {},
        };
        world.stage.scene.add(mesh);
        return mesh;
      },

      spawnTestGoblin: (x: number, z: number, color = "#00FF00") => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null;
        }

        // Use MeshBasicNodeMaterial for WebGPU compatibility
        const geometry = new THREE.BoxGeometry(0.8, 1.6, 0.8);
        const material = new MeshBasicNodeMaterial();
        material.color = new THREE.Color(color);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `TestGoblin_${Date.now()}`;
        mesh.position.set(x, 0.8, z);
        mesh.userData = {
          type: "mob",
          mobType: "goblin",
          health: 50,
          maxHealth: 50,
          level: 1,
        };
        world.stage.scene.add(mesh);
        return mesh;
      },

      spawnTestItem: (
        x: number,
        z: number,
        itemType = "bronze_sword",
        color = "#0000FF",
      ) => {
        // Only work on client side where THREE.js scene is available
        if (world.isServer) {
          return null;
        }

        // Use MeshBasicNodeMaterial for WebGPU compatibility
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new MeshBasicNodeMaterial();
        material.color = new THREE.Color(color);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `TestItem_${itemType}_${Date.now()}`;
        mesh.position.set(x, 0.25, z);
        mesh.userData = {
          type: "item",
          itemType: itemType,
          quantity: 1,
        };
        world.stage.scene.add(mesh);
        return mesh;
      },

      simulateCombat: (attacker: THREE.Object3D, target: THREE.Object3D) => {
        if (!attacker || !target) {
          throw new Error("Invalid attacker or target");
        }

        const damage = Math.floor(Math.random() * 10) + 5;

        const targetEntity = target as THREE.Object3D & {
          userData: { health: number };
        };

        targetEntity.userData.health -= damage;

        if (targetEntity.userData.health <= 0) {
          // Target dies - remove from scene
          world.stage.scene.remove(target);
          return { killed: true, damage: damage };
        }

        return { killed: false, damage: damage };
      },
    },
  };

  // Attach all RPG API methods directly to the world object
  Object.assign(world, rpgAPI);

  // Create a simple Actions system wrapper so it can be accessed via getSystem("actions")
  class ActionsSystem extends System {
    name = "actions";
    actionMethods = rpgAPI.actionMethods;

    constructor(world: World) {
      super(world);
    }

    async init(_options: unknown): Promise<void> {
      // No initialization needed
    }

    update(_dt: number): void {
      // No update needed
    }
  }

  // Register the actions system
  world.register("actions", ActionsSystem);
}
