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
import type { CombatSystem } from "../systems/shared";
// DialogueSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { EntityManager } from "../systems/shared";
import type { EquipmentSystem } from "../systems/shared";
// GravestoneLootSystem migrated to @hyperforge/hyperscape (2026-04-24)
// HealthRegenSystem migrated to @hyperforge/hyperscape (2026-04-24).
// SystemMap entry removed — its only consumer was a dead
// `systems.healthRegen = ...` lookup in SystemLoader.
// InventoryInteractionSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown` — sole consumer pattern
// (SystemLoader stats reader) duck-types `getSystemInfo()`.
import type { InventorySystem } from "../systems/shared";
// ItemSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// LootSystem migrated to @hyperforge/hyperscape (2026-04-25).
// SystemMap entry below typed as `unknown` — the only consumer
// pattern is the boot-time setter calls in SystemLoader, which
// duck-type the surface they need.
// MobDeathSystem migrated to @hyperforge/hyperscape (2026-04-24).
// "mob-death" SystemMap entry removed — its only consumer was a
// dead `systems.mobDeath = ...` lookup in SystemLoader (no reads).
// MobNPCSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { MobNPCSystem } from "../systems/shared";
// NPCSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { PlayerDeathSystem } from "../systems/shared";
import type { PlayerSystem } from "../systems/shared";
// PrayerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// ProcessingSystem migrated to @hyperforge/hyperscape (2026-04-25).
// QuestSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { ResourceSystem } from "../systems/shared";
import type { SkillsSystem } from "../systems/shared";
// SmeltingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// SmithingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// CraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// FletchingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// RunecraftingSystem migrated to @hyperforge/hyperscape (2026-04-24)
// StationSpawnerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// StoreSystem migrated to @hyperforge/hyperscape (2026-04-25).
// TanningSystem migrated to @hyperforge/hyperscape (2026-04-24)
import type { GroundItemSystem } from "../systems/shared/economy/GroundItemSystem";
import type { ZoneDetectionSystem } from "../systems/shared/death/ZoneDetectionSystem";
import type { PersistenceSystem } from "../systems/server/PersistenceSystem";
import type { TerrainSystem } from "../systems/shared/world/TerrainSystem";
import type { TownSystem } from "../systems/shared/world/TownSystem";
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
import type { SocialSystem } from "../systems/client";
import type { DuelArenaVisualsSystem } from "../systems/client";
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
  player: PlayerSystem;
  "mob-npc": MobNPCSystem;

  // Combat & interaction
  combat: CombatSystem;
  "coin-pouch": unknown;
  inventory: InventorySystem;
  equipment: EquipmentSystem;
  skills: SkillsSystem;
  prayer: unknown;
  // "health-regen" registered by @hyperforge/hyperscape plugin onEnable
  aggro: unknown;

  // Economy
  banking: unknown;
  store: unknown;
  resource: ResourceSystem;
  "ground-items": GroundItemSystem;
  loot: unknown;

  // Processing / crafting
  processing: unknown;
  // The five OSRS skill processing systems are all registered by
  // the @hyperforge/hyperscape plugin onEnable (2026-04-24):
  //   "smelting", "smithing", "crafting", "fletching",
  //   "tanning", "runecrafting"

  // Death
  "player-death": PlayerDeathSystem;
  // "gravestone-loot" registered by @hyperforge/hyperscape plugin onEnable
  // "mob-death" registered by @hyperforge/hyperscape plugin onEnable

  // World content
  npc: unknown;
  dialogue: unknown;
  quest: unknown;
  "mob-npc-spawner": unknown;
  "station-spawner": unknown;
  "item-spawner": unknown;
  "zone-detection": ZoneDetectionSystem;

  // Terrain & world
  terrain: TerrainSystem;
  towns: TownSystem;
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
  social: SocialSystem;
  "duel-arena-visuals": DuelArenaVisualsSystem;
  healthbars: unknown;

  // Shared systems with key access
  chat: Chat;
  buildingCollision: BuildingCollisionService;

  // Alias: "town" → TownSystem (some code uses "town" instead of "towns")
  town: TownSystem;
}

export type SystemKey = keyof SystemMap;
