/**
 * @hyperforge/shared - CLIENT ONLY
 *
 * Client-safe exports that don't include any Node.js-specific code
 */

// IMPORTANT: DO NOT export createServerWorld or any server systems here
// This entry point is specifically for browser/client builds

export { createClientWorld } from "./runtime/createClientWorld";
export { createViewerWorld } from "./runtime/createViewerWorld";
export {
  createEditorWorld,
  initEditorWorld,
  EditorWorld,
  editorDataManager,
} from "./runtime/createEditorWorld";
export type { EditorWorldOptions } from "./runtime/createEditorWorld";
export { World } from "./core/World";

// Export editor systems
export {
  EditorCameraSystem,
  EditorSelectionSystem,
  EditorGizmoSystem,
} from "./systems/editor";
export type {
  EditorCameraMode,
  EditorCameraConfig,
  CameraBookmark,
  Selectable,
  SelectionChangeEvent,
  EditorSelectionConfig,
  TransformMode,
  TransformSpace,
  TransformEvent,
  EditorGizmoConfig,
} from "./systems/editor";

// Export entity classes
export { Entity } from "./entities/Entity";
export type { EventCallback } from "./entities/Entity";
export { MobEntity } from "./entities/npc/MobEntity";
export { PlayerLocal } from "./entities/player/PlayerLocal";
export { PlayerRemote } from "./entities/player/PlayerRemote";

// Export System class from core systems
export { System } from "./systems/shared";

// Export all types from types/index.ts
export type {
  Anchors,
  Chat,
  ChatMessage,
  Component,
  // Entity Component System Types
  Entity as EntityInterface,
  Events,
  // UI and control types
  HotReloadable,
  Matrix4,
  // Network Types
  NetworkConnection,
  // Physics Types
  PhysicsOptions,
  // Player Types
  Player,
  PlayerInput,
  PlayerStats,
  Quaternion,
  // Additional system interfaces
  Settings,
  Stage,
  // System Types
  System as SystemInterface,
  // Math Types
  Vector3,
  World as WorldInterface,
  // Core World Types
  WorldOptions,
  // Additional interfaces without corresponding classes
  ClientMonitor,
  ServerDB,
} from "./types/index";

// Export EventType enum
export { EventType } from "./types/events";

// Export PlayerMigration
export { PlayerMigration } from "./types/core/core";

// Export enums (these are values, not types)
export { WeaponType, EquipmentSlotName } from "./types/core/core";

// Weapon style configuration (OSRS-accurate style restrictions per weapon)
export {
  WEAPON_STYLE_CONFIG,
  getAvailableStyles,
  isStyleValidForWeapon,
  getDefaultStyleForWeapon,
} from "./constants/WeaponStyleConfig";

// Export db helpers and type guards for server usage
export { dbHelpers, isDatabaseInstance } from "./types/network/database";

// Export role utilities
export {
  addRole,
  removeRole,
  hasRole,
  serializeRoles,
  uuid,
} from "./utils/index";

// Export ID generation utilities (for transaction tracking, etc.)
export { generateTransactionId } from "./utils/IdGenerator";
export {
  deriveStreamingGuardrailReason,
  hasValidStreamingGuardrailAgentSnapshot,
  hasValidStreamingGuardrailArenaPositions,
  isActiveStreamingGuardrailPhase,
  requiresStreamingArenaPositions,
} from "./utils/rendering/streamingGuardrails";
export type {
  StreamingGuardrailAgentSnapshot,
  StreamingGuardrailArenaPositions,
  StreamingGuardrailPhase,
} from "./utils/rendering/streamingGuardrails";

// Export death/loot types for shadow state and transaction tracking
export type {
  LootResult,
  LootFailureReason,
  PendingLootTransaction,
} from "./types/death";

// Export tile utilities (used for OSRS-style tile-based distance checks)
export {
  worldToTile,
  tileToWorld,
  tilesEqual,
  tilesAdjacent,
  tilesWithinRange,
  TILE_SIZE,
  parseTileKey,
  type TileCoord,
} from "./systems/shared/movement/TileSystem";

// Export item helpers used by server network snapshot
export { ITEMS, getItem } from "./data/items";

// Item type detection helpers (OSRS-accurate inventory actions)
export {
  isFood,
  isPotion,
  isBone,
  isWeapon,
  isShield,
  usesWield,
  usesWear,
  isNotedItem,
  getPrimaryAction,
  getPrimaryActionFromManifest,
  HANDLED_INVENTORY_ACTIONS,
} from "./utils/item-helpers";
export type { PrimaryActionType } from "./utils/item-helpers";

// Context menu colors (OSRS-accurate styling)
export { CONTEXT_MENU_COLORS } from "./constants/GameConstants";

// Live getters — provider-first reads of boot-captured context-menu colors.
// Prefer these over `CONTEXT_MENU_COLORS` so PIE manifest edits to
// `game.contextMenuColors` apply without a client reload.
export {
  getContextMenuItemColor,
  getContextMenuNpcColor,
  getContextMenuObjectColor,
  getContextMenuPlayerColor,
  getDefaultHealth,
  getDefaultMaxHealth,
  getHealthRegenRate,
  getHomeTeleportCooldownMs,
  getHomeTeleportCastTimeMs,
  getHomeTeleportCastTimeTicks,
  getMaxInventorySlots,
  getMaxBanditMobsWorld,
  getBanditMobIdsForGlobalCap,
  isBanditMobForGlobalCap,
  getWorldChunkSize,
  getWaterThreshold,
  getWaterEdgeBuffer,
  getMinVisibleWaterDepth,
  getMaxWalkableSlope,
  getSlopeCheckDistance,
  getTileSize,
  getTerrainTileSize,
} from "./data/live/game-live";

export { getPickupRange } from "./data/live/combat-live";
export { getMaxTradeSlots } from "./data/live/trading-live";
export {
  getMaxBankSlots,
  getBankSlotsPerTab,
  getMaxBankTabs,
  getDefaultBankTabs,
  getDefaultBankSlots,
} from "./data/live/banking-live";
export {
  getMaxItemIdLength,
  getMaxStoreIdLength,
  getMaxQuantity,
  getMaxInventorySlotsInputLimit,
  getMaxRequestAgeMs,
  getMaxClockSkewMs,
  getInteractionDistanceFor,
  getTransactionRateLimitMs,
  getSessionValidationIntervalTicks,
  getSessionGracePeriodTicks,
  getSessionMaxSessionTicks,
} from "./data/live/interaction-live";

// Home teleport constants (cooldown, cast time)
export { HOME_TELEPORT_CONSTANTS } from "./constants/GameConstants";

// Inventory constants (slot counts, stack sizes)
export { INVENTORY_CONSTANTS } from "./constants/GameConstants";

// Player constants (health, stamina, speeds)
export { PLAYER_CONSTANTS } from "./constants/GameConstants";

// Terrain constants (water threshold, walkable slopes) — single source of truth
export { TERRAIN_CONSTANTS } from "./constants/GameConstants";

// Client input constants (click-to-move distance, drag threshold, raycast range)
export { INPUT } from "./systems/client/interaction/constants";

// Export avatar options for character creation
export { AVATAR_OPTIONS } from "./data/avatars";

// Export skill data for UI displays
export {
  SKILL_ICONS,
  getSkillIcon,
  SKILL_DEFINITIONS,
  getSkillDefinition,
  getSkillsByCategory,
  type SkillDefinition,
  type SkillCategory,
} from "./data/skill-icons";

// Export skill unlocks for level-up notifications
export {
  SKILL_UNLOCKS,
  getUnlocksAtLevel,
  getUnlocksUpToLevel,
  getUnlocksForSkill,
  getAllSkillUnlocks,
  clearSkillUnlocksCache,
  loadSkillUnlocks,
  isSkillUnlocksLoaded,
  resetSkillUnlocks,
} from "./data/skill-unlocks";
export type {
  SkillUnlock,
  UnlockType,
  SkillUnlocksManifest,
} from "./data/skill-unlocks";

// Export prayer data provider for UI panels
export { prayerDataProvider } from "./data/PrayerDataProvider";
export type {
  PrayerDefinition,
  PrayerCategory,
} from "./data/PrayerDataProvider";

// Export spell service for magic spellbook UI
export { spellService } from "./systems/shared/combat/SpellService";
export type { Spell } from "./systems/shared/combat/SpellService";

// Export CLIENT system classes only (NO SERVER SYSTEMS)
export { Entities } from "./systems/shared";
export { Physics } from "./systems/shared";
export { Particles } from "./systems/shared";
export { LODs } from "./systems/shared";
export { ClientInterface } from "./systems/client/ClientInterface"; // UI state, preferences, stats display
export { ClientLoader } from "./systems/client/ClientLoader";
export { Environment } from "./systems/shared";
export { ClientNetwork } from "./systems/client/ClientNetwork";
export { ClientGraphics } from "./systems/client/ClientGraphics";
export { ClientRuntime } from "./systems/client/ClientRuntime"; // Client lifecycle and diagnostics
export { ClientAudio } from "./systems/client/ClientAudio";
export { ClientLiveKit } from "./systems/client/ClientLiveKit";
export { ClientInput } from "./systems/client/ClientInput";
export {
  attachEquipmentVisualToVRM,
  extractEquipmentAttachmentData,
  removeEquipmentVisual,
  resolveEquipmentVisualData,
  resolveEquipmentVisualUrls,
} from "./systems/client/EquipmentVisualHelpers";
export type {
  EquipmentAttachmentData,
  EquipmentVisualModelData,
  EquipmentVisualStore,
  EquipmentVisualUrlResolution,
} from "./systems/client/EquipmentVisualHelpers";
export { ClientActions } from "./systems/client/ClientActions";
export { DevStats } from "./systems/client/DevStats"; // FPS counter and dev performance telemetry
export { EventBus } from "./systems/shared";
export { System as SystemClass } from "./systems/shared";
export { SystemBase } from "./systems/shared";
export { PendingActionTracker } from "./systems/client/network/PendingActionTracker";

// Export node client components directly from their source modules (NOT ServerLoader, ServerRuntime, ServerLiveKit)
export { createNodeClientWorld } from "./runtime/createNodeClientWorld";
export { NodeClient } from "./systems/client/NodeClient";
// Environment system works in both browser and Node contexts
export { Node } from "./nodes/Node";
// Re-export commonly used node classes to satisfy API extractor
export { UI } from "./nodes/UI";
export { UIView } from "./nodes/UIView";
export { UIText } from "./nodes/UIText";
export { Group } from "./nodes/Group";
export { Mesh } from "./nodes/Mesh";
export { Avatar } from "./nodes/Avatar";
// Export client-only storage (no Node.js dependencies)
export { storage, LocalStorage } from "./platform/shared/storage";
export {
  loadPhysX,
  waitForPhysX,
  getPhysX,
  isPhysXReady,
} from "./physics/PhysXManager";

// Export renderer utilities (WebGPU only - no WebGL fallback)
export {
  createRenderer,
  configureRenderer,
  configureShadowMaps,
  type WebGPURenderer,
  type RendererOptions,
} from "./utils/rendering/RendererFactory";

export {
  createPostProcessing,
  type PostProcessingComposer,
} from "./utils/rendering/PostProcessingFactory";

// Material and mesh optimizations
export {
  optimizeMaterialForWebGPU,
  createOptimizedInstancedMesh,
  getWebGPUCapabilities,
  logWebGPUInfo,
} from "./utils/rendering/RendererFactory";

export {
  isNumber,
  isBoolean,
  isString,
  isObject,
  isArray,
  isValidColor,
  isValidUrl,
  validatePosition,
  calculateDistance,
  calculateDistance2D,
} from "./utils/ValidationUtils";

export { isTouch, cls, hashFile } from "./platform/client/utils-client";
export { ReactiveVector3 } from "./extras/animation/ReactiveVector3";
export { createEmoteFactory } from "./extras/three/createEmoteFactory";
export { createNode } from "./extras/three/createNode";
export { glbToNodes } from "./extras/three/glbToNodes";
export { Emotes } from "./data/playerEmotes";
export { ALL_WORLD_AREAS, STARTER_TOWNS } from "./data/world-areas";
export {
  DUEL_RULE_DEFINITIONS,
  DUEL_RULE_LABELS,
  EQUIPMENT_SLOT_DEFINITIONS,
  EQUIPMENT_SLOT_LABELS,
  EQUIPMENT_SLOTS_ORDERED,
  VALID_DUEL_RULE_KEYS,
  DUEL_EQUIPMENT_SLOT_KEYS,
  isValidDuelRuleKey,
  isValidEquipmentSlot,
  getIncompatibleRules,
  areRulesCompatible,
  type DuelRuleDefinition,
  type EquipmentSlotDefinition,
  type DuelEquipmentSlot,
} from "./data/duel-manifest";
export { ControlPriorities } from "./systems/client/ControlPriorities";
export { downloadFile } from "./utils/downloadFile";
export { Curve } from "./extras/animation/Curve";
export { buttons, propToLabel } from "./extras/ui/buttons";
// GLTFLoader export disabled due to TypeScript declaration generation issues
// Users can import it directly: import { GLTFLoader } from './libs/gltfloader/GLTFLoader';

// NOTE: CSM (WebGL) removed - use CSMShadowNode from three/addons/csm/CSMShadowNode.js for WebGPU

// Export lighting/sky/fog config for World Studio visual parity
export {
  DAY_CYCLE,
  SUN_LIGHT,
  SUN_SHADE,
  NIGHT,
  HEMISPHERE_LIGHT,
  AMBIENT_LIGHT,
  EXPOSURE,
  FOG_COLORS,
  applySunShade,
  applyCustomLighting,
} from "./systems/shared/world/LightingConfig";
export {
  fogRenderTarget,
  applySkyFog,
  FOG_NEAR,
  FOG_FAR,
} from "./systems/shared/world/FogConfig";
export {
  StandaloneSky,
  type StandaloneSkyOptions,
} from "./systems/shared/world/StandaloneSky";
export {
  StandaloneGrass,
  type StandaloneGrassOptions,
  type GrassTerrainSampler,
  type GrassTerrainSample,
} from "./systems/shared/world/StandaloneGrass";

// Terrain shader — used by World Studio for game-accurate terrain rendering
export {
  createTerrainMaterial,
  generateNoiseTexture,
  getNoiseTexture,
  sampleNoiseAtPosition,
  getGrassiness,
  calculateSlope,
  applyAnimeShade,
  TERRAIN_SHADER_CONSTANTS,
  TERRAIN_SHADE,
  computeTerrainColorCPU,
  type TerrainMaterialOptions,
  type TerrainUniforms,
} from "./systems/shared/world/TerrainShader";
export {
  WATER,
  WAVES,
  type WaveParams,
  generateWaterNormalMap,
  generateWaterFlowMap,
  generateWaterFoamTexture,
  createWaterMaterial,
  type WaterMaterialUniforms,
  type WaterMaterialOptions,
} from "./systems/shared/world/WaterMaterialCore";
export {
  hourToDayPhase,
  computeDayIntensity,
  computeTransitionFade,
  computeIsDay,
  isGoldenHour,
  updateSunLight,
  updateAmbientLights,
  updateSceneFog,
  computeTargetExposure,
  computeSunPosition,
  updateSceneLighting,
  type SceneLightingRefs,
} from "./systems/shared/world/SceneLightingCore";

// PhysX asset path helper function
export function getPhysXAssetPath(assetName: string): string {
  // In the browser, serve assets from CDN /web/ directory
  if (typeof window !== "undefined") {
    return `/web/${assetName}`;
  }
  // In Node.js, compute path relative to this module using URL without importing node:path
  try {
    const here = new URL(import.meta.url);
    const vendorUrl = new URL(`../vendor/${assetName}`, here);
    // pathname is fine for local filesystem access in Node
    return vendorUrl.pathname;
  } catch {
    return assetName;
  }
}

// Export THREE namespace as a default-only module export
export { default as THREE } from "./extras/three/three";

// Export Vector3 compatibility utilities for plugin use
export {
  toTHREEVector3,
  assignVector3,
  cloneVector3,
  createVector3,
  toVector3Object,
  isVector3Like,
} from "./extras/animation/vector3-compatibility";

// Export PhysX types
export type {
  PxVec3,
  PxTransform,
  PxQuat,
  PxSphereGeometry,
  PxCapsuleGeometry,
} from "./types/systems/physics";
export type {
  PxScene,
  PxFoundation,
  PxTolerancesScale,
  PxCookingParams,
  PxPhysics,
  PxMaterial,
  PxRaycastResult,
  PxSweepResult,
  PxOverlapResult,
  PxControllerManager,
  PxControllerFilters,
  PxActor,
  PxRigidDynamic,
  PxRigidStatic,
  PxRigidBody,
  PxShape,
  PxGeometry,
  PxDefaultAllocator,
  PxDefaultErrorCallback,
  PxQueryFilterData,
} from "./types/systems/physics";

// Re-export types referenced by API Extractor warnings
export type { PhysXInfo, PhysXModule } from "./types/systems/physics";
export type {
  InterpolatedPhysicsHandle,
  NonInterpolatedPhysicsHandle,
} from "./types/systems/physics";
// Re-export specific core types referenced by entity declarations
export type {
  PlayerDeathData,
  Player as PlayerCore,
  PlayerHealth,
  PlayerStamina,
  PlayerPosition,
  Skills,
  PlayerEquipmentItems,
  PlayerCombatData,
  SystemConfig,
  SkillData,
  MovementComponent,
  InventoryItem,
  Item,
  Inventory,
  PlayerEquipment,
  AttackType,
  CombatStyle,
  ItemType,
  ItemRarity,
  CombatBonuses,
  EquipmentSlot,
} from "./types/core/core";
export type { Physics as PhysicsInterface } from "./types/index";
// Re-export UI-related types used by UIView/UIText/UI
export type {
  UIData,
  UIViewData,
  DisplayType,
  EdgeValue,
  FlexBasis,
  UIContext,
  UISceneItem,
  UIYogaNode,
} from "./types/rendering/nodes";
export type { NodeData, Position3D } from "./types/index";
// Re-export extras used by PlayerRemote and others
export { LerpVector3 } from "./extras/animation/LerpVector3";
export { LerpQuaternion } from "./extras/animation/LerpQuaternion";
// Re-export core utility types referenced by declarations
export type { RaycastHit, NetworkData } from "./types/index";
// Re-export entity configuration types
export type { EntityConfig, EntityInteractionData } from "./types/entities";
// Re-export GLB typing used by createEmoteFactory
export type { GLBData } from "./types/index";
// Re-export storage types (client-only)
export type { Storage } from "./platform/shared/storage";
// NodeStorage is only available from the main index (server-side)
// Re-export nodes namespace for createNode typings
export * as Nodes from "./nodes";

// Export additional UI/node types used by various node declarations
export type {
  UITextData,
  TextAlign,
  FontWeight,
  UIImageData,
  UIPointerEvent,
  UIWheelEvent,
  RigidBodyData,
  MeshData,
  SkinnedMeshData,
  SkyData,
  ActionData,
  DistanceModelType,
  LODItem,
  LODNode,
  LODData,
  AvatarData,
  VRMAvatarFactory,
  AvatarHooks,
  VRMAvatarInstance,
  ControllerData,
  ColliderData,
  JointData,
  ParticlesData,
  PhysicsTriggerEvent,
  PhysicsContactEvent,
  JointLimits,
  JointDrive,
  PhysXActor,
  PhysXController,
  PhysXJoint,
  PxJointLimitCone,
  PxConstraintFlag,
  PxJointAngularLimitPair,
  PxRigidBodyFlag,
  PhysXMoveFlags,
  AudioData,
  ImageData,
} from "./types/rendering/nodes";

export type {
  ActorHandle,
  PxControllerCollisionFlags,
  PxRigidBodyFlagEnum,
} from "./types/systems/physics";
export type { PhysXShape, PhysXMesh } from "./systems/shared";

// Export Node internal types
export type { NodeProxy, NodeStats } from "./nodes/Node";

// Export LooseOctree internal types
export type {
  LooseOctreeNode,
  OctreeHelper,
  LooseOctreeOptions,
} from "./utils/physics/LooseOctree";

// Export additional system and event types
export type { SystemConstructor, SystemDependencies } from "./systems/shared";
export type {
  EventSubscription,
  SystemEvent,
  EventHandler,
} from "./systems/shared";
export type { EventMap } from "./types/events";
export type {
  AnyEvent,
  EventType as EventTypeEnum,
  EventPayloads,
} from "./types/events";
export type { LoaderResult } from "./types/index";
export type { ComponentDefinition, EntityData } from "./types/index";
export type { Entities as EntitiesInterface } from "./types/index";
export type { SystemLogger } from "./utils/Logger";

// Export network/system interface types
export type { NetworkSystem } from "./types/systems/system-interfaces";
export type { IEventsInterface } from "./systems/shared";

// Export Client Interface types
export type {
  ClientUIState,
  PrefsKey,
  PrefsValue,
  ClientPrefsData,
} from "./systems/client/ClientInterface";
export type { ChatListener } from "./systems/shared";
export type { UIProxy } from "./types/rendering/nodes";

// Export Panel utility
export { default as Panel } from "./libs/stats-gl/panel";

// Export ClientActions internal handler type
export type { ClientActionHandler } from "./systems/client/ClientActions";

// Export alternate HotReloadable and RaycastHit for nodes/UI references
// Export HotReloadable from physics as well (needed by PlayerLocal)
export type { HotReloadable as HotReloadable_2 } from "./types/systems/physics";

// Export environment and stage types
export type {
  BaseEnvironment,
  EnvironmentModel,
  SkyHandle,
  SkyInfo,
  SkyNode,
} from "./types/index";
export { LooseOctree } from "./utils/physics/LooseOctree";
export type {
  MaterialWrapper,
  InsertOptions,
  StageHandle,
  MaterialOptions,
} from "./systems/shared";
export type {
  OctreeItem,
  ExtendedIntersection,
  RenderHelperItem,
  GeometryPhysXMesh,
} from "./types/systems/physics";
export type {
  ParticleEmitter,
  EmitterNode,
  ParticleMessage,
  ParticleMessageData,
} from "./types/rendering/particles";

// Export client audio types
export type { AudioGroupGains } from "./types/index";

// Export control types
export type {
  ControlBinding,
  ControlsBinding,
  ControlAction,
  TouchInfo,
  ControlEntry,
  ButtonEntry,
  MouseInput,
  ValueEntry,
  VectorEntry,
  ScreenEntry,
  PointerEntry,
  InputState,
} from "./types/index";

// Export entity and interaction types
export type { BaseEntityProperties } from "./types/entities";
// InteractionType is an enum — needs value re-export for migrated systems.
export { InteractionType } from "./types/entities/entities";
// EntityType is an enum (value), not just a type — needs `export {}`
// for runtime use by migrated systems.
export { EntityType } from "./types/entities/entities";

// Export event payloads namespace
export * as Payloads from "./types/events";

// Export additional core types
export type { SkillsData } from "./types/systems/system-interfaces";
export type {
  HealthComponent,
  VisualComponent,
  EntityCombatComponent,
  PlayerCombatStyle,
} from "./types/entities";
export type { GroupType } from "./types/rendering/nodes";
export type { InventoryItemInfo } from "./types/events";
export type { MaterialProxy } from "./types/rendering/materials";

// Export database/event types
export type {
  InventoryCanAddEvent,
  InventoryRemoveCoinsEvent,
  InventoryCheckEvent,
  InventoryHasEquippedEvent,
  BankDepositEvent,
  BankWithdrawEvent,
  BankDepositSuccessEvent,
  UIMessageEvent,
  StoreOpenEvent,
  StoreCloseEvent,
  StoreBuyEvent,
  StoreSellEvent,
} from "./types/events";

// Export settings data
export type { SettingsData } from "./types/index";

// Export SystemDatabase and TypedKnexDatabase to fix API Extractor warnings
export type {
  SystemDatabase,
  TypedKnexDatabase,
  ConfigRow,
  UserRow,
  EntityRow,
  DatabaseRow,
} from "./types/network/database";

// Export entity types
export type {
  PlayerEntity,
  CharacterController,
  CharacterControllerOptions,
  NetworkPacket,
} from "./types/index";

// Export video and model types
export type {
  VideoFactory,
  LoadedModel,
  LoadedEmote,
  LoadedAvatar,
  SnapshotData,
  VideoSource,
  HSNode,
} from "./types/index";

// Export player touch/stick types used by PlayerLocal
export type { PlayerTouch, PlayerStickState } from "./types/systems/physics";
// Export additional physics handle types referenced in declarations
export type {
  PhysicsHandle,
  PhysicsRaycastHit,
  PhysicsOverlapHit,
  BasePhysicsHandle,
  InterpolationData,
  ContactEvent,
  TriggerEvent,
} from "./types/systems/physics";
export type { Collider, RigidBody, PhysicsMaterial } from "./types/index";
export type {
  InternalContactCallback,
  InternalTriggerCallback,
  ExtendedContactEvent,
  ExtendedTriggerEvent,
  OverlapHit,
} from "./systems/shared";
export { writePacket, readPacket } from "./platform/shared/packets";
export { Socket } from "./platform/shared/Socket";

// Export physics utilities
export { installThreeJSExtensions } from "./utils/physics/PhysicsUtils";

// Export spawn utilities
export { CircularSpawnArea } from "./utils/physics/CircularSpawnArea";

// Export terrain system
export { TerrainSystem } from "./systems/shared";

// Export pathfinding utilities (used by NavigationVisualizer and building navigation)
export { BFSPathfinder } from "./systems/shared/movement/BFSPathfinder";
export type { WalkabilityChecker } from "./systems/shared/movement/BFSPathfinder";

// Export building collision utilities
export {
  cellToWorldTile,
  rotateWallDirection,
  getOppositeDirection,
  toWallDirection,
  tileKey as buildingTileKey,
} from "./types/world/building-collision-types";
export type {
  WallDirection,
  WallSegment,
  StairTile,
  FloorCollisionData,
} from "./types/world/building-collision-types";

// xp-curves runtime registry — shared module-level singleton.
// Populated at boot by DataManager and live-mutated by PIEEditorSession.
// Client HUD (xp-orb) resolves xp-to-level through this same instance
// so editor saves take effect in the HUD without a restart.
export {
  xpCurveRegistry,
  XPCurveRegistry,
  UnknownXpCurveError,
  InvalidXpLevelError,
  type XpToNextResult,
} from "./progression/index";

// skill-icons runtime registry — same shape as xpCurveRegistry.
// `getEffectiveSkillIcon(key)` is the registry-prefer-fallback helper
// HUD / level-up-popup consumers should use in preference to reading
// `SKILL_ICONS` directly, so PIE hot-reload of skill-icons.json
// propagates without a restart.
export {
  skillIconsRegistry,
  getEffectiveSkillIcon,
  SkillIconsRegistry,
  SkillIconsNotLoadedError,
  UnknownSkillDefinitionError,
} from "./skill-icons/index";

// combat-spells runtime registry — same shape as xpCurveRegistry.
// Populated at boot by DataManager + hot-mutated by PIEEditorSession.
// SpellService reads through this registry; React spellbook panel
// subscribes to `onReloaded` to invalidate its memoized spell list
// when authored spell edits land.
export {
  combatSpellsRegistry,
  CombatSpellsRegistry,
  CombatSpellsNotLoadedError,
  UnknownCombatSpellError,
  type CombatSpellTier,
  type CombatSpellsReloadListener,
} from "./combat-spells/index";

// ─────────────────────────────────────────────────────────────────────
// Plugin-migration exports — re-exported here for the CLIENT bundle
// (`framework.client.js`) so the migrated systems in
// `@hyperforge/hyperscape` resolve their imports at runtime in the
// browser. These mirror the additions made to `index.ts` (the
// server-side entry) during the 2026-04-24/25 session migrations.
// Each block names which migrated system needs which symbol.
// ─────────────────────────────────────────────────────────────────────

// HealthBars (client-only)
export type {
  ShaderNode,
  TSLNodeFloat,
  TSLNodeVec2,
  TSLNodeVec3,
  TSLNodeVec4,
} from "./extras/three/three";
export {
  HEALTH_BAR_COLORS,
  HEALTH_BAR_DIMENSIONS,
  type HealthBarStyle,
  type HealthBarCanvasOptions,
  drawHealthBar,
  clearHealthBar,
  createHealthBarCanvas,
  updateHealthBarCanvas,
} from "./utils/rendering/HealthBarRenderer";

// ZoneVisualsSystem (client-only)
export { Chat as ChatSystem } from "./systems/shared/presentation/Chat";
export { ZoneDetectionSystem } from "./systems/shared/death/ZoneDetectionSystem";
export type { WorldArea } from "./types/world/world-types";
export { getEffectiveWorldAreas } from "./world-areas";

// EquipmentVisualSystem (client-only)
export { EQUIPMENT_SLOT_NAMES } from "./constants/EquipmentConstants";

// WaterfallVisualsSystem (client-only)
export type { WaterfallDefinition } from "./systems/shared/world/WaterfallDefinition";

// Identifier branded types + create helpers — needed by every
// migrated cross-cutting server-side system (CoinPouch, Prayer,
// Banking, Store, etc.) for id construction.
export type {
  PlayerID,
  ItemID,
  MobID,
  EntityID,
  StoreID,
  BankID,
  ResourceID,
  NPCID,
  SessionID,
  QuestID,
  SkillID,
  ZoneID,
  ChunkID,
  SlotNumber,
} from "./types/core/identifiers";
export {
  isValidPlayerID,
  isValidMobID,
  isValidEntityID,
  isValidItemID,
  isValidStoreID,
  isValidBankID,
  isValidResourceID,
  isValidNPCID,
  isValidSessionID,
  isValidSlotNumber,
  isValidQuestID,
  isValidSkillID,
  isValidZoneID,
  isValidChunkID,
  createPlayerID,
  createMobID,
  createEntityID,
  createItemID,
  createStoreID,
  createBankID,
  createResourceID,
  createNPCID,
  createSessionID,
  createSlotNumber,
  createQuestID,
  createSkillID,
  createZoneID,
  createChunkID,
} from "./types/core/identifiers";

// CoinPouchSystem (cross-cutting server-side)
export { toPlayerID } from "./utils/IdentifierUtils";
export type { DatabaseSystem } from "./types/systems/system-interfaces";

// PrayerSystem (cross-cutting server-side)
export {
  clampPrayerLevel,
  clampPrayerPoints,
  isAltarPrayPayload,
  isPlayerCleanupPayload,
  isPlayerRegisteredPayload,
  isPrayerToggleEventPayload,
  isValidRestoreAmount,
  isValidPrayerId,
  MAX_ACTIVE_PRAYERS,
  PRAYER_TOGGLE_COOLDOWN_MS,
  PRAYER_TOGGLE_RATE_LIMIT,
  getPlayerPrayerLevel,
  getPlayerPrayerBonus,
} from "./types/game/prayer-types";
export type { PlayerJoinedPayload } from "./types/events/event-payloads";
export type {
  PrayerState,
  PrayerBonuses,
  PlayerWithPrayerStats,
} from "./types/game/prayer-types";
// Note: PrayerDefinition + PrayerCategory already re-exported above
// from ./data/PrayerDataProvider — same underlying type.

// Logger (value) — used by every migrated SystemBase subclass for
// structured console output.
export { Logger } from "./utils/Logger";

// BankingSystem (cross-cutting server-side)
export type { BankData } from "./types/game/inventory-types";

// StoreSystem (cross-cutting server-side)
export type { Store } from "./types/game/item-types";
export { GENERAL_STORES } from "./data/banks-stores";
export { storesRegistry } from "./stores";

// ─────────────────────────────────────────────────────────────────────
// Earlier-session migration deps that need client-bundle exports too
// (the OSRS skill systems + visual systems migrated 2026-04-24 also
// import these symbols, but `index.client.ts` was never updated for
// them — the dev server crashes only surface as users actually hit
// each system at runtime).
// ─────────────────────────────────────────────────────────────────────

// SkillsSystem `Skill` enum + DeathState + ALL_WORLD_AREAS
// (AttackType already re-exported earlier in this file)
export { Skill } from "./systems/shared/character/SkillsSystem";
export { DeathState } from "./types/entities/entities";
// ALL_WORLD_AREAS + STARTER_TOWNS already re-exported above; just
// add the missing helper.
export { getRandomSpawnPoint } from "./data/world-areas";

// World systems consumed by migrated systems via `getSystem` (some
// already imported at the top of this file, re-listed here for clarity)
export { BridgeSystem } from "./systems/shared/world/BridgeSystem";
export { BuildingCollisionService } from "./systems/shared/world/BuildingCollisionService";
export { TownSystem, POISystem, RoadNetworkSystem } from "./systems/shared";

// Combat + Player system class refs — Hyperscape plugins like
// HealthRegenSystem do `getSystem<CombatSystem>("combat")`.
// (Not yet migrated; downstream plugin systems still reference them.)
export { CombatSystem } from "./systems/shared/combat";
export { PlayerSystem } from "./systems/shared/character/PlayerSystem";

// Spell-visual / arrow-visual config helpers — ProjectileRenderer.
export {
  getSpellVisual,
  getArrowVisual,
  type SpellVisualConfig,
  type ArrowVisualConfig,
} from "./data/spell-visuals";

// Collision flags + masks — used by visual systems for ray queries.
export {
  CollisionFlag,
  CollisionMask,
} from "./systems/shared/movement/CollisionFlags";

// Resource footprint constants + types.
export {
  FOOTPRINT_SIZES,
  resolveFootprint,
} from "./types/game/resource-processing-types";
export type {
  ResourceFootprint,
  FootprintDimensions,
  FootprintSpec,
} from "./types/game/resource-processing-types";

// Smithing helpers consumed by every OSRS skill system migrated.
export {
  getItemQuantity,
  getSmithingLevelSafe,
  hasSkills,
  isLooseInventoryItem,
} from "./constants/SmithingConstants";
export { getHammerItemId } from "./data/live/smithing-live";

// Tile pathfinding helpers — `hasLineOfSight` etc. consumed by
// PathfindingDebugSystem + future migrated combat.
export {
  hasLineOfSight,
  getValidRangedTiles,
  getValidMeleeTiles,
} from "./systems/shared/movement/TileSystem";

// Processing data provider + recipe types.
export { processingDataProvider } from "./data/ProcessingDataProvider";
export type {
  CraftingRecipeData,
  FletchingRecipeData,
} from "./data/ProcessingDataProvider";

// EquipmentVisual helpers already re-exported earlier in this file
// (search for "EquipmentVisualHelpers"); EquipmentVisualSystem in
// the plugin imports them from `@hyperforge/shared` and resolves
// through that earlier re-export.

// HealthRegen live-getters consumed by HealthRegenSystem in plugin.
// (`getHealthRegenRate` is in game-live; the tick-interval helpers
// are in combat-live.)
export {
  getHealthRegenIntervalTicks,
  getHealthRegenCooldownTicks,
} from "./data/live/combat-live";

// `toTHREEVector3` already re-exported earlier in this file; HealthBars
// resolves through that.

// DialogueSystem (cross-cutting server-side) — re-exported here for
// the client bundle so the plugin's DialogueSystem can resolve its
// imports when registered on the client world. (Mirrors index.ts.)
export { DialogueRegistry } from "./dialogue/DialogueRegistry";
export type {
  DialogueContext,
  DialoguePresentation,
} from "./dialogue/DialogueRunner";
export { LocalizationCatalog } from "./localization/LocalizationCatalog";
export { getNPCById } from "./data/npcs";
export type {
  NPCDialogueTree,
  NPCDialogueNode,
} from "./types/entities/npc-mob-types";
export { isValidQuestId } from "./types/game/quest-types";

// StationSpawnerSystem deps — re-exported for the client bundle.
export { stationDataProvider } from "./data/StationDataProvider";

// MobNPCSpawnerSystem deps — re-exported for the client bundle.
export { ALL_NPCS } from "./data/npcs";
export type { WorldJsonMobSpawn } from "./data/world-structure";
export type {
  LevelRange,
  NPCData,
  MobSpawnStats,
} from "./types/entities/npc-mob-types";
export type { EntitySpawnedEvent } from "./types/systems/system-interfaces";
// (InteractionType already re-exported earlier in this file as a value)

// NPCSystem deps — re-exported for the client bundle.
export type { NPCLocation } from "./data/world-areas";
export { worldAreasRegistry } from "./world-areas";
export { SHOP_ITEMS } from "./data/items";
export {
  getEntitiesSystem,
  getSystem as getSystemUtil,
} from "./utils/SystemUtils";
export type {
  BankTransaction,
  PlayerBankStorage,
  StoreTransaction,
  Town,
} from "./types/core/core";
export type { NPCSystemInfo } from "./types/systems/system-interfaces";
export { groundToTerrain } from "./utils/game/EntityUtils";

// ProcessingSystem deps — re-exported for the client bundle.
export { ITEM_IDS } from "./constants/GameConstants";
export type { ProcessingAction } from "./types/game/resource-processing-types";
export { getTargetValidator } from "./systems/shared/interaction/TargetValidator";
export { modelCache } from "./utils/rendering/ModelCache";
export { ParticleSystem } from "./systems/shared/presentation/ParticleSystem";
// (calculateDistance2D + GroundItemSystem are already in client barrel)

// AggroSystem deps — re-exported for the client bundle.
export type {
  AggroTarget,
  MobAIStateData,
} from "./types/entities/npc-mob-types";
export {
  getDefaultNpcAggroRange,
  getDefaultNpcLeashRange,
} from "./data/live/combat-live";
export {
  calculateCombatLevel,
  normalizeCombatSkills,
  shouldMobIgnorePlayer,
} from "./utils/game/CombatLevelCalculator";

// QuestSystem (cross-cutting server-side) — re-exported here for the
// client bundle.
export { validateQuestDefinition } from "./types/game/quest-types";
export type {
  QuestDefinition,
  QuestStatus,
  QuestDbStatus,
  QuestStage,
  StageProgress,
  QuestProgress,
  PlayerQuestState,
  QuestManifest,
} from "./types/game/quest-types";
export type { NPCDiedPayload } from "./types/events/event-payloads";
export { validateKillToken } from "./utils/game/KillTokenUtils";
export type { IQuestSystem } from "./types/game/quest-interfaces";
