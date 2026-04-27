/**
 * CombatMeleeAttackHandler — entry-point + execute pair for melee
 * attacks.
 *
 * Wraps two methods extracted from CombatSystem.ts:
 *
 *   - handleMeleeAttack: inbound entry. Validates entity IDs (anti-
 *     cheat-aware), rate-limits player attackers, runs the attack
 *     validator, checks the cooldown, then delegates to
 *     executeMeleeAttack.
 *   - executeMeleeAttack: damage path. Faces target, plays emote,
 *     reads combat style from playerSystem, computes melee damage
 *     via damageOrchestrator, applies via damageApplicator, emits
 *     splatter, sets next-attack cooldown, and routes through
 *     enterCombat to set up combat state.
 *
 * Together they implement the full inbound-to-state-set-up flow for
 * a single melee swing. Cohesive — they share the (data, currentTick)
 * call-context and validation pipeline.
 *
 * Extracted from CombatSystem.ts as the fourteenth slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT). With this slice
 * CombatSystem.ts crosses below the 2,000-LOC target.
 *
 * Coupling shape: 13 dep refs at construction. Most are concrete
 * helpers from earlier slices. One closure for late-bound playerSystem
 * (assigned during start() after world lookups). Plus shared mutable
 * refs: nextAttackTicks Map. world ref needed for currentTick.
 */

import {
  type CombatStyle,
  type EntityID,
  getEntityPosition,
  type SystemLogger,
  type World,
} from "@hyperforge/shared";

import type {
  AttackValidationResult,
  CombatAttackValidator,
  MeleeAttackData,
} from "./CombatAttackValidator";
import type { CombatAnimationManager } from "./CombatAnimationManager";
import type { CombatAntiCheat } from "./CombatAntiCheat";
import type { CombatDamageApplicator } from "./CombatDamageApplicator";
import type { CombatDamageOrchestrator } from "./CombatDamageOrchestrator";
import type { CombatEnterLifecycleHandler } from "./CombatEnterLifecycleHandler";
import type { CombatEntityResolver } from "./CombatEntityResolver";
import type { CombatEventEmitter } from "./CombatEventEmitter";
import type { CombatRateLimiter } from "./CombatRateLimiter";
import type { CombatRotationManager } from "./CombatRotationManager";
import type { EntityIdValidator } from "./EntityIdValidator";

/** Surface needed for combat-style lookup. */
interface PlayerSystemLike {
  getPlayerAttackStyle?(id: string): { id: string } | undefined;
}

export class CombatMeleeAttackHandler {
  private readonly world: World;
  private readonly entityIdValidator: EntityIdValidator;
  private readonly logger: SystemLogger;
  private readonly antiCheat: CombatAntiCheat;
  private readonly rateLimiter: CombatRateLimiter;
  private readonly attackValidator: CombatAttackValidator;
  private readonly entityResolver: CombatEntityResolver;
  private readonly rotationManager: CombatRotationManager;
  private readonly animationManager: CombatAnimationManager;
  private readonly damageOrchestrator: CombatDamageOrchestrator;
  private readonly damageApplicator: CombatDamageApplicator;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly enterLifecycleHandler: CombatEnterLifecycleHandler;
  private readonly nextAttackTicks: Map<EntityID, number>;
  private readonly getPlayerSystem: () => PlayerSystemLike | undefined;

  constructor(
    world: World,
    entityIdValidator: EntityIdValidator,
    logger: SystemLogger,
    antiCheat: CombatAntiCheat,
    rateLimiter: CombatRateLimiter,
    attackValidator: CombatAttackValidator,
    entityResolver: CombatEntityResolver,
    rotationManager: CombatRotationManager,
    animationManager: CombatAnimationManager,
    damageOrchestrator: CombatDamageOrchestrator,
    damageApplicator: CombatDamageApplicator,
    eventEmitter: CombatEventEmitter,
    enterLifecycleHandler: CombatEnterLifecycleHandler,
    nextAttackTicks: Map<EntityID, number>,
    getPlayerSystem: () => PlayerSystemLike | undefined,
  ) {
    this.world = world;
    this.entityIdValidator = entityIdValidator;
    this.logger = logger;
    this.antiCheat = antiCheat;
    this.rateLimiter = rateLimiter;
    this.attackValidator = attackValidator;
    this.entityResolver = entityResolver;
    this.rotationManager = rotationManager;
    this.animationManager = animationManager;
    this.damageOrchestrator = damageOrchestrator;
    this.damageApplicator = damageApplicator;
    this.eventEmitter = eventEmitter;
    this.enterLifecycleHandler = enterLifecycleHandler;
    this.nextAttackTicks = nextAttackTicks;
    this.getPlayerSystem = getPlayerSystem;
  }

  /**
   * Inbound entry point for a melee attack request. Performs ID
   * sanity, rate-limit, anti-cheat tracking, and validation before
   * delegating to executeMeleeAttack.
   */
  handleMeleeAttack(data: MeleeAttackData): void {
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

    const validation = this.attackValidator.validateMeleeAttack(
      data,
      currentTick,
    );
    if (!validation.valid) {
      return;
    }

    if (
      !this.attackValidator.checkAttackCooldown(
        validation.typedAttackerId!,
        currentTick,
      )
    ) {
      return;
    }

    this.executeMeleeAttack(data, validation, currentTick);
  }

  /**
   * Execute a validated melee attack. Faces target, plays emote,
   * computes + applies damage, sets next-attack cooldown, and
   * delegates combat-state set-up to enterCombat.
   */
  private executeMeleeAttack(
    data: MeleeAttackData,
    validation: AttackValidationResult,
    currentTick: number,
  ): void {
    const { attackerId, targetId, attackerType, targetType } = data;
    const { attacker, target, typedAttackerId, typedTargetId } = validation;

    if (!attacker || !target || !typedAttackerId || !typedTargetId) return;

    const entityType = attacker.type === "mob" ? "mob" : "player";
    const attackSpeedTicks = this.entityResolver.getAttackSpeed(
      typedAttackerId,
      entityType,
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

    let combatStyle: CombatStyle = "accurate";
    if (attackerType === "player") {
      const playerSystem = this.getPlayerSystem();
      const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
      if (styleData?.id) {
        combatStyle = styleData.id as CombatStyle;
      }
    }

    const rawDamage = this.damageOrchestrator.calculateMeleeDamage(
      attacker,
      target,
      combatStyle,
    );
    const currentHealth = this.entityResolver.getHealth(target);
    const damage = Math.min(rawDamage, currentHealth);

    this.damageApplicator.applyDamage(targetId, targetType, damage, attackerId);

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

    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);
    this.enterLifecycleHandler.enterCombat(
      typedAttackerId,
      typedTargetId,
      attackSpeedTicks,
    );
  }
}
