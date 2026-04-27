/**
 * CombatEventRecorder — combat event recording + replay-snapshot
 * helpers used by the combat system.
 *
 * Wraps three responsibilities:
 *   - `record` — append a combat event to the EventStore for replay,
 *     gated on `eventRecordingEnabled`. Includes RNG state in the
 *     payload so deterministic replay can reproduce the dice rolls.
 *   - `buildGameStateInfo` — minimal "world heartbeat" snapshot
 *     attached to every recorded event (current tick, player count,
 *     active combat count).
 *   - `buildCombatSnapshot` — full combat-state snapshot taken every
 *     100 ticks for efficient replay start points.
 *
 * Extracted from CombatSystem.ts as the third slice of the system's
 * decomposition (item #9 in PROGRESS_AUDIT, after CombatEventEmitter
 * + CombatPlayerQueries).
 */

import type {
  Entity,
  EntitySnapshot,
  CombatSnapshot,
  GameEventType,
  GameStateInfo,
  SeededRandomState,
  World,
} from "@hyperforge/shared";
import { getEntityPosition, getGameRngState } from "@hyperforge/shared";
import type { EventStore } from "@hyperforge/shared";

import type { CombatStateService } from "./CombatStateService.js";
import type { CombatEntityResolver } from "./CombatEntityResolver.js";

/** Optional `getMaxHealth` shape — older Entity / MobEntity values may not implement it. */
type WithMaybeMaxHealth = Entity & { getMaxHealth?: () => number };

export class CombatEventRecorder {
  private readonly world: World;
  private readonly eventStore: EventStore;
  private readonly stateService: CombatStateService;
  private readonly entityResolver: CombatEntityResolver;

  /**
   * Recording can be turned off by tests or by the host system to
   * suppress event emission. Enabled by default. Mirror of the
   * previous `CombatSystem.eventRecordingEnabled` flag.
   */
  recordingEnabled: boolean = true;

  constructor(
    world: World,
    eventStore: EventStore,
    stateService: CombatStateService,
    entityResolver: CombatEntityResolver,
  ) {
    this.world = world;
    this.eventStore = eventStore;
    this.stateService = stateService;
    this.entityResolver = entityResolver;
  }

  /**
   * Record a combat event to the EventStore. No-op when recording is
   * disabled. Always attaches the current `GameStateInfo`. Attaches a
   * full combat snapshot every 100 ticks.
   */
  record(type: GameEventType, entityId: string, payload: unknown): void {
    if (!this.recordingEnabled) return;

    const tick = this.world.currentTick ?? 0;
    const stateInfo = this.buildGameStateInfo();

    // Include snapshot data periodically (every 100 ticks) for
    // efficient replay start points.
    const snapshot = tick % 100 === 0 ? this.buildCombatSnapshot() : undefined;

    this.eventStore.record(
      {
        tick,
        type,
        entityId,
        payload: {
          ...((payload as object) ?? {}),
          rngState: getGameRngState(), // RNG state for deterministic replay
        },
      },
      stateInfo,
      snapshot,
    );
  }

  /** Build the minimal GameStateInfo attached to every recorded event. */
  buildGameStateInfo(): GameStateInfo {
    const combatStatesMap = this.stateService.getCombatStatesMap();
    return {
      currentTick: this.world.currentTick ?? 0,
      playerCount: this.world.entities.players.size,
      activeCombats: combatStatesMap.size,
    };
  }

  /**
   * Build a full snapshot of combat state for replay. Called
   * periodically (every 100 ticks) for efficient replay start points.
   */
  buildCombatSnapshot(): {
    entities: Map<string, EntitySnapshot>;
    combatStates: Map<string, CombatSnapshot>;
    rngState: SeededRandomState;
  } {
    const entities = new Map<string, EntitySnapshot>();
    const combatStates = new Map<string, CombatSnapshot>();

    // Snapshot all active combat participants
    for (const [entityId, state] of this.stateService.getCombatStatesMap()) {
      const attackerEntity = this.entityResolver.resolve(
        String(entityId),
        state.attackerType,
      ) as WithMaybeMaxHealth | null;
      const targetEntity = this.entityResolver.resolve(
        String(state.targetId),
        state.targetType,
      ) as WithMaybeMaxHealth | null;

      // Snapshot attacker
      if (attackerEntity) {
        const pos = getEntityPosition(attackerEntity);
        entities.set(String(entityId), {
          id: String(entityId),
          type: state.attackerType,
          position: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined,
          health: this.entityResolver.getHealth(attackerEntity),
          maxHealth: attackerEntity.getMaxHealth?.() ?? 100,
        });
      }

      // Snapshot target
      if (targetEntity) {
        const pos = getEntityPosition(targetEntity);
        entities.set(String(state.targetId), {
          id: String(state.targetId),
          type: state.targetType,
          position: pos ? { x: pos.x, y: pos.y, z: pos.z } : undefined,
          health: this.entityResolver.getHealth(targetEntity),
          maxHealth: targetEntity.getMaxHealth?.() ?? 100,
        });
      }

      // Snapshot combat state
      combatStates.set(String(entityId), {
        attackerId: String(entityId),
        targetId: String(state.targetId),
        startTick: state.lastAttackTick, // approximate — same as lastAttackTick
        lastAttackTick: state.lastAttackTick,
      });
    }

    // Get RNG state for deterministic replay
    const rngState = getGameRngState() ?? { state0: "0", state1: "0" };

    return { entities, combatStates, rngState };
  }
}
