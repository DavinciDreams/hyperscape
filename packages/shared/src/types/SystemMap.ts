/**
 * SystemMap — typed registry for World.getSystem()
 *
 * Maps every system registration key to its concrete class so callers
 * can write `world.getSystem("combat")` and get `CombatSystem | undefined`
 * without manual casts.
 *
 * Only systems that are actively looked up via getSystem() are listed here.
 * Systems that are only accessed through World properties (e.g. world.chat)
 * don't need entries.
 */

import type { ActionRegistry } from "../systems/shared";
// AggroSystem migrated to @hyperforge/hyperscape (2026-04-25).
// BankingSystem migrated to @hyperforge/hyperscape (2026-04-25).
// CoinPouchSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown` — same pattern as
// HealthBars; consumers locally duck-type the surface they need.
// CombatSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 6).
// SystemMap entry below typed as `unknown`.
// DialogueSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { EntityManager } from "../systems/shared";
// EquipmentSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5b).
// SystemMap entry below typed as `unknown`.
// GravestoneLootSystem migrated to @hyperforge/hyperscape (2026-04-24)
// HealthRegenSystem migrated to @hyperforge/hyperscape (2026-04-24).
// SystemMap entry removed — its only consumer was a dead
// `systems.healthRegen = ...` lookup in SystemLoader.
// InventoryInteractionSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown` — sole consumer pattern
// (SystemLoader stats reader) duck-types `getSystemInfo()`.
// InventorySystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5c).
// SystemMap entry below typed as `unknown`.
// ItemSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// LootSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown` — the only consumer
// pattern is the boot-time setter calls in SystemLoader, which
// duck-type the surface they need.
// MobDeathSystem migrated to @hyperforge/hyperscape (2026-04-24).
// "mob-death" SystemMap entry removed — its only consumer was a
// dead `systems.mobDeath = ...` lookup in SystemLoader (no reads).
// MobNPCSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// MobNPCSystem migrated to @hyperforge/hyperscape (2026-04-25, Wave 3a).
// SystemMap entry below typed as `unknown`.
// NPCSystem migrated to @hyperforge/hyperscape (2026-04-25).
// PlayerDeathSystem migrated to @hyperforge/hyperscape (2026-04-26).
// SystemMap entry below typed as `unknown`.
// PlayerSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5d).
// SystemMap entry below typed as `unknown`.
// PrayerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// ProcessingSystem migrated to @hyperforge/hyperscape (2026-04-25).
// QuestSystem migrated to @hyperforge/hyperscape (2026-04-25).
// ResourceSystem migrated to @hyperforge/hyperscape (2026-04-25, Wave 1).
// SystemMap entry below typed as `unknown`.
// SkillsSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5a).
// SystemMap entry below typed as `unknown`.
// SmeltingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// SmithingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// CraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// FletchingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// RunecraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// StationSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// StoreSystem migrated to @hyperforge/hyperscape (2026-04-25).
// TanningSystem migrated to @hyperforge/hyperscape (2026-04-24)
// GroundItemSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown`; consumers in shared use
// the duck-typed `GroundItemSystemDuck` from `types/death/death-types`.
// ZoneDetectionSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown`; consumers in shared use
// the duck-typed `ZoneDetectionSystemDuck` from death-types.
import type { PersistenceSystem } from "../systems/server/PersistenceSystem";
import type { TerrainSystem } from "../systems/shared/world/TerrainSystem";
// TownSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entries below typed as `unknown`.
// RoadNetworkSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown`.
import type { DatabaseSystem } from "./systems/system-interfaces";

// Client systems
import type { ClientCameraSystem } from "../systems/client/ClientCameraSystem";
import type { ClientGraphics } from "../systems/client/ClientGraphics";
import type { ClientNetwork } from "../systems/client/ClientNetwork";
import type { ClientActions } from "../systems/client/ClientActions";
// DamageSplatSystem migrated to @hyperforge/hyperscape (2026-04-24)
// DuelCountdownSplatSystem migrated to @hyperforge/hyperscape (2026-04-24)
// ProjectileRenderer migrated to @hyperforge/hyperscape (2026-04-24)
// SocialSystem migrated to @hyperforge/hyperscape (2026-04-26).
// DuelArenaVisualsSystem migrated to @hyperforge/hyperscape (2026-04-26).
import type { InteractionRouter } from "../systems/client";
// HealthBars migrated to @hyperforge/hyperscape (2026-04-24).
// SystemMap entry below typed as `unknown` — the only consumer
// (nodes/HealthBar.ts) duck-types the surface it needs.

// Shared systems accessed by key
import type { Chat } from "../systems/shared/presentation/Chat";
import type { BuildingCollisionService } from "../systems/shared/world/BuildingCollisionService";

// Core engine systems (always registered)
import type { Stage } from "../systems/shared";
import type { Physics } from "../systems/shared";
import type { Environment } from "../systems/shared";
import type { LODs } from "../systems/shared";
import type { Particles } from "../systems/shared";

/**
 * Maps system registration keys to their concrete types.
 *
 * Usage:
 * ```ts
 * // Before — manual cast:
 * const combat = world.getSystem("combat") as unknown as CombatSystem;
 *
 * // After — automatic:
 * const combat = world.getSystem("combat"); // CombatSystem | undefined
 * ```
 */
export interface SystemMap {
  // Foundational
  "action-registry": ActionRegistry;
  "entity-manager": EntityManager;
  persistence: PersistenceSystem;

  // Core entity
  player: unknown;
  "mob-npc": unknown;

  // Combat & interaction
  combat: unknown;
  "coin-pouch": unknown;
  inventory: unknown;
  equipment: unknown;
  skills: unknown;
  prayer: unknown;
  // "health-regen" registered by @hyperforge/hyperscape plugin onEnable
  aggro: unknown;

  // Economy
  banking: unknown;
  store: unknown;
  resource: unknown;
  "ground-items": unknown;
  loot: unknown;

  // Processing / crafting
  processing: unknown;
  // The five classic MMORPG skill processing systems are all registered by
  // the @hyperforge/hyperscape plugin onEnable (2026-04-24):
  //   "smelting", "smithing", "crafting", "fletching",
  //   "tanning", "runecrafting"

  // Death
  "player-death": unknown;
  // "gravestone-loot" registered by @hyperforge/hyperscape plugin onEnable
  // "mob-death" registered by @hyperforge/hyperscape plugin onEnable

  // World content
  npc: unknown;
  dialogue: unknown;
  quest: unknown;
  "mob-npc-spawner": unknown;
  "station-spawner": unknown;
  "item-spawner": unknown;
  "zone-detection": unknown;

  // Terrain & world
  terrain: TerrainSystem;
  towns: unknown;
  roads: unknown;

  // Database (server)
  database: DatabaseSystem;

  // Core engine
  stage: Stage;
  physics: Physics;
  environment: Environment;
  lods: LODs;
  particles: Particles;

  // Client systems
  graphics: ClientGraphics;
  network: ClientNetwork;
  actions: ClientActions;
  "client-camera-system": ClientCameraSystem;
  interaction: InteractionRouter;
  "inventory-interaction": unknown;
  // "damage-splat" registered by @hyperforge/hyperscape plugin onEnable
  // "projectile-renderer" registered by @hyperforge/hyperscape plugin onEnable
  // "duel-countdown-splat" registered by @hyperforge/hyperscape plugin onEnable
  social: unknown;
  "duel-arena-visuals": unknown;
  healthbars: unknown;

  // Shared systems with key access
  chat: Chat;
  buildingCollision: BuildingCollisionService;

  // Alias: "town" → TownSystem (some code uses "town" instead of "towns")
  // TownSystem migrated to @hyperforge/hyperscape (2026-04-25).
  town: unknown;
}

export type SystemKey = keyof SystemMap;
