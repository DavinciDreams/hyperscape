/**
 * Game manifest schema.
 *
 * Source of truth for the grab-bag of tuning values previously hardcoded
 * in `packages/shared/src/constants/GameConstants.ts`. Extracted as part
 * of Phase A9 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 *
 * What lives here (raw values, editor-tunable):
 *   - inventory/player/home-teleport/xp/world/physics/camera/network/test
 *   - terrain thresholds (water + slopes + tile sizes)
 *   - render and simulation distance tiers (pre-computed squared values are
 *     derived in the façade, not stored here)
 *   - mob system caps and counted-mob-id list
 *   - UI/name-tag dimensions, context-menu colors
 *   - item id map (numeric id → key) — the numeric mapping is a
 *     backwards-compat concern; the canonical item data is in items.json
 *   - skills, equipment slots, attack styles, world areas, error/success
 *     messages
 *
 * What DOES NOT live here:
 *   - Combat tables (see combat.json) — already extracted
 *   - Banking slot counts (see banking.json) — already extracted
 *   - Gathering tables (see gathering.json) — already extracted
 *   - Per-mob stats (see mobs.json)
 *   - Biome enum values (TerrainBiomeTypes is the single source of truth)
 *   - Health-bar dimensions (HealthBarRenderer is the single source of truth)
 */

import { z } from "zod";

export const InventoryConstantsSchema = z.object({
  maxInventorySlots: z.number().int().positive(),
  maxStackSize: z.number().int().positive(),
  defaultItemValue: z.number().int().nonnegative(),
});
export type InventoryConstants = z.infer<typeof InventoryConstantsSchema>;

export const PlayerConstantsSchema = z.object({
  defaultHealth: z.number().int().positive(),
  defaultMaxHealth: z.number().int().positive(),
  defaultStamina: z.number().int().positive(),
  defaultMaxStamina: z.number().int().positive(),
  baseMovementSpeed: z.number().positive(),
  runningSpeedMultiplier: z.number().positive(),
  healthRegenRate: z.number().positive(),
  staminaRegenRate: z.number().positive(),
  staminaDrainRate: z.number().positive(),
});
export type PlayerConstants = z.infer<typeof PlayerConstantsSchema>;

export const HomeTeleportConstantsSchema = z.object({
  cooldownMs: z.number().int().positive(),
  castTimeMs: z.number().int().positive(),
  castTimeTicks: z.number().int().positive(),
});
export type HomeTeleportConstants = z.infer<typeof HomeTeleportConstantsSchema>;

export const XpConstantsSchema = z.object({
  baseXpMultiplier: z.number().positive(),
  maxLevel: z.number().int().positive(),
  xpTableLength: z.number().int().positive(),
  defaultXpGain: z.object({
    combat: z.number().nonnegative(),
    woodcutting: z.number().nonnegative(),
    fishing: z.number().nonnegative(),
    firemaking: z.number().nonnegative(),
    cooking: z.number().nonnegative(),
  }),
});
export type XpConstants = z.infer<typeof XpConstantsSchema>;

export const WorldConstantsSchema = z.object({
  chunkSize: z.number().positive(),
});
export type WorldConstants = z.infer<typeof WorldConstantsSchema>;

export const TerrainConstantsSchema = z.object({
  waterThreshold: z.number(),
  waterEdgeBuffer: z.number().nonnegative(),
  minVisibleWaterDepth: z.number().nonnegative(),
  maxWalkableSlope: z.number().positive(),
  slopeCheckDistance: z.number().positive(),
  tileSize: z.number().positive(),
  terrainTileSize: z.number().positive(),
});
export type TerrainConstants = z.infer<typeof TerrainConstantsSchema>;

export const DistanceRenderSchema = z.object({
  mob: z.number().positive(),
  mobFadeStart: z.number().positive(),
  npc: z.number().positive(),
  npcFadeStart: z.number().positive(),
  player: z.number().positive(),
  playerFadeStart: z.number().positive(),
  item: z.number().positive(),
  itemFadeStart: z.number().positive(),
  vegetation: z.number().positive(),
  terrain: z.number().positive(),
});

export const DistanceSimulationSchema = z.object({
  entityUpdate: z.number().positive(),
  networkBroadcast: z.number().positive(),
  aiActive: z.number().positive(),
  aiDormant: z.number().positive(),
  chunkActive: z.number().positive(),
  chunkHysteresis: z.number().nonnegative(),
});

export const DistanceAnimationLodSchema = z.object({
  full: z.number().positive(),
  half: z.number().positive(),
  quarter: z.number().positive(),
  frozen: z.number().positive(),
  culled: z.number().positive(),
});

export const DistanceConstantsSchema = z.object({
  render: DistanceRenderSchema,
  simulation: DistanceSimulationSchema,
  animationLod: DistanceAnimationLodSchema,
});
export type DistanceConstants = z.infer<typeof DistanceConstantsSchema>;

export const MobConstantsSchema = z.object({
  spawnRadius: z.number().positive(),
  maxMobsPerArea: z.number().int().positive(),
  maxBanditMobsWorld: z.number().int().positive(),
  banditMobIdsForGlobalCap: z.array(z.string().min(1)).min(1),
});
export type MobConstants = z.infer<typeof MobConstantsSchema>;

export const UiConstantsSchema = z.object({
  nameTagWidth: z.number().positive(),
  nameTagHeight: z.number().positive(),
  uiScale: z.number().positive(),
  spriteScale: z.number().positive(),
  hudUpdateRate: z.number().int().positive(),
  chatMessageTimeout: z.number().int().positive(),
});
export type UiConstants = z.infer<typeof UiConstantsSchema>;

export const ContextMenuColorsSchema = z.object({
  item: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  npc: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  object: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  player: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type ContextMenuColors = z.infer<typeof ContextMenuColorsSchema>;

export const PhysicsConstantsSchema = z.object({
  gravity: z.number(),
  characterCapsuleRadius: z.number().positive(),
  characterCapsuleHeight: z.number().positive(),
  itemBoxSize: z.number().positive(),
  collisionMargin: z.number().nonnegative(),
  groundCheckDistance: z.number().positive(),
  stepHeight: z.number().nonnegative(),
});
export type PhysicsConstants = z.infer<typeof PhysicsConstantsSchema>;

export const CameraConstantsSchema = z.object({
  defaultCamHeight: z.number().positive(),
  thirdPersonDistance: z.number().positive(),
  topDownDistance: z.number().positive(),
  cameraLerpSpeed: z.number().positive(),
  mouseSensitivity: z.number().positive(),
  zoomSpeed: z.number().positive(),
  minZoom: z.number().positive(),
  maxZoom: z.number().positive(),
});
export type CameraConstants = z.infer<typeof CameraConstantsSchema>;

export const NetworkConstantsSchema = z.object({
  updateRate: z.number().int().positive(),
  interpolationDelay: z.number().int().positive(),
  maxPacketSize: z.number().int().positive(),
  positionSyncThreshold: z.number().positive(),
  rotationSyncThreshold: z.number().positive(),
});
export type NetworkConstants = z.infer<typeof NetworkConstantsSchema>;

export const TestConstantsSchema = z.object({
  testCubeSize: z.number().positive(),
  testTimeout: z.number().int().positive(),
  visualTestColors: z.object({
    player: z.number().int().nonnegative(),
    goblin: z.number().int().nonnegative(),
    item: z.number().int().nonnegative(),
    corpse: z.number().int().nonnegative(),
    bank: z.number().int().nonnegative(),
    store: z.number().int().nonnegative(),
    resource: z.number().int().nonnegative(),
    testCube: z.number().int().nonnegative(),
  }),
  screenshotDelay: z.number().int().positive(),
  maxTestDuration: z.number().int().positive(),
});
export type TestConstants = z.infer<typeof TestConstantsSchema>;

export const ItemIdEntrySchema = z.object({
  id: z.number().int().positive(),
  key: z.string().min(1),
});
export type ItemIdEntry = z.infer<typeof ItemIdEntrySchema>;

export const BiomeTypesSchema = z.object({
  tundra: z.string().min(1),
  forest: z.string().min(1),
  canyon: z.string().min(1),
});
export type BiomeTypes = z.infer<typeof BiomeTypesSchema>;

export const SkillsSchema = z.object({
  attack: z.string().min(1),
  strength: z.string().min(1),
  defense: z.string().min(1),
  constitution: z.string().min(1),
  ranged: z.string().min(1),
  magic: z.string().min(1),
  prayer: z.string().min(1),
  woodcutting: z.string().min(1),
  mining: z.string().min(1),
  fishing: z.string().min(1),
  firemaking: z.string().min(1),
  cooking: z.string().min(1),
  smithing: z.string().min(1),
  agility: z.string().min(1),
});
export type Skills = z.infer<typeof SkillsSchema>;

export const EquipmentSlotsGameSchema = z.object({
  weapon: z.string().min(1),
  shield: z.string().min(1),
  helmet: z.string().min(1),
  body: z.string().min(1),
  legs: z.string().min(1),
  arrows: z.string().min(1),
});
export type EquipmentSlotsGame = z.infer<typeof EquipmentSlotsGameSchema>;

export const AttackStylesSchema = z.object({
  aggressive: z.string().min(1),
  controlled: z.string().min(1),
  defensive: z.string().min(1),
  accurate: z.string().min(1),
});
export type AttackStyles = z.infer<typeof AttackStylesSchema>;

export const WorldAreasSchema = z.object({
  centralHaven: z.string().min(1),
  varrock: z.string().min(1),
  falador: z.string().min(1),
  wilderness: z.string().min(1),
  barbarianVillage: z.string().min(1),
});
export type WorldAreas = z.infer<typeof WorldAreasSchema>;

export const ErrorCodesSchema = z.object({
  invalidPlayer: z.string().min(1),
  insufficientItems: z.string().min(1),
  inventoryFull: z.string().min(1),
  invalidAction: z.string().min(1),
  combatCooldown: z.string().min(1),
  outOfRange: z.string().min(1),
  insufficientLevel: z.string().min(1),
  systemError: z.string().min(1),
});
export type ErrorCodes = z.infer<typeof ErrorCodesSchema>;

export const SuccessMessagesSchema = z.object({
  itemPickedUp: z.string().min(1),
  combatStarted: z.string().min(1),
  levelUp: z.string().min(1),
  questCompleted: z.string().min(1),
  itemEquipped: z.string().min(1),
  bankDeposit: z.string().min(1),
});
export type SuccessMessages = z.infer<typeof SuccessMessagesSchema>;

export const GameManifestSchema = z.object({
  $schema: z.literal("hyperforge.game.v1"),
  inventory: InventoryConstantsSchema,
  player: PlayerConstantsSchema,
  homeTeleport: HomeTeleportConstantsSchema,
  xp: XpConstantsSchema,
  world: WorldConstantsSchema,
  terrain: TerrainConstantsSchema,
  distance: DistanceConstantsSchema,
  mob: MobConstantsSchema,
  ui: UiConstantsSchema,
  contextMenuColors: ContextMenuColorsSchema,
  physics: PhysicsConstantsSchema,
  camera: CameraConstantsSchema,
  network: NetworkConstantsSchema,
  test: TestConstantsSchema,
  /** Numeric item id → key map. Legacy / backwards-compat layer. */
  itemIds: z.array(ItemIdEntrySchema).min(1),
  biomeTypes: BiomeTypesSchema,
  skills: SkillsSchema,
  equipmentSlots: EquipmentSlotsGameSchema,
  attackStyles: AttackStylesSchema,
  worldAreas: WorldAreasSchema,
  errorCodes: ErrorCodesSchema,
  successMessages: SuccessMessagesSchema,
});
export type GameManifest = z.infer<typeof GameManifestSchema>;
