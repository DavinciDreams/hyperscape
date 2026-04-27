/**
 * CombatDeathHandler — death + respawn cleanup for the combat
 * system.
 *
 * Wraps two responsibilities:
 *   - `handleEntityDied(entityId, entityType)` — when an entity
 *     (player or mob) dies during combat: record the death event,
 *     clear the dead entity's combat/attack state, notify mob
 *     attackers so they can return to patrol, clear ALL attacker
 *     combat states targeting the dead entity, clear face-target /
 *     pending-attacker references on attacking players, and reset
 *     mob death animations.
 *   - `handlePlayerRespawned(playerId)` — when a respawning player
 *     comes back: clear any lingering combat state, clear attack
 *     cooldowns, defensively clear any attacker states still
 *     targeting them, clear the face-target.
 *
 * Extracted from CombatSystem.ts as the fifth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after the four prior
 * slices: CombatEventEmitter, CombatPlayerQueries, CombatEventRecorder,
 * CombatDamageOrchestrator).
 *
 * Coupling shape: 6 dep references injected at construction time.
 * `nextAttackTicks` is a shared `Map` reference — CombatSystem still
 * owns the cooldown state; this helper deletes from it on death/
 * respawn.
 */

import type { Entity, World } from "@hyperforge/shared";
import {
  GameEventType,
  clearPendingAttacker,
  createEntityID,
  getPendingAttacker,
  isMobEntity,
  type EntityID,
} from "@hyperforge/shared";

import type { CombatAnimationManager } from "./CombatAnimationManager.js";
import type { CombatEventEmitter } from "./CombatEventEmitter.js";
import type { CombatEventRecorder } from "./CombatEventRecorder.js";
import type { CombatStateService } from "./CombatStateService.js";

export class CombatDeathHandler {
  private readonly world: World;
  private readonly stateService: CombatStateService;
  private readonly animationManager: CombatAnimationManager;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly eventRecorder: CombatEventRecorder;
  private readonly nextAttackTicks: Map<EntityID, number>;

  constructor(
    world: World,
    stateService: CombatStateService,
    animationManager: CombatAnimationManager,
    eventEmitter: CombatEventEmitter,
    eventRecorder: CombatEventRecorder,
    nextAttackTicks: Map<EntityID, number>,
  ) {
    this.world = world;
    this.stateService = stateService;
    this.animationManager = animationManager;
    this.eventEmitter = eventEmitter;
    this.eventRecorder = eventRecorder;
    this.nextAttackTicks = nextAttackTicks;
  }

  /**
   * Handle an entity death during combat. Cleans up the dead entity's
   * own combat state and any attacker states targeting it.
   */
  handleEntityDied(entityId: string, entityType: string): void {
    const typedEntityId = createEntityID(entityId);

    // Record death event for analytics
    const deathEventType =
      entityType === "player"
        ? GameEventType.DEATH_PLAYER
        : GameEventType.DEATH_MOB;
    const combatState = this.stateService.getCombatData(entityId);
    this.eventRecorder.record(deathEventType, entityId, {
      entityType,
      killedBy: combatState ? String(combatState.targetId) : "unknown",
    });

    // 1. Remove the dead entity's own combat state from the internal map
    this.stateService.removeCombatState(typedEntityId);

    // 1b. CRITICAL: Sync the cleared state to the entity/client
    //     Without this, the client's combat.combatTarget persists and
    //     they keep facing the target!
    if (entityType === "player") {
      this.stateService.clearCombatStateFromEntity(entityId, "player");
    }

    // 2. Clear the dead entity's attack cooldown so they can attack
    //    immediately after respawn.
    this.nextAttackTicks.delete(typedEntityId);

    // 3. Clear any scheduled emote resets for the dead entity
    this.animationManager.cancelEmoteReset(entityId);

    // 4. BEFORE clearing attacker states, notify mob attackers so they
    //    can return to patrol, and clear attack cooldowns so attackers
    //    can target someone else immediately.
    const combatStatesMap = this.stateService.getCombatStatesMap();
    for (const [attackerId, state] of combatStatesMap) {
      if (String(state.targetId) === entityId) {
        // Clear attacker's cooldown so they can engage new targets.
        this.nextAttackTicks.delete(attackerId);

        // Notify mob attackers so they can return to patrol/spawn.
        if (state.attackerType === "mob") {
          const mobEntity = this.world.entities.get(String(attackerId));
          if (
            isMobEntity(mobEntity) &&
            typeof mobEntity.onTargetDied === "function"
          ) {
            mobEntity.onTargetDied(entityId);
          }
        }
      }
    }

    // 5. CRITICAL: Clear ALL attacker combat states targeting this
    //    dead entity. This prevents attackers from continuing to
    //    chase/fight the respawned entity.
    this.stateService.clearStatesTargeting(entityId);

    // 6. Clear face target for players who had this as pending attacker
    if (entityType === "mob") {
      for (const player of this.world.entities.players.values()) {
        const pendingAttacker = getPendingAttacker(player as Entity);
        if (pendingAttacker === entityId) {
          clearPendingAttacker(player as Entity);
          this.eventEmitter.emitClearFaceTarget(player.id);
        }
      }
    }

    // 7. Reset dead entity's emote if they were mid-animation.
    //    SKIP for players — let the death animation play instead of
    //    resetting to idle. Mobs can reset.
    if (entityType === "mob") {
      this.animationManager.resetEmote(entityId, entityType);
    }
    // Player death animation is handled by PlayerDeathSystem.
  }

  /**
   * Handle player respawn — defensive cleanup of lingering combat
   * state.
   *
   * Safety net that catches edge cases where combat states might
   * survive the death cleanup. When a player respawns:
   * 1. They should have NO combat state (fresh start)
   * 2. NO entities should be targeting them
   * 3. Their attack cooldown should be clear
   *
   * Prevents bugs like:
   *   - Being immediately attacked at spawn point
   *   - Stale combat UI indicators
   *   - Auto-retaliate triggering against old attackers
   */
  handlePlayerRespawned(playerId: string): void {
    const typedPlayerId = createEntityID(playerId);

    // 1. Clear any lingering combat state the respawned player might have
    const playerCombatState = this.stateService.getCombatData(typedPlayerId);
    if (playerCombatState) {
      this.stateService.removeCombatState(typedPlayerId);
      this.stateService.clearCombatStateFromEntity(playerId, "player");
    }

    // 2. Clear the respawned player's attack cooldown
    this.nextAttackTicks.delete(typedPlayerId);

    // 3. Clear any attacker states that might still be targeting this player
    //    (Safety net — handleEntityDied should have already done this.)
    this.stateService.clearStatesTargeting(playerId);

    // 4. Clear any pending attacker reference on the player
    const playerEntity = this.world.getPlayer?.(playerId);
    if (playerEntity) {
      clearPendingAttacker(playerEntity);
    }

    // 5. Clear face target so player doesn't auto-look at old attacker
    this.eventEmitter.emitClearFaceTarget(playerId);
  }
}
