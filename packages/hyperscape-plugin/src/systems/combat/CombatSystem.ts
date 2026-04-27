import { MobEntity } from "../../entities/npc/MobEntity.js";
/**
 * CombatSystem - Handles all combat mechanics
 */

import { EventType } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import {
  WEAPON_DEFAULT_ATTACK_STYLE,
  type MeleeAttackStyle,
} from "@hyperforge/shared";
import {
  getAfkDisableRetaliateTicks,
  getArrowLaunchDelayMs,
  getCombatTimeoutTicks,
  getDefaultMagicRange,
  getDefaultNpcAttackSpeedTicks,
  getDefaultRangedRange,
  getHitDelayConfig,
  getSpellLaunchDelayMs,
  getTickDurationMs,
} from "@hyperforge/shared";
import { AttackType } from "@hyperforge/shared";
import { EntityID } from "@hyperforge/shared";
import { Entity } from "@hyperforge/shared";
// NOTE: Import directly to avoid circular dependency through barrel file
// PlayerSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5d).
interface PlayerSystem {
  getPlayer(id: string): { alive?: boolean } | undefined;
  getPlayerAutoRetaliate(id: string): boolean;
  getPlayerAttackStyle?(id: string): { id: string } | undefined;
  damagePlayer(id: string, amount: number, source?: string): boolean;
}
import {
  isAttackOnCooldownTicks,
  calculateRetaliationDelay,
  CombatStyle,
  PrayerCombatBonuses,
} from "@hyperforge/shared";
// PrayerSystem migrated to @hyperforge/hyperscape (2026-04-25).
// Duck-typed local interface; CombatSystem only calls
// `getCombinedBonuses(playerId)` and passes the result to damage
// handlers as opaque attacker/defender bonus blobs.
import type { PrayerBonuses } from "@hyperforge/shared";
interface PrayerSystemLike {
  getCombinedBonuses(playerId: string): Partial<PrayerBonuses>;
}
import { createEntityID } from "@hyperforge/shared";
// NOTE: Import directly to avoid circular dependency through barrel file
import { EntityManager } from "@hyperforge/shared";
// MobNPCSystem migrated to @hyperforge/hyperscape (2026-04-25, Wave 3a).
// Was imported here only for the dead `mobSystem` field below.
import { SystemBase } from "@hyperforge/shared";
import {
  tilesWithinMeleeRange,
  tilesWithinRange,
  worldToTile,
} from "@hyperforge/shared";
import { tilePool, PooledTile } from "@hyperforge/shared";
import { CombatAnimationManager } from "./CombatAnimationManager";
import {
  CombatAttackValidator,
  type AttackValidationResult,
  type MeleeAttackData,
} from "./CombatAttackValidator";
import {
  CombatDamageOrchestrator,
  type PlayerEquipmentStats,
} from "./CombatDamageOrchestrator";
import { CombatDeathHandler } from "./CombatDeathHandler";
import { CombatEventEmitter } from "./CombatEventEmitter";
import { CombatEventRecorder } from "./CombatEventRecorder";
import { CombatFollowController } from "./CombatFollowController";
import { CombatLifecycleHandler } from "./CombatLifecycleHandler";
import { CombatPlayerQueries } from "./CombatPlayerQueries";
import { CombatRotationManager } from "./CombatRotationManager";
import { CombatStateService, CombatData } from "./CombatStateService";
import {
  CombatAntiCheat,
  CombatViolationType,
  CombatViolationSeverity,
} from "./CombatAntiCheat";
import { getEntityPosition } from "@hyperforge/shared";
import { quaternionPool } from "@hyperforge/shared";
import { EntityIdValidator } from "./EntityIdValidator";
import { CombatRateLimiter } from "./CombatRateLimiter";
import { CombatEntityResolver } from "./CombatEntityResolver";
import { DamageCalculator } from "./DamageCalculator";
import {
  EventStore,
  GameEventType,
  type GameStateInfo,
  type EntitySnapshot,
  type CombatSnapshot,
} from "@hyperforge/shared";
import { getGameRngState, type SeededRandomState } from "@hyperforge/shared";
import {
  DamageHandler,
  PlayerDamageHandler,
  MobDamageHandler,
} from "./handlers";
import { PidManager } from "./PidManager";
import { getGameRng } from "@hyperforge/shared";
import {
  isEntityDead,
  getMobRetaliates,
  getPendingAttacker,
  clearPendingAttacker,
  isPlayerDamageHandler,
  isMobEntity,
} from "@hyperforge/shared";
// ZoneDetectionSystem migrated to @hyperforge/hyperscape (2026-04-25).
import type { ZoneDetectionSystemDuck } from "@hyperforge/shared";
import { tileChebyshevDistance } from "@hyperforge/shared";

// Ranged/Magic combat services (F2P Phase 1)
import {
  calculateRangedDamage,
  type RangedDamageParams,
} from "./RangedDamageCalculator";
import {
  calculateMagicDamage,
  type MagicDamageParams,
} from "./MagicDamageCalculator";
import {
  type RangedCombatStyle,
  type MagicCombatStyle,
  RANGED_STYLE_BONUSES,
} from "@hyperforge/shared";
import { ammunitionService } from "./AmmunitionService";
import { runeService } from "./RuneService";
import { spellService, type Spell } from "./SpellService";
import {
  ProjectileService,
  type CreateProjectileParams,
} from "./ProjectileService";
import { getNPCById } from "@hyperforge/shared";
// EquipmentSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5b).
import type { PlayerEquipment } from "@hyperforge/shared";
interface EquipmentSystemDuck {
  getPlayerEquipment(playerId: string): PlayerEquipment | undefined;
}
// InventorySystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 5c).
import type { PlayerInventory } from "@hyperforge/shared";
interface InventorySystemDuck {
  hasItem(playerId: string, itemId: string, quantity?: number): boolean;
  getInventory(playerId: string): PlayerInventory | undefined;
  removeItemDirect(
    playerId: string,
    item: { itemId: string; quantity: number; slot?: number },
  ): Promise<boolean>;
}
import type { Item, EquipmentSlot } from "@hyperforge/shared";

// Re-export CombatData from CombatStateService for backwards compatibility
export type { CombatData } from "./CombatStateService";

/**
 * Attack data structure for validation and execution
 */
// MeleeAttackData and AttackValidationResult moved to
// ./CombatAttackValidator (slice 7); re-imported above for use
// at the few CombatSystem call sites that still reference them.

export class CombatSystem extends SystemBase {
  private nextAttackTicks = new Map<EntityID, number>(); // Tick when entity can next attack
  // mobSystem field removed 2026-04-25: was set in init() but never read.
  private entityManager?: EntityManager;
  private playerSystem?: PlayerSystem; // Cached for auto-retaliate checks (hot path optimization)

  // OPTIMIZATION: Cache frequently used systems to avoid getSystem() lookups in hot paths
  private prayerSystem?: PrayerSystemLike | null;
  private zoneDetectionSystem?: ZoneDetectionSystemDuck | null;
  private _systemsCached = false;

  // Public for GameTickProcessor access during tick processing
  public readonly stateService: CombatStateService;
  private animationManager: CombatAnimationManager;
  private rotationManager: CombatRotationManager;

  public readonly antiCheat: CombatAntiCheat;
  private entityIdValidator: EntityIdValidator;
  private rateLimiter: CombatRateLimiter;
  public readonly eventStore: EventStore;
  private entityResolver: CombatEntityResolver;
  private damageCalculator: DamageCalculator;
  // Combat event recording — replay snapshot + EventStore append.
  // Extracted to CombatEventRecorder (top-10 #9 third decomposition
  // slice). Toggle via `this.eventRecorder.recordingEnabled`.
  private readonly eventRecorder: CombatEventRecorder;

  // Equipment stats cache per player for damage calculations.
  // Type lives in CombatDamageOrchestrator (which is the primary
  // reader); CombatSystem owns the Map and populates it on the
  // PLAYER_EQUIPMENT_CHANGED event.
  private playerEquipmentStats = new Map<string, PlayerEquipmentStats>();

  // Damage calculation pipeline (5 calculate*Damage methods +
  // equipment lookups). Extracted to CombatDamageOrchestrator (top-10
  // #9 fourth decomposition slice). All callsites delegate via
  // `this.damageOrchestrator.fooBar(...)`.
  private readonly damageOrchestrator: CombatDamageOrchestrator;

  // Death + respawn handlers — clean up combat state when entities
  // die or players respawn. Extracted to CombatDeathHandler (top-10
  // #9 fifth decomposition slice).
  private readonly deathHandler: CombatDeathHandler;

  // Combat lifecycle handler — currently wraps endCombat (timeout +
  // manual force-end cleanup). enterCombat is deferred to a future
  // slice (top-10 #9 sixth decomposition slice).
  private readonly lifecycleHandler: CombatLifecycleHandler;

  // Pre-attack validation predicates extracted as the seventh slice.
  // Wraps validateMeleeAttack, isWithinCombatRange, checkAttackCooldown,
  // validateCombatActors, validateAttackRange.
  private readonly attackValidator: CombatAttackValidator;

  // Tile-follow + weapon attack-type lookup extracted as the eighth
  // slice. Wraps checkRangeAndFollow + getAttackTypeFromWeapon.
  private readonly followController: CombatFollowController;

  // Ranged/Magic combat services (F2P)
  private readonly projectileService: ProjectileService;
  private equipmentSystem?: EquipmentSystemDuck;
  private inventorySystem?: InventorySystemDuck;

  // Pre-allocated pooled tiles for hot path calculations (zero GC)
  private readonly _attackerTile: PooledTile = tilePool.acquire();
  private readonly _targetTile: PooledTile = tilePool.acquire();

  // OSRS-accurate: Track last known target tile per attacker for persistent combat follow.
  // In OSRS, the player continuously follows the target while in combat — not just when
  // out of range. This map lets us detect when the target has moved and re-path accordingly.
  private lastCombatTargetTile = new Map<string, { x: number; z: number }>();

  // Auto-retaliate disabled after 20 minutes of no input (OSRS behavior)
  private lastInputTick = new Map<string, number>();

  private damageHandlers: Map<"player" | "mob", DamageHandler>;

  // Lower PID = higher priority when attacks occur on same tick
  public readonly pidManager: PidManager;

  // Combat event emission helpers — pre-allocated payloads + zero-
  // allocation emit methods. Extracted to CombatEventEmitter (top-10
  // #9 first decomposition slice). All `emit*` callsites in this
  // file delegate to `this.eventEmitter.emit*(...)`.
  private readonly eventEmitter: CombatEventEmitter;

  // Player query helpers — read-only skill / spell / inventory
  // accessors + rune consumption. Extracted to CombatPlayerQueries
  // (top-10 #9 second decomposition slice).
  private readonly playerQueries: CombatPlayerQueries;

  constructor(world: World) {
    super(world, {
      name: "combat",
      dependencies: {
        required: ["entity-manager"], // Combat needs entity manager
        optional: ["mob-npc"], // Combat can work without mob NPCs but better with them
      },
      autoCleanup: true,
    });

    this.stateService = new CombatStateService(world);
    this.animationManager = new CombatAnimationManager(world);
    this.rotationManager = new CombatRotationManager(world);
    this.antiCheat = new CombatAntiCheat();
    this.entityIdValidator = new EntityIdValidator();
    this.rateLimiter = new CombatRateLimiter();
    this.entityResolver = new CombatEntityResolver(world);
    this.damageCalculator = new DamageCalculator(this.playerEquipmentStats);

    this.eventStore = new EventStore({
      snapshotInterval: 100,
      maxEvents: 100000,
      maxSnapshots: 10,
    });

    this.damageHandlers = new Map();
    this.damageHandlers.set("player", new PlayerDamageHandler(world));
    this.damageHandlers.set("mob", new MobDamageHandler(world));

    this.pidManager = new PidManager(getGameRng());

    // Ranged/Magic projectile service (F2P)
    this.projectileService = new ProjectileService();

    // Combat event emission helpers — pre-allocated payloads + zero-
    // alloc emit. Closure injects this system's protected emitTypedEvent.
    this.eventEmitter = new CombatEventEmitter((type, payload) =>
      this.emitTypedEvent(type, payload),
    );

    // Player query helpers. Inventory accessor is a closure so the
    // helper picks up `this.inventorySystem` once it's assigned in
    // start() (it's undefined at construct-time).
    this.playerQueries = new CombatPlayerQueries(
      world,
      () => this.inventorySystem,
    );

    // Combat event recorder — appends events to EventStore for replay,
    // builds GameStateInfo + periodic combat snapshots.
    this.eventRecorder = new CombatEventRecorder(
      world,
      this.eventStore,
      this.stateService,
      this.entityResolver,
    );

    // Damage calculation pipeline. Closures over equipmentSystem +
    // prayerSystem because both are late-bound (assigned in start()).
    this.damageOrchestrator = new CombatDamageOrchestrator(
      world,
      this.playerQueries,
      this.damageCalculator,
      this.playerEquipmentStats,
      () => this.equipmentSystem,
      () => this.prayerSystem,
    );

    // Death + respawn handlers — clean up combat state on entity
    // death / player respawn. All deps are already-extracted helpers
    // plus the shared nextAttackTicks Map.
    this.deathHandler = new CombatDeathHandler(
      world,
      this.stateService,
      this.animationManager,
      this.eventEmitter,
      this.eventRecorder,
      this.nextAttackTicks,
    );

    // Combat lifecycle handler (endCombat). Closure over emitTypedEvent
    // for the UI_MESSAGE event. Shares lastCombatTargetTile Map with
    // the host system — CombatSystem populates, helper deletes on end.
    this.lifecycleHandler = new CombatLifecycleHandler(
      this.stateService,
      this.animationManager,
      this.eventEmitter,
      this.eventRecorder,
      this.lastCombatTargetTile,
      (type, payload) => this.emitTypedEvent(type, payload),
    );

    // Pre-attack validation (slice 7). Shares the pooled tile buffers
    // and nextAttackTicks Map with the host system — both are read
    // by other CombatSystem methods on the same tick, which is safe
    // because combat is single-threaded.
    this.attackValidator = new CombatAttackValidator(
      this.entityResolver,
      this.antiCheat,
      this.eventEmitter,
      this.nextAttackTicks,
      this._attackerTile,
      this._targetTile,
    );

    // Tile-follow + weapon attack-type (slice 8). Closures capture
    // late-bound systems assigned during start() (equipmentSystem,
    // zoneDetectionSystem). Shared mutable refs: pooled tile buffers
    // + lastCombatTargetTile cache.
    this.followController = new CombatFollowController(
      this.entityResolver,
      this.eventEmitter,
      this.playerQueries,
      this._attackerTile,
      this._targetTile,
      this.lastCombatTargetTile,
      () => this.equipmentSystem,
      () => this.zoneDetectionSystem,
    );
  }

  // Event emission helpers live in CombatEventEmitter — see field
  // declaration above. All `this.emitXxx(...)` callsites in this file
  // are now `this.eventEmitter.emitXxx(...)`.

  async init(): Promise<void> {
    // Get entity manager - required dependency
    this.entityManager = this.world.getSystem<EntityManager>("entity-manager");
    if (!this.entityManager) {
      throw new Error(
        "[CombatSystem] EntityManager not found - required dependency",
      );
    }

    // mobSystem lookup removed 2026-04-25: was assigned but never read.

    // Configure entity resolver with entity manager and logger
    this.entityResolver.setEntityManager(this.entityManager);
    this.entityResolver.setLogger(this.logger);

    // Cache PlayerSystem for auto-retaliate checks (hot path optimization)
    // Optional dependency - combat still works without it (defaults to retaliate)
    this.playerSystem = this.world.getSystem("player") as unknown as
      | PlayerSystem
      | undefined;

    // OPTIMIZATION: Cache other systems used in hot paths (damage calc, PvP zone checks)
    this.prayerSystem =
      (this.world.getSystem("prayer") as unknown as PrayerSystemLike | null) ??
      null;
    this.zoneDetectionSystem =
      (this.world.getSystem(
        "zone-detection",
      ) as unknown as ZoneDetectionSystemDuck | null) ?? null;
    this._systemsCached = true;

    // Cache PlayerSystem into PlayerDamageHandler for damage application
    const playerHandler = this.damageHandlers.get("player");
    if (isPlayerDamageHandler(playerHandler)) {
      playerHandler.cachePlayerSystem(this.playerSystem ?? null);
    }

    // Cache EquipmentSystem and InventorySystem for ranged/magic combat (F2P)
    this.equipmentSystem = this.world.getSystem("equipment") as unknown as
      | EquipmentSystemDuck
      | undefined;
    this.inventorySystem = this.world.getSystem("inventory") as unknown as
      | InventorySystemDuck
      | undefined;

    // Listen for auto-retaliate toggle to start combat if toggled ON while being attacked
    // SERVER-ONLY: Combat state changes must happen on server, client receives via network sync
    this.subscribe(
      EventType.UI_AUTO_RETALIATE_CHANGED,
      (data: { playerId: string; enabled: boolean }) => {
        if (!this.world.isServer) return; // Combat is server-authoritative
        if (data.enabled) {
          this.handleAutoRetaliateEnabled(data.playerId);
        }
      },
    );

    // OSRS-accurate: Player clicked to move = cancel their attacking combat
    // In OSRS, clicking anywhere else cancels your current action including combat
    // SERVER-ONLY: Combat state changes must happen on server
    this.subscribe(
      EventType.COMBAT_PLAYER_DISENGAGE,
      (data: { playerId: string }) => {
        if (!this.world.isServer) return; // Combat is server-authoritative
        this.handlePlayerDisengage(data.playerId);
      },
    );

    // Set up event listeners - required for combat to function
    // SERVER-ONLY: Combat processing should only happen on server to avoid duplicate damage events
    this.subscribe(
      EventType.COMBAT_ATTACK_REQUEST,
      async (data: {
        attackerId: string;
        targetId: string;
        attackerType?: "player" | "mob";
        targetType?: "player" | "mob";
        attackType?: AttackType;
      }) => {
        if (!this.world.isServer) return; // Combat is server-authoritative
        await this.handleAttack({
          attackerId: data.attackerId,
          targetId: data.targetId,
          attackerType: data.attackerType || "player",
          targetType: data.targetType || "mob",
          attackType: data.attackType || AttackType.MELEE,
        });
      },
    );
    this.subscribe<{
      attackerId: string;
      targetId: string;
      attackerType: "player" | "mob";
      targetType: "player" | "mob";
    }>(EventType.COMBAT_MELEE_ATTACK, (data) => {
      if (!this.world.isServer) return; // Combat is server-authoritative
      this.handleMeleeAttack(data);
    });
    // MVP: Ranged combat subscription removed - melee only
    this.subscribe(
      EventType.COMBAT_MOB_NPC_ATTACK,
      (data: {
        mobId: string;
        targetId: string;
        attackType?: AttackType;
        spellId?: string;
        arrowId?: string;
      }) => {
        if (!this.world.isServer) return; // Combat is server-authoritative
        this.handleMobAttack(data);
      },
    );

    // Listen for death events to end combat
    this.subscribe(EventType.NPC_DIED, (data: { mobId: string }) => {
      this.deathHandler.handleEntityDied(data.mobId, "mob");
    });
    this.subscribe(
      EventType.ENTITY_DEATH,
      (data: { entityId: string; entityType: string }) => {
        this.deathHandler.handleEntityDied(data.entityId, data.entityType);
      },
    );

    // CRITICAL: Listen for player respawn to clear any lingering combat states
    // This catches edge cases where combat states survive the death cleanup
    this.subscribe(
      EventType.PLAYER_RESPAWNED,
      (data: {
        playerId: string;
        spawnPosition: { x: number; y: number; z: number };
      }) => {
        this.deathHandler.handlePlayerRespawned(data.playerId);
      },
    );

    this.subscribe(EventType.PLAYER_JOINED, (data: { playerId: string }) => {
      const tickNumber = this.world.currentTick ?? 0;
      this.pidManager.assignPid(data.playerId as EntityID, tickNumber);
    });

    this.subscribe(EventType.PLAYER_LEFT, (data: { playerId: string }) => {
      this.cleanupPlayerDisconnect(data.playerId);
      this.pidManager.removePid(data.playerId as EntityID);
    });

    // Listen for explicit combat stop requests (e.g., player clicking new target)
    this.subscribe(
      EventType.COMBAT_STOP_ATTACK,
      (data: { attackerId: string }) => {
        if (this.stateService.isInCombat(data.attackerId)) {
          this.logger.info("Stopping combat for target switch", {
            attackerId: data.attackerId,
          });
          this.forceEndCombat(data.attackerId);
        }
      },
    );

    // Listen for combat follow events to initiate player movement toward target
    this.subscribe(
      EventType.COMBAT_FOLLOW_TARGET,
      (data: {
        playerId: string;
        targetId: string;
        targetPosition: { x: number; y: number; z: number };
      }) => {
        this.handleCombatFollow(data);
      },
    );

    // Listen for equipment stats updates to use bonuses in damage calculation
    this.subscribe(
      EventType.PLAYER_STATS_EQUIPMENT_UPDATED,
      (data: {
        playerId: string;
        equipmentStats: {
          attack: number;
          strength: number;
          defense: number;
          ranged: number;
          // Optional ranged/magic bonuses (F2P)
          rangedAttack?: number;
          rangedStrength?: number;
          magicAttack?: number;
          magicDefense?: number;
          // Optional per-style bonuses (OSRS combat triangle)
          defenseStab?: number;
          defenseSlash?: number;
          defenseCrush?: number;
          defenseRanged?: number;
          attackStab?: number;
          attackSlash?: number;
          attackCrush?: number;
        };
      }) => {
        this.playerEquipmentStats.set(data.playerId, {
          attack: data.equipmentStats.attack,
          strength: data.equipmentStats.strength,
          defense: data.equipmentStats.defense,
          ranged: data.equipmentStats.ranged,
          rangedAttack: data.equipmentStats.rangedAttack ?? 0,
          rangedStrength: data.equipmentStats.rangedStrength ?? 0,
          magicAttack: data.equipmentStats.magicAttack ?? 0,
          magicDefense: data.equipmentStats.magicDefense ?? 0,
          defenseStab: data.equipmentStats.defenseStab ?? 0,
          defenseSlash: data.equipmentStats.defenseSlash ?? 0,
          defenseCrush: data.equipmentStats.defenseCrush ?? 0,
          defenseRanged: data.equipmentStats.defenseRanged ?? 0,
          attackStab: data.equipmentStats.attackStab ?? 0,
          attackSlash: data.equipmentStats.attackSlash ?? 0,
          attackCrush: data.equipmentStats.attackCrush ?? 0,
        });
      },
    );
  }

  // getAttackTypeFromWeapon moved to ./CombatFollowController
  // (slice 8). Call sites delegate via
  // this.followController.getAttackTypeFromWeapon(attackerId).

  // Equipment lookups (getEquippedArrows / getEquippedWeapon) +
  // damage calculation methods live in CombatDamageOrchestrator —
  // see field declaration above. All callsites delegate via
  // `this.damageOrchestrator.fooBar(...)`.

  private async handleAttack(data: {
    attackerId: string;
    targetId: string;
    attackerType: "player" | "mob";
    targetType: "player" | "mob";
    attackType?: AttackType;
  }): Promise<void> {
    // Route by attack type from equipped weapon (F2P ranged/magic support)
    const attackType =
      data.attackerType === "player"
        ? this.followController.getAttackTypeFromWeapon(data.attackerId)
        : (data.attackType ?? AttackType.MELEE);

    switch (attackType) {
      case AttackType.RANGED:
        this.handleRangedAttack(data);
        break;
      case AttackType.MAGIC:
        await this.handleMagicAttack(data);
        break;
      case AttackType.MELEE:
      default:
        this.handleMeleeAttack(data);
        break;
    }
  }

  /**
   * Main melee attack handler - orchestrates validation and execution
   * Refactored for clarity: validation logic extracted to validateMeleeAttack(),
   * execution logic extracted to executeMeleeAttack()
   */
  private handleMeleeAttack(data: MeleeAttackData): void {
    const { attackerId, targetId, attackerType } = data;
    const currentTick = this.world.currentTick ?? 0;

    if (!this.entityIdValidator.isValid(attackerId)) {
      const sanitized = this.entityIdValidator.sanitizeForLogging(attackerId);
      this.logger.warn("Invalid attacker ID rejected", {
        attackerId: sanitized,
        reason: "invalid_format",
      });
      this.antiCheat.recordInvalidEntityId(
        String(attackerId).slice(0, 64),
        String(attackerId),
      );
      return;
    }

    if (!this.entityIdValidator.isValid(targetId)) {
      const sanitized = this.entityIdValidator.sanitizeForLogging(targetId);
      this.logger.warn("Invalid target ID rejected", {
        attackerId,
        targetId: sanitized,
        reason: "invalid_format",
      });
      this.antiCheat.recordInvalidEntityId(attackerId, String(targetId));
      return;
    }

    if (attackerType === "player") {
      const rateResult = this.rateLimiter.checkLimit(attackerId, currentTick);
      if (!rateResult.allowed) {
        this.logger.warn("Attack rate limited", {
          attackerId,
          reason: rateResult.reason,
          cooldownUntil: rateResult.cooldownUntil,
        });
        return;
      }
      this.antiCheat.trackAttack(attackerId, currentTick);
    }

    // Validate the attack (entities exist, alive, in range, etc.)
    const validation = this.attackValidator.validateMeleeAttack(
      data,
      currentTick,
    );
    if (!validation.valid) {
      return;
    }

    // Check cooldown before executing
    if (
      !this.attackValidator.checkAttackCooldown(
        validation.typedAttackerId!,
        currentTick,
      )
    ) {
      return;
    }

    // Execute the attack
    this.executeMeleeAttack(data, validation, currentTick);
  }

  // validateMeleeAttack, isWithinCombatRange, checkAttackCooldown
  // moved to ./CombatAttackValidator (slice 7). Call sites delegate
  // via this.attackValidator.{method}(...).

  /**
   * Execute a validated melee attack
   * Handles rotation, animation, damage, and combat state
   */
  private executeMeleeAttack(
    data: MeleeAttackData,
    validation: AttackValidationResult,
    currentTick: number,
  ): void {
    const { attackerId, targetId, attackerType, targetType } = data;
    const { attacker, target, typedAttackerId, typedTargetId } = validation;

    if (!attacker || !target || !typedAttackerId || !typedTargetId) return;

    // Get attack speed
    const entityType = attacker.type === "mob" ? "mob" : "player";
    const attackSpeedTicks = this.entityResolver.getAttackSpeed(
      typedAttackerId,
      entityType,
    );

    // Face target
    this.rotationManager.rotateTowardsTarget(
      attackerId,
      targetId,
      attackerType,
      targetType,
    );

    // Play attack animation with attack speed for proper animation duration
    this.animationManager.setCombatEmote(
      attackerId,
      attackerType,
      currentTick,
      attackSpeedTicks,
    );

    // Get player's combat style for OSRS-accurate damage bonuses
    let combatStyle: CombatStyle = "accurate";
    if (attackerType === "player") {
      const playerSystem = this.world.getSystem(
        "player",
      ) as unknown as PlayerSystem | null;
      const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
      if (styleData?.id) {
        combatStyle = styleData.id as CombatStyle;
      }
    }

    // Calculate and apply damage
    const rawDamage = this.damageOrchestrator.calculateMeleeDamage(
      attacker,
      target,
      combatStyle,
    );
    const currentHealth = this.entityResolver.getHealth(target);
    const damage = Math.min(rawDamage, currentHealth);

    this.applyDamage(targetId, targetType, damage, attackerId);

    // Emit damage event using pre-allocated payload (zero allocation)
    const targetPosition = getEntityPosition(target);
    this.eventEmitter.emitDamageDealt(
      attackerId,
      targetId,
      damage,
      undefined,
      targetType,
      targetPosition,
    );

    if (!this.entityResolver.isAlive(target, targetType)) {
      return;
    }

    // Set cooldown and enter combat state
    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
    this.enterCombat(typedAttackerId, typedTargetId, attackSpeedTicks);
  }

  /**
   * Handle ranged attack - validate arrows, create projectile, queue damage
   */
  private handleRangedAttack(data: {
    attackerId: string;
    targetId: string;
    attackerType: "player" | "mob";
    targetType: "player" | "mob";
    arrowId?: string;
  }): void {
    const { attackerId, targetId, attackerType, targetType } = data;
    const currentTick = this.world.currentTick ?? 0;

    // Mobs can launch ranged projectiles when configured with arrowId.
    if (attackerType === "mob") {
      const attacker = this.entityResolver.resolve(attackerId, attackerType);
      const target = this.entityResolver.resolve(targetId, targetType);
      if (!attacker || !target || !isMobEntity(attacker)) return;

      if (
        !this.entityResolver.isAlive(attacker, attackerType) ||
        !this.entityResolver.isAlive(target, targetType)
      ) {
        return;
      }

      const mobData = attacker.getMobData();
      const npcData = getNPCById(mobData.type);
      if (!npcData) return;

      const arrowId = data.arrowId ?? npcData.combat.arrowId;
      if (!arrowId) {
        console.warn(
          `[RangedAttackHandler] Mob ${attackerId} (${mobData.type}) has no arrowId configured, skipping attack`,
        );
        return;
      }

      const attackRange = Math.max(
        1,
        Math.floor(npcData.combat.combatRange ?? getDefaultRangedRange()),
      );
      const attackerPos = getEntityPosition(attacker);
      const targetPos = getEntityPosition(target);
      if (!attackerPos || !targetPos) return;

      tilePool.setFromPosition(this._attackerTile, attackerPos);
      tilePool.setFromPosition(this._targetTile, targetPos);
      const distance = tileChebyshevDistance(
        this._attackerTile,
        this._targetTile,
      );
      if (distance > attackRange || distance === 0) {
        this.eventEmitter.emitAttackFailed(
          attackerId,
          targetId,
          "out_of_range",
        );
        return;
      }

      const typedAttackerId = createEntityID(attackerId);
      if (
        !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
      ) {
        return;
      }

      const attackSpeedTicks = Math.max(
        1,
        npcData.combat.attackSpeedTicks ?? getDefaultNpcAttackSpeedTicks(),
      );

      this.rotationManager.rotateTowardsTarget(
        attackerId,
        targetId,
        attackerType,
        targetType,
      );
      this.animationManager.setCombatEmote(
        attackerId,
        attackerType,
        currentTick,
        attackSpeedTicks,
        "ranged",
      );

      const damage = this.damageOrchestrator.calculateMobRangedDamageForAttack(
        target,
        targetType,
        npcData.stats.ranged ?? 1,
        arrowId,
      );

      const projectileParams: CreateProjectileParams = {
        sourceId: attackerId,
        targetId,
        attackType: AttackType.RANGED,
        damage,
        currentTick,
        sourcePosition: { x: attackerPos.x, z: attackerPos.z },
        targetPosition: { x: targetPos.x, z: targetPos.z },
        arrowId,
        xpReward: 0,
      };

      this.projectileService.createProjectile(projectileParams);

      const HIT_DELAY = getHitDelayConfig();
      const TICK_DURATION_MS = getTickDurationMs();
      const rangedHitDelayTicks = Math.min(
        HIT_DELAY.MAX_HIT_DELAY,
        HIT_DELAY.RANGED_BASE +
          Math.floor(
            (HIT_DELAY.RANGED_DISTANCE_OFFSET + distance) /
              HIT_DELAY.RANGED_DISTANCE_DIVISOR,
          ),
      );
      const arrowLaunchDelayMs = getArrowLaunchDelayMs();
      const travelDurationMs = Math.max(
        200,
        rangedHitDelayTicks * TICK_DURATION_MS - arrowLaunchDelayMs,
      );

      this.eventEmitter.emitProjectileLaunched(
        attackerId,
        targetId,
        "arrow",
        attackerPos,
        targetPos,
        undefined,
        arrowId,
        arrowLaunchDelayMs,
        travelDurationMs,
      );

      const typedTargetId = createEntityID(targetId);
      this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
      this.enterCombat(
        typedAttackerId,
        typedTargetId,
        attackSpeedTicks,
        AttackType.RANGED,
      );
      return;
    }

    // Validate entity IDs
    if (
      !this.entityIdValidator.isValid(attackerId) ||
      !this.entityIdValidator.isValid(targetId)
    ) {
      return;
    }

    // Rate limiting
    const rateResult = this.rateLimiter.checkLimit(attackerId, currentTick);
    if (!rateResult.allowed) {
      return;
    }
    this.antiCheat.trackAttack(attackerId, currentTick);

    // Get entities
    const attacker = this.entityResolver.resolve(attackerId, attackerType);
    const target = this.entityResolver.resolve(targetId, targetType);
    if (!attacker || !target) return;

    // Check both are alive
    if (
      !this.entityResolver.isAlive(attacker, attackerType) ||
      !this.entityResolver.isAlive(target, targetType)
    ) {
      return;
    }

    // Validate arrows equipped
    const weapon = this.damageOrchestrator.getEquippedWeapon(attackerId);
    const arrowSlot = this.damageOrchestrator.getEquippedArrows(attackerId);
    const rangedLevel = this.playerQueries.getPlayerSkillLevel(
      attackerId,
      "ranged",
    );

    const arrowValidation = ammunitionService.validateArrows(
      weapon,
      arrowSlot,
      rangedLevel,
    );
    if (!arrowValidation.valid) {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: attackerId,
        message: arrowValidation.error ?? "You need arrows to attack.",
        type: "error",
      });
      return;
    }

    // Check ranged attack range (bows have attackRange property)
    const attackRange = weapon?.attackRange ?? 7;
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return;

    tilePool.setFromPosition(this._attackerTile, attackerPos);
    tilePool.setFromPosition(this._targetTile, targetPos);
    const distance = tileChebyshevDistance(
      this._attackerTile,
      this._targetTile,
    );

    if (distance > attackRange || distance === 0) {
      this.eventEmitter.emitAttackFailed(attackerId, targetId, "out_of_range");
      return;
    }

    // Check cooldown
    const typedAttackerId = createEntityID(attackerId);
    if (
      !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
    ) {
      return;
    }

    // Get player's ranged style for speed modifier
    let rangedStyle: RangedCombatStyle = "accurate";
    const playerSystem = this.world.getSystem(
      "player",
    ) as unknown as PlayerSystem | null;
    const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
    if (styleData?.id) {
      const id = styleData.id;
      if (id === "accurate" || id === "rapid" || id === "longrange") {
        rangedStyle = id;
      }
    }

    // Get attack speed from weapon with style modifier (rapid = -1 tick)
    const baseAttackSpeed = weapon?.attackSpeed ?? 4;
    const styleBonus = RANGED_STYLE_BONUSES[rangedStyle];
    const attackSpeedTicks = Math.max(
      1,
      baseAttackSpeed + styleBonus.speedModifier,
    );

    // Face target
    this.rotationManager.rotateTowardsTarget(
      attackerId,
      targetId,
      attackerType,
      targetType,
    );

    // Play attack animation
    this.animationManager.setCombatEmote(
      attackerId,
      attackerType,
      currentTick,
      attackSpeedTicks,
    );

    // Calculate damage
    const damage = this.damageOrchestrator.calculateRangedDamageForAttack(
      attacker,
      target,
      attackerId,
      targetType,
    );

    // Create projectile with delayed hit
    const projectileParams: CreateProjectileParams = {
      sourceId: attackerId,
      targetId,
      attackType: AttackType.RANGED,
      damage,
      currentTick,
      sourcePosition: { x: attackerPos.x, z: attackerPos.z },
      targetPosition: { x: targetPos.x, z: targetPos.z },
      arrowId: arrowSlot?.itemId ? String(arrowSlot.itemId) : undefined,
    };

    this.projectileService.createProjectile(projectileParams);

    // Emit projectile created event for client visuals
    this.eventEmitter.emitProjectileLaunched(
      attackerId,
      targetId,
      "arrow",
      attackerPos,
      targetPos,
      undefined,
      arrowSlot?.itemId ? String(arrowSlot.itemId) : undefined,
      400, // Delay to match bow draw animation
    );

    // Set cooldown and enter combat
    const typedTargetId = createEntityID(targetId);
    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
    this.enterCombat(
      typedAttackerId,
      typedTargetId,
      attackSpeedTicks,
      AttackType.RANGED,
    );

    // Arrow consumption will be handled when projectile hits
  }

  private async handleMagicAttack(data: {
    attackerId: string;
    targetId: string;
    attackerType: "player" | "mob";
    targetType: "player" | "mob";
    spellId?: string;
  }): Promise<void> {
    const { attackerId, targetId, attackerType, targetType } = data;
    const currentTick = this.world.currentTick ?? 0;

    // Mobs can launch magic projectiles when configured with spellId.
    if (attackerType === "mob") {
      const attacker = this.entityResolver.resolve(attackerId, attackerType);
      const target = this.entityResolver.resolve(targetId, targetType);
      if (!attacker || !target || !isMobEntity(attacker)) return;

      if (
        !this.entityResolver.isAlive(attacker, attackerType) ||
        !this.entityResolver.isAlive(target, targetType)
      ) {
        return;
      }

      const mobData = attacker.getMobData();
      const npcData = getNPCById(mobData.type);
      if (!npcData) return;

      const spellId = data.spellId ?? npcData.combat.spellId;
      if (!spellId) {
        console.warn(
          `[MagicAttackHandler] Mob ${attackerId} (${mobData.type}) has no spellId configured, skipping attack`,
        );
        return;
      }

      const spell = spellService.getSpell(spellId);
      if (!spell) return;

      const attackRange = Math.max(
        1,
        Math.floor(npcData.combat.combatRange ?? getDefaultMagicRange()),
      );
      const attackerPos = getEntityPosition(attacker);
      const targetPos = getEntityPosition(target);
      if (!attackerPos || !targetPos) return;

      tilePool.setFromPosition(this._attackerTile, attackerPos);
      tilePool.setFromPosition(this._targetTile, targetPos);
      const distance = tileChebyshevDistance(
        this._attackerTile,
        this._targetTile,
      );
      if (distance > attackRange || distance === 0) {
        this.eventEmitter.emitAttackFailed(
          attackerId,
          targetId,
          "out_of_range",
        );
        return;
      }

      const typedAttackerId = createEntityID(attackerId);
      if (
        !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
      ) {
        return;
      }

      const attackSpeedTicks = Math.max(
        1,
        npcData.combat.attackSpeedTicks ?? spell.attackSpeed,
      );

      this.rotationManager.rotateTowardsTarget(
        attackerId,
        targetId,
        attackerType,
        targetType,
      );
      this.animationManager.setCombatEmote(
        attackerId,
        attackerType,
        currentTick,
        attackSpeedTicks,
        "magic",
      );

      const damage = this.damageOrchestrator.calculateMobMagicDamageForAttack(
        target,
        targetType,
        npcData.stats.magic ?? 1,
        spell,
      );

      const projectileParams: CreateProjectileParams = {
        sourceId: attackerId,
        targetId,
        attackType: AttackType.MAGIC,
        damage,
        currentTick,
        sourcePosition: { x: attackerPos.x, z: attackerPos.z },
        targetPosition: { x: targetPos.x, z: targetPos.z },
        spellId: spell.id,
        xpReward: 0,
      };

      this.projectileService.createProjectile(projectileParams);

      const HIT_DELAY = getHitDelayConfig();
      const TICK_DURATION_MS = getTickDurationMs();
      const magicHitDelayTicks = Math.min(
        HIT_DELAY.MAX_HIT_DELAY,
        HIT_DELAY.MAGIC_BASE +
          Math.floor(
            (HIT_DELAY.MAGIC_DISTANCE_OFFSET + distance) /
              HIT_DELAY.MAGIC_DISTANCE_DIVISOR,
          ),
      );
      const spellLaunchDelayMs = getSpellLaunchDelayMs();
      const travelDurationMs = Math.max(
        200,
        magicHitDelayTicks * TICK_DURATION_MS - spellLaunchDelayMs,
      );

      this.eventEmitter.emitProjectileLaunched(
        attackerId,
        targetId,
        spell.element,
        attackerPos,
        targetPos,
        spell.id,
        undefined,
        spellLaunchDelayMs,
        travelDurationMs,
      );

      const typedTargetId = createEntityID(targetId);
      this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
      this.enterCombat(
        typedAttackerId,
        typedTargetId,
        attackSpeedTicks,
        AttackType.MAGIC,
      );
      return;
    }

    // Detect streaming duel agents for diagnostic logging
    const attackerEntity = this.world.entities.get(attackerId);
    const isStreamingDuel =
      (attackerEntity as { data?: { inStreamingDuel?: boolean } })?.data
        ?.inStreamingDuel === true;

    // Validate entity IDs
    if (
      !this.entityIdValidator.isValid(attackerId) ||
      !this.entityIdValidator.isValid(targetId)
    ) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Entity ID validation failed for ${attackerId} → ${targetId}`,
        );
      }
      return;
    }

    // Rate limiting
    const rateResult = this.rateLimiter.checkLimit(attackerId, currentTick);
    if (!rateResult.allowed) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Rate limited: ${attackerId} (reason=${rateResult.reason ?? "unknown"})`,
        );
      }
      return;
    }
    this.antiCheat.trackAttack(attackerId, currentTick);

    // Get entities
    const attacker = this.entityResolver.resolve(attackerId, attackerType);
    const target = this.entityResolver.resolve(targetId, targetType);
    if (!attacker || !target) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Entity resolve failed: attacker=${!!attacker} target=${!!target}`,
        );
      }
      return;
    }

    // Check both are alive
    if (
      !this.entityResolver.isAlive(attacker, attackerType) ||
      !this.entityResolver.isAlive(target, targetType)
    ) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Alive check failed: attacker=${this.entityResolver.isAlive(attacker, attackerType)} target=${this.entityResolver.isAlive(target, targetType)}`,
        );
      }
      return;
    }

    // Get selected spell from player data
    const selectedSpellId =
      this.playerQueries.getPlayerSelectedSpell(attackerId);
    const magicLevel = this.playerQueries.getPlayerSkillLevel(
      attackerId,
      "magic",
    );

    if (isStreamingDuel && !selectedSpellId) {
      // Extra diagnostics: check entity.data directly
      const entityData = attackerEntity?.data as {
        selectedSpell?: string;
      } | null;
      const worldPlayer = this.world.getPlayer?.(attackerId);
      console.warn(
        `[MagicAttack:Duel] selectedSpell NULL for ${attackerId}! ` +
          `entity.data.selectedSpell=${entityData?.selectedSpell ?? "undefined"} ` +
          `worldPlayer.data.selectedSpell=${(worldPlayer?.data as { selectedSpell?: string } | null)?.selectedSpell ?? "undefined"} ` +
          `worldPlayer exists=${!!worldPlayer}`,
      );
    }

    // Validate spell can be cast
    const spellValidation = spellService.canCastSpell(
      selectedSpellId,
      magicLevel,
    );
    if (!spellValidation.valid) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Spell validation failed: spell=${selectedSpellId} level=${magicLevel} error=${spellValidation.error}`,
        );
      }
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: attackerId,
        message: spellValidation.error ?? "You cannot cast this spell.",
        type: "error",
      });
      return;
    }

    const spell = spellService.getSpell(selectedSpellId!);
    if (!spell) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Spell lookup failed: ${selectedSpellId}`,
        );
      }
      return;
    }

    // Validate runes in inventory
    const weapon = this.damageOrchestrator.getEquippedWeapon(attackerId);
    const inventory = this.playerQueries.getPlayerInventoryItems(attackerId);

    if (isStreamingDuel && inventory.length === 0) {
      console.warn(
        `[MagicAttack:Duel] Empty inventory for ${attackerId}! inventorySystem=${!!this.inventorySystem}`,
      );
    }

    const runeValidation = runeService.hasRequiredRunes(
      inventory,
      spell.runes,
      weapon,
    );
    if (!runeValidation.valid) {
      if (isStreamingDuel) {
        // Streaming duel agents bypass rune validation — inventory-based rune
        // addition is unreliable for bot agents (race conditions, manifest
        // loading timing). The staff provides infinite elemental runes; only
        // catalytic runes (mind/chaos) would fail. Since these are AI bots
        // with no real economy, let the attack proceed.
        console.warn(
          `[MagicAttack:Duel] Rune validation bypassed for ${attackerId} ` +
            `(${runeValidation.error}) weapon=${weapon?.id ?? "none"} spell=${spell.id}`,
        );
      } else {
        this.emitTypedEvent(EventType.UI_MESSAGE, {
          playerId: attackerId,
          message: runeValidation.error ?? "You don't have enough runes.",
          type: "error",
        });
        return;
      }
    }

    // Check magic attack range (spells have fixed range, typically 10 tiles)
    const attackRange = 10;
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return;

    tilePool.setFromPosition(this._attackerTile, attackerPos);
    tilePool.setFromPosition(this._targetTile, targetPos);
    const distance = tileChebyshevDistance(
      this._attackerTile,
      this._targetTile,
    );

    if (distance > attackRange || distance === 0) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Range check failed: distance=${distance} range=${attackRange}`,
        );
      }
      this.eventEmitter.emitAttackFailed(attackerId, targetId, "out_of_range");
      return;
    }

    // Check cooldown
    const typedAttackerId = createEntityID(attackerId);
    if (
      !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
    ) {
      return;
    }

    // Get attack speed from spell (clamp to minimum 1 tick)
    const attackSpeedTicks = Math.max(1, spell.attackSpeed);

    // Claim cooldown slot IMMEDIATELY to prevent async race condition.
    // consumeRunesForSpell is async, so two concurrent invocations (event
    // handler + tick auto-attack) can both pass checkAttackCooldown before
    // either sets the cooldown, resulting in duplicate projectiles.
    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);

    // Enter combat state synchronously so auto-attack tick gating works
    const typedTargetId = createEntityID(targetId);
    this.enterCombat(
      typedAttackerId,
      typedTargetId,
      attackSpeedTicks,
      AttackType.MAGIC,
    );

    // Face target
    this.rotationManager.rotateTowardsTarget(
      attackerId,
      targetId,
      attackerType,
      targetType,
    );

    // Play attack animation
    this.animationManager.setCombatEmote(
      attackerId,
      attackerType,
      currentTick,
      attackSpeedTicks,
    );

    // Calculate damage
    const damage = this.damageOrchestrator.calculateMagicDamageForAttack(
      attacker,
      target,
      attackerId,
      targetType,
      spell,
    );

    // Consume runes for real players; skip for streaming duel agents (they
    // bypass rune validation above, so consumption would fail or be a no-op)
    if (!isStreamingDuel) {
      try {
        await this.playerQueries.consumeRunesForSpell(
          attackerId,
          spell,
          weapon,
        );
      } catch (err) {
        console.warn(
          `[MagicAttack] consumeRunesForSpell failed for ${attackerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Create projectile with delayed hit
    const projectileParams: CreateProjectileParams = {
      sourceId: attackerId,
      targetId,
      attackType: AttackType.MAGIC,
      damage,
      currentTick,
      sourcePosition: { x: attackerPos.x, z: attackerPos.z },
      targetPosition: { x: targetPos.x, z: targetPos.z },
      spellId: spell.id,
      xpReward: spell.baseXp,
    };

    this.projectileService.createProjectile(projectileParams);

    // Emit projectile created event for client visuals
    // Delay projectile spawn to sync with casting animation (roughly halfway through)
    this.eventEmitter.emitProjectileLaunched(
      attackerId,
      targetId,
      spell.element,
      attackerPos,
      targetPos,
      spell.id,
      undefined,
      800, // Delay to match casting animation
    );
  }

  /**
   * Get player skill level
   */
  // Player query helpers (skill level, selected spell, inventory
  // items, rune consumption) live in CombatPlayerQueries — see field
  // declaration above. All `this.getPlayerFoo(...)` and
  // `this.playerQueries.consumeRunesForSpell(...)` callsites delegate via
  // `this.playerQueries`.

  private handleMobAttack(data: {
    mobId: string;
    targetId: string;
    attackType?: AttackType;
    spellId?: string;
    arrowId?: string;
  }): void {
    if (data.attackType === AttackType.MAGIC) {
      void this.handleMagicAttack({
        attackerId: data.mobId,
        targetId: data.targetId,
        attackerType: "mob",
        targetType: "player",
        spellId: data.spellId,
      });
      return;
    }

    if (data.attackType === AttackType.RANGED) {
      this.handleRangedAttack({
        attackerId: data.mobId,
        targetId: data.targetId,
        attackerType: "mob",
        targetType: "player",
        arrowId: data.arrowId,
      });
      return;
    }

    // Default mob attack path is melee.
    this.handleMeleeAttack({
      attackerId: data.mobId,
      targetId: data.targetId,
      attackerType: "mob",
      targetType: "player",
    });
  }

  /**
   * Handle auto-retaliate being toggled ON while being attacked
   * OSRS behavior: Player should start fighting back immediately
   *
   * Supports both PvE (mob attacker) and PvP (player attacker) scenarios.
   */
  private handleAutoRetaliateEnabled(playerId: string): void {
    const playerEntity = this.world.getPlayer?.(playerId);
    if (!playerEntity) return;

    // Use type guard to get pending attacker ID
    const pendingAttacker = getPendingAttacker(playerEntity);
    if (!pendingAttacker) return;

    // Detect attacker type dynamically - supports both PvP and PvE
    // This fixes the bug where PvP retaliation failed because we assumed "mob"
    const attackerType = this.entityResolver.resolveType(pendingAttacker);
    const attackerEntity = this.entityResolver.resolve(
      pendingAttacker,
      attackerType,
    );

    if (
      !attackerEntity ||
      !this.entityResolver.isAlive(attackerEntity, attackerType)
    ) {
      // Attacker gone - clear pending attacker state using type guard
      clearPendingAttacker(playerEntity);
      return;
    }

    // Start combat! Player now retaliates against the attacker
    const attackSpeedTicks = this.entityResolver.getAttackSpeed(
      createEntityID(playerId),
      "player",
    );

    // enterCombat() detects entity types internally
    this.enterCombat(
      createEntityID(playerId),
      createEntityID(pendingAttacker),
      attackSpeedTicks,
    );

    // Clear pending attacker since we're now actively fighting
    clearPendingAttacker(playerEntity);

    // Clear server face target since player now has a combat target
    // Note: enterCombat() already handles rotation via rotateTowardsTarget()
    this.eventEmitter.emitClearFaceTarget(playerId);
  }

  /**
   * OSRS-accurate: Handle player clicking to move (disengage from combat)
   * In OSRS, clicking anywhere else cancels YOUR current action including combat.
   *
   * CRITICAL: This only affects the DISENGAGING player's combat state.
   * The player who was attacking them (their target) keeps their combat state
   * and continues chasing. This is correct OSRS behavior:
   * - "Deliberate movement out of the opponent's weapon range to force them to follow
   *    is called dragging." - OSRS Wiki (Free-to-play PvP techniques)
   * - Pathfinding recalculates every tick when targeting a moving entity
   *
   * @see https://oldschool.runescape.wiki/w/Free-to-play_PvP_techniques
   * @see https://oldschool.runescape.wiki/w/Pathfinding
   */
  private handlePlayerDisengage(playerId: string): void {
    const combatState = this.stateService.getCombatData(playerId);
    if (!combatState || combatState.attackerType !== "player") {
      return; // Not in combat as an attacker, nothing to cancel
    }

    const targetId = String(combatState.targetId);
    const typedPlayerId = createEntityID(playerId);

    // OSRS-ACCURATE: Only remove THIS player's combat state
    // DO NOT call forceEndCombat() as it removes BOTH players' states!
    // The target (who may be attacking this player) keeps their combat state
    // and continues chasing this player. This enables the "dragging" PvP technique.

    // Reset emote for disengaging player only
    this.animationManager.resetEmote(playerId, "player");

    // Clear combat UI state from this player's entity only
    this.stateService.clearCombatStateFromEntity(playerId, "player");

    // Remove ONLY this player's combat state - NOT the target's!
    this.stateService.removeCombatState(typedPlayerId);

    // Clean up combat follow tracking for disengaging player
    this.lastCombatTargetTile.delete(playerId);

    // Mark player as "in combat without target" - the attacker is still chasing them
    // This keeps the combat timer active but player won't auto-attack
    // If auto-retaliate is ON and attacker catches up and hits, player will start fighting again
    this.stateService.markInCombatWithoutTarget(playerId, targetId);

    // OSRS-ACCURATE: Do NOT face the target when walking away
    // Player should face their walking direction (handled by tile movement)
    // Only face target when auto-retaliate triggers (handled by enterCombat)
  }

  /**
   * Handle combat follow - move player toward target when out of melee range.
   * This allows combat to continue when the target moves instead of timing out.
   *
   * NOTE: Actual movement is handled by ServerNetwork listening for COMBAT_FOLLOW_TARGET event.
   * This handler validates that combat is still active before the server initiates movement.
   */
  private handleCombatFollow(data: {
    playerId: string;
    targetId: string;
    targetPosition: { x: number; y: number; z: number };
  }): void {
    // Verify player is still in combat with this target
    const combatState = this.stateService
      .getCombatStatesMap()
      .get(data.playerId as EntityID);
    if (!combatState || combatState.targetId !== data.targetId) {
      return; // Combat ended or target changed, don't follow
    }
    // Movement is handled by ServerNetwork's COMBAT_FOLLOW_TARGET listener
    // which calls TileMovementManager.movePlayerToward()
  }

  private applyDamage(
    targetId: string,
    targetType: string,
    damage: number,
    attackerId: string,
  ): void {
    // Validate target type
    if (targetType !== "player" && targetType !== "mob") {
      return;
    }

    // Get the appropriate handler for the target type
    const handler = this.damageHandlers.get(targetType);
    if (!handler) {
      this.logger.error("No damage handler for target type", undefined, {
        targetType,
      });
      return;
    }

    // Create typed EntityID for handler
    const typedTargetId = createEntityID(targetId);
    const typedAttackerId = createEntityID(attackerId);

    // Determine attacker type for handler
    const attackerType = this.entityResolver.resolveType(attackerId);

    // Apply damage through polymorphic handler
    const result = handler.applyDamage(
      typedTargetId,
      damage,
      typedAttackerId,
      attackerType,
    );

    // Handle failed damage application
    if (!result.success) {
      if (result.targetDied) {
        // Target was already dead - end ALL combat with this entity
        this.deathHandler.handleEntityDied(targetId, targetType);
      } else {
        this.logger.error("Failed to apply damage", undefined, {
          targetId,
          targetType,
        });
      }
      return;
    }

    // Prevent additional attacks if target died this tick
    if (result.targetDied) {
      this.deathHandler.handleEntityDied(targetId, targetType);
      return;
    }

    // Emit UI message based on target type
    if (targetType === "player") {
      // Get attacker name for message
      const attackerHandler = this.damageHandlers.get(attackerType);
      const attackerName = attackerHandler
        ? attackerHandler.getDisplayName(typedAttackerId)
        : "enemy";

      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: targetId,
        message: `The ${attackerName} hits you for ${damage} damage!`,
        type: "damage",
      });
    }
    // Note: Mob death messages are emitted by MobEntity.die() to avoid duplication

    // Note: Damage splatter events are now emitted at the call sites
    // (handleMeleeAttack, processAutoAttack) to ensure they're emitted even for 0 damage hits
  }

  // Note: syncCombatStateToEntity, clearCombatStateFromEntity moved to CombatStateService
  // Note: setCombatEmote, resetEmote moved to CombatAnimationManager
  // Note: rotateTowardsTarget moved to CombatRotationManager

  private enterCombat(
    attackerId: EntityID,
    targetId: EntityID,
    attackerSpeedTicks?: number,
    attackerWeaponType: AttackType = AttackType.MELEE,
  ): void {
    const currentTick = this.world.currentTick ?? 0;

    // Detect entity types (don't assume attacker is always player!)
    const attackerEntity = this.world.entities.get(String(attackerId));
    const targetEntity = this.world.entities.get(String(targetId));

    // Don't enter combat if target is dead (using type guard)
    if (isEntityDead(targetEntity)) {
      return;
    }

    // Also check if target is a player marked as dead
    const playerSystem = this.world.getSystem("player") as unknown as
      | PlayerSystem
      | undefined;
    if (playerSystem?.getPlayer) {
      const targetPlayer = playerSystem.getPlayer(String(targetId));
      if (targetPlayer && !targetPlayer.alive) {
        return;
      }
    }

    const attackerType =
      attackerEntity?.type === "mob" ? ("mob" as const) : ("player" as const);
    const targetType =
      targetEntity?.type === "mob" ? ("mob" as const) : ("player" as const);

    const attackerInStreamingDuel =
      (attackerEntity as { data?: { inStreamingDuel?: boolean } } | undefined)
        ?.data?.inStreamingDuel === true;
    const targetInStreamingDuel =
      (targetEntity as { data?: { inStreamingDuel?: boolean } } | undefined)
        ?.data?.inStreamingDuel === true;
    const bypassPvPZoneCheck = attackerInStreamingDuel || targetInStreamingDuel;

    // PvP ZONE VALIDATION: Prevent player vs player combat in safe zones
    // This is critical to prevent:
    // - Combat resuming after respawn in safe zone
    // - Players attacking each other in towns/banks
    // - Auto-retaliate triggering in non-PvP areas
    // OPTIMIZATION: Use cached zoneDetectionSystem
    if (
      attackerType === "player" &&
      targetType === "player" &&
      !bypassPvPZoneCheck
    ) {
      if (this.zoneDetectionSystem) {
        const attackerPos = getEntityPosition(attackerEntity);
        if (attackerPos) {
          const isPvPAllowed = this.zoneDetectionSystem.isPvPEnabled({
            x: attackerPos.x,
            z: attackerPos.z,
          });
          if (!isPvPAllowed) {
            return; // Cannot start PvP in safe zone
          }
        }
      }
    }

    // Get attack speeds in ticks (use provided or calculate)
    const attackerAttackSpeedTicks =
      attackerSpeedTicks ??
      this.entityResolver.getAttackSpeed(attackerId, attackerType);
    const targetAttackSpeedTicks = this.entityResolver.getAttackSpeed(
      targetId,
      targetType,
    );

    // Set combat state for attacker (just attacked, so next attack is after cooldown)
    this.stateService.createAttackerState(
      attackerId,
      targetId,
      attackerType,
      targetType,
      currentTick,
      attackerAttackSpeedTicks,
      attackerWeaponType,
    );

    // OSRS Retaliation: Target retaliates after ceil(speed/2) + 1 ticks
    // @see https://oldschool.runescape.wiki/w/Auto_Retaliate
    // Check if target can retaliate (mobs have retaliates flag, players check auto-retaliate setting)
    let canRetaliate = true;
    if (targetType === "mob" && targetEntity) {
      // Check mob's retaliates config using type guard - if false, mob won't fight back
      canRetaliate = getMobRetaliates(targetEntity);
    } else if (targetType === "player") {
      // Check player's auto-retaliate setting
      // Uses cached reference (no getSystem() call in hot path)
      // Defaults to true if PlayerSystem unavailable (fail-safe, OSRS default)
      if (this.playerSystem) {
        canRetaliate = this.playerSystem.getPlayerAutoRetaliate(
          String(targetId),
        );
      }
      // Note: If playerSystem is null, canRetaliate stays true (default OSRS behavior)

      // 20 min AFK disables auto-retaliate
      if (canRetaliate && this.isAFKTooLong(String(targetId), currentTick)) {
        canRetaliate = false;
      }
    }

    // Attacker always faces target
    this.rotationManager.rotateTowardsTarget(
      String(attackerId),
      String(targetId),
      attackerType,
      targetType,
    );

    // Emit COMBAT_FACE_TARGET for the attacker so the local player client
    // rotates toward the target. This is essential for magic/ranged attacks
    // where the player is stationary (no movement to naturally rotate them).
    if (attackerType === "player") {
      this.eventEmitter.emitFaceTarget(String(attackerId), String(targetId));
    }

    // Auto-retaliate only triggers when player has no current target
    let targetHasValidTarget = false;
    if (canRetaliate) {
      const targetCombatState = this.stateService.getCombatData(targetId);
      targetHasValidTarget = !!(
        targetCombatState &&
        targetCombatState.inCombat &&
        this.entityResolver.isAlive(
          this.entityResolver.resolve(
            String(targetCombatState.targetId),
            targetCombatState.targetType,
          ),
          targetCombatState.targetType,
        )
      );

      if (!targetHasValidTarget) {
        // Target has no valid target - schedule retaliation (normal OSRS auto-retaliate)
        const retaliationDelay = calculateRetaliationDelay(
          targetAttackSpeedTicks,
        );

        this.stateService.createRetaliatorState(
          targetId,
          attackerId,
          targetType,
          attackerType,
          currentTick,
          retaliationDelay,
          targetAttackSpeedTicks,
        );

        // OSRS-ACCURATE: Auto-retaliate ALWAYS redirects player toward attacker
        // When hit with auto-retaliate ON, player stops any current movement and turns to fight
        // The COMBAT_FOLLOW_TARGET event replaces any existing movement destination
        // Wiki: "the player's character walks/runs towards the monster attacking and fights back"

        // ALWAYS rotate defender to face attacker immediately when retaliation starts
        // This fixes PvP rotation bug where defender wouldn't face attacker
        if (targetType === "player") {
          this.rotationManager.rotateTowardsTarget(
            String(targetId),
            String(attackerId),
            targetType,
            attackerType,
          );
        }

        // If not in attack range, also emit follow event to trigger movement
        // Movement will update rotation to face movement direction
        if (targetType === "player" && attackerEntity && targetEntity) {
          const attackerPos = getEntityPosition(attackerEntity);
          const targetPos = getEntityPosition(targetEntity);

          if (attackerPos && targetPos) {
            const attackerTile = worldToTile(attackerPos.x, attackerPos.z);
            const targetTile = worldToTile(targetPos.x, targetPos.z);

            // Get target player's attack type and range (they are retaliating)
            const targetAttackType =
              this.followController.getAttackTypeFromWeapon(String(targetId));
            const targetCombatRange = this.entityResolver.getCombatRange(
              targetEntity,
              "player",
            );

            // Use appropriate range check based on attack type
            const inRange =
              targetAttackType === AttackType.MELEE
                ? tilesWithinMeleeRange(
                    targetTile,
                    attackerTile,
                    targetCombatRange,
                  )
                : tilesWithinRange(targetTile, attackerTile, targetCombatRange);

            if (!inRange) {
              // Not in range - emit follow event to trigger movement
              this.eventEmitter.emitFollowTarget(
                String(targetId),
                String(attackerId),
                attackerPos,
                targetCombatRange,
                targetAttackType,
              );
            }
          }
        }
      } else {
        // Target already has valid target - just extend their combat timer
        // They stay locked on their current target (OSRS-accurate)
        this.stateService.extendCombatTimer(targetId, currentTick);
      }
    }

    // Sync combat state to player entities for client-side combat awareness
    // Attacker always gets combat state with target
    this.stateService.syncCombatStateToEntity(
      String(attackerId),
      String(targetId),
      attackerType,
    );

    // Target only gets NEW combat target if:
    // 1. They will retaliate (auto-retaliate ON), AND
    // 2. They don't already have a valid target (OSRS-accurate)
    //
    // If target already has a valid target, we don't overwrite their target state.
    // They stay locked on their current enemy.
    // NOTE: We use the same targetHasValidTarget value calculated BEFORE state modifications
    if (canRetaliate && !targetHasValidTarget) {
      // Target has no valid target - sync them to attack this attacker
      this.stateService.syncCombatStateToEntity(
        String(targetId),
        String(attackerId),
        targetType,
      );
    } else if (!canRetaliate && targetType === "player") {
      // Mark player as in combat (for logout timer) but without a target
      // Store attackerId so combat can start if auto-retaliate is toggled ON
      this.stateService.markInCombatWithoutTarget(
        String(targetId),
        String(attackerId),
      );

      // Player visually faces attacker even with auto-retaliate off
      this.eventEmitter.emitFaceTarget(String(targetId), String(attackerId));
    }

    // DON'T set combat emotes here - we set them when attacks happen instead
    // This prevents the animation from looping continuously

    // Emit combat started event
    this.eventEmitter.emitCombatStarted(String(attackerId), String(targetId));

    this.eventRecorder.record(GameEventType.COMBAT_START, String(attackerId), {
      targetId: String(targetId),
      attackerType,
      targetType,
      attackerAttackSpeedTicks,
      targetAttackSpeedTicks,
    });

    // Show combat UI indicator for the local player (whoever that is)
    const localPlayer = this.world.getPlayer();
    if (
      localPlayer &&
      (String(attackerId) === localPlayer.id ||
        String(targetId) === localPlayer.id)
    ) {
      const opponent =
        String(attackerId) === localPlayer.id ? targetEntity : attackerEntity;
      const opponentName = opponent!.name;

      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: localPlayer.id,
        message: `Combat started with ${opponentName}!`,
        type: "combat",
        duration: 3000,
      });
    }
  }

  public startCombat(
    attackerId: string,
    targetId: string,
    options?: {
      attackerType?: "player" | "mob";
      targetType?: "player" | "mob";
      weaponType?: AttackType;
    },
  ): boolean {
    const opts = {
      attackerType: "player",
      targetType: "mob",
      weaponType: AttackType.MELEE,
      ...options,
    };

    const attacker = this.entityResolver.resolve(attackerId, opts.attackerType);
    const target = this.entityResolver.resolve(targetId, opts.targetType);

    if (!attacker || !target) {
      return false;
    }

    const attackerAlive = this.entityResolver.isAlive(
      attacker,
      opts.attackerType,
    );
    const targetAlive = this.entityResolver.isAlive(target, opts.targetType);

    if (!attackerAlive) {
      return false;
    }
    if (!targetAlive) {
      return false;
    }

    // MVP: Melee-only range check (tile-based)
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return false; // Missing position

    // Use pre-allocated pooled tiles (zero GC)
    tilePool.setFromPosition(this._attackerTile, attackerPos);
    tilePool.setFromPosition(this._targetTile, targetPos);
    const combatRangeTiles = this.entityResolver.getCombatRange(
      attacker,
      opts.attackerType,
    );
    // OSRS-accurate melee range check (cardinal-only for range 1)
    if (
      !tilesWithinMeleeRange(
        this._attackerTile,
        this._targetTile,
        combatRangeTiles,
      )
    ) {
      return false;
    }

    // Start combat — pass weaponType so enterCombat uses correct attack speed
    this.enterCombat(
      createEntityID(attackerId),
      createEntityID(targetId),
      undefined,
      opts.weaponType as AttackType,
    );
    return true;
  }

  public isInCombat(entityId: string): boolean {
    return this.stateService.isInCombat(entityId);
  }

  public getCombatData(entityId: string): CombatData | null {
    return this.stateService.getCombatData(entityId);
  }

  /**
   * Check if player is on attack cooldown
   * Used by eating system to determine if eat should add attack delay
   *
   * OSRS Rule: Foods only add to EXISTING attack delay.
   * If weapon is ready to attack (cooldown expired), eating does NOT add delay.
   *
   * @param playerId - Player to check
   * @param currentTick - Current game tick
   * @returns true if player has pending attack cooldown
   */
  public isPlayerOnAttackCooldown(
    playerId: string,
    currentTick: number,
  ): boolean {
    const typedPlayerId = createEntityID(playerId);
    const nextAllowedTick = this.nextAttackTicks.get(typedPlayerId) ?? 0;
    return currentTick < nextAllowedTick;
  }

  /**
   * Add delay ticks to player's next attack
   * Used by eating system (OSRS: eating during combat adds 3 tick delay)
   *
   * OSRS-Accurate: Only called when player is ALREADY on cooldown.
   * If weapon is ready, eating does not add delay.
   *
   * @param playerId - Player to modify
   * @param delayTicks - Ticks to add to attack cooldown
   */
  public addAttackDelay(playerId: string, delayTicks: number): void {
    const typedPlayerId = createEntityID(playerId);
    const currentNext = this.nextAttackTicks.get(typedPlayerId);

    if (currentNext !== undefined) {
      // Add delay to existing cooldown (mutate in place, no allocation)
      this.nextAttackTicks.set(typedPlayerId, currentNext + delayTicks);

      // Also update CombatData if active (keeps state consistent)
      const combatData = this.stateService.getCombatData(typedPlayerId);
      if (combatData) {
        combatData.nextAttackTick += delayTicks;
      }
    }
    // If no current cooldown, do nothing (OSRS-accurate: no delay if weapon ready)
  }

  public forceEndCombat(
    entityId: string,
    options?: {
      skipAttackerEmoteReset?: boolean;
      skipTargetEmoteReset?: boolean;
    },
  ): void {
    this.lifecycleHandler.endCombat({
      entityId,
      skipAttackerEmoteReset: options?.skipAttackerEmoteReset,
      skipTargetEmoteReset: options?.skipTargetEmoteReset,
    });
  }

  /**
   * Check if a player can logout based on combat state
   * OSRS-accurate: Cannot logout while actively in combat
   * Uses the combat timeout window to determine if player is in active combat
   *
   * @param playerId - The player's entity ID
   * @param currentTick - The current game tick
   * @returns Object with allowed boolean and optional reason string
   */
  public canLogout(
    playerId: string,
    currentTick: number,
  ): { allowed: boolean; reason?: string } {
    const combatData = this.stateService.getCombatData(playerId);

    // Player is in active combat if:
    // 1. They have combat data with inCombat flag
    // 2. Current tick is before their combat end tick
    if (combatData?.inCombat && currentTick < combatData.combatEndTick) {
      return {
        allowed: false,
        reason: "Cannot logout during combat",
      };
    }

    return { allowed: true };
  }

  /**
   * Update the last input tick for a player
   * Called by PlayerSystem when player performs any action
   * OSRS: Auto-retaliate disabled after 20 minutes of no input
   *
   * @param playerId - The player's entity ID
   * @param currentTick - The current game tick
   */
  public updatePlayerInput(playerId: string, currentTick: number): void {
    this.lastInputTick.set(playerId, currentTick);
  }

  /**
   * Check if a player has been AFK too long (20 minutes)
   * OSRS-accurate: Auto-retaliate disabled after 2000 ticks of no input
   *
   * @param playerId - The player's entity ID
   * @param currentTick - The current game tick
   * @returns true if player has been AFK too long
   */
  public isAFKTooLong(playerId: string, currentTick: number): boolean {
    const lastInput = this.lastInputTick.get(playerId) ?? currentTick;
    return currentTick - lastInput >= getAfkDisableRetaliateTicks();
  }

  /**
   * Clean up all combat state for a disconnecting player
   * Called when a player disconnects to prevent orphaned combat states
   * and allow mobs to immediately retarget other players
   */
  public cleanupPlayerDisconnect(playerId: string): void {
    const typedPlayerId = createEntityID(playerId);

    // Remove player's own combat state
    this.stateService.removeCombatState(typedPlayerId);

    // Clear player's attack cooldowns
    this.nextAttackTicks.delete(typedPlayerId);

    // Clear any scheduled emote resets
    this.animationManager.cancelEmoteReset(playerId);

    // Clear player's equipment stats cache
    this.playerEquipmentStats.delete(playerId);

    this.antiCheat.cleanup(playerId);
    this.rateLimiter.cleanup(playerId);
    this.lastInputTick.delete(playerId);

    // Clear combat follow tracking
    this.lastCombatTargetTile.delete(playerId);

    // Cancel any in-flight projectiles targeting or from this player
    this.projectileService.cancelProjectilesForTarget(playerId);
    this.projectileService.cancelProjectilesFromAttacker(playerId);

    // Find all entities that were targeting this disconnected player
    const combatStatesMap = this.stateService.getCombatStatesMap();
    for (const [attackerId, state] of combatStatesMap) {
      if (String(state.targetId) === playerId) {
        // Clear the attacker's cooldown so they can immediately retarget
        this.nextAttackTicks.delete(attackerId);

        // If attacker is a mob, reset its internal combat state
        if (state.attackerType === "mob") {
          const mobEntity = this.world.entities.get(String(attackerId));
          if (
            isMobEntity(mobEntity) &&
            typeof mobEntity.onTargetDied === "function"
          ) {
            // Reuse the same method - disconnect is similar to death
            mobEntity.onTargetDied(playerId);
          }
        }

        // Remove the attacker's combat state (don't let them keep attacking empty air)
        this.stateService.removeCombatState(attackerId);

        // Clear combat state from entity if it's a player
        if (state.attackerType === "player") {
          this.stateService.clearCombatStateFromEntity(
            String(attackerId),
            "player",
          );
        }
      }
    }
  }

  // Combat update loop - DEPRECATED: Combat logic now handled by processCombatTick() via TickSystem
  // This method is kept for compatibility but does nothing - all combat runs through tick system
  update(_dt: number): void {
    // Combat logic moved to processCombatTick() for OSRS-accurate tick-based timing
    // This is called by TickSystem at TickPriority.COMBAT
  }

  // Track when PID order needs re-sorting (optimization)
  private _pidSortDirty = true;
  private _lastSortedCombatCount = 0;

  /**
   * Process combat on each server tick (OSRS-accurate)
   * Called by TickSystem at COMBAT priority (after movement, before AI)
   */
  public processCombatTick(tickNumber: number): void {
    // Update PIDs - returns true if shuffle happened
    const pidShuffled = this.pidManager.update(tickNumber);
    if (pidShuffled) {
      this._pidSortDirty = true;
    }

    // Process projectile hits (ranged/magic delayed damage)
    this.processProjectileHits(tickNumber);

    // Process scheduled emote resets (tick-aligned animation timing)
    // Delegated to AnimationManager for better separation of concerns
    this.animationManager.processEmoteResets(tickNumber);

    // Get all combat states via StateService (returns reusable buffer to avoid allocations)
    const combatStates = this.stateService.getAllCombatStates();
    const combatStatesMap = this.stateService.getCombatStatesMap();

    // OPTIMIZED: Only sort when needed
    // - Skip if <= 1 combatants (nothing to sort)
    // - Mark dirty when PIDs shuffle or combatant count changes
    const combatCount = combatStates.length;
    if (combatCount !== this._lastSortedCombatCount) {
      this._pidSortDirty = true;
      this._lastSortedCombatCount = combatCount;
    }

    if (combatCount > 1 && this._pidSortDirty) {
      // Lower PID attacks first when multiple attacks on same tick
      combatStates.sort((a, b) => this.pidManager.comparePriority(a[0], b[0]));
      this._pidSortDirty = false;
    }

    // PERFORMANCE: Process combat with frame budget awareness
    // Combat ticks are critical gameplay - always process, but track budget
    const frameBudget = this.world.frameBudget;
    let processed = 0;

    for (const [entityId, combatState] of combatStates) {
      // Check frame budget every 20 combatants (combat is time-critical, be lenient)
      if (processed > 0 && processed % 20 === 0) {
        if (frameBudget && !frameBudget.hasTimeRemaining(1)) {
          // Over budget - log warning but don't skip combat (would break gameplay)
          // This is a signal to optimize elsewhere
          console.warn(
            `[CombatSystem] Frame budget exhausted with ${combatStates.length - processed} combats remaining`,
          );
          // Continue processing - combat must complete for fairness
        }
      }

      if (!combatStatesMap.has(entityId)) {
        continue;
      }

      // Check for combat timeout (8 ticks after last hit)
      if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
        const entityIdStr = String(entityId);
        this.lifecycleHandler.endCombat({ entityId: entityIdStr });
        processed++;
        continue;
      }

      if (!combatState.inCombat || !combatState.targetId) continue;

      // OSRS-style: Check range EVERY tick and follow if needed (not just on attack ticks)
      // In OSRS, you continuously pursue your target while in combat
      if (combatState.attackerType === "player") {
        this.followController.checkRangeAndFollow(combatState, tickNumber);
      }

      if (tickNumber >= combatState.nextAttackTick) {
        void this.processAutoAttackOnTick(combatState, tickNumber).catch(
          (error) => {
            this.logger.error(
              "processAutoAttackOnTick failed",
              error instanceof Error ? error : undefined,
              { entityId: String(entityId), tickNumber },
            );
          },
        );
      }

      processed++;
    }
  }

  /**
   * Process combat for a specific NPC on this tick
   *
   * OSRS-ACCURATE: Called by GameTickProcessor during NPC phase
   * NPCs process BEFORE players, creating the damage asymmetry:
   * - NPC → Player damage: Applied same tick
   * - Player → NPC damage: Applied next tick
   *
   * @param mobId - The NPC entity ID to process
   * @param tickNumber - Current tick number
   */
  public processNPCCombatTick(mobId: string, tickNumber: number): void {
    const combatState = this.stateService.getCombatData(mobId);

    if (!combatState) return;

    // Check for combat timeout (8 ticks after last hit)
    if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
      this.lifecycleHandler.endCombat({ entityId: mobId });
      return;
    }

    if (!combatState.inCombat || !combatState.targetId) return;

    // Only process mob attackers (not mobs being attacked)
    if (combatState.attackerType !== "mob") return;

    // Process emote resets for this mob
    this.animationManager.processEntityEmoteReset(mobId, tickNumber);

    if (tickNumber >= combatState.nextAttackTick) {
      void this.processAutoAttackOnTick(combatState, tickNumber).catch(
        (error) => {
          this.logger.error(
            "NPC processAutoAttackOnTick failed",
            error instanceof Error ? error : undefined,
            { mobId, tickNumber },
          );
        },
      );
    }
  }

  /**
   * Process combat for a specific player on this tick
   *
   * OSRS-ACCURATE: Called by GameTickProcessor during Player phase
   * Players process AFTER NPCs, creating the damage asymmetry:
   * - Player → NPC damage: Applied next tick (queued by GameTickProcessor)
   * - NPC → Player damage: Applied same tick
   *
   * @param playerId - The player entity ID to process
   * @param tickNumber - Current tick number
   */
  public processPlayerCombatTick(playerId: string, tickNumber: number): void {
    const combatState = this.stateService.getCombatData(playerId);

    if (!combatState) return;

    // Check for combat timeout (8 ticks after last hit)
    if (combatState.inCombat && tickNumber >= combatState.combatEndTick) {
      this.lifecycleHandler.endCombat({ entityId: playerId });
      return;
    }

    if (!combatState.inCombat || !combatState.targetId) return;

    // Only process player attackers (not players being attacked)
    if (combatState.attackerType !== "player") return;

    // OSRS-ACCURATE: No movement suppression needed
    // If player has combat state, they're either:
    // 1. Standing still fighting
    // 2. Combat following (chasing their target)
    // In both cases, attacks should happen when in range and cooldown ready
    // Wiki: "follow and attack while chasing it"
    // The disengage event handles the "escape" case by clearing combat state

    // Process emote resets for this player
    this.animationManager.processEntityEmoteReset(playerId, tickNumber);

    // OSRS-style: Check range EVERY tick and follow if needed
    this.followController.checkRangeAndFollow(combatState, tickNumber);

    if (tickNumber >= combatState.nextAttackTick) {
      void this.processAutoAttackOnTick(combatState, tickNumber).catch(
        (error) => {
          this.logger.error(
            "Player processAutoAttackOnTick failed",
            error instanceof Error ? error : undefined,
            { playerId, tickNumber },
          );
        },
      );
    }
  }

  // checkRangeAndFollow moved to ./CombatFollowController (slice 8).
  // Call sites delegate via
  // this.followController.checkRangeAndFollow(combatState, tickNumber).

  // validateCombatActors and validateAttackRange moved to
  // ./CombatAttackValidator (slice 7). Call sites delegate via
  // this.attackValidator.{method}(...).

  /**
   * Execute the attack: rotation, animation, damage calculation, and application
   * @returns The damage dealt (capped at target's current health)
   */
  private executeAttackDamage(
    attackerId: string,
    targetId: string,
    attacker: Entity | MobEntity,
    target: Entity | MobEntity,
    combatState: CombatData,
    tickNumber: number,
  ): number {
    // OSRS-STYLE: Update entity facing to face target
    this.rotationManager.rotateTowardsTarget(
      attackerId,
      targetId,
      combatState.attackerType,
      combatState.targetType,
    );

    // Play attack animation with attack speed for proper animation duration
    this.animationManager.setCombatEmote(
      attackerId,
      combatState.attackerType,
      tickNumber,
      combatState.attackSpeedTicks,
    );

    // Get player's combat style for OSRS-accurate damage bonuses
    let combatStyle: CombatStyle = "accurate";
    if (combatState.attackerType === "player") {
      const playerSystem = this.world.getSystem(
        "player",
      ) as unknown as PlayerSystem | null;
      const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
      if (styleData?.id) {
        combatStyle = styleData.id as CombatStyle;
      }
    }

    // MVP: Melee-only damage calculation
    const rawDamage = this.damageOrchestrator.calculateMeleeDamage(
      attacker,
      target,
      combatStyle,
    );

    // OSRS-STYLE: Cap damage at target's current health (no overkill)
    const currentHealth = this.entityResolver.getHealth(target);
    const damage = Math.min(rawDamage, currentHealth);

    // Apply capped damage
    this.applyDamage(targetId, combatState.targetType, damage, attackerId);

    // Emit damage splatter event using pre-allocated payload (zero allocation)
    const targetPosition = getEntityPosition(target);
    this.eventEmitter.emitDamageDealt(
      attackerId,
      targetId,
      damage,
      undefined,
      combatState.targetType,
      targetPosition,
    );

    this.eventRecorder.record(GameEventType.COMBAT_ATTACK, attackerId, {
      targetId,
      attackerType: combatState.attackerType,
      targetType: combatState.targetType,
      attackSpeedTicks: combatState.attackSpeedTicks,
    });

    if (damage > 0) {
      this.eventRecorder.record(GameEventType.COMBAT_DAMAGE, attackerId, {
        targetId,
        damage,
        rawDamage,
        targetHealth: currentHealth,
        targetPosition: targetPosition
          ? { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }
          : undefined,
      });
    } else {
      this.eventRecorder.record(GameEventType.COMBAT_MISS, attackerId, {
        targetId,
        rawDamage,
      });
    }

    return damage;
  }

  /**
   * Update combat state tick tracking after a successful attack
   */
  private updateCombatTickState(
    combatState: CombatData,
    typedAttackerId: EntityID,
    tickNumber: number,
  ): void {
    combatState.lastAttackTick = tickNumber;
    combatState.nextAttackTick = tickNumber + combatState.attackSpeedTicks;
    combatState.combatEndTick = tickNumber + getCombatTimeoutTicks();
    this.nextAttackTicks.set(typedAttackerId, combatState.nextAttackTick);
  }

  /**
   * Handle player auto-retaliation when attacked
   * Creates retaliation state if player needs to fight back
   */
  private handlePlayerRetaliation(
    targetId: string,
    attackerId: string,
    typedAttackerId: EntityID,
    attackerType: "player" | "mob",
    tickNumber: number,
  ): void {
    const targetPlayerState = this.stateService.getCombatData(targetId);
    let shouldRetaliate =
      this.playerSystem?.getPlayerAutoRetaliate(targetId) ?? true;

    if (shouldRetaliate && this.isAFKTooLong(targetId, tickNumber)) {
      shouldRetaliate = false;
    }

    // Player needs a new retaliation state if:
    // 1. They have auto-retaliate ON, AND
    // 2. They have no combat state, OR their current target is dead/invalid
    if (!shouldRetaliate) return;

    const needsNewTarget =
      !targetPlayerState ||
      !targetPlayerState.inCombat ||
      !this.entityResolver.isAlive(
        this.entityResolver.resolve(
          String(targetPlayerState.targetId),
          targetPlayerState.targetType,
        ),
        targetPlayerState.targetType,
      );

    if (!needsNewTarget) return;

    // Create retaliation state for player targeting this attacker
    const playerAttackSpeed = this.entityResolver.getAttackSpeed(
      createEntityID(targetId),
      "player",
    );
    const retaliationDelay = calculateRetaliationDelay(playerAttackSpeed);

    this.stateService.createRetaliatorState(
      createEntityID(targetId),
      typedAttackerId,
      "player",
      attackerType,
      tickNumber,
      retaliationDelay,
      playerAttackSpeed,
    );

    // Sync combat state to player entity
    this.stateService.syncCombatStateToEntity(targetId, attackerId, "player");

    // Face the attacker
    this.rotationManager.rotateTowardsTarget(
      targetId,
      attackerId,
      "player",
      attackerType,
    );

    // Clear any server face target since player now has combat target
    this.eventEmitter.emitClearFaceTarget(targetId);
  }

  /**
   * Emit combat events for UI feedback
   * NOTE: COMBAT_MELEE_ATTACK is NOT emitted here to avoid duplicate processing.
   * Damage splats are handled by COMBAT_DAMAGE_DEALT which is already emitted
   * by executeAttackDamage() and bridged to clients via EventBridge.
   */
  private emitCombatEvents(
    attackerId: string,
    _targetId: string,
    target: Entity | MobEntity,
    damage: number,
    combatState: CombatData,
  ): void {
    // Emit UI message for player attacks (chat feedback)
    if (combatState.attackerType === "player") {
      this.emitTypedEvent(EventType.UI_MESSAGE, {
        playerId: attackerId,
        message: `You hit the ${this.entityResolver.getDisplayName(target)} for ${damage} damage!`,
        type: "combat",
      });
    }
  }

  /**
   * Process projectile hits for ranged/magic attacks
   * Applies delayed damage when projectiles reach their targets
   */
  private processProjectileHits(tickNumber: number): void {
    const result = this.projectileService.processTick(tickNumber);

    for (const projectile of result.hits) {
      // Get target entity
      const target =
        this.entityResolver.resolve(
          projectile.targetId,
          "mob", // Could be player or mob, resolver handles this
        ) ?? this.entityResolver.resolve(projectile.targetId, "player");

      if (!target) continue;

      // Determine target type
      const targetType = isMobEntity(target) ? "mob" : "player";

      // Check if target is still alive
      if (!this.entityResolver.isAlive(target, targetType)) {
        continue;
      }

      // Cap damage at target's current health
      const currentHealth = this.entityResolver.getHealth(target);
      const damage = Math.min(projectile.damage, currentHealth);

      // Apply damage
      this.applyDamage(
        projectile.targetId,
        targetType,
        damage,
        projectile.attackerId,
      );

      // Emit damage and projectile hit events using pre-allocated payloads (zero allocation)
      const targetPosition = getEntityPosition(target);
      this.eventEmitter.emitDamageDealt(
        projectile.attackerId,
        projectile.targetId,
        damage,
        undefined,
        targetType,
        targetPosition,
      );
      this.eventEmitter.emitProjectileHit(
        projectile.attackerId,
        projectile.targetId,
        damage,
        projectile.spellId ? "spell" : "arrow",
      );

      // Record combat event
      this.eventRecorder.record(
        GameEventType.COMBAT_DAMAGE,
        projectile.attackerId,
        {
          targetId: projectile.targetId,
          damage,
          rawDamage: projectile.damage,
          projectileHit: true,
          attackType: projectile.spellId ? "magic" : "ranged",
        },
      );

      // Handle XP rewards for magic (ranged XP handled elsewhere)
      if (projectile.xpReward && projectile.xpReward > 0) {
        this.emitTypedEvent(EventType.PLAYER_XP_GAINED, {
          playerId: projectile.attackerId,
          skill: "magic",
          xp: projectile.xpReward,
        });
      }
    }
  }

  /**
   * Process auto-attack for a combatant on a specific tick
   */
  private async processAutoAttackOnTick(
    combatState: CombatData,
    tickNumber: number,
  ): Promise<void> {
    const attackerId = String(combatState.attackerId);
    const targetId = String(combatState.targetId);
    const typedAttackerId = combatState.attackerId;

    // Step 1: Validate combat actors exist and are alive
    const actors = this.attackValidator.validateCombatActors(combatState);
    if (!actors) return;
    const { attacker, target } = actors;

    // Step 1.5: Route ranged/magic auto-attacks through projectile handlers.
    // Players derive attack type from equipment; mobs use persisted combat weapon type.
    const attackType =
      combatState.attackerType === "player"
        ? this.followController.getAttackTypeFromWeapon(attackerId)
        : combatState.weaponType;
    if (attackType === AttackType.RANGED || attackType === AttackType.MAGIC) {
      // Handlers handle claiming the cooldown slot synchronously before any async work,
      // so we don't need to pre-claim it here (which would break their internal checks).
      await this.handleAttack({
        attackerId,
        targetId,
        attackerType: combatState.attackerType,
        targetType: combatState.targetType,
        attackType,
      });

      // Refresh combat timeout after ranged/magic attack to prevent combat
      // from timing out after COMBAT_TIMEOUT_TICKS. The handler may have
      // replaced the state via enterCombat → createAttackerState, so fetch
      // the fresh state from the Map (old reference may be stale).
      const freshState = this.stateService
        .getCombatStatesMap()
        .get(typedAttackerId);
      if (freshState) {
        freshState.combatEndTick = tickNumber + getCombatTimeoutTicks();
        freshState.lastAttackTick = tickNumber;
      }
      return;
    }

    // Step 2: Validate attack range (melee only from here)
    if (
      !this.attackValidator.validateAttackRange(
        attacker,
        target,
        combatState.attackerType,
      )
    ) {
      return;
    }

    // Step 3: Execute melee attack (rotation, animation, damage)
    const damage = this.executeAttackDamage(
      attackerId,
      targetId,
      attacker,
      target,
      combatState,
      tickNumber,
    );

    // Step 4: Check if combat state still exists (target may have died)
    if (!this.stateService.getCombatStatesMap().has(typedAttackerId)) {
      return;
    }

    // Step 5: Update combat tick state
    this.updateCombatTickState(combatState, typedAttackerId, tickNumber);

    // Step 6: Handle player retaliation if target is a player
    if (combatState.targetType === "player") {
      this.handlePlayerRetaliation(
        targetId,
        attackerId,
        typedAttackerId,
        combatState.attackerType,
        tickNumber,
      );
    }

    // Step 7: Emit combat events
    this.emitCombatEvents(attackerId, targetId, target, damage, combatState);
  }

  // Combat event recording (record / buildGameStateInfo /
  // buildCombatSnapshot) lives in CombatEventRecorder — see field
  // declaration above. All `this.eventRecorder.record(...)` callsites
  // delegate to `this.eventRecorder.record(...)`.

  destroy(): void {
    this.stateService.destroy();
    this.animationManager.destroy();
    this.antiCheat.destroy();
    this.rateLimiter.destroy();
    this.eventStore.destroy();
    this.projectileService.clear();
    tilePool.release(this._attackerTile);
    tilePool.release(this._targetTile);
    this.nextAttackTicks.clear();
    this.lastCombatTargetTile.clear();
    this.playerEquipmentStats.clear();
    this.lastInputTick.clear();
    super.destroy();
  }

  /**
   * Decay anti-cheat scores and clean stale XP history
   * Call periodically (e.g., every minute) to prevent memory leaks
   */
  public decayAntiCheatScores(): void {
    this.antiCheat.decayScores();
    // Also clean stale XP history to prevent memory leaks from disconnected players
    const currentTick = this.world.currentTick ?? 0;
    this.antiCheat.cleanupStaleXPHistory(currentTick);
  }

  /**
   * Get pool statistics for monitoring dashboard
   * Useful for detecting memory leaks or pool exhaustion
   *
   * @see COMBAT_SYSTEM_IMPROVEMENTS.md Section 3.2
   */
  public getPoolStats(): {
    quaternions: { total: number; available: number; inUse: number };
  } {
    return {
      quaternions: quaternionPool.getStats(),
    };
  }
}
