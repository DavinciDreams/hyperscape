/**
 * CombatMagicAttackHandler — inbound entry for magic attacks.
 *
 * Wraps the single async `handleMagicAttack` method extracted from
 * CombatSystem.ts. Two branches share the same shape:
 *
 *   - **Mob branch**: resolves the attacker's NPC config (spellId,
 *     range, attackSpeedTicks, magic stat), enforces range +
 *     cooldown, plays emote with magic variant, computes mob-magic
 *     damage, creates the projectile, emits the projectile-launched
 *     event with computed flight timing, sets cooldown, dispatches
 *     enterCombat.
 *   - **Player branch**: validates entity IDs + rate-limits, resolves
 *     entities + alive checks, reads selected spell + magic level
 *     via playerQueries, validates spell + runes, claims the cooldown
 *     synchronously BEFORE async rune consumption to prevent race-
 *     condition double projectiles, enters combat synchronously,
 *     consumes runes async, then creates the projectile.
 *
 * Streaming-duel agents bypass rune validation (inventory-based rune
 * addition is unreliable for bot agents). Diagnostic warnings print
 * for the duel-flagged path so future debugging stays attached.
 *
 * Damage is created at launch but applied later via the projectile-
 * hit deferred-resolution loop (CombatProjectileHitProcessor, slice
 * 11).
 *
 * Extracted from CombatSystem.ts as the sixteenth slice of the
 * system's decomposition (item #9 in PROGRESS_AUDIT). Mirrors the
 * structure of slice 15 (CombatRangedAttackHandler).
 *
 * Coupling shape: 17 dep refs at construction. Most are concrete
 * helpers from earlier slices. Two closures because the underlying
 * systems are late-bound on CombatSystem (assigned during start()):
 *   - getInventorySystem — used in a diagnostic warning only;
 *     consumeRunesForSpell goes through playerQueries which already
 *     captures the inventorySystem closure.
 * Plus shared mutable refs: nextAttackTicks Map, _attackerTile +
 * _targetTile pooled buffers, world ref for currentTick + entities.
 */

import {
  AttackType,
  EventType,
  type EntityID,
  type PooledTile,
  type World,
  createEntityID,
  getDefaultMagicRange,
  getEntityPosition,
  getHitDelayConfig,
  getNPCById,
  getSpellLaunchDelayMs,
  getTickDurationMs,
  isMobEntity,
  tileChebyshevDistance,
  tilePool,
} from "@hyperforge/shared";

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
import { runeService } from "./RuneService";
import { spellService } from "./SpellService";

/** Surface needed for diagnostic empty-inventory warning. */
interface InventorySystemLike {
  hasItem(playerId: string, itemId: string, quantity?: number): boolean;
}

/** Callback shape for the host system's typed-emit method. */
export type CombatMagicEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatMagicAttackHandler {
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
  private readonly emit: CombatMagicEmitFn;
  private readonly getInventorySystem: () => InventorySystemLike | undefined;

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
    emit: CombatMagicEmitFn,
    getInventorySystem: () => InventorySystemLike | undefined,
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
    this.getInventorySystem = getInventorySystem;
  }

  /**
   * Inbound entry point for a magic attack request. Branches on
   * attackerType and dispatches mob-side or player-side flow.
   */
  async handleMagicAttack(data: {
    attackerId: string;
    targetId: string;
    attackerType: "player" | "mob";
    targetType: "player" | "mob";
    spellId?: string;
  }): Promise<void> {
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
      this.enterLifecycleHandler.enterCombat(
        typedAttackerId,
        typedTargetId,
        attackSpeedTicks,
        AttackType.MAGIC,
      );
      return;
    }

    const attackerEntity = this.world.entities.get(attackerId);
    const isStreamingDuel =
      (attackerEntity as { data?: { inStreamingDuel?: boolean } })?.data
        ?.inStreamingDuel === true;

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

    const selectedSpellId =
      this.playerQueries.getPlayerSelectedSpell(attackerId);
    const magicLevel = this.playerQueries.getPlayerSkillLevel(
      attackerId,
      "magic",
    );

    if (isStreamingDuel && !selectedSpellId) {
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
      this.emit(EventType.UI_MESSAGE, {
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

    const weapon = this.damageOrchestrator.getEquippedWeapon(attackerId);
    const inventory = this.playerQueries.getPlayerInventoryItems(attackerId);

    if (isStreamingDuel && inventory.length === 0) {
      const inventorySystem = this.getInventorySystem();
      console.warn(
        `[MagicAttack:Duel] Empty inventory for ${attackerId}! inventorySystem=${!!inventorySystem}`,
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
        this.emit(EventType.UI_MESSAGE, {
          playerId: attackerId,
          message: runeValidation.error ?? "You don't have enough runes.",
          type: "error",
        });
        return;
      }
    }

    const attackRange = 10;
    const attackerPos = getEntityPosition(attacker);
    const targetPos = getEntityPosition(target);
    if (!attackerPos || !targetPos) return;

    tilePool.setFromPosition(this.attackerTile, attackerPos);
    tilePool.setFromPosition(this.targetTile, targetPos);
    const distance = tileChebyshevDistance(this.attackerTile, this.targetTile);

    if (distance > attackRange || distance === 0) {
      if (isStreamingDuel) {
        console.warn(
          `[MagicAttack:Duel] Range check failed: distance=${distance} range=${attackRange}`,
        );
      }
      this.eventEmitter.emitAttackFailed(attackerId, targetId, "out_of_range");
      return;
    }

    const typedAttackerId = createEntityID(attackerId);
    if (
      !this.attackValidator.checkAttackCooldown(typedAttackerId, currentTick)
    ) {
      return;
    }

    const attackSpeedTicks = Math.max(1, spell.attackSpeed);

    // Claim cooldown slot IMMEDIATELY to prevent async race condition.
    // consumeRunesForSpell is async, so two concurrent invocations (event
    // handler + tick auto-attack) can both pass checkAttackCooldown before
    // either sets the cooldown, resulting in duplicate projectiles.
    this.nextAttackTicks.set(typedAttackerId, currentTick + attackSpeedTicks);

    const typedTargetId = createEntityID(targetId);
    this.enterLifecycleHandler.enterCombat(
      typedAttackerId,
      typedTargetId,
      attackSpeedTicks,
      AttackType.MAGIC,
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

    const damage = this.damageOrchestrator.calculateMagicDamageForAttack(
      attacker,
      target,
      attackerId,
      targetType,
      spell,
    );

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

    this.eventEmitter.emitProjectileLaunched(
      attackerId,
      targetId,
      spell.element,
      attackerPos,
      targetPos,
      spell.id,
      undefined,
      800,
    );
  }
}
