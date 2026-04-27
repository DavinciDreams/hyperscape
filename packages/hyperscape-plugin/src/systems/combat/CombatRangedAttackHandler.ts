/**
 * CombatRangedAttackHandler — inbound entry for ranged attacks.
 *
 * Wraps the single `handleRangedAttack` method extracted from
 * CombatSystem.ts. Two branches share the same shape:
 *
 *   - **Mob branch**: resolves the attacker's NPC config (arrowId,
 *     range, attackSpeedTicks), enforces range + cooldown, plays
 *     emote, computes mob-ranged damage, creates the projectile,
 *     emits the projectile-launched event with computed flight
 *     timing, sets cooldown, dispatches enterCombat.
 *   - **Player branch**: validates entity IDs + rate-limits, resolves
 *     entities + alive checks, validates equipped arrows via
 *     ammunitionService, applies the ranged style speed modifier,
 *     reads attackRange from the bow, performs the same projectile
 *     setup as the mob branch using the player's equipment.
 *
 * Damage is created at launch but applied later via the projectile-
 * hit deferred-resolution loop (CombatProjectileHitProcessor, slice
 * 11).
 *
 * Extracted from CombatSystem.ts as the fifteenth slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT). Coupling shape:
 * 14 dep refs at construction. Most are concrete helpers from earlier
 * slices. Two closures because the underlying systems are late-bound
 * on CombatSystem (assigned during start() after world lookups):
 *   - getPlayerSystem — combat-style lookup for ranged style modifier
 * Plus shared mutable refs: nextAttackTicks Map, _attackerTile +
 * _targetTile pooled buffers, world ref for currentTick.
 */

import {
  AttackType,
  EventType,
  RANGED_STYLE_BONUSES,
  type EntityID,
  type PooledTile,
  type RangedCombatStyle,
  type World,
  createEntityID,
  getArrowLaunchDelayMs,
  getDefaultNpcAttackSpeedTicks,
  getDefaultRangedRange,
  getEntityPosition,
  getHitDelayConfig,
  getNPCById,
  getTickDurationMs,
  isMobEntity,
  tileChebyshevDistance,
  tilePool,
} from "@hyperforge/shared";

import { ammunitionService } from "./AmmunitionService";
import type { CombatAnimationManager } from "./CombatAnimationManager";
import type { CombatAntiCheat } from "./CombatAntiCheat";
import type { CombatAttackValidator } from "./CombatAttackValidator";
import type { CombatDamageOrchestrator } from "./CombatDamageOrchestrator";
import type { CombatEnterLifecycleHandler } from "./CombatEnterLifecycleHandler";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatPlayerQueries } from "./CombatPlayerQueries";
import type { CombatRateLimiter } from "./CombatRateLimiter";
import type { CombatRotationManager } from "./CombatRotationManager";
import type { EntityIdValidator } from "./EntityIdValidator";
import type {
  CreateProjectileParams,
  ProjectileService,
} from "./ProjectileService";

/** Surface needed for combat-style lookup. */
interface PlayerSystemLike {
  getPlayerAttackStyle?(id: string): { id: string } | undefined;
}

/** Callback shape for the host system's typed-emit method. */
export type CombatRangedEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatRangedAttackHandler {
  private readonly world: World;
  private readonly entityIdValidator: EntityIdValidator;
  private readonly antiCheat: CombatAntiCheat;
  private readonly rateLimiter: CombatRateLimiter;
  private readonly attackValidator: CombatAttackValidator;
  private readonly entityResolver: CombatEntityResolver;
  private readonly rotationManager: CombatRotationManager;
  private readonly animationManager: CombatAnimationManager;
  private readonly damageOrchestrator: CombatDamageOrchestrator;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly playerQueries: CombatPlayerQueries;
  private readonly projectileService: ProjectileService;
  private readonly enterLifecycleHandler: CombatEnterLifecycleHandler;
  private readonly nextAttackTicks: Map<EntityID, number>;
  private readonly attackerTile: PooledTile;
  private readonly targetTile: PooledTile;
  private readonly emit: CombatRangedEmitFn;
  private readonly getPlayerSystem: () => PlayerSystemLike | undefined;

  constructor(
    world: World,
    entityIdValidator: EntityIdValidator,
    antiCheat: CombatAntiCheat,
    rateLimiter: CombatRateLimiter,
    attackValidator: CombatAttackValidator,
    entityResolver: CombatEntityResolver,
    rotationManager: CombatRotationManager,
    animationManager: CombatAnimationManager,
    damageOrchestrator: CombatDamageOrchestrator,
    eventEmitter: CombatEventEmitter,
    playerQueries: CombatPlayerQueries,
    projectileService: ProjectileService,
    enterLifecycleHandler: CombatEnterLifecycleHandler,
    nextAttackTicks: Map<EntityID, number>,
    attackerTile: PooledTile,
    targetTile: PooledTile,
    emit: CombatRangedEmitFn,
    getPlayerSystem: () => PlayerSystemLike | undefined,
  ) {
    this.world = world;
    this.entityIdValidator = entityIdValidator;
    this.antiCheat = antiCheat;
    this.rateLimiter = rateLimiter;
    this.attackValidator = attackValidator;
    this.entityResolver = entityResolver;
    this.rotationManager = rotationManager;
    this.animationManager = animationManager;
    this.damageOrchestrator = damageOrchestrator;
    this.eventEmitter = eventEmitter;
    this.playerQueries = playerQueries;
    this.projectileService = projectileService;
    this.enterLifecycleHandler = enterLifecycleHandler;
    this.nextAttackTicks = nextAttackTicks;
    this.attackerTile = attackerTile;
    this.targetTile = targetTile;
    this.emit = emit;
    this.getPlayerSystem = getPlayerSystem;
  }

  /**
   * Inbound entry point for a ranged attack request. Branches on
   * attackerType and dispatches mob-side or player-side flow.
   */
  handleRangedAttack(data: {
    attackerId: string;
    targetId: string;
    attackerType: "player" | "mob";
    targetType: "player" | "mob";
    arrowId?: string;
  }): void {
    const { attackerId, targetId, attackerType, targetType } = data;
    const currentTick = this.world.currentTick ?? 0;

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

      tilePool.setFromPosition(this.attackerTile, attackerPos);
      tilePool.setFromPosition(this.targetTile, targetPos);
      const distance = tileChebyshevDistance(
        this.attackerTile,
        this.targetTile,
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
      this.enterLifecycleHandler.enterCombat(
        typedAttackerId,
        typedTargetId,
        attackSpeedTicks,
        AttackType.RANGED,
      );
      return;
    }

    if (
      !this.entityIdValidator.isValid(attackerId) ||
      !this.entityIdValidator.isValid(targetId)
    ) {
      return;
    }

    const rateResult = this.rateLimiter.checkLimit(attackerId, currentTick);
    if (!rateResult.allowed) {
      return;
    }
    this.antiCheat.trackAttack(attackerId, currentTick);

    const attacker = this.entityResolver.resolve(attackerId, attackerType);
    const target = this.entityResolver.resolve(targetId, targetType);
    if (!attacker || !target) return;

    if (
      !this.entityResolver.isAlive(attacker, attackerType) ||
      !this.entityResolver.isAlive(target, targetType)
    ) {
      return;
    }

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
      this.emit(EventType.UI_MESSAGE, {
        playerId: attackerId,
        message: arrowValidation.error ?? "You need arrows to attack.",
        type: "error",
      });
      return;
    }

    const attackRange = weapon?.attackRange ?? 7;
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return;

    tilePool.setFromPosition(this.attackerTile, attackerPos);
    tilePool.setFromPosition(this.targetTile, targetPos);
    const distance = tileChebyshevDistance(this.attackerTile, this.targetTile);

    if (distance > attackRange || distance === 0) {
      this.eventEmitter.emitAttackFailed(attackerId, targetId, "out_of_range");
      return;
    }

    const typedAttackerId = createEntityID(attackerId);
    if (
      !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
    ) {
      return;
    }

    let rangedStyle: RangedCombatStyle = "accurate";
    const playerSystem = this.getPlayerSystem();
    const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
    if (styleData?.id) {
      const id = styleData.id;
      if (id === "accurate" || id === "rapid" || id === "longrange") {
        rangedStyle = id;
      }
    }

    const baseAttackSpeed = weapon?.attackSpeed ?? 4;
    const styleBonus = RANGED_STYLE_BONUSES[rangedStyle];
    const attackSpeedTicks = Math.max(
      1,
      baseAttackSpeed + styleBonus.speedModifier,
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
    );

    const damage = this.damageOrchestrator.calculateRangedDamageForAttack(
      attacker,
      target,
      attackerId,
      targetType,
    );

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

    this.eventEmitter.emitProjectileLaunched(
      attackerId,
      targetId,
      "arrow",
      attackerPos,
      targetPos,
      undefined,
      arrowSlot?.itemId ? String(arrowSlot.itemId) : undefined,
      400,
    );

    const typedTargetId = createEntityID(targetId);
    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
    this.enterLifecycleHandler.enterCombat(
      typedAttackerId,
      typedTargetId,
      attackSpeedTicks,
      AttackType.RANGED,
    );
  }
}
