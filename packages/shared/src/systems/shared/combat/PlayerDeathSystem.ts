import { SystemBase } from "../infrastructure/SystemBase";
import type { World } from "../../../core/World";
import { EventType } from "../../../types/events";
import { COMBAT_CONSTANTS } from "../../../constants/CombatConstants";
import { ticksToMs } from "../../../utils/game/CombatCalculations";
import type {
  InventoryItem,
  DeathLocationData,
} from "../../../types/core/core";
import { calculateDistance } from "../../../utils/game/EntityUtils";
import { DeathState } from "../../../types/entities";
import type { EntityManager } from "..";
import { ZoneDetectionSystem } from "../death/ZoneDetectionSystem";
import type { GroundItemSystem } from "../economy/GroundItemSystem";
import { DeathStateManager } from "../death/DeathStateManager";
import { SafeAreaDeathHandler } from "../death/SafeAreaDeathHandler";
import { WildernessDeathHandler } from "../death/WildernessDeathHandler";
import { ZoneType, type TransactionContext } from "../../../types/death";
import type { InventorySystem } from "../character/InventorySystem";
import { getEntityPosition } from "../../../utils/game/EntityPositionUtils";
import { STARTER_TOWNS } from "../../../data/world-areas";
import { isPositionInsideDuelArenaZone } from "../../../data/duel-manifest";
import { dataManager } from "../../../data/DataManager";

/**
 * Sanitize killedBy string to prevent injection attacks
 * - Normalizes Unicode to prevent homograph attacks (Cyrillic 'а' vs Latin 'a')
 * - Removes zero-width characters and BiDi overrides that could manipulate display
 * - Removes control characters and dangerous HTML characters
 * - Limits length to prevent buffer overflow attacks
 * - Defaults to "unknown" for invalid inputs
 */
function sanitizeKilledBy(killedBy: unknown): string {
  if (typeof killedBy !== "string" || !killedBy) {
    return "unknown";
  }

  // Normalize Unicode to NFKC form to prevent homograph attacks
  const normalized = killedBy.normalize("NFKC");

  // Build sanitized string character by character
  let sanitized = "";
  for (const char of normalized) {
    const code = char.charCodeAt(0);

    // Skip zero-width characters (U+200B-U+200D, U+FEFF)
    if (code >= 0x200b && code <= 0x200d) continue;
    if (code === 0xfeff) continue;

    // Skip BiDi override characters (U+202A-U+202E)
    if (code >= 0x202a && code <= 0x202e) continue;

    // Skip control characters (0x00-0x1F and 0x7F)
    if (code < 32 || code === 127) continue;

    // Skip dangerous HTML characters
    if ("<>'\"&".includes(char)) continue;

    sanitized += char;
  }

  sanitized = sanitized.trim().substring(0, 64); // Limit to 64 characters
  return sanitized || "unknown";
}

/**
 * OSRS-style: In safe zones, player keeps their 3 most valuable items on death.
 * These items are returned to inventory after respawn instead of going to gravestone.
 * @see https://oldschool.runescape.wiki/w/Items_Kept_on_Death
 */
const ITEMS_KEPT_ON_DEATH = 3;

/**
 * Get the value of an item from manifest data.
 * Returns 0 for unknown items (they sort to bottom and get dropped first).
 */
function getItemValue(itemId: string): number {
  const item = dataManager.getItem(itemId);
  return item?.value ?? 0;
}

/**
 * Split items into "kept" and "dropped" lists for safe zone deaths (OSRS-style).
 * Keeps the N most valuable individual items. For stacked items (quantity > 1),
 * each unit counts as one item but only the top N units across all stacks are kept.
 *
 * Returns { kept: items retained by player, dropped: items for gravestone }
 */
function splitItemsForSafeDeath(
  allItems: InventoryItem[],
  keepCount: number,
): { kept: InventoryItem[]; dropped: InventoryItem[] } {
  if (keepCount <= 0) {
    return { kept: [], dropped: [...allItems] };
  }

  // Expand stacks into individual value-tagged entries for sorting
  const expanded: Array<{
    item: InventoryItem;
    index: number;
    unitValue: number;
  }> = [];
  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const unitValue = getItemValue(item.itemId);
    // For stacked items, each unit is considered separately
    for (let q = 0; q < item.quantity; q++) {
      expanded.push({ item, index: i, unitValue });
    }
  }

  // Sort descending by value (most valuable first)
  expanded.sort((a, b) => b.unitValue - a.unitValue);

  // Track how many units to keep per original item index
  const keptCounts = new Map<number, number>();
  let remaining = keepCount;
  for (const entry of expanded) {
    if (remaining <= 0) break;
    keptCounts.set(entry.index, (keptCounts.get(entry.index) ?? 0) + 1);
    remaining--;
  }

  const kept: InventoryItem[] = [];
  const dropped: InventoryItem[] = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    const keptQty = keptCounts.get(i) ?? 0;
    const droppedQty = item.quantity - keptQty;

    if (keptQty > 0) {
      kept.push({ ...item, quantity: keptQty });
    }
    if (droppedQty > 0) {
      dropped.push({ ...item, quantity: droppedQty });
    }
  }

  return { kept, dropped };
}

/**
 * Position validation constants
 */
const POSITION_VALIDATION = {
  WORLD_BOUNDS: 10000, // Max 10km from origin
  MAX_HEIGHT: 500, // Max height
  MIN_HEIGHT: -50, // Allow some underground (caves)
} as const;

/**
 * Check if a number is valid for position use
 */
function isValidPositionNumber(n: number): boolean {
  return Number.isFinite(n) && !Number.isNaN(n);
}

/**
 * Validate and clamp a position to world bounds
 * @param position - Position to validate
 * @returns Validated and clamped position, or null if completely invalid
 */
function validatePosition(position: {
  x: number;
  y: number;
  z: number;
}): { x: number; y: number; z: number } | null {
  const { x, y, z } = position;

  // Check for invalid numbers (NaN, Infinity)
  if (
    !isValidPositionNumber(x) ||
    !isValidPositionNumber(y) ||
    !isValidPositionNumber(z)
  ) {
    return null;
  }

  // Clamp to world bounds
  return {
    x: Math.max(
      -POSITION_VALIDATION.WORLD_BOUNDS,
      Math.min(POSITION_VALIDATION.WORLD_BOUNDS, x),
    ),
    y: Math.max(
      POSITION_VALIDATION.MIN_HEIGHT,
      Math.min(POSITION_VALIDATION.MAX_HEIGHT, y),
    ),
    z: Math.max(
      -POSITION_VALIDATION.WORLD_BOUNDS,
      Math.min(POSITION_VALIDATION.WORLD_BOUNDS, z),
    ),
  };
}

/**
 * Check if position is within world bounds without clamping
 */
function isPositionInBounds(position: {
  x: number;
  y: number;
  z: number;
}): boolean {
  return (
    Math.abs(position.x) <= POSITION_VALIDATION.WORLD_BOUNDS &&
    Math.abs(position.z) <= POSITION_VALIDATION.WORLD_BOUNDS &&
    position.y >= POSITION_VALIDATION.MIN_HEIGHT &&
    position.y <= POSITION_VALIDATION.MAX_HEIGHT
  );
}

interface PlayerSystemLike {
  players?: Map<string, { position?: { x: number; y: number; z: number } }>;
}

interface DatabaseSystemLike {
  executeInTransaction: (
    fn: (tx: TransactionContext) => Promise<void>,
  ) => Promise<void>;
}

interface EquipmentSystemLike {
  getPlayerEquipment: (playerId: string) => EquipmentData | null;
  clearEquipmentImmediate?: (playerId: string) => Promise<void>;
  // Atomic clear-and-return for death system
  clearEquipmentAndReturn?: (
    playerId: string,
    tx?: TransactionContext,
  ) => Promise<Array<{ itemId: string; slot: string; quantity: number }>>;
}

interface EquipmentData {
  weapon?: { item?: { id: string; quantity?: number } };
  shield?: { item?: { id: string; quantity?: number } };
  helmet?: { item?: { id: string; quantity?: number } };
  body?: { item?: { id: string; quantity?: number } };
  legs?: { item?: { id: string; quantity?: number } };
  arrows?: { item?: { id: string; quantity?: number } };
  [key: string]: { item?: { id: string; quantity?: number } } | undefined;
}

interface TerrainSystemLike {
  isReady: () => boolean;
  getHeightAt: (x: number, z: number) => number;
}

interface NetworkLike {
  sendTo: (
    playerId: string,
    eventName: string,
    data: Record<string, unknown>,
  ) => void;
}

interface TickSystemLike {
  getCurrentTick: () => number;
  onTick: (
    callback: (tickNumber: number, deltaMs: number) => void,
    priority?: number,
  ) => () => void;
}

interface PlayerEntityLike {
  emote?: string;
  data?: {
    e?: string;
    visible?: boolean;
    name?: string;
    position?: number[];
    // Death state fields (single source of truth)
    deathState?: DeathState;
    deathPosition?: [number, number, number];
    respawnTick?: number;
  };
  node?: {
    position: { set: (x: number, y: number, z: number) => void };
  };
  position?: { x: number; y: number; z: number };
  setHealth?: (health: number) => void;
  getMaxHealth?: () => number;
  markNetworkDirty?: () => void;
}

/** Extended death location data with headstone tracking */
interface DeathLocationDataWithHeadstone extends DeathLocationData {
  headstoneId?: string;
}

/**
 * Orchestrates player death via modular handlers (zone detection, safe area, wilderness).
 * Safe zones: gravestone (5min) → ground (2min). Wilderness: ground immediately (2min).
 * @see https://oldschool.runescape.wiki/w/Death
 */
export class PlayerDeathSystem extends SystemBase {
  private deathLocations = new Map<string, DeathLocationData>();
  private respawnTimers = new Map<string, NodeJS.Timeout>();
  private playerPositions = new Map<
    string,
    { x: number; y: number; z: number }
  >();
  private playerInventories = new Map<
    string,
    { items: InventoryItem[]; coins: number }
  >();
  private pendingGravestones = new Map<
    string,
    {
      position: { x: number; y: number; z: number };
      items: InventoryItem[];
      killedBy: string;
      zoneType: ZoneType;
    }
  >();

  // OSRS-style: Items kept on death (top 3 most valuable) — returned on respawn
  private itemsKeptOnDeath = new Map<string, InventoryItem[]>();

  private lastDeathTime = new Map<string, number>();
  private readonly DEATH_COOLDOWN = ticksToMs(
    COMBAT_CONSTANTS.DEATH.COOLDOWN_TICKS,
  );

  // Tick-based respawn system (AAA quality - deterministic timing)
  private tickSystem: TickSystemLike | null = null;
  private tickUnsubscribe: (() => void) | null = null;

  private zoneDetection!: ZoneDetectionSystem;
  private groundItemSystem!: GroundItemSystem;
  private deathStateManager!: DeathStateManager;
  private safeAreaHandler!: SafeAreaDeathHandler;
  private wildernessHandler!: WildernessDeathHandler;

  constructor(world: World) {
    super(world, {
      name: "player-death",
      dependencies: {
        required: ["ground-items"], // Depends on shared GroundItemSystem
        optional: ["inventory", "entity-manager", "database"], // database for death persistence (server only)
      },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {
    this.zoneDetection = new ZoneDetectionSystem(this.world);
    await this.zoneDetection.init();

    this.groundItemSystem = this.world.getSystem("ground-items")!;
    if (!this.groundItemSystem) {
      this.logger.error("GroundItemSystem not found");
    }

    this.deathStateManager = new DeathStateManager(this.world);
    await this.deathStateManager.init();

    // Register for tick-based respawn processing (AAA quality - deterministic timing)
    // TickSystem is only available on server
    if (this.world.isServer) {
      const tickSystemRaw = this.world.getSystem("tick");
      if (
        tickSystemRaw &&
        "getCurrentTick" in tickSystemRaw &&
        "onTick" in tickSystemRaw
      ) {
        this.tickSystem = tickSystemRaw as unknown as TickSystemLike;
        // Priority 3 = AI priority, runs after combat
        this.tickUnsubscribe = this.tickSystem.onTick(
          (tickNumber) => this.processPendingRespawns(tickNumber),
          3,
        );
      }
    }

    this.safeAreaHandler = new SafeAreaDeathHandler(
      this.world,
      this.groundItemSystem,
      this.deathStateManager,
    );

    this.wildernessHandler = new WildernessDeathHandler(
      this.world,
      this.groundItemSystem,
      this.deathStateManager,
    );

    this.subscribe(
      EventType.ENTITY_DEATH,
      (data: {
        entityId: string;
        killedBy: string;
        entityType: "player" | "mob";
      }) => this.handlePlayerDeath(data),
    );
    this.subscribe(
      EventType.PLAYER_RESPAWN_REQUEST,
      (data: { playerId: string }) => this.handleRespawnRequest(data),
    );
    this.subscribe(EventType.DEATH_LOOT_COLLECT, (data: { playerId: string }) =>
      this.handleLootCollection(data),
    );
    this.subscribe(EventType.PLAYER_UNREGISTERED, (data: { id: string }) => {
      this.cleanupPlayerDeath(data);
      this.playerInventories.delete(data.id);
      this.itemsKeptOnDeath.delete(data.id);
    });
    this.subscribe(
      EventType.DEATH_HEADSTONE_EXPIRED,
      (data: { headstoneId: string; playerId: string }) =>
        this.handleHeadstoneExpired(data),
    );
    this.subscribe(
      EventType.CORPSE_EMPTY,
      (data: { corpseId: string; playerId: string }) =>
        this.handleCorpseEmpty(data),
    );
    this.subscribe(EventType.PLAYER_JOINED, (data: { playerId: string }) =>
      this.handlePlayerReconnect(data),
    );

    // Crash recovery: when server restarts and finds unrecovered deaths for offline players
    this.subscribe(
      EventType.DEATH_RECOVERED,
      (data: {
        playerId: string;
        position: { x: number; y: number; z: number };
        items: InventoryItem[];
        killedBy: string;
        zoneType: ZoneType;
      }) => this.handleDeathRecovered(data),
    );

    this.subscribe(
      EventType.PLAYER_POSITION_UPDATED,
      (data: {
        playerId: string;
        position: { x: number; y: number; z: number };
      }) => {
        this.playerPositions.set(data.playerId, data.position);
      },
    );

    this.subscribe(
      EventType.INVENTORY_UPDATED,
      (data: { playerId: string; items: InventoryItem[]; coins: number }) => {
        const inventory = this.playerInventories.get(data.playerId) || {
          items: [],
          coins: 0,
        };
        inventory.items = data.items;
        this.playerInventories.set(data.playerId, inventory);
      },
    );

    this.subscribe(
      EventType.INVENTORY_COINS_UPDATED,
      (data: { playerId: string; newAmount: number }) => {
        const inventory = this.playerInventories.get(data.playerId) || {
          items: [],
          coins: 0,
        };
        inventory.coins = data.newAmount;
        this.playerInventories.set(data.playerId, inventory);
      },
    );
  }

  /**
   * Start - called after all systems are initialized
   * Delegates to DeathStateManager to recover unfinished deaths
   */
  async start(): Promise<void> {
    await this.deathStateManager.start();
  }

  destroy(): void {
    // Unsubscribe from tick system
    if (this.tickUnsubscribe) {
      this.tickUnsubscribe();
      this.tickUnsubscribe = null;
    }

    // Clean up modular death system components
    if (this.safeAreaHandler) {
      this.safeAreaHandler.destroy();
    }
    if (this.wildernessHandler) {
      this.wildernessHandler.destroy();
    }
    for (const timer of this.respawnTimers.values()) {
      clearTimeout(timer);
    }

    // Clean up all Maps to prevent memory leaks
    this.respawnTimers.clear();
    this.deathLocations.clear();
    this.playerPositions.clear();
    this.playerInventories.clear();
    this.pendingGravestones.clear();
    this.lastDeathTime.clear();
    this.itemsKeptOnDeath.clear();
  }

  private async handlePlayerDeath(data: {
    entityId: string;
    killedBy: string;
    entityType: "player" | "mob";
    deathPosition?: { x: number; y: number; z: number };
  }): Promise<void> {
    console.warn("[DEATH-DEBUG] handlePlayerDeath received ENTITY_DEATH", {
      entityId: data.entityId,
      entityType: data.entityType,
      killedBy: data.killedBy,
      hasDeathPosition: !!data.deathPosition,
      isServer: this.world.isServer,
    });
    // Only handle player deaths - mob deaths are handled by MobDeathSystem
    if (data.entityType !== "player") {
      // Fallback: Check if entityId looks like a player (fixes rare bug if entityType missing)
      const entityId = data.entityId || "";
      if (
        !entityId.includes("player_") &&
        !entityId.includes("user_") &&
        !entityId.startsWith("player-") &&
        !entityId.startsWith("user-")
      ) {
        return; // Definitely not a player
      }
    }

    const playerId = data.entityId;

    // CRITICAL: Use position from event first (captured at exact moment of death)
    // Fall back to cache only if event doesn't include position
    let deathPosition = data.deathPosition;
    if (!deathPosition) {
      deathPosition = this.playerPositions.get(playerId);
    }
    if (!deathPosition) {
      const playerEntity = this.world.entities?.get?.(playerId);
      if (playerEntity) {
        const entityPos = getEntityPosition(playerEntity);
        if (entityPos) {
          deathPosition = { x: entityPos.x, y: entityPos.y, z: entityPos.z };
        }
      }
    }

    // Check if player is in an active duel - DuelSystem handles duel deaths.
    // Also honor streaming-duel flags to suppress normal respawn/death-lock flow.
    // No gravestone or item drops should occur during duel-owned deaths.
    const duelSystem = this.world.getSystem?.("duel") as {
      isPlayerInActiveDuel?: (playerId: string) => boolean;
    } | null;
    const deadPlayerEntity = this.world.entities?.get?.(playerId) as
      | {
          data?: {
            inStreamingDuel?: boolean;
            preventRespawn?: boolean;
          };
        }
      | undefined;
    const inStreamingDuel =
      deadPlayerEntity?.data?.inStreamingDuel === true ||
      deadPlayerEntity?.data?.preventRespawn === true;

    console.warn("[DEATH-DEBUG] duel check", {
      playerId,
      hasDuelSystem: !!duelSystem,
      isInActiveDuel: duelSystem?.isPlayerInActiveDuel?.(playerId) ?? false,
      inStreamingDuel: deadPlayerEntity?.data?.inStreamingDuel,
      preventRespawn: deadPlayerEntity?.data?.preventRespawn,
      inStreamingDuelResult: inStreamingDuel,
    });

    if (duelSystem?.isPlayerInActiveDuel?.(playerId) || inStreamingDuel) {
      console.warn("[DEATH-DEBUG] DUEL DEATH - skipping normal death flow!", {
        playerId,
      });

      // CRITICAL: Cancel any scheduled emote resets BEFORE emitting death event
      // This prevents race conditions where a scheduled "idle" reset overwrites death animation
      const combatSystem = this.world.getSystem?.("combat") as {
        animationManager?: { cancelEmoteReset?: (entityId: string) => void };
      } | null;
      if (combatSystem?.animationManager?.cancelEmoteReset) {
        combatSystem.animationManager.cancelEmoteReset(playerId);
        this.logger.info("Cancelled scheduled emote reset for duel death", {
          playerId,
        });
      }

      // Still emit death state and play animation for duel deaths
      // DuelSystem handles stakes/respawn, but we need the visual feedback
      // CRITICAL: Include deathPosition so clients can properly position the death animation
      this.emitTypedEvent(EventType.PLAYER_SET_DEAD, {
        playerId,
        isDead: true,
        deathPosition: deathPosition
          ? [deathPosition.x, deathPosition.y, deathPosition.z]
          : undefined,
      });

      // Set death animation on entity
      if (deadPlayerEntity && "data" in deadPlayerEntity) {
        const typedPlayerEntity = deadPlayerEntity as PlayerEntityLike;
        if (typedPlayerEntity.emote !== undefined) {
          typedPlayerEntity.emote = "death";
        }
        if (typedPlayerEntity.data) {
          typedPlayerEntity.data.e = "death";
          typedPlayerEntity.data.deathState = DeathState.DYING;
          this.logger.info("Set death animation for duel death", {
            playerId,
            emote: typedPlayerEntity.data.e,
          });
        }
        if ("markNetworkDirty" in deadPlayerEntity) {
          (
            deadPlayerEntity as { markNetworkDirty: () => void }
          ).markNetworkDirty();
        }
      } else {
        this.logger.warn("Could not find entity to set death animation", {
          playerId,
        });
      }

      // Award combat XP to the killer - duels should grant XP (OSRS-accurate)
      // Pass killedBy directly since CombatSystem clears attacker states on ENTITY_DEATH
      // before PlayerDeathSystem runs, making stateService queries unreliable
      this.emitCombatKillForPvP(playerId, data.killedBy);

      return;
    }

    // Use the deathPosition already captured at the top of this function
    // (from event data first, then fallbacks)
    let position = deathPosition;

    if (!position) {
      // Fallback 2: Try to get from player system
      const playerSystem = this.world.getSystem?.(
        "player",
      ) as unknown as PlayerSystemLike | null;
      if (playerSystem) {
        const player = playerSystem.players?.get?.(playerId);
        if (player?.position) {
          position = { ...player.position };
        }
      }
    }

    if (!position) {
      // Ultimate fallback: Use spawn location
      this.logger.warn(
        "Could not find position for player, using default spawn",
        {
          playerId,
        },
      );
      position = { x: 0, y: 10, z: 0 };
    }

    try {
      await this.processPlayerDeath(playerId, position, data.killedBy);
    } catch (error) {
      this.logger.error(
        "Death processing failed, resetting to alive",
        error instanceof Error ? error : undefined,
        { playerId },
      );
      // Reset player to alive state so they aren't stuck dead
      const playerEntity = this.world.entities?.get?.(playerId);
      if (playerEntity && "data" in playerEntity) {
        const typedPlayerEntity = playerEntity as PlayerEntityLike;
        if (typedPlayerEntity.data) {
          typedPlayerEntity.data.deathState = DeathState.ALIVE;
          typedPlayerEntity.data.deathPosition = undefined;
          typedPlayerEntity.data.respawnTick = undefined;
        }
        if ("setHealth" in playerEntity && "getMaxHealth" in playerEntity) {
          const maxHealth =
            (playerEntity as PlayerEntityLike).getMaxHealth?.() ?? 100;
          (playerEntity as PlayerEntityLike).setHealth?.(maxHealth);
        }
        if ("markNetworkDirty" in playerEntity) {
          (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
        }
      }
      this.emitTypedEvent(EventType.PLAYER_SET_DEAD, {
        playerId,
        isDead: false,
      });
      // Emit PLAYER_RESPAWNED so PlayerSystem restores player.alive and health
      // Without this, PlayerSystem state stays dead even though entity is reset
      this.emitTypedEvent(EventType.PLAYER_RESPAWNED, {
        playerId,
        spawnPosition: deathPosition,
      });
      this.lastDeathTime.delete(playerId);
    }
  }

  private convertEquipmentToInventoryItems(
    equipment: EquipmentData,
    playerId: string,
  ): InventoryItem[] {
    const items: InventoryItem[] = [];
    const timestamp = Date.now();
    const slots = ["weapon", "shield", "helmet", "body", "legs", "arrows"];

    for (const slotName of slots) {
      const equipSlot = equipment[slotName];
      if (equipSlot && equipSlot.item) {
        items.push({
          id: `death_equipped_${playerId}_${slotName}_${timestamp}`,
          itemId: equipSlot.item.id,
          quantity: equipSlot.item.quantity || 1,
          slot: -1, // Equipment items don't have inventory slots
          metadata: null,
        });
      }
    }

    return items;
  }

  private async processPlayerDeath(
    playerId: string,
    deathPosition: { x: number; y: number; z: number },
    killedByRaw: string,
  ): Promise<void> {
    console.warn("[DEATH-DEBUG] processPlayerDeath called", {
      playerId,
      deathPosition,
      killedBy: killedByRaw,
    });
    // Sanitize killedBy input to prevent injection attacks
    const killedBy = sanitizeKilledBy(killedByRaw);
    // Server-only - prevent client from triggering death events
    if (!this.world.isServer) {
      console.warn("[DEATH-DEBUG] ABORT: not server-side", { playerId });
      return;
    }

    // Validate death position using extracted helper
    let validatedPosition = validatePosition(deathPosition);

    if (!validatedPosition) {
      this.logger.error(
        "Invalid death position, using player entity position",
        undefined,
        {
          playerId,
          position: {
            x: deathPosition.x,
            y: deathPosition.y,
            z: deathPosition.z,
          },
        },
      );
      // Try to get player's actual position as fallback
      const playerEntity = this.world.entities.get(playerId);
      if (playerEntity?.position) {
        validatedPosition = validatePosition(playerEntity.position);
      }
      if (!validatedPosition) {
        console.warn("[DEATH-DEBUG] ABORT: no valid death position", {
          playerId,
        });
        return;
      }
    }

    // Check bounds and log warning if clamped
    if (!isPositionInBounds(deathPosition)) {
      this.logger.warn("Death position out of bounds, clamped", {
        playerId,
        position: {
          x: deathPosition.x,
          y: deathPosition.y,
          z: deathPosition.z,
        },
      });
    }

    // Use validated position from here on
    deathPosition = validatedPosition;

    // Cache Date.now() to avoid multiple system calls
    const now = Date.now();

    const lastDeath = this.lastDeathTime.get(playerId) || 0;
    if (now - lastDeath < this.DEATH_COOLDOWN) {
      console.warn("[DEATH-DEBUG] ABORT: death cooldown active", {
        playerId,
        timeSinceLast: now - lastDeath,
        cooldown: this.DEATH_COOLDOWN,
      });
      return;
    }
    console.warn("[DEATH-DEBUG] checkpoint: past cooldown check", { playerId });

    // Check for existing death lock - if player dies again before looting, clear old one
    // This matches OSRS behavior where dying again replaces your old gravestone
    console.warn("[DEATH-DEBUG] checkpoint: checking death lock", { playerId });
    let existingDeathLock;
    try {
      existingDeathLock = await this.deathStateManager.getDeathLock(playerId);
    } catch (err) {
      console.warn("[DEATH-DEBUG] ABORT: getDeathLock threw", {
        playerId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    if (existingDeathLock) {
      console.warn("[DEATH-DEBUG] clearing existing death lock", { playerId });
      try {
        await this.deathStateManager.clearDeathLock(playerId);
      } catch (err) {
        console.warn("[DEATH-DEBUG] ABORT: clearDeathLock threw", {
          playerId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }

    // Update last death time (use cached timestamp)
    this.lastDeathTime.set(playerId, now);

    // Set death state IMMEDIATELY to block any incoming loot/pickup requests
    // This must happen BEFORE the transaction to prevent race conditions where
    // items are looted between inventory snapshot and clear
    const playerEntity = this.world.entities?.get?.(playerId);
    if (playerEntity && "data" in playerEntity) {
      const typedPlayerEntity = playerEntity as PlayerEntityLike;
      if (typedPlayerEntity.data) {
        typedPlayerEntity.data.deathState = DeathState.DYING;
        if ("markNetworkDirty" in playerEntity) {
          (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
        }
      }
    }

    // Duel arena deaths should not generate gravestones, ground items, or other loot clutter.
    // Keep normal death animation + respawn timing, but preserve inventory/equipment.
    const inDuelArenaZone = isPositionInsideDuelArenaZone(
      deathPosition.x,
      deathPosition.z,
    );
    console.warn("[DEATH-DEBUG] checkpoint: duel arena zone check", {
      playerId,
      inDuelArenaZone,
      deathPosition,
    });
    if (inDuelArenaZone) {
      this.postDeathCleanup(playerId, deathPosition, [], killedBy);
      return;
    }

    // PLAYER_SET_DEAD is emitted once in postDeathCleanup after the transaction
    // succeeds. The deathState = DYING set above blocks loot during the transaction.

    // Get database system for transaction support
    const databaseSystem = this.world.getSystem(
      "database",
    ) as unknown as DatabaseSystemLike | null;
    console.warn("[DEATH-DEBUG] checkpoint: database system", {
      playerId,
      hasDB: !!databaseSystem,
      hasExecuteInTransaction: !!databaseSystem?.executeInTransaction,
    });
    if (!databaseSystem || !databaseSystem.executeInTransaction) {
      console.warn("[DEATH-DEBUG] no DB - proceeding without item drops", {
        playerId,
      });
      this.postDeathCleanup(playerId, deathPosition, [], killedBy);
      return;
    }

    // Get inventory system
    const inventorySystem = this.world.getSystem("inventory");
    console.warn("[DEATH-DEBUG] checkpoint: inventory system", {
      playerId,
      hasInventory: !!inventorySystem,
    });
    if (!inventorySystem) {
      console.warn(
        "[DEATH-DEBUG] no inventory - proceeding without item drops",
        { playerId },
      );
      this.postDeathCleanup(playerId, deathPosition, [], killedBy);
      return;
    }

    // Get equipment system
    const equipmentSystem = this.world.getSystem(
      "equipment",
    ) as unknown as EquipmentSystemLike | null;

    let itemsToDrop: InventoryItem[] = [];
    let itemsKept: InventoryItem[] = [];

    console.warn("[DEATH-DEBUG] checkpoint: starting death transaction", {
      playerId,
    });
    try {
      await databaseSystem.executeInTransaction(
        async (tx: TransactionContext) => {
          console.warn("[DEATH-DEBUG] inside transaction callback", {
            playerId,
          });
          const inventory = inventorySystem.getInventory(playerId);
          console.warn("[DEATH-DEBUG] tx: got inventory", {
            playerId,
            hasInventory: !!inventory,
            itemCount: inventory?.items?.length ?? 0,
          });

          const inventoryItems =
            inventory?.items.map((item, index) => ({
              id: `death_${playerId}_${Date.now()}_${index}`,
              itemId: item.itemId,
              quantity: item.quantity,
              slot: item.slot,
              metadata: null,
            })) || [];

          let equipmentItems: InventoryItem[] = [];
          if (equipmentSystem) {
            if (equipmentSystem.clearEquipmentAndReturn) {
              console.warn(
                "[DEATH-DEBUG] tx: calling clearEquipmentAndReturn",
                { playerId },
              );
              const clearedEquipment =
                await equipmentSystem.clearEquipmentAndReturn(playerId, tx);
              console.warn("[DEATH-DEBUG] tx: clearEquipmentAndReturn done", {
                playerId,
                count: clearedEquipment.length,
              });
              equipmentItems = clearedEquipment.map((item, index) => ({
                id: `death_equip_${playerId}_${Date.now()}_${index}`,
                itemId: item.itemId,
                quantity: item.quantity,
                slot: -1,
                metadata: null,
              }));
            } else {
              const equipment = equipmentSystem.getPlayerEquipment(playerId);
              if (equipment) {
                equipmentItems = this.convertEquipmentToInventoryItems(
                  equipment,
                  playerId,
                );
              }
            }
          }

          const allItems = [...inventoryItems, ...equipmentItems];
          const zoneType = this.zoneDetection.getZoneType(deathPosition);
          console.warn("[DEATH-DEBUG] tx: zone type", {
            playerId,
            zoneType,
            totalItems: allItems.length,
          });

          // OSRS-style: In safe zones, keep 3 most valuable items
          if (zoneType === ZoneType.SAFE_AREA) {
            const split = splitItemsForSafeDeath(allItems, ITEMS_KEPT_ON_DEATH);
            itemsToDrop = split.dropped;
            itemsKept = split.kept;
            console.warn("[DEATH-DEBUG] tx: safe zone split", {
              playerId,
              kept: itemsKept.map((i) => `${i.itemId} x${i.quantity}`),
              dropped: itemsToDrop.length,
            });

            this.pendingGravestones.set(playerId, {
              position: deathPosition,
              items: itemsToDrop,
              killedBy,
              zoneType,
            });

            console.warn("[DEATH-DEBUG] tx: creating death lock", { playerId });
            await this.deathStateManager.createDeathLock(
              playerId,
              {
                gravestoneId: "",
                position: deathPosition,
                zoneType: ZoneType.SAFE_AREA,
                itemCount: itemsToDrop.length,
                items: itemsToDrop.map((item) => ({
                  itemId: item.itemId,
                  quantity: item.quantity,
                })),
                killedBy,
              },
              tx,
            );
            console.warn("[DEATH-DEBUG] tx: death lock created", { playerId });
          } else {
            // Wilderness: drop everything
            itemsToDrop = allItems;
            itemsKept = [];
            console.warn("[DEATH-DEBUG] tx: calling wildernessHandler", {
              playerId,
            });
            await this.wildernessHandler.handleDeath(
              playerId,
              deathPosition,
              itemsToDrop,
              killedBy,
              zoneType,
              tx,
            );
            console.warn("[DEATH-DEBUG] tx: wildernessHandler done", {
              playerId,
            });
          }

          // Clear all inventory in memory (kept items will be re-added after respawn)
          // skipPersist=true: we're inside a DB transaction — independent persist
          // would open a nested transaction that deadlocks on SQLite.
          console.warn("[DEATH-DEBUG] tx: clearing inventory", { playerId });
          await inventorySystem.clearInventoryImmediate(playerId, true);
          console.warn("[DEATH-DEBUG] tx: inventory cleared", { playerId });

          if (
            equipmentSystem &&
            !equipmentSystem.clearEquipmentAndReturn &&
            equipmentSystem.clearEquipmentImmediate
          ) {
            await equipmentSystem.clearEquipmentImmediate(playerId);
          }
          console.warn("[DEATH-DEBUG] tx: transaction callback COMPLETE", {
            playerId,
          });
        },
      );

      // CRITICAL: Persist equipment clearing to DB AFTER transaction completes
      // (inside the transaction it would deadlock on SQLite)
      if (equipmentSystem) {
        try {
          // saveEquipmentToDatabase is private, so use clearEquipmentImmediate
          // which saves to DB. Equipment is already cleared in memory by
          // clearEquipmentAndReturn, so this just persists the empty state.
          if (equipmentSystem.clearEquipmentImmediate) {
            await equipmentSystem.clearEquipmentImmediate(playerId);
          }
        } catch (err) {
          console.warn(
            "[DEATH-DEBUG] equipment DB persist failed (non-fatal)",
            {
              playerId,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        }
      }

      // Persist empty inventory to DB (was skipped inside transaction)
      try {
        await inventorySystem.clearInventoryImmediate(playerId, false);
      } catch (err) {
        console.warn("[DEATH-DEBUG] inventory DB persist failed (non-fatal)", {
          playerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      console.warn(
        "[DEATH-DEBUG] checkpoint: transaction complete, calling postDeathCleanup",
        { playerId },
      );
      this.postDeathCleanup(
        playerId,
        deathPosition,
        itemsToDrop,
        killedBy,
        itemsKept,
      );
    } catch (error) {
      console.warn("[DEATH-DEBUG] ABORT: death transaction THREW", {
        playerId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private postDeathCleanup(
    playerId: string,
    deathPosition: { x: number; y: number; z: number },
    itemsToDrop: InventoryItem[],
    killedBy: string,
    keptItems?: InventoryItem[],
  ): void {
    console.warn("[DEATH-DEBUG] postDeathCleanup called", {
      playerId,
      deathPosition,
      itemCount: itemsToDrop.length,
      keptCount: keptItems?.length ?? 0,
      killedBy,
      hasTickSystem: !!this.tickSystem,
    });

    // Store items to return on respawn (OSRS keep-3)
    if (keptItems && keptItems.length > 0) {
      this.itemsKeptOnDeath.set(playerId, keptItems);
    }

    const deathData: DeathLocationData = {
      playerId,
      deathPosition,
      timestamp: Date.now(),
      items: itemsToDrop,
    };
    this.deathLocations.set(playerId, deathData);

    // PVP XP: Emit COMBAT_KILL event if killed by another player
    // This allows SkillsSystem to award XP for PvP kills
    // Pass killedBy directly since CombatSystem clears attacker states on ENTITY_DEATH
    // before PlayerDeathSystem runs, making stateService queries unreliable
    this.emitCombatKillForPvP(playerId, killedBy);

    // Set player as dead and disable movement
    this.emitTypedEvent(EventType.PLAYER_SET_DEAD, {
      playerId,
      isDead: true,
      deathPosition,
    });

    // Emit death screen so the client shows the death overlay
    this.emitTypedEvent(EventType.UI_DEATH_SCREEN, {
      playerId,
      message: `Oh dear, you are dead!`,
      killedBy,
      respawnTime: ticksToMs(COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS),
    });

    const playerEntity = this.world.entities?.get?.(playerId);
    if (playerEntity && "data" in playerEntity) {
      const entityData = playerEntity.data as { e?: string; visible?: boolean };
      entityData.visible = true;

      const typedPlayerEntity = playerEntity as PlayerEntityLike;
      if (typedPlayerEntity.emote !== undefined) {
        typedPlayerEntity.emote = "death";
      }
      if (typedPlayerEntity.data) {
        typedPlayerEntity.data.e = "death";

        // AAA QUALITY: Set entity death state (single source of truth)
        typedPlayerEntity.data.deathState = DeathState.DYING;
        typedPlayerEntity.data.deathPosition = [
          deathPosition.x,
          deathPosition.y,
          deathPosition.z,
        ];

        // Calculate respawn tick using tick system
        // Use safe addition to prevent integer overflow
        const currentTick = this.tickSystem?.getCurrentTick() ?? 0;
        const animationTicks = COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS;
        // Cap at 32-bit max to prevent overflow during serialization (MessagePack, etc.)
        const MAX_TICK = 2147483647; // 2^31-1, safe for 32-bit serialization
        const MAX_SAFE_TICK = MAX_TICK - animationTicks;
        typedPlayerEntity.data.respawnTick =
          currentTick > MAX_SAFE_TICK ? MAX_TICK : currentTick + animationTicks;
        console.warn("[DEATH-DEBUG] respawnTick set", {
          playerId,
          currentTick,
          animationTicks,
          respawnTick: typedPlayerEntity.data.respawnTick,
          deathState: typedPlayerEntity.data.deathState,
        });
      }

      if ("markNetworkDirty" in playerEntity) {
        (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
      }
    } else {
      console.warn(
        "[DEATH-DEBUG] postDeathCleanup: no playerEntity found for death state",
        {
          playerId,
          entityExists: !!playerEntity,
        },
      );
    }

    // Fallback: Use setTimeout if tick system is not available (e.g., client-side)
    // This maintains backward compatibility while preferring tick-based timing
    if (!this.tickSystem) {
      const DEATH_ANIMATION_DURATION = ticksToMs(
        COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS,
      );
      const respawnTimer = setTimeout(() => {
        if (playerEntity && "data" in playerEntity) {
          const entityData = playerEntity.data as {
            e?: string;
            visible?: boolean;
          };
          entityData.visible = false;
          if ("markNetworkDirty" in playerEntity) {
            (
              playerEntity as { markNetworkDirty: () => void }
            ).markNetworkDirty();
          }
        }

        this.initiateRespawn(playerId).catch((err) => {
          this.logger.error(
            "Respawn failed",
            err instanceof Error ? err : undefined,
            { playerId },
          );
        });
      }, DEATH_ANIMATION_DURATION);

      this.respawnTimers.set(playerId, respawnTimer);
    }
    // Note: If tickSystem is available, respawn is handled by processPendingRespawns()
  }

  /**
   * Emit COMBAT_KILL event for PvP kills so SkillsSystem can award XP.
   *
   * Uses killedBy from the ENTITY_DEATH event as the primary attacker source.
   * CombatSystem handles ENTITY_DEATH before PlayerDeathSystem and clears all
   * attacker states via clearStatesTargeting(), so the stateService query is
   * used only as a fallback for multi-attacker scenarios.
   */
  private emitCombatKillForPvP(deadPlayerId: string, killedBy?: string): void {
    // Collect unique player attacker IDs
    const playerAttackerIds = new Set<string>();

    // Primary: use killedBy from the death event (always available, not cleared)
    if (killedBy && this.world.entities?.players?.has(killedBy)) {
      playerAttackerIds.add(killedBy);
    }

    // Secondary: try stateService for any additional attackers (may be empty
    // if CombatSystem already cleared states, which is the common case)
    const combatSystem = this.world.getSystem("combat") as {
      stateService?: {
        getAttackersTargeting: (
          entityId: string,
        ) => Array<{ toString: () => string }>;
        getCombatData: (entityId: string) => {
          attackerType: "player" | "mob";
        } | null;
      };
    } | null;

    if (combatSystem?.stateService) {
      const attackers =
        combatSystem.stateService.getAttackersTargeting(deadPlayerId);
      for (const attackerId of attackers) {
        const attackerIdStr = attackerId.toString();
        const combatData =
          combatSystem.stateService.getCombatData(attackerIdStr);
        if (combatData?.attackerType === "player") {
          playerAttackerIds.add(attackerIdStr);
        }
      }
    }

    if (playerAttackerIds.size === 0) {
      return;
    }

    // Get dead player's max health for damage calculation (same approach as MobEntity)
    const deadPlayerEntity = this.world.entities?.get?.(deadPlayerId);
    let maxHealth = 10; // Default fallback
    if (deadPlayerEntity && "getMaxHealth" in deadPlayerEntity) {
      maxHealth =
        (deadPlayerEntity as { getMaxHealth: () => number }).getMaxHealth() ||
        10;
    }

    // Get systems for weapon-type-aware attack style detection (same approach as MobEntity)
    const playerSystem = this.world.getSystem("player") as {
      getPlayerAttackStyle?: (playerId: string) => { id: string } | null;
    } | null;
    const equipmentSystem = this.world.getSystem("equipment") as {
      getPlayerEquipment?: (playerId: string) => {
        weapon?: { item?: { weaponType?: string; attackType?: string } };
      } | null;
    } | null;

    const meleeStyles = new Set([
      "accurate",
      "aggressive",
      "defensive",
      "controlled",
    ]);

    // Emit COMBAT_KILL for each player attacker (award XP to all who contributed)
    for (const attackerIdStr of playerAttackerIds) {
      // Detect attack style from equipped weapon type (not just UI selection)
      // This matches MobEntity logic — a bow should always grant Ranged XP
      const equipment = equipmentSystem?.getPlayerEquipment?.(attackerIdStr);
      const weapon = equipment?.weapon?.item;
      let attackStyle = "aggressive";

      const attackerEntity = this.world.getPlayer?.(attackerIdStr);
      const selectedSpell = (attackerEntity?.data as { selectedSpell?: string })
        ?.selectedSpell;

      if (weapon) {
        const attackType = weapon.attackType?.toLowerCase();
        const weaponType = weapon.weaponType?.toLowerCase();

        if (
          attackType === "ranged" ||
          weaponType === "bow" ||
          weaponType === "crossbow"
        ) {
          attackStyle = "ranged";
        } else if (
          (attackType === "magic" ||
            weaponType === "staff" ||
            weaponType === "wand") &&
          selectedSpell
        ) {
          attackStyle = "magic";
        } else {
          const styleData = playerSystem?.getPlayerAttackStyle?.(attackerIdStr);
          const playerStyle = styleData?.id;
          attackStyle =
            playerStyle && meleeStyles.has(playerStyle)
              ? playerStyle
              : "aggressive";
        }
      } else if (selectedSpell) {
        attackStyle = "magic";
      } else {
        const styleData = playerSystem?.getPlayerAttackStyle?.(attackerIdStr);
        const playerStyle = styleData?.id;
        attackStyle =
          playerStyle && meleeStyles.has(playerStyle)
            ? playerStyle
            : "aggressive";
      }

      // Emit COMBAT_KILL event - SkillsSystem will handle XP distribution
      this.emitTypedEvent(EventType.COMBAT_KILL, {
        attackerId: attackerIdStr,
        targetId: deadPlayerId,
        damageDealt: maxHealth,
        attackStyle: attackStyle,
      });
    }
  }

  private async initiateRespawn(playerId: string): Promise<void> {
    this.respawnTimers.delete(playerId);
    this.logger.info("initiateRespawn called", { playerId });

    const deathData = this.deathLocations.get(playerId);
    if (!deathData) {
      this.logger.info(
        "No death data in deathLocations, checking pendingGravestones",
        {
          playerId,
        },
      );
    }

    // Get spawn position from manifest starter town (Central Haven at origin)
    const centralHaven = STARTER_TOWNS["central_haven"];
    const spawnPosition = centralHaven
      ? {
          x: (centralHaven.bounds.minX + centralHaven.bounds.maxX) / 2,
          y: 0,
          z: (centralHaven.bounds.minZ + centralHaven.bounds.maxZ) / 2,
        }
      : COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_POSITION;
    const spawnTownName =
      centralHaven?.name ?? COMBAT_CONSTANTS.DEATH.DEFAULT_RESPAWN_TOWN;

    // CRITICAL: Must await to ensure death lock is cleared before next death
    await this.respawnPlayer(playerId, spawnPosition, spawnTownName);

    const gravestoneData = this.pendingGravestones.get(playerId);
    if (gravestoneData && gravestoneData.items.length > 0) {
      this.logger.info("Spawning gravestone", {
        playerId,
        itemCount: gravestoneData.items.length,
        position: {
          x: gravestoneData.position.x,
          y: gravestoneData.position.y,
          z: gravestoneData.position.z,
        },
      });
      const gravestoneId = await this.safeAreaHandler.spawnAndTrackGravestone(
        playerId,
        gravestoneData.position,
        gravestoneData.items,
        gravestoneData.killedBy,
      );
      if (gravestoneId) {
        await this.deathStateManager.updateGravestoneId(playerId, gravestoneId);
      }
      this.pendingGravestones.delete(playerId);
    } else {
      this.logger.info("No pending gravestone data", { playerId });
    }
  }

  private async respawnPlayer(
    playerId: string,
    spawnPosition: { x: number; y: number; z: number },
    townName: string,
  ): Promise<void> {
    const playerEntity = this.world.entities?.get?.(playerId);
    if (playerEntity) {
      if ("setHealth" in playerEntity && "getMaxHealth" in playerEntity) {
        const typedEntity = playerEntity as PlayerEntityLike;
        const maxHealth = typedEntity.getMaxHealth?.() ?? 100;
        typedEntity.setHealth?.(maxHealth);
      }

      if ("data" in playerEntity) {
        const typedPlayerEntity = playerEntity as PlayerEntityLike;
        const entityData = typedPlayerEntity.data!;

        entityData.e = "idle";
        entityData.visible = true;

        // AAA QUALITY: Clear death state (single source of truth)
        entityData.deathState = DeathState.ALIVE;
        entityData.deathPosition = undefined;
        entityData.respawnTick = undefined;

        if ("markNetworkDirty" in playerEntity) {
          (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
        }
      }
    }

    // Ground to terrain (use same logic as initial player spawn)
    const terrainSystem = this.world.getSystem(
      "terrain",
    ) as unknown as TerrainSystemLike | null;
    let groundedY = spawnPosition.y;

    if (terrainSystem && terrainSystem.isReady && terrainSystem.isReady()) {
      // Get terrain height at respawn position
      const terrainHeight = terrainSystem.getHeightAt(
        spawnPosition.x,
        spawnPosition.z,
      );
      if (Number.isFinite(terrainHeight)) {
        // Player feet at ground level (no offset)
        groundedY = terrainHeight;
      } else {
        groundedY = 10; // Fallback safe height
      }
    } else {
      // Terrain not ready; use safe height
      groundedY = 10;
    }

    const groundedPosition = {
      x: spawnPosition.x,
      y: groundedY,
      z: spawnPosition.z,
    };

    if (playerEntity) {
      if ("node" in playerEntity && playerEntity.node) {
        const typedEntity = playerEntity as PlayerEntityLike;
        typedEntity.node?.position.set(
          groundedPosition.x,
          groundedPosition.y,
          groundedPosition.z,
        );
      }

      if ("data" in playerEntity) {
        const entityData = playerEntity.data as {
          position?: number[];
        };

        if (Array.isArray(entityData.position)) {
          entityData.position[0] = groundedPosition.x;
          entityData.position[1] = groundedPosition.y;
          entityData.position[2] = groundedPosition.z;
        }

        if ("markNetworkDirty" in playerEntity) {
          (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
        }
      }

      if ("position" in playerEntity && playerEntity.position) {
        const pos = playerEntity.position as {
          x: number;
          y: number;
          z: number;
        };
        pos.x = groundedPosition.x;
        pos.y = groundedPosition.y;
        pos.z = groundedPosition.z;
      }
    }

    // Send teleport packet to client
    if (this.world.network && "sendTo" in this.world.network) {
      (this.world.network as NetworkLike).sendTo(playerId, "playerTeleport", {
        playerId,
        position: [groundedPosition.x, groundedPosition.y, groundedPosition.z],
      });
    }

    this.emitTypedEvent(EventType.PLAYER_RESPAWNED, {
      playerId,
      spawnPosition: groundedPosition,
      townName,
      deathLocation: this.deathLocations.get(playerId)?.deathPosition,
    });

    this.emitTypedEvent(EventType.PLAYER_SET_DEAD, {
      playerId,
      isDead: false,
    });

    // Close death screen overlay on client
    this.emitTypedEvent(EventType.UI_DEATH_SCREEN_CLOSE, {
      playerId,
    });

    // OSRS-style: Return kept items to inventory after respawn
    const keptItems = this.itemsKeptOnDeath.get(playerId);
    if (keptItems && keptItems.length > 0) {
      this.itemsKeptOnDeath.delete(playerId);
      const inventorySystem = this.world.getSystem(
        "inventory",
      ) as InventorySystem | null;
      if (inventorySystem) {
        for (const item of keptItems) {
          try {
            await inventorySystem.addItemDirect(playerId, {
              itemId: item.itemId,
              quantity: item.quantity,
            });
          } catch (err) {
            console.warn("[DEATH-DEBUG] Failed to return kept item", {
              playerId,
              itemId: item.itemId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        console.warn("[DEATH-DEBUG] Returned kept items on respawn", {
          playerId,
          count: keptItems.length,
          items: keptItems.map((i) => `${i.itemId} x${i.quantity}`),
        });
      }
    }

    const hasGravestone = this.deathLocations.has(playerId);
    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId,
      message: hasGravestone
        ? `You have respawned in ${townName}. Your items are at your gravestone where you died.`
        : `You have respawned in ${townName}.`,
      type: "info",
    });

    // NOTE: Do NOT clear death lock here - it must persist for crash recovery!
    // Death lock is cleared when:
    // 1. All items are looted from gravestone (CORPSE_EMPTY event)
    // 2. Ground items despawn (timeout)
    // This ensures that if server crashes before items are looted, they can be recovered.

    // Clear death cooldown so player can die again immediately after respawn
    this.lastDeathTime.delete(playerId);
  }

  private handleRespawnRequest(data: { playerId: string }): void {
    // Allow immediate respawn if timer is still active (e.g., clicked respawn button)
    const timer = this.respawnTimers.get(data.playerId);
    if (timer) {
      clearTimeout(timer);
      this.respawnTimers.delete(data.playerId);
    }

    // Also check tick-based respawn: if player is in DYING state, allow immediate respawn
    const playerEntity = this.world.entities?.get?.(data.playerId);
    const isDying =
      playerEntity &&
      "data" in playerEntity &&
      (playerEntity as PlayerEntityLike).data?.deathState === DeathState.DYING;

    if (timer || isDying) {
      this.initiateRespawn(data.playerId).catch((err) => {
        this.logger.error(
          "Respawn request failed",
          err instanceof Error ? err : undefined,
          { playerId: data.playerId },
        );
      });
    }
  }

  private async handlePlayerReconnect(data: {
    playerId: string;
  }): Promise<void> {
    if (!this.world.isServer) {
      return; // Only server validates death state
    }

    await this.onPlayerReconnect(data.playerId);
  }

  /** Validates death state on reconnect - blocks inventory load if death lock exists */
  async onPlayerReconnect(playerId: string): Promise<{
    blockInventoryLoad: boolean;
  }> {
    this.logger.info("onPlayerReconnect called", { playerId });
    const deathLock = await this.deathStateManager.getDeathLock(playerId);

    if (deathLock) {
      this.logger.info("Found death lock for player", {
        playerId,
        itemCount: deathLock.itemCount,
        recoveryItems: deathLock.items?.length || 0,
      });
      // Check if death lock is stale (older than 1 hour)
      // Stale death locks should be cleared, not restored
      const MAX_DEATH_LOCK_AGE = ticksToMs(
        COMBAT_CONSTANTS.DEATH.STALE_LOCK_AGE_TICKS,
      );
      const deathAge = Date.now() - deathLock.timestamp;

      if (deathAge > MAX_DEATH_LOCK_AGE) {
        await this.deathStateManager.clearDeathLock(playerId);
        return { blockInventoryLoad: false };
      }

      // Convert death lock items to InventoryItem format for gravestone
      const itemsFromDeathLock: InventoryItem[] = (deathLock.items || []).map(
        (item, index) => ({
          id: `recovery_${playerId}_${Date.now()}_${index}`,
          itemId: item.itemId,
          quantity: item.quantity,
          slot: index,
          metadata: null,
        }),
      );

      // Restore death location to memory WITH items from death lock
      this.deathLocations.set(playerId, {
        playerId,
        deathPosition: deathLock.position,
        timestamp: deathLock.timestamp,
        items: itemsFromDeathLock,
      });

      // Restore pendingGravestones so initiateRespawn will spawn the gravestone
      if (itemsFromDeathLock.length > 0) {
        this.pendingGravestones.set(playerId, {
          position: deathLock.position,
          items: itemsFromDeathLock,
          killedBy: deathLock.killedBy || "unknown",
          zoneType: deathLock.zoneType,
        });
        this.logger.info(
          "Restored items from death lock, will spawn gravestone on respawn",
          {
            playerId,
            itemCount: itemsFromDeathLock.length,
          },
        );
      } else {
        this.logger.info("No items to restore, skipping gravestone spawn", {
          playerId,
        });
      }

      // Immediately trigger respawn (RuneScape-style - no waiting, no screen)
      // Very short delay, then auto-respawn (just enough for world to load)
      const reconnectTimer = setTimeout(() => {
        this.respawnTimers.delete(playerId);
        this.initiateRespawn(playerId).catch((err) => {
          this.logger.error(
            "Reconnect respawn failed",
            err instanceof Error ? err : undefined,
            { playerId },
          );
        });
      }, ticksToMs(COMBAT_CONSTANTS.DEATH.RECONNECT_RESPAWN_DELAY_TICKS));
      this.respawnTimers.set(playerId, reconnectTimer);

      // Block inventory load until respawn
      return { blockInventoryLoad: true };
    }

    return { blockInventoryLoad: false };
  }

  /**
   * Handle crash recovery for offline players.
   * Called when DeathStateManager finds unrecovered deaths on server restart
   * where items exist but no gravestone/ground items are in the world.
   * Spawns a new gravestone with the recovered items.
   */
  private handleDeathRecovered(data: {
    playerId: string;
    position: { x: number; y: number; z: number };
    items: InventoryItem[];
    killedBy: string;
    zoneType: ZoneType;
  }): void {
    if (!this.world.isServer) return;

    // Guard against double-recovery
    if (this.pendingGravestones.has(data.playerId)) {
      this.logger.warn(
        "Skipping death recovery, already has pending gravestone",
        {
          playerId: data.playerId,
        },
      );
      return;
    }

    if (data.items.length === 0) {
      this.logger.info("No items to recover, skipping", {
        playerId: data.playerId,
      });
      return;
    }

    this.logger.info("Recovering death for offline player", {
      playerId: data.playerId,
      itemCount: data.items.length,
    });

    // Spawn gravestone via SafeAreaDeathHandler (tick-based expiration)
    this.safeAreaHandler
      .spawnAndTrackGravestone(
        data.playerId,
        data.position,
        data.items,
        data.killedBy,
      )
      .then(async (gravestoneId) => {
        if (gravestoneId) {
          await this.deathStateManager.updateGravestoneId(
            data.playerId,
            gravestoneId,
          );
        }
      })
      .catch((err) => {
        this.logger.error(
          "Failed to spawn recovery gravestone",
          err instanceof Error ? err : undefined,
          { playerId: data.playerId },
        );
      });
  }

  private handleLootCollection(data: { playerId: string }): void {
    const deathData = this.deathLocations.get(data.playerId);
    if (!deathData) {
      return;
    }

    // Check if player is near their death location (within 3 meters) - reactive pattern
    const playerPosition = this.playerPositions.get(data.playerId);
    if (!playerPosition) {
      this.logger.error(`Could not get position for player ${data.playerId}`);
      return;
    }

    const distance = calculateDistance(playerPosition, deathData.deathPosition);

    if (distance > 3) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: data.playerId,
        message: "You need to be closer to your grave to collect your items.",
        type: "error",
      });
      return;
    }

    // Return all items to player
    let returnedItems = 0;
    for (const item of deathData.items) {
      this.emitTypedEvent(EventType.INVENTORY_CAN_ADD, {
        playerId: data.playerId,
        item: item,
        callback: (canAdd: boolean) => {
          if (canAdd) {
            this.emitTypedEvent(EventType.INVENTORY_ITEM_ADDED, {
              playerId: data.playerId,
              item: item,
            });
            returnedItems++;
          } else {
            // If inventory full, create ground item
            this.emitTypedEvent(EventType.WORLD_CREATE_GROUND_ITEM, {
              position: playerPosition,
              item: item,
            });
          }
        },
      });
    }

    // Clear death location and timers
    this.clearDeathLocation(data.playerId);

    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId: data.playerId,
      message: `Retrieved ${returnedItems} items from your grave.`,
      type: "success",
    });
  }

  private despawnDeathItems(playerId: string): void {
    const deathData = this.deathLocations.get(playerId) as
      | DeathLocationDataWithHeadstone
      | undefined;
    if (!deathData) return;

    const headstoneId = deathData.headstoneId;
    if (headstoneId) {
      const entityManager = this.world.getSystem("entity-manager");
      if (entityManager) {
        entityManager.destroyEntity(headstoneId);
      }
    }

    this.clearDeathLocation(playerId);

    this.emitTypedEvent(EventType.UI_MESSAGE, {
      playerId,
      message: "Your death items have despawned due to timeout.",
      type: "warning",
    });
  }

  private clearDeathLocation(playerId: string): void {
    // Clear all data and timers for this player's death
    this.deathLocations.delete(playerId);

    const respawnTimer = this.respawnTimers.get(playerId);
    if (respawnTimer) {
      clearTimeout(respawnTimer);
      this.respawnTimers.delete(playerId);
    }
  }

  /**
   * Reset death state when death processing fails early (system unavailable).
   * Prevents players from being permanently stuck in DYING state.
   * Restores entity health AND PlayerSystem state to avoid stuck-at-0-HP.
   */
  private resetDeathState(
    playerId: string,
    playerEntity: ReturnType<NonNullable<typeof this.world.entities>["get"]>,
  ): void {
    if (playerEntity && "data" in playerEntity) {
      const typedPlayerEntity = playerEntity as PlayerEntityLike;
      if (typedPlayerEntity.data) {
        typedPlayerEntity.data.deathState = DeathState.ALIVE;
        typedPlayerEntity.data.deathPosition = undefined;
        typedPlayerEntity.data.respawnTick = undefined;
      }
      // Restore entity health so player isn't stuck at 0 HP
      if ("setHealth" in playerEntity && "getMaxHealth" in playerEntity) {
        const maxHealth =
          (playerEntity as PlayerEntityLike).getMaxHealth?.() ?? 100;
        (playerEntity as PlayerEntityLike).setHealth?.(maxHealth);
      }
      if ("markNetworkDirty" in playerEntity) {
        (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
      }
    }
    this.emitTypedEvent(EventType.PLAYER_SET_DEAD, {
      playerId,
      isDead: false,
    });
    // Restore PlayerSystem state (player.alive and health)
    this.emitTypedEvent(EventType.PLAYER_RESPAWNED, {
      playerId,
      spawnPosition: playerEntity?.position ?? { x: 0, y: 10, z: 0 },
    });
    this.logger.warn("Reset death state after failed death processing", {
      playerId,
    });
  }

  private cleanupPlayerDeath(data: { id: string }): void {
    const playerId = data.id;
    this.clearDeathLocation(playerId);
    this.playerPositions.delete(playerId);
    this.lastDeathTime.delete(playerId);
    this.pendingGravestones.delete(playerId);
  }

  private handleHeadstoneExpired(data: {
    headstoneId: string;
    playerId: string;
  }): void {
    this.despawnDeathItems(data.playerId);
  }

  private async handleCorpseEmpty(data: {
    corpseId: string;
    playerId: string;
  }): Promise<void> {
    this.logger.info("All items looted, clearing death lock", {
      corpseId: data.corpseId,
      playerId: data.playerId,
    });

    // Cancel tick-based gravestone expiration to prevent duplicate ground item spawns
    this.safeAreaHandler.cancelGravestoneTimer(data.corpseId);

    await this.deathStateManager.clearDeathLock(data.playerId);
  }

  getDeathLocation(playerId: string): DeathLocationData | undefined {
    // AAA QUALITY: Check entity deathPosition first (single source of truth)
    const playerEntity = this.world.entities?.get?.(playerId);
    if (playerEntity && "data" in playerEntity) {
      const typedEntity = playerEntity as PlayerEntityLike;
      if (
        typedEntity.data?.deathState === DeathState.DYING &&
        typedEntity.data?.deathPosition
      ) {
        const [x, y, z] = typedEntity.data.deathPosition;
        return {
          playerId,
          deathPosition: { x, y, z },
          timestamp: Date.now(), // Not available from entity, use now
          items: this.deathLocations.get(playerId)?.items || [],
        };
      }
    }
    // Fallback to deathLocations Map for backward compatibility
    return this.deathLocations.get(playerId);
  }

  getAllDeathLocations(): DeathLocationData[] {
    return Array.from(this.deathLocations.values());
  }

  isPlayerDead(playerId: string): boolean {
    // AAA QUALITY: Check entity deathState first (single source of truth)
    const playerEntity = this.world.entities?.get?.(playerId);
    if (playerEntity && "data" in playerEntity) {
      const typedEntity = playerEntity as PlayerEntityLike;
      if (typedEntity.data?.deathState) {
        return (
          typedEntity.data.deathState === DeathState.DYING ||
          typedEntity.data.deathState === DeathState.DEAD
        );
      }
    }
    // Fallback to deathLocations Map for backward compatibility
    return this.deathLocations.has(playerId);
  }

  getRemainingRespawnTime(playerId: string): number {
    const deathData = this.deathLocations.get(playerId);
    if (!deathData) return 0;

    const elapsed = Date.now() - deathData.timestamp;
    return Math.max(
      0,
      ticksToMs(COMBAT_CONSTANTS.DEATH.ANIMATION_TICKS) - elapsed,
    );
  }

  getRemainingDespawnTime(playerId: string): number {
    const deathData = this.deathLocations.get(playerId);
    if (!deathData) return 0;

    const elapsed = Date.now() - deathData.timestamp;
    return Math.max(0, ticksToMs(COMBAT_CONSTANTS.GRAVESTONE_TICKS) - elapsed);
  }

  forceRespawn(playerId: string): void {
    this.handleRespawnRequest({ playerId });
  }

  // Headstone API (now uses EntityManager instead of HeadstoneApp objects)
  getPlayerHeadstoneId(playerId: string): string | undefined {
    const deathData = this.deathLocations.get(playerId) as
      | DeathLocationDataWithHeadstone
      | undefined;
    if (!deathData) return undefined;
    return deathData.headstoneId;
  }

  processTick(currentTick: number): void {
    if (this.safeAreaHandler) {
      this.safeAreaHandler.processTick(currentTick);
    }
  }

  /**
   * Tick-based respawn processing (AAA quality - deterministic timing)
   * Called every tick by TickSystem when registered.
   * Checks all players in DYING state and respawns them when respawnTick is reached.
   */
  private processPendingRespawns(currentTick: number): void {
    // Iterate over all player entities and check for pending respawns
    // Use world.entities.players to get the players Map
    const players = this.world.entities?.players;
    if (!players) return;

    for (const [playerId, playerEntity] of players) {
      const typedEntity = playerEntity as PlayerEntityLike;
      if (!typedEntity.data) continue;

      // Log dying players so we can trace respawn timing
      if (typedEntity.data.deathState === DeathState.DYING) {
        // Only log every 10 ticks to avoid spam
        if (currentTick % 10 === 0) {
          console.warn(
            "[DEATH-DEBUG] processPendingRespawns: player in DYING state",
            {
              playerId,
              currentTick,
              respawnTick: typedEntity.data.respawnTick,
              ticksRemaining:
                typedEntity.data.respawnTick !== undefined
                  ? (typedEntity.data.respawnTick as number) - currentTick
                  : "NO_RESPAWN_TICK",
            },
          );
        }
      }

      // Check if player is in DYING state and respawn tick has been reached
      if (
        typedEntity.data.deathState === DeathState.DYING &&
        typedEntity.data.respawnTick !== undefined &&
        currentTick >= typedEntity.data.respawnTick
      ) {
        // Hide player briefly before respawn
        typedEntity.data.visible = false;
        if ("markNetworkDirty" in playerEntity) {
          (playerEntity as { markNetworkDirty: () => void }).markNetworkDirty();
        }

        // Initiate respawn for this player
        console.warn(
          "[DEATH-DEBUG] processPendingRespawns: triggering respawn",
          {
            playerId,
            currentTick,
            respawnTick: typedEntity.data.respawnTick,
          },
        );
        this.initiateRespawn(playerId).catch((err) => {
          this.logger.error(
            "Tick-based respawn failed",
            err instanceof Error ? err : undefined,
            { playerId },
          );
        });
      }
    }
  }
}
