/**
 * CombatLifecycleHandler — combat end (and eventually start)
 * lifecycle management for the combat system.
 *
 * Currently wraps `endCombat` — the cleanup path that runs when an
 * attacker's combat state expires (timeout or manual force-end).
 * Resets emotes, clears state via StateService, drops follow-tile
 * tracking, emits the COMBAT_ENDED event, records the event for
 * replay, and surfaces the "Combat ended." UI message to player
 * attackers.
 *
 * Extracted from CombatSystem.ts as the sixth slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after the five prior
 * slices: CombatEventEmitter, CombatPlayerQueries, CombatEventRecorder,
 * CombatDamageOrchestrator, CombatDeathHandler).
 *
 * `enterCombat` (287 LOC, 11+ deps) is deferred to a future slice —
 * it has tighter coupling to retaliation flow + zone-detection +
 * playerSystem caching that needs careful design.
 *
 * Coupling shape: 6 dep references injected at construction time.
 * `lastCombatTargetTile` is a shared `Map` reference — CombatSystem
 * still owns the cache (populated during attack-pipeline range-and-
 * follow); this helper deletes from it on combat-end.
 */

import { EventType, GameEventType, createEntityID } from "@hyperforge/shared";

import type { CombatAnimationManager } from "./CombatAnimationManager.js";
import type { CombatEventEmitter } from "./CombatEventEmitter.js";
import type { CombatEventRecorder } from "./CombatEventRecorder.js";
import type { CombatStateService } from "./CombatStateService.js";

/** Callback shape for the host system's typed-emit method. */
export type CombatLifecycleEmitFn = (
  type: string,
  payload: Record<string, unknown>,
) => void;

export class CombatLifecycleHandler {
  private readonly stateService: CombatStateService;
  private readonly animationManager: CombatAnimationManager;
  private readonly eventEmitter: CombatEventEmitter;
  private readonly eventRecorder: CombatEventRecorder;
  private readonly lastCombatTargetTile: Map<string, { x: number; z: number }>;
  private readonly emit: CombatLifecycleEmitFn;

  constructor(
    stateService: CombatStateService,
    animationManager: CombatAnimationManager,
    eventEmitter: CombatEventEmitter,
    eventRecorder: CombatEventRecorder,
    lastCombatTargetTile: Map<string, { x: number; z: number }>,
    emit: CombatLifecycleEmitFn,
  ) {
    this.stateService = stateService;
    this.animationManager = animationManager;
    this.eventEmitter = eventEmitter;
    this.eventRecorder = eventRecorder;
    this.lastCombatTargetTile = lastCombatTargetTile;
    this.emit = emit;
  }

  /**
   * End combat for an entity (timeout or manual force-end). Cleans
   * up combat state on both attacker and target, resets emotes,
   * clears follow-tile tracking, emits the COMBAT_ENDED event, and
   * surfaces the UI message to player attackers.
   *
   * Skip flags allow callers to suppress emote resets in edge cases:
   *   - `skipAttackerEmoteReset` — when the target died during the
   *     attacker's attack animation
   *   - `skipTargetEmoteReset` — when the dead entity is the one
   *     ending combat
   */
  endCombat(data: {
    entityId: string;
    skipAttackerEmoteReset?: boolean;
    skipTargetEmoteReset?: boolean;
  }): void {
    // Validate entity ID before processing
    if (!data.entityId) {
      return;
    }

    const typedEntityId = createEntityID(data.entityId);
    const combatState = this.stateService.getCombatData(data.entityId);
    if (!combatState) return;

    // Reset emotes for both entities via AnimationManager.
    if (!data.skipAttackerEmoteReset) {
      this.animationManager.resetEmote(data.entityId, combatState.attackerType);
    }
    if (!data.skipTargetEmoteReset) {
      this.animationManager.resetEmote(
        String(combatState.targetId),
        combatState.targetType,
      );
    }

    // Clear combat state from player entities via StateService
    this.stateService.clearCombatStateFromEntity(
      data.entityId,
      combatState.attackerType,
    );
    this.stateService.clearCombatStateFromEntity(
      String(combatState.targetId),
      combatState.targetType,
    );

    // Remove combat states via StateService
    this.stateService.removeCombatState(typedEntityId);
    this.stateService.removeCombatState(combatState.targetId);

    // Clean up combat follow tracking
    this.lastCombatTargetTile.delete(data.entityId);
    this.lastCombatTargetTile.delete(String(combatState.targetId));

    // Emit combat ended event
    this.eventEmitter.emitCombatEnded(
      data.entityId,
      String(combatState.targetId),
    );

    this.eventRecorder.record(GameEventType.COMBAT_END, data.entityId, {
      targetId: String(combatState.targetId),
      attackerType: combatState.attackerType,
      targetType: combatState.targetType,
      reason: "timeout_or_manual",
    });

    if (combatState.attackerType === "player") {
      this.eventEmitter.emitClearFaceTarget(data.entityId);
    }
    if (combatState.targetType === "player") {
      this.eventEmitter.emitClearFaceTarget(String(combatState.targetId));
    }

    // Show combat end message for player
    if (combatState.attackerType === "player") {
      this.emit(EventType.UI_MESSAGE, {
        playerId: data.entityId,
        message: `Combat ended.`,
        type: "info",
      });
    }
  }
}
