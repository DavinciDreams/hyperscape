/**
 * DuelCombatController - Combat engagement, AI management, loop control,
 * HP tracking, and stall nudge for streaming duels.
 *
 * Extracted from DuelOrchestrator to isolate all combat-execution concerns.
 */

import type { World } from "@hyperscape/shared";
import { AttackType, EventType, PlayerEntity } from "@hyperscape/shared";
import { DuelCombatAI } from "../../../duel/DuelCombatAI.js";
import { type StreamingDuelCycle, STREAMING_TIMING } from "../types.js";
import { Logger } from "../../ServerNetwork/services";
import { errMsg } from "../../../shared/errMsg.js";
import type { DuelCombatRole } from "./DuelGearManager.js";

// ============================================================================
// Types
// ============================================================================

type AgentCombatData = {
  inCombat?: boolean;
  combatTarget?: string | null;
  ct?: string | null;
  c?: boolean;
  attackTarget?: string | null;
};

/** Type for network with send method */
interface NetworkWithSend {
  send: <T>(name: string, data: T, ignoreSocketId?: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const STREAMING_COMBAT_STALL_NUDGE_MS = Math.max(
  5_000,
  Number.parseInt(process.env.STREAMING_COMBAT_STALL_NUDGE_MS || "15000", 10),
);
/** Interval between escalating stall nudges after the first (#20) */
const STALL_NUDGE_ESCALATION_INTERVAL_MS = 10_000;
/** Maximum damage per escalating nudge (#20) */
const STALL_NUDGE_MAX_DAMAGE = 5;

// ============================================================================
// DuelCombatController Class
// ============================================================================

export class DuelCombatController {
  // -- Owned state --
  private combatAIs: Map<string, DuelCombatAI> = new Map();
  private combatLoopInterval: ReturnType<typeof setInterval> | null = null;
  private combatLoopTickCount: number = 0;
  private combatRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Escalating stall nudge state (#20) */
  private combatStallNudgeCount = 0;
  private lastCombatStallNudgeTime = 0;

  constructor(
    private readonly world: World,
    private readonly getCurrentCycle: () => StreamingDuelCycle | null,
    private readonly getCombatRole: (
      characterId: string,
    ) => DuelCombatRole | undefined,
    private readonly onTeleportToArena: (
      agent1Id: string,
      agent2Id: string,
      suppressEffect?: boolean,
    ) => Promise<void>,
  ) {}

  // ============================================================================
  // Combat Engagement
  // ============================================================================

  initiateAgentCombat(): void {
    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    const { agent1, agent2 } = cycle;

    this.tryMutualCombat(agent1.characterId, agent2.characterId);

    const cycleAfter = this.getCurrentCycle();
    if (!cycleAfter || cycleAfter.phase !== "FIGHTING") {
      return;
    }

    Logger.info(
      "StreamingDuelScheduler",
      `Combat initiated between ${agent1.name} and ${agent2.name}`,
    );

    // Set entity-level combat flags only when CombatSystem didn't establish
    // state (e.g., startCombat failed due to range/validation). This prevents
    // masking engagement failures — DuelCombatAI checks these flags to decide
    // whether to call executeAttack(), so false positives cause agents to idle.
    const combatSystem = this.world.getSystem("combat") as {
      isInCombat?: (entityId: string) => boolean;
    } | null;
    if (!combatSystem?.isInCombat?.(agent1.characterId)) {
      this.setAgentCombatTarget(agent1.characterId, agent2.characterId);
    }
    if (!combatSystem?.isInCombat?.(agent2.characterId)) {
      this.setAgentCombatTarget(agent2.characterId, agent1.characterId);
    }

    // Fix L — Verify combat actually engaged; schedule one retry if not.
    this.scheduleCombatRetryIfNeeded(agent1.characterId, agent2.characterId);

    // Start combat re-engagement loop to keep agents fighting
    this.startCombatLoop();
  }

  /** Set combat target on an agent entity */
  setAgentCombatTarget(agentId: string, targetId: string): void {
    const entity = this.world.entities.get(agentId);
    if (!entity) return;

    entity.data.combatTarget = targetId;
    entity.data.inCombat = true;
    entity.data.attackTarget = targetId;
  }

  /**
   * Force-stop any active combat on an agent via the CombatSystem.
   *
   * This is essential before teleporting agents to the arena. Without it, the
   * CombatSystem's internal state (attack cooldowns, target tracking, chase
   * movement) continues independently of entity.data flags — combat ticks can
   * fire during async operations and broadcast attack events at pre-arena
   * positions.
   *
   * Also clears entity-level combat flags and emits a COMBAT_STOP_ATTACK event
   * so all listeners (animation, face direction, UI) properly reset.
   */
  forceStopAgentCombat(agentId: string): void {
    const combatSystem = this.world.getSystem("combat") as {
      forceEndCombat?: (entityId: string) => void;
      isInCombat?: (entityId: string) => boolean;
    } | null;

    // Use the CombatSystem's forceEndCombat to properly tear down internal
    // combat state (StateService entries, attack cooldowns, animation resets).
    if (combatSystem?.forceEndCombat) {
      try {
        combatSystem.forceEndCombat(agentId);
      } catch {
        // Agent may not have active combat state; safe to ignore.
      }
    }

    // Clear entity-level combat flags as a belt-and-suspenders measure.
    const entity = this.world.entities.get(agentId);
    if (entity) {
      (entity.data as AgentCombatData).inCombat = false;
      (entity.data as AgentCombatData).combatTarget = null;
      (entity.data as AgentCombatData).ct = null;
      (entity.data as AgentCombatData).c = false;
      (entity.data as AgentCombatData).attackTarget = null;
    }

    // Notify other systems (animation, face direction) to stop combat visuals.
    this.world.emit(EventType.COMBAT_STOP_ATTACK, { attackerId: agentId });
  }

  /**
   * Keep duel contestants within melee range to guarantee engagement.
   */
  ensureDuelProximity(agent1Id: string, agent2Id: string): void {
    const distance = this.getTileChebyshevDistance(agent1Id, agent2Id);
    if (distance !== null && distance !== 1) {
      Logger.warn(
        "StreamingDuelScheduler",
        `Contestants not in valid melee spacing (tileDistance=${distance}), re-teleporting`,
      );
      // suppressEffect=true: skip the visual beam/glow during FIGHTING corrections
      void this.onTeleportToArena(agent1Id, agent2Id, true);
    }
  }

  logCombatStartFailure(
    attackerId: string,
    targetId: string,
    side: "a1" | "a2",
  ): void {
    const distance = this.getTileChebyshevDistance(attackerId, targetId);
    Logger.warn(
      "StreamingDuelScheduler",
      `startCombat failed (${side}) attacker=${attackerId} target=${targetId} tileDistance=${distance ?? "unknown"}`,
    );
  }

  /**
   * Fix L — After initiating combat, verify agents are actually engaged.
   * If neither is in combat after 1.5s, re-teleport to fix spacing and retry.
   */
  clearCombatRetryTimeout(): void {
    if (this.combatRetryTimeout) {
      clearTimeout(this.combatRetryTimeout);
      this.combatRetryTimeout = null;
    }
  }

  scheduleCombatRetryIfNeeded(agent1Id: string, agent2Id: string): void {
    this.clearCombatRetryTimeout();
    this.combatRetryTimeout = setTimeout(() => {
      this.combatRetryTimeout = null;
      const cycle = this.getCurrentCycle();
      if (!cycle || cycle.phase !== "FIGHTING") return;

      const combatSystem = this.world.getSystem("combat") as {
        startCombat?: (
          attackerId: string,
          targetId: string,
          options?: { attackerType?: string; targetType?: string },
        ) => boolean;
        isInCombat?: (entityId: string) => boolean;
      } | null;

      const entity1 = this.world.entities.get(agent1Id);
      const entity2 = this.world.entities.get(agent2Id);

      // Check CombatSystem state only — entity.data flags can be stale from
      // setAgentCombatTarget() and mask engagement failures.
      const inCombat1 = combatSystem?.isInCombat?.(agent1Id) ?? false;
      const inCombat2 = combatSystem?.isInCombat?.(agent2Id) ?? false;

      if (inCombat1 && inCombat2) return; // Both agents engaged in CombatSystem, OK.

      Logger.warn(
        "StreamingDuelScheduler",
        "Combat retry: neither agent in combat after 1.5s, re-teleporting and retrying",
      );

      // Re-teleport to fix spacing, then retry combat
      this.ensureDuelProximity(agent1Id, agent2Id);

      if (combatSystem?.startCombat) {
        combatSystem.startCombat(agent1Id, agent2Id, {
          attackerType: "player",
          targetType: "player",
        });
        const cycleAfterRetry = this.getCurrentCycle();
        if (cycleAfterRetry?.phase === "FIGHTING") {
          combatSystem.startCombat(agent2Id, agent1Id, {
            attackerType: "player",
            targetType: "player",
          });
        }
      }

      this.setAgentCombatTarget(agent1Id, agent2Id);
      this.setAgentCombatTarget(agent2Id, agent1Id);
    }, 3000); // 5 ticks at 600ms - aligned with combat loop re-engagement interval
  }

  getTileChebyshevDistance(
    entityAId: string,
    entityBId: string,
  ): number | null {
    const entityA = this.world.entities.get(entityAId);
    const entityB = this.world.entities.get(entityBId);
    if (!entityA || !entityB) return null;

    const posA = entityA.data.position as
      | [number, number, number]
      | { x: number; y?: number; z: number }
      | undefined;
    const posB = entityB.data.position as
      | [number, number, number]
      | { x: number; y?: number; z: number }
      | undefined;
    if (!posA || !posB) return null;

    const ax = Array.isArray(posA) ? posA[0] : posA.x;
    const az = Array.isArray(posA) ? posA[2] : posA.z;
    const bx = Array.isArray(posB) ? posB[0] : posB.x;
    const bz = Array.isArray(posB) ? posB[2] : posB.z;

    const tileAx = Math.floor(ax);
    const tileAz = Math.floor(az);
    const tileBx = Math.floor(bx);
    const tileBz = Math.floor(bz);
    return Math.max(Math.abs(tileAx - tileBx), Math.abs(tileAz - tileBz));
  }

  // ============================================================================
  // Combat Loop
  // ============================================================================

  /**
   * Start a loop that drives DuelCombatAI ticks and re-engages agents.
   *
   * Runs every 600ms (TICK_DURATION_MS) so AI decisions are aligned with
   * the game tick cadence instead of drifting on an independent setInterval.
   * Re-engagement for agents WITHOUT an active AI runs every 5th tick (~3s).
   */
  startCombatLoop(): void {
    // Clear any existing loop
    if (this.combatLoopInterval) {
      clearInterval(this.combatLoopInterval);
    }
    this.combatLoopTickCount = 0;

    const TICK_MS = 600; // Match game tick duration

    this.combatLoopInterval = setInterval(() => {
      const cycle = this.getCurrentCycle();
      if (!cycle || cycle.phase !== "FIGHTING") {
        if (this.combatLoopInterval) {
          clearInterval(this.combatLoopInterval);
          this.combatLoopInterval = null;
        }
        return;
      }

      this.combatLoopTickCount++;

      const { agent1, agent2 } = cycle;
      if (!agent1 || !agent2) return;

      // Drive DuelCombatAI ticks synchronously with this loop
      for (const [characterId, ai] of this.combatAIs) {
        ai.externalTick().catch((err) => {
          Logger.warn(
            "StreamingDuelScheduler",
            `Combat AI tick error for ${characterId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      // Re-engage agents that DON'T have an active AI every ~3 seconds (5 ticks)
      if (this.combatLoopTickCount % 5 !== 0) return;

      const agent1HasAI = this.combatAIs.has(agent1.characterId);
      const agent2HasAI = this.combatAIs.has(agent2.characterId);

      // If both agents have AI, skip re-engagement entirely
      if (agent1HasAI && agent2HasAI) return;

      const entity1 = this.world.entities.get(agent1.characterId);
      const entity2 = this.world.entities.get(agent2.characterId);

      // Only re-engage agents without an active AI
      if (!agent1HasAI && entity1 && !entity1.data.combatTarget) {
        this.setAgentCombatTarget(agent1.characterId, agent2.characterId);
      }
      if (!agent2HasAI && entity2 && !entity2.data.combatTarget) {
        this.setAgentCombatTarget(agent2.characterId, agent1.characterId);
      }

      // Re-initiate combat via system
      this.tryMutualCombat(agent1.characterId, agent2.characterId);
    }, TICK_MS);
  }

  /**
   * Attempt to start mutual combat between two agents via the combat system.
   * Handles proximity checks, failure logging, and mid-resolution bail.
   */
  tryMutualCombat(agent1Id: string, agent2Id: string): void {
    const combatSystem = this.world.getSystem("combat") as {
      startCombat?: (
        attackerId: string,
        targetId: string,
        options?: {
          attackerType?: string;
          targetType?: string;
          weaponType?: AttackType;
        },
      ) => boolean;
      isInCombat?: (entityId: string) => boolean;
      getCombatData?: (
        entityId: string,
      ) => { targetId?: unknown; inCombat?: boolean } | null;
    } | null;

    if (!combatSystem?.startCombat) {
      Logger.warn(
        "StreamingDuelScheduler",
        "Combat system not available or missing startCombat method",
      );
      return;
    }

    this.ensureDuelProximity(agent1Id, agent2Id);

    // Resolve weapon type from each agent's combat role so the combat system
    // creates the correct state (melee / ranged / magic). Without this, all
    // agents default to MELEE, which means magic and ranged agents never fire
    // their projectile-based attacks.
    const roleToWeaponType = (role: DuelCombatRole): AttackType => {
      switch (role) {
        case "mage":
          return AttackType.MAGIC;
        case "ranged":
          return AttackType.RANGED;
        default:
          return AttackType.MELEE;
      }
    };
    const role1 = this.getCombatRole(agent1Id) ?? "melee";
    const role2 = this.getCombatRole(agent2Id) ?? "melee";
    const weaponType1 = roleToWeaponType(role1);
    const weaponType2 = roleToWeaponType(role2);

    // Guard: Don't replace existing combat state if agent already has a valid
    // state targeting the correct opponent. createAttackerState replaces the
    // state Map entry which resets nextAttackTick — for slow weapons (2H swords,
    // attackSpeed 7) the auto-attack loop never reaches nextAttackTick because
    // repeated re-engagement keeps pushing it forward (starvation pattern).
    const hasValidState = (attackerId: string, targetId: string): boolean => {
      if (!combatSystem.getCombatData || !combatSystem.isInCombat) return false;
      if (!combatSystem.isInCombat(attackerId)) return false;
      const state = combatSystem.getCombatData(attackerId);
      return !!(state?.inCombat && String(state.targetId) === targetId);
    };

    if (!hasValidState(agent1Id, agent2Id)) {
      const started1 = combatSystem.startCombat(agent1Id, agent2Id, {
        attackerType: "player",
        targetType: "player",
        weaponType: weaponType1,
      });
      if (!started1) {
        this.logCombatStartFailure(agent1Id, agent2Id, "a1");
      }
    }

    // First attack may have ended the duel; do not allow stale follow-up hit.
    const cycle = this.getCurrentCycle();
    if (!cycle || cycle.phase !== "FIGHTING") {
      return;
    }

    if (!hasValidState(agent2Id, agent1Id)) {
      const started2 = combatSystem.startCombat(agent2Id, agent1Id, {
        attackerType: "player",
        targetType: "player",
        weaponType: weaponType2,
      });
      if (!started2) {
        this.logCombatStartFailure(agent2Id, agent1Id, "a2");
      }
    }
  }

  /** Stop the combat loop */
  stopCombatLoop(): void {
    if (this.combatLoopInterval) {
      clearInterval(this.combatLoopInterval);
      this.combatLoopInterval = null;
    }
  }

  // ============================================================================
  // HP Tracking & Combat Stall Nudge
  // ============================================================================

  updateContestantHp(): void {
    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    const entity1 = this.world.entities.get(cycle.agent1.characterId);
    const entity2 = this.world.entities.get(cycle.agent2.characterId);
    const previousHp1 = cycle.agent1.currentHp;
    const previousHp2 = cycle.agent2.currentHp;

    let nextHp1 = previousHp1;
    let nextHp2 = previousHp2;

    if (entity1) {
      const data = entity1.data as { health?: number; maxHealth?: number };
      nextHp1 = data.health || 0;
      cycle.agent1.currentHp = nextHp1;
      cycle.agent1.maxHp = data.maxHealth || 10;
    }

    if (entity2) {
      const data = entity2.data as { health?: number; maxHealth?: number };
      nextHp2 = data.health || 0;
      cycle.agent2.currentHp = nextHp2;
      cycle.agent2.maxHp = data.maxHealth || 10;
    }

    if (cycle.phase !== "FIGHTING") {
      return;
    }

    // Fallback for combat paths that mutate HP without emitting
    // COMBAT_DAMAGE_DEALT. If the damage event already fired, currentHp was
    // synchronized immediately and these deltas stay at zero.
    const hpLost1 = Math.max(0, previousHp1 - nextHp1);
    const hpLost2 = Math.max(0, previousHp2 - nextHp2);

    if (hpLost1 > 0) {
      cycle.agent2.damageDealtThisFight += hpLost1;
    }

    if (hpLost2 > 0) {
      cycle.agent1.damageDealtThisFight += hpLost2;
    }
  }

  /**
   * Escalating combat stall nudge (#20).
   * First nudge at STREAMING_COMBAT_STALL_NUDGE_MS, subsequent every 10s.
   * Damage escalates: min(count+1, 5). Alternates targets. Resets on combat evidence.
   * Floors HP at 1 to avoid accidental kills.
   */
  applyCombatStallNudge(now: number): void {
    const cycle = this.getCurrentCycle();
    if (!cycle || cycle.phase !== "FIGHTING") return;

    const { agent1, agent2 } = cycle;
    if (!agent1 || !agent2) return;

    // Reset nudge state if there's combat evidence
    const hasCombatEvidence =
      agent1.currentHp < agent1.maxHp ||
      agent2.currentHp < agent2.maxHp ||
      agent1.damageDealtThisFight > 0 ||
      agent2.damageDealtThisFight > 0;
    if (hasCombatEvidence) {
      this.combatStallNudgeCount = 0;
      this.lastCombatStallNudgeTime = 0;
      return;
    }

    // Check cooldown: first nudge uses the initial stall threshold,
    // subsequent nudges use the escalation interval
    if (this.combatStallNudgeCount > 0) {
      if (
        now - this.lastCombatStallNudgeTime <
        STALL_NUDGE_ESCALATION_INTERVAL_MS
      )
        return;
    }

    // Alternate targets based on nudge count
    const isEven = this.combatStallNudgeCount % 2 === 0;
    const attackerId = isEven ? agent1.characterId : agent2.characterId;
    const targetId = isEven ? agent2.characterId : agent1.characterId;
    const targetAgent = isEven ? agent2 : agent1;
    const targetEntity = this.world.entities.get(targetId);
    if (!targetEntity) return;

    const currentHp = Number((targetEntity.data as { health?: number }).health);
    const safeCurrentHp = Number.isFinite(currentHp)
      ? currentHp
      : targetAgent.currentHp;
    const nudgeDamage = Math.min(
      this.combatStallNudgeCount + 1,
      STALL_NUDGE_MAX_DAMAGE,
    );
    const nextHp = Math.max(1, safeCurrentHp - nudgeDamage);
    const damage = safeCurrentHp - nextHp;
    if (damage <= 0) return;

    if (targetEntity instanceof PlayerEntity) {
      targetEntity.setHealth(nextHp);
      targetEntity.markNetworkDirty();
    }

    (targetEntity.data as { health?: number; alive?: boolean }).health = nextHp;
    this.world.emit(EventType.ENTITY_MODIFIED, {
      id: targetId,
      changes: { health: nextHp },
    });
    this.world.emit(EventType.COMBAT_DAMAGE_DEALT, {
      attackerId,
      targetId,
      damage,
    });

    this.combatStallNudgeCount++;
    this.lastCombatStallNudgeTime = now;
    Logger.warn(
      "StreamingDuelScheduler",
      `Applied escalating combat nudge #${this.combatStallNudgeCount} (${attackerId} -> ${targetId}, damage=${damage})`,
    );
  }

  // ============================================================================
  // Combat AIs
  // ============================================================================

  /**
   * Start DuelCombatAI instances for both agents.
   * These run alongside the re-engagement loop and handle food eating,
   * potion usage, and combat phase awareness (opening, trading, finishing).
   */
  async startCombatAIs(): Promise<void> {
    this.stopCombatAIs();

    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    const combatAiEnabled =
      (process.env.STREAMING_DUEL_COMBAT_AI_ENABLED || "true")
        .toLowerCase()
        .trim() !== "false";
    if (!combatAiEnabled) {
      Logger.info(
        "StreamingDuelScheduler",
        "Combat AI disabled via STREAMING_DUEL_COMBAT_AI_ENABLED=false; relying on combat system re-engagement loop",
      );
      return;
    }

    const { agent1, agent2 } = cycle;
    const llmTacticsEnabled =
      (process.env.STREAMING_DUEL_LLM_TACTICS_ENABLED || "true")
        .toLowerCase()
        .trim() !== "false";

    const { getAgentManager } = await import("../../../eliza/AgentManager.js");
    const { getAgentRuntimeByCharacterId } =
      await import("../../../eliza/ModelAgentSpawner.js");
    const manager = getAgentManager();

    const service1 = manager?.getAgentService(agent1.characterId) ?? null;
    const service2 = manager?.getAgentService(agent2.characterId) ?? null;
    const runtime1 = getAgentRuntimeByCharacterId(agent1.characterId);
    const runtime2 = getAgentRuntimeByCharacterId(agent2.characterId);

    const role1 = this.getCombatRole(agent1.characterId) ?? "melee";
    const role2 = this.getCombatRole(agent2.characterId) ?? "melee";

    if (service1) {
      const ai1 = new DuelCombatAI(
        service1,
        agent2.characterId,
        {
          useLlmTactics: llmTacticsEnabled && !!runtime1,
          combatRole: role1,
        },
        runtime1 ?? undefined,
        // Trash talk callback — sends chat as overhead bubble via the agent's service
        (text) => {
          service1.sendChatMessage(text).catch(() => {});
        },
      );
      ai1.setContext(agent1.name, agent2.combatLevel, agent2.name);
      ai1.start();
      this.combatAIs.set(agent1.characterId, ai1);
      Logger.info(
        "StreamingDuelScheduler",
        `Combat AI started for ${agent1.name} (role=${role1}, ${llmTacticsEnabled && !!runtime1 ? "LLM strategy" : "scripted"})`,
      );
    }

    if (service2) {
      const ai2 = new DuelCombatAI(
        service2,
        agent1.characterId,
        {
          useLlmTactics: llmTacticsEnabled && !!runtime2,
          combatRole: role2,
        },
        runtime2 ?? undefined,
        // Trash talk callback — sends chat as overhead bubble via the agent's service
        (text) => {
          service2.sendChatMessage(text).catch(() => {});
        },
      );
      ai2.setContext(agent2.name, agent1.combatLevel, agent1.name);
      ai2.start();
      this.combatAIs.set(agent2.characterId, ai2);
      Logger.info(
        "StreamingDuelScheduler",
        `Combat AI started for ${agent2.name} (role=${role2}, ${llmTacticsEnabled && !!runtime2 ? "LLM strategy" : "scripted"})`,
      );
    }
  }

  /** Stop all DuelCombatAI instances and log their stats */
  stopCombatAIs(): void {
    for (const [characterId, ai] of this.combatAIs) {
      const stats = ai.getStats();
      Logger.info(
        "StreamingDuelScheduler",
        `Combat AI stats for ${characterId}: ${stats.attacksLanded} attacks, ${stats.healsUsed} heals, ${stats.totalDamageDealt} dmg dealt`,
      );
      ai.stop();
    }
    this.combatAIs.clear();
  }

  // ============================================================================
  // Stop Combat (post-duel cleanup helper)
  // ============================================================================

  stopCombat(playerId: string): void {
    // Tear down CombatSystem internal state (StateService entries, attack
    // cooldowns, animation resets) so the combat tick doesn't re-set entity
    // flags after we clear them below.
    const combatSystem = this.world.getSystem("combat") as {
      forceEndCombat?: (entityId: string) => void;
    } | null;
    if (combatSystem?.forceEndCombat) {
      try {
        combatSystem.forceEndCombat(playerId);
      } catch {
        // Agent may not have active combat state; safe to ignore.
      }
    }

    const entity = this.world.entities.get(playerId);
    if (!entity) return;

    // Clear ALL combat-related entity data fields. The `ct` (serialized
    // combatTarget) and `attackTarget` fields are checked by
    // EmbeddedHyperscapeService.getGameState() — leaving them stale causes
    // agents to think they're still in combat and return "idle" from every
    // behavior tick instead of moving or attacking.
    (entity.data as AgentCombatData).combatTarget = null;
    (entity.data as AgentCombatData).inCombat = false;
    (entity.data as AgentCombatData).ct = null;
    (entity.data as AgentCombatData).c = false;
    (entity.data as AgentCombatData).attackTarget = null;

    // Reset emote to idle so victory wave stops when agent teleports out
    entity.data.emote = "idle";
    const network = this.world.network as NetworkWithSend | undefined;
    network?.send?.("entityModified", {
      id: playerId,
      changes: { e: "idle" },
    });

    // Notify other systems (animation, face direction) to stop combat visuals.
    this.world.emit(EventType.COMBAT_STOP_ATTACK, { attackerId: playerId });
  }

  // ============================================================================
  // Reset
  // ============================================================================

  /** Reset all owned state for destroy cleanup */
  reset(): void {
    this.stopCombatLoop();
    this.clearCombatRetryTimeout();
    this.stopCombatAIs();
    this.combatStallNudgeCount = 0;
    this.lastCombatStallNudgeTime = 0;
    this.combatLoopTickCount = 0;
  }
}
