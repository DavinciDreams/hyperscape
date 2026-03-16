/**
 * DuelOrchestrator - Coordinator for streaming duel lifecycle.
 *
 * Delegates gear management to DuelGearManager and combat execution to
 * DuelCombatController. Keeps contestant creation, health restoration,
 * arena teleportation, duel flags, fight lifecycle, victory handling,
 * and post-duel cleanup coordination.
 */

import type { World } from "@hyperscape/shared";
import {
  DeathState,
  EventType,
  PlayerEntity,
  getDuelArenaConfig,
  isPositionInsideCombatArena,
} from "@hyperscape/shared";
import {
  type StreamingDuelCycle,
  type AgentContestant,
  type LeaderboardEntry,
  type RecentDuelEntry,
  STREAMING_TIMING,
} from "../types.js";
import { Logger } from "../../ServerNetwork/services";
import { errMsg } from "../../../shared/errMsg.js";
import { normalizePosition } from "./duel-position-utils.js";
import { DuelGearManager } from "./DuelGearManager.js";
import { DuelCombatController } from "./DuelCombatController.js";

// ============================================================================
// Types
// ============================================================================

/** Type for network with send method */
interface NetworkWithSend {
  send: <T>(name: string, data: T, ignoreSocketId?: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Reserved regular duel arena for streaming agents (always use a single arena). */
const STREAMING_AGENT_ARENA_ID = 1;

// ============================================================================
// DuelOrchestrator Class
// ============================================================================

export class DuelOrchestrator {
  // ---- Delegated managers ----
  readonly gear: DuelGearManager;
  readonly combat: DuelCombatController;

  // ---- Contestant Cache (Memory Optimization) ----
  /** Cached contestant objects keyed by "agentId:opponentId" */
  private _contestantCache: Map<string, AgentContestant> = new Map();
  /** Cache expiry timestamp for contestant cache */
  private _contestantCacheExpiry = 0;
  /** Cache duration in ms (invalidate every 250ms to allow HP updates) */
  private static readonly CONTESTANT_CACHE_TTL_MS = 250;

  constructor(
    private readonly world: World,
    private readonly getCurrentCycle: () => StreamingDuelCycle | null,
    private readonly setCurrentCycleFields: (
      fields: Partial<StreamingDuelCycle>,
    ) => void,
    private readonly getAgentStats: () => Map<
      string,
      {
        characterId: string;
        name: string;
        provider: string;
        model: string;
        wins: number;
        losses: number;
        combatLevel: number;
        currentStreak: number;
      }
    >,
    private readonly onResolution: (
      winnerId: string,
      loserId: string,
      winReason: "kill" | "hp_advantage" | "damage_advantage" | "draw",
    ) => void,
    private readonly getLeaderboard: () => LeaderboardEntry[],
    private readonly getRecentDuels: () => RecentDuelEntry[],
    gear: DuelGearManager,
    combatController: DuelCombatController,
  ) {
    this.gear = gear;
    this.combat = combatController;
  }

  // ============================================================================
  // Public accessors — delegate to sub-managers
  // ============================================================================

  /** Get the duel food slots tracked by this orchestrator for a given agent. */
  getDuelFoodSlotsByAgent(): Map<string, { slot: number; itemId: string }[]> {
    return this.gear.getDuelFoodSlotsByAgent();
  }

  // ============================================================================
  // Contestant Creation
  // ============================================================================

  /**
   * Create or update a cached AgentContestant for streaming state.
   * MEMORY OPTIMIZATION: Caches and updates contestants in place to avoid
   * creating new objects every 500ms broadcast.
   */
  createContestant(
    agentId: string,
    opponentId?: string,
  ): AgentContestant | null {
    const now = Date.now();
    const cacheKey = `${agentId}:${opponentId ?? ""}`;

    // Check cache expiry
    if (now > this._contestantCacheExpiry) {
      this._contestantCache.clear();
      this._contestantCacheExpiry =
        now + DuelOrchestrator.CONTESTANT_CACHE_TTL_MS;
    }

    // Check for cached contestant
    const cached = this._contestantCache.get(cacheKey);

    const entity = this.world.entities.get(agentId);
    if (!entity) {
      // Remove from cache if entity no longer exists
      if (cached) this._contestantCache.delete(cacheKey);
      return null;
    }

    const data = entity.data as {
      name?: string;
      health?: number;
      maxHealth?: number;
      position?: [number, number, number] | { x: number; y: number; z: number };
      skills?: Record<string, { level: number }>;
      equipment?: unknown;
      inventory?: unknown;
    };

    // If cached, just update mutable fields (HP, stats) and return
    if (cached) {
      const stats = this.getAgentStats().get(agentId);
      const skills = data.skills || {};
      const constitution = skills.constitution?.level || 10;

      cached.currentHp = data.health ?? constitution;
      cached.maxHp = data.maxHealth ?? constitution;
      cached.wins = stats?.wins || 0;
      cached.losses = stats?.losses || 0;
      // Update equipment/inventory snapshots
      cached.equipment = this.snapshotAgentEquipment(data.equipment);
      cached.inventory = this.snapshotAgentInventory(data.inventory);
      return cached;
    }

    // Create new contestant (first time only)
    const stats = this.getAgentStats().get(agentId);
    const parts = agentId.split("-");
    const provider = parts[1] || "unknown";
    const model = parts.slice(2).join("-") || "unknown";

    const entityPosition = (entity as { position?: unknown }).position;
    const normalizedPos =
      normalizePosition(data.position) ?? normalizePosition(entityPosition);
    const originalPosition = this.sanitizeRestorePosition(
      normalizedPos,
      agentId,
    );

    // Calculate combat level
    const skills = data.skills || {};
    const attack = skills.attack?.level || 1;
    const strength = skills.strength?.level || 1;
    const defense = skills.defense?.level || 1;
    const constitution = skills.constitution?.level || 10;
    const combatLevel = Math.floor(
      (attack + strength + defense + constitution) / 4,
    );

    let rank = 0;
    const leaderboard = this.getLeaderboard();
    for (let i = 0; i < leaderboard.length; i++) {
      if (leaderboard[i].characterId === agentId) {
        rank = leaderboard[i].rank;
        break;
      }
    }

    let headToHeadWins = 0;
    let headToHeadLosses = 0;
    if (opponentId) {
      for (const duel of this.getRecentDuels()) {
        if (duel.winnerId === agentId && duel.loserId === opponentId) {
          headToHeadWins++;
        } else if (duel.winnerId === opponentId && duel.loserId === agentId) {
          headToHeadLosses++;
        }
      }
    }

    const contestant: AgentContestant = {
      characterId: agentId,
      name: data.name || agentId,
      provider,
      model,
      combatLevel,
      wins: stats?.wins || 0,
      losses: stats?.losses || 0,
      currentHp: data.health ?? constitution,
      maxHp: data.maxHealth ?? constitution,
      originalPosition,
      damageDealtThisFight: 0,
      // Keep a lightweight, serialization-safe snapshot for streaming payloads.
      equipment: this.snapshotAgentEquipment(data.equipment),
      inventory: this.snapshotAgentInventory(data.inventory),
      rank,
      headToHeadWins,
      headToHeadLosses,
    };

    // Cache for future calls
    this._contestantCache.set(cacheKey, contestant);
    return contestant;
  }

  /** Clear the contestant cache (call when cycle ends) */
  clearContestantCache(): void {
    this._contestantCache.clear();
    this._contestantCacheExpiry = 0;
  }

  snapshotAgentEquipment(equipment: unknown): Record<string, string> {
    if (!equipment || typeof equipment !== "object") {
      return {};
    }

    const snapshot: Record<string, string> = {};
    for (const [slot, rawValue] of Object.entries(
      equipment as Record<string, unknown>,
    )) {
      const itemId = this.extractItemId(rawValue);
      if (itemId) {
        snapshot[slot] = itemId;
      }
    }
    return snapshot;
  }

  snapshotAgentInventory(
    inventory: unknown,
  ): Array<{ itemId: string; quantity: number } | null> {
    const slots: Array<{ itemId: string; quantity: number } | null> =
      Array.from({ length: 28 }, () => null);

    const sourceItems = Array.isArray(inventory)
      ? inventory
      : inventory &&
          typeof inventory === "object" &&
          Array.isArray((inventory as { items?: unknown[] }).items)
        ? ((inventory as { items: unknown[] }).items ?? [])
        : [];

    for (const [index, rawItem] of sourceItems.entries()) {
      if (!rawItem || typeof rawItem !== "object") {
        continue;
      }

      const item = rawItem as Record<string, unknown>;
      const itemId = this.extractItemId(item);
      if (!itemId) {
        continue;
      }

      const rawSlot = Number(item.slot);
      const slot = Number.isFinite(rawSlot) ? rawSlot : index;
      if (slot < 0 || slot >= slots.length) {
        continue;
      }

      const rawQuantity = Number(item.quantity ?? item.qty ?? 1);
      const quantity =
        Number.isFinite(rawQuantity) && rawQuantity > 0
          ? Math.floor(rawQuantity)
          : 1;

      slots[slot] = { itemId, quantity };
    }

    return slots;
  }

  extractItemId(value: unknown): string | null {
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : null;
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    const direct = record.itemId ?? record.id;
    if (typeof direct === "string") {
      const normalized = direct.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }

    const nested = record.item;
    if (nested && typeof nested === "object") {
      const nestedRecord = nested as Record<string, unknown>;
      const nestedId = nestedRecord.itemId ?? nestedRecord.id;
      if (typeof nestedId === "string") {
        const normalized = nestedId.trim();
        return normalized.length > 0 ? normalized : null;
      }
    }

    return null;
  }

  // ============================================================================
  // Duel Preparation
  // ============================================================================

  async prepareContestantsForDuel(): Promise<void> {
    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    const { agent1, agent2 } = cycle;
    const levelDiff = Math.abs(agent1.combatLevel - agent2.combatLevel);

    // CRITICAL: Stop any active combat and movement BEFORE any async
    // operations below. During awaits, the event loop is free and combat
    // system ticks can fire — if agents are still in combat, attack/damage
    // events would be broadcast at pre-arena positions.
    this.combat.forceStopAgentCombat(agent1.characterId);
    this.combat.forceStopAgentCombat(agent2.characterId);
    this.world.emit("player:movement:cancel", { playerId: agent1.characterId });
    this.world.emit("player:movement:cancel", { playerId: agent2.characterId });

    // Pick combat roles based on agent skill levels and equip best available gear.
    const role1 = this.gear.pickCombatRoleBySkills(agent1.characterId);
    const role2 = this.gear.pickCombatRoleBySkills(agent2.characterId);
    this.gear.setCombatRole(agent1.characterId, role1);
    this.gear.setCombatRole(agent2.characterId, role2);

    const [weapon1, weapon2] = await Promise.all([
      this.gear.ensureAgentCombatSetup(agent1.characterId, role1),
      this.gear.ensureAgentCombatSetup(agent2.characterId, role2),
    ]);

    // NOTE: Food provisioning removed — agents must self-provision food
    // through fishing/cooking between duels. They fight with whatever
    // food/gear they've gathered autonomously.

    // Restore full health
    this.restoreHealth(agent1.characterId);
    this.restoreHealth(agent2.characterId);

    // NOTE: Teleport is handled separately in startCountdown() so agents
    // appear in the arena at the exact moment the countdown begins on screen.

    Logger.info(
      "StreamingDuelScheduler",
      `Contestants prepared: ${agent1.name} (${role1}, ${weapon1}) vs ${agent2.name} (${role2}, ${weapon2}) (levelDiff=${levelDiff})`,
    );
  }

  // ============================================================================
  // Health Restoration
  // ============================================================================

  restoreHealth(playerId: string, quiet = false): void {
    const entity = this.world.entities.get(playerId);
    if (!entity) return;

    const data = entity.data as {
      health?: number;
      maxHealth?: number;
      alive?: boolean;
      position?:
        | [number, number, number]
        | { x?: number; y?: number; z?: number };
      skills?: Record<string, { level: number }>;
      deathState?: DeathState;
    };

    // Calculate max health from constitution
    const constitution = data.skills?.constitution?.level || 10;
    const maxHealth = constitution;

    // Restore to full and clear stale death state so startCombat() can engage.
    if (entity instanceof PlayerEntity) {
      entity.resetDeathState();
      entity.setHealth(maxHealth);
      entity.markNetworkDirty();
    } else {
      data.health = maxHealth;
      data.maxHealth = maxHealth;
      data.deathState = DeathState.ALIVE;

      const healthComponent = (
        entity as {
          getComponent?: (name: string) => {
            data?: { current?: number; max?: number; isDead?: boolean };
          } | null;
        }
      ).getComponent?.("health");

      if (healthComponent?.data) {
        healthComponent.data.current = maxHealth;
        healthComponent.data.max = maxHealth;
        healthComponent.data.isDead = false;
      }
    }

    // Keep raw entity data in sync for network serialization.
    data.health = maxHealth;
    data.maxHealth = maxHealth;
    data.alive = true;
    data.deathState = DeathState.ALIVE;

    // In quiet mode (used during fight-start HP top-up), skip respawn/death
    // events that cause visible teleport snaps on clients. The entity health
    // values and ENTITY_MODIFIED emission below are sufficient for HP sync.
    if (!quiet) {
      const respawnPosition =
        normalizePosition(data.position) ??
        normalizePosition((entity as { position?: unknown }).position) ??
        this.getFallbackLobbyPosition(playerId);

      // Synchronize PlayerSystem alive/death flags after duel-owned deaths.
      this.world.emit(EventType.PLAYER_RESPAWNED, {
        playerId,
        spawnPosition: {
          x: respawnPosition[0],
          y: respawnPosition[1],
          z: respawnPosition[2],
        },
        townName: "Streaming Duel Arena",
      });

      // Ensure client and server systems clear any lingering dead flags.
      this.world.emit(EventType.PLAYER_SET_DEAD, {
        playerId,
        isDead: false,
      });
    }

    // Update contestant data
    const cycle = this.getCurrentCycle();
    if (cycle?.agent1?.characterId === playerId) {
      cycle.agent1.currentHp = maxHealth;
      cycle.agent1.maxHp = maxHealth;
    } else if (cycle?.agent2?.characterId === playerId) {
      cycle.agent2.currentHp = maxHealth;
      cycle.agent2.maxHp = maxHealth;
    }

    // Emit health update
    this.world.emit(EventType.ENTITY_MODIFIED, {
      id: playerId,
      changes: { health: maxHealth, maxHealth },
    });
  }

  // ============================================================================
  // Arena Teleportation
  // ============================================================================

  async teleportToArena(
    agent1Id: string,
    agent2Id: string,
    suppressEffect = false,
  ): Promise<void> {
    // Use a single reserved regular duel arena so all agent duels happen in
    // the same standard arena as player duels (no custom arena coordinates).
    const arenaConfig = getDuelArenaConfig();
    const arenaId = Math.max(
      1,
      Math.min(STREAMING_AGENT_ARENA_ID, arenaConfig.arenaCount),
    );
    const row = Math.floor((arenaId - 1) / arenaConfig.columns);
    const col = (arenaId - 1) % arenaConfig.columns;
    const arenaCenterX =
      arenaConfig.baseX +
      col * (arenaConfig.arenaWidth + arenaConfig.arenaGap) +
      arenaConfig.arenaWidth / 2;
    const arenaCenterZ =
      arenaConfig.baseZ +
      row * (arenaConfig.arenaLength + arenaConfig.arenaGap) +
      arenaConfig.arenaLength / 2;
    const centerTileX = Math.floor(arenaCenterX);
    const centerTileZ = Math.floor(arenaCenterZ);

    const agent1X = centerTileX + 0.5;
    const agent1Z = centerTileZ - 0.5;
    const agent2X = centerTileX + 0.5;
    const agent2Z = centerTileZ + 0.5;

    // Agent 1 spawns north (negative Z)
    const agent1Pos: [number, number, number] = [
      agent1X,
      this.getGroundedY(agent1X, agent1Z, arenaConfig.baseY),
      agent1Z,
    ];

    // Agent 2 spawns south (positive Z)
    const agent2Pos: [number, number, number] = [
      agent2X,
      this.getGroundedY(agent2X, agent2Z, arenaConfig.baseY),
      agent2Z,
    ];

    // Teleport both agents, facing each other
    this.teleportPlayer(agent1Id, agent1Pos, agent2Pos, suppressEffect);
    this.teleportPlayer(agent2Id, agent2Pos, agent1Pos, suppressEffect);

    const cycle = this.getCurrentCycle();
    if (cycle) {
      cycle.arenaId = arenaId;
      cycle.arenaPositions = {
        agent1: agent1Pos,
        agent2: agent2Pos,
      };
    }

    Logger.info(
      "StreamingDuelScheduler",
      "Contestants teleported to arena, facing each other",
    );
  }

  /**
   * Get grounded Y using terrain height when available.
   */
  getGroundedY(x: number, z: number, fallbackY: number): number {
    const terrain = this.world.getSystem("terrain") as {
      getHeightAt?: (x: number, z: number) => number;
    } | null;

    const sampledY = terrain?.getHeightAt?.(x, z);
    return typeof sampledY === "number" && Number.isFinite(sampledY)
      ? sampledY
      : fallbackY;
  }

  /**
   * Deterministic fallback near duel lobby to avoid overlapping resets.
   */
  getFallbackLobbyPosition(agentId: string): [number, number, number] {
    const lobby = getDuelArenaConfig().lobbySpawnPoint;

    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = (hash * 31 + agentId.charCodeAt(i)) >>> 0;
    }

    const angle = ((hash % 360) * Math.PI) / 180;
    const radius = 6 + (hash % 4);
    const x = lobby.x + Math.cos(angle) * radius;
    const z = lobby.z + Math.sin(angle) * radius;
    const y = this.getGroundedY(x, z, lobby.y);

    return [x, y, z];
  }

  /**
   * Keep restore positions safe for spectator camera and terrain grounding.
   */
  sanitizeRestorePosition(
    position: [number, number, number] | null,
    agentId: string,
  ): [number, number, number] {
    const fallback = this.getFallbackLobbyPosition(agentId);
    if (!position) {
      return fallback;
    }

    const [x, y, z] = position;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return fallback;
    }

    // Never restore non-dueling agents back into combat arena tiles.
    if (isPositionInsideCombatArena(x, z)) {
      return fallback;
    }

    // Only reject positions that are clearly out-of-world (very far from origin).
    // Agents should be free to roam the world between duels.
    const distFromOrigin = Math.hypot(x, z);
    if (distFromOrigin > 2000) {
      return fallback;
    }

    const terrainY = this.getGroundedY(x, z, fallback[1]);
    const yTooLow = !Number.isFinite(y) || y < terrainY - 15;
    const yTooHigh = Number.isFinite(y) && y > terrainY + 80;
    const safeY = yTooLow || yTooHigh ? terrainY : y;

    return [x, safeY, z];
  }

  teleportPlayer(
    playerId: string,
    position: [number, number, number],
    faceToward?: [number, number, number],
    suppressEffect = false,
  ): void {
    const entity = this.world.entities.get(playerId);
    if (!entity) return;

    // Position as object for events
    const posObj = { x: position[0], y: position[1], z: position[2] };

    // Calculate rotation to face opponent if specified
    let rotation = 0;
    if (faceToward) {
      const dx = faceToward[0] - position[0];
      const dz = faceToward[2] - position[2];
      rotation = Math.atan2(dx, dz);
    }

    // Update entity data - keep as tuple format for type compatibility
    entity.data.position = position;
    entity.data.rotation = rotation;

    // Mark as teleport for network sync (tells client to snap, not lerp)
    entity.data._teleport = true;

    // Emit teleport event for network system to handle properly.
    // suppressEffect tells the client to skip the visual beam/glow effect
    // (used during FIGHTING-phase proximity corrections).
    this.world.emit("player:teleport", {
      playerId,
      position: posObj,
      rotation,
      suppressEffect,
    });

    // Emit entity modified for immediate sync
    this.world.emit(EventType.ENTITY_MODIFIED, {
      id: playerId,
      changes: {
        position,
        rotation,
        _teleport: true,
      },
    });

    Logger.debug(
      "StreamingDuelScheduler",
      `Teleported ${playerId} to [${position.join(", ")}]`,
    );
  }

  // ============================================================================
  // Duel Flags
  // ============================================================================

  /** Set or clear duel flags on agents to prevent normal respawn */
  setDuelFlags(inDuel: boolean): void {
    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    const { agent1, agent2 } = cycle;

    const entity1 = this.world.entities.get(agent1.characterId);
    const entity2 = this.world.entities.get(agent2.characterId);

    if (entity1) {
      entity1.data.inStreamingDuel = inDuel;
      entity1.data.preventRespawn = inDuel;
    }
    if (entity2) {
      entity2.data.inStreamingDuel = inDuel;
      entity2.data.preventRespawn = inDuel;
    }
  }

  /**
   * Clear streaming duel flags for contestants in a cycle.
   */
  clearDuelFlagsForCycle(cycle: StreamingDuelCycle | null): void {
    if (!cycle?.agent1 || !cycle.agent2) {
      return;
    }

    const ids = [cycle.agent1.characterId, cycle.agent2.characterId];
    for (const playerId of ids) {
      const entity = this.world.entities.get(playerId);
      if (!entity) {
        continue;
      }
      entity.data.inStreamingDuel = false;
      entity.data.preventRespawn = false;
    }
  }

  /**
   * Clear flags from a completed cycle without clobbering agents that are
   * already contestants in a newly-started cycle.
   */
  clearDuelFlagsForCycleIfInactive(cycle: StreamingDuelCycle | null): void {
    if (!cycle?.agent1 || !cycle.agent2) {
      return;
    }

    const currentCycle = this.getCurrentCycle();
    const currentAgent1Id = currentCycle?.agent1?.characterId ?? null;
    const currentAgent2Id = currentCycle?.agent2?.characterId ?? null;
    const ids = [cycle.agent1.characterId, cycle.agent2.characterId];

    for (const playerId of ids) {
      if (playerId === currentAgent1Id || playerId === currentAgent2Id) {
        continue;
      }

      const entity = this.world.entities.get(playerId);
      if (!entity) {
        continue;
      }
      entity.data.inStreamingDuel = false;
      entity.data.preventRespawn = false;
    }
  }

  /**
   * Clear stale duel flags from idle agents when no duel owns them.
   */
  clearStaleDuelFlagsForIdleAgents(availableAgents: Set<string>): void {
    const cycle = this.getCurrentCycle();
    if (cycle) {
      return;
    }

    for (const agentId of availableAgents) {
      const entity = this.world.entities.get(agentId);
      if (!entity) {
        continue;
      }

      if (
        entity.data.inStreamingDuel === true ||
        entity.data.preventRespawn === true
      ) {
        entity.data.inStreamingDuel = false;
        entity.data.preventRespawn = false;
      }
    }
  }

  // ============================================================================
  // Fight Execution
  // ============================================================================

  startFight(): void {
    const cycle = this.getCurrentCycle();
    if (!cycle) return;

    // Phase guard — only transition from COUNTDOWN (Fix B).
    if (cycle.phase !== "COUNTDOWN") return;

    const { agent1, agent2 } = cycle;

    // Validate both agents exist and are alive (Fix B).
    const entity1 = agent1 ? this.world.entities.get(agent1.characterId) : null;
    const entity2 = agent2 ? this.world.entities.get(agent2.characterId) : null;
    const alive1 =
      entity1 && ((entity1.data as { health?: number }).health ?? 0) > 0;
    const alive2 =
      entity2 && ((entity2.data as { health?: number }).health ?? 0) > 0;

    if (!alive1 && !alive2) {
      // Both agents missing — caller should handle abort
      return;
    }
    if (!alive1 && agent2) {
      this.onResolution(agent2.characterId, agent1?.characterId ?? "", "kill");
      return;
    }
    if (!alive2 && agent1) {
      this.onResolution(agent1.characterId, agent2?.characterId ?? "", "kill");
      return;
    }

    const now = Date.now();
    this.setCurrentCycleFields({
      phase: "FIGHTING",
      phaseStartTime: now,
      countdownValue: null,
    });

    Logger.info("StreamingDuelScheduler", "Fight started!");

    // Mark agents as in duel (prevents normal respawn mechanics)
    this.setDuelFlags(true);

    // Guarantee full HP at fight start. Health was restored during prep, but
    // agents may have taken incidental damage during the countdown (lingering
    // combat ticks, environmental damage, etc.).
    // quiet=true: skip PLAYER_RESPAWNED/PLAYER_SET_DEAD events that cause
    // visible teleport snaps on clients during the FIGHTING phase.
    if (agent1) this.restoreHealth(agent1.characterId, true);
    if (agent2) this.restoreHealth(agent2.characterId, true);

    // Emit fight start (streaming-specific event for spectator UI)
    this.world.emit("streaming:fight:start", {
      cycleId: cycle.cycleId,
      duelId: cycle.duelId ?? `streaming-${cycle.cycleId}`,
      duelKeyHex: cycle.duelKeyHex,
      fightStartTime: now,
      agent1Id: agent1?.characterId,
      agent2Id: agent2?.characterId,
      duration:
        STREAMING_TIMING.FIGHTING_DURATION +
        STREAMING_TIMING.END_WARNING_DURATION,
    });

    // Emit standard duel fight start so agent plugins enter combat mode.
    // The duel-events listener sends duelFightStart to both agent sockets.
    if (agent1 && agent2) {
      const duelId = cycle.duelId ?? `streaming-${cycle.cycleId}`;
      this.world.emit(EventType.DUEL_FIGHT_START, {
        duelId,
        challengerId: agent1.characterId,
        targetId: agent2.characterId,
        arenaId: cycle.arenaId ?? 0,
      });
    }

    // Make agents attack each other
    this.combat.initiateAgentCombat();

    // Start DuelCombatAI for each agent (tick-based heal/buff/attack decisions)
    this.combat.startCombatAIs().catch((err) => {
      Logger.warn(
        "StreamingDuelScheduler",
        `Failed to start combat AIs: ${errMsg(err)}`,
      );
    });
  }

  // ============================================================================
  // Fight Resolution
  // ============================================================================

  endFightByTimeout(): void {
    const cycle = this.getCurrentCycle();
    if (!cycle?.agent1 || !cycle?.agent2) return;

    // Defense-in-depth: only run during FIGHTING phase (Fix G).
    if (cycle.phase !== "FIGHTING") return;

    const { agent1, agent2 } = cycle;

    // Determine winner by HP percentage
    const hp1Percent = agent1.currentHp / agent1.maxHp;
    const hp2Percent = agent2.currentHp / agent2.maxHp;

    let winnerId: string;
    let loserId: string;
    let winReason: "hp_advantage" | "damage_advantage" | "draw";

    if (hp1Percent > hp2Percent) {
      winnerId = agent1.characterId;
      loserId = agent2.characterId;
      winReason = "hp_advantage";
    } else if (hp2Percent > hp1Percent) {
      winnerId = agent2.characterId;
      loserId = agent1.characterId;
      winReason = "hp_advantage";
    } else {
      // Tied HP - check damage dealt
      if (agent1.damageDealtThisFight > agent2.damageDealtThisFight) {
        winnerId = agent1.characterId;
        loserId = agent2.characterId;
        winReason = "damage_advantage";
      } else if (agent2.damageDealtThisFight > agent1.damageDealtThisFight) {
        winnerId = agent2.characterId;
        loserId = agent1.characterId;
        winReason = "damage_advantage";
      } else {
        // True draw — both HP and damage equal (#24)
        // Resolve as a proper draw: no winner/loser, just record it
        this.onResolution(agent1.characterId, agent2.characterId, "draw");
        return;
      }
    }

    this.startResolution(winnerId, loserId, winReason);
  }

  startResolution(
    winnerId: string,
    loserId: string,
    winReason: "kill" | "hp_advantage" | "damage_advantage" | "draw",
  ): void {
    const cycle = this.getCurrentCycle();
    if (!cycle) return;

    // Idempotency guard — only transition from FIGHTING or COUNTDOWN (Fix C).
    if (cycle.phase !== "FIGHTING" && cycle.phase !== "COUNTDOWN") {
      return;
    }

    // Stop the combat loop, retry timeout, and AIs
    this.combat.stopCombatLoop();
    this.combat.clearCombatRetryTimeout();
    this.combat.stopCombatAIs();

    // Notify the facade to handle resolution (phase transition, stats, recording, camera)
    this.onResolution(winnerId, loserId, winReason);

    // Delay the victory emote so all death/combat cleanup (emote resets,
    // combat state teardown, scheduled animation resets) finishes first.
    // Without this, the "victory" emote gets immediately overwritten by
    // stale "idle" resets from the combat animation system.
    setTimeout(() => {
      this.triggerVictoryEmote(winnerId);
      this.fireVictoryTrashTalk(winnerId);
    }, 600);
  }

  /**
   * Trigger victory emote on the winning agent.
   * Called after a short delay so all death/combat cleanup has finished
   * and won't overwrite the emote.
   */
  triggerVictoryEmote(winnerId: string): void {
    const network = this.world.network as NetworkWithSend | undefined;
    if (!network?.send) return;

    // Set emote on the server entity so any future entity sync includes it
    const entity = this.world.entities.get(winnerId);
    if (entity?.data) {
      entity.data.emote = "victory";
    }

    // Broadcast victory emote to all clients
    network.send("entityModified", {
      id: winnerId,
      changes: {
        e: "victory",
      },
    });

    Logger.info(
      "StreamingDuelScheduler",
      `Triggered victory emote for winner ${winnerId}`,
    );
  }

  /**
   * Fire a victory trash talk message from the winning agent.
   * Uses the agent's chat service to display a closing taunt overhead.
   */
  private fireVictoryTrashTalk(winnerId: string): void {
    const VICTORY_TAUNTS = [
      "GG EZ",
      "Too easy",
      "Get good",
      "Was that it?",
      "Next!",
      "Sit down kid",
      "Another one bites the dust",
      "Unmatched",
    ];

    // Fire-and-forget: try to send a victory taunt via agent service
    void (async () => {
      try {
        const { getAgentManager } =
          await import("../../../eliza/AgentManager.js");
        const manager = getAgentManager();
        const service = manager?.getAgentService(winnerId);
        if (service) {
          const msg =
            VICTORY_TAUNTS[Math.floor(Math.random() * VICTORY_TAUNTS.length)];
          await service.sendChatMessage(msg);
        }
      } catch {
        // Swallow — chat failure must not break resolution
      }
    })();
  }

  // ============================================================================
  // Post-Duel Cleanup
  // ============================================================================

  async cleanupAfterDuel(
    cycleSnapshot: StreamingDuelCycle,
    duelFoodSlotsSnapshotByAgent: Map<
      string,
      { slot: number; itemId: string }[]
    >,
  ): Promise<void> {
    if (!cycleSnapshot.agent1 || !cycleSnapshot.agent2) return;

    const { agent1, agent2 } = cycleSnapshot;
    const agent1TrackedFoodSlots =
      duelFoodSlotsSnapshotByAgent.get(agent1.characterId) ?? [];
    const agent2TrackedFoodSlots =
      duelFoodSlotsSnapshotByAgent.get(agent2.characterId) ?? [];

    // Restore health
    this.restoreHealth(agent1.characterId);
    this.restoreHealth(agent2.characterId);

    // Remove duel combat gear and food (Fix: weapons only exist during duel period)
    await Promise.all([
      this.gear.cleanupAgentCombatSetup(agent1.characterId),
      this.gear.cleanupAgentCombatSetup(agent2.characterId),
      this.gear.removeDuelFood(agent1.characterId, agent1TrackedFoodSlots),
      this.gear.removeDuelFood(agent2.characterId, agent2TrackedFoodSlots),
    ]);

    // Always teleport both agents to lobby and stop combat. The inter-cycle
    // delay in endCycle() ensures cleanup completes before the next cycle
    // re-selects and re-teleports agents, preventing stale avatar artifacts.
    const agent1RestorePosition = this.sanitizeRestorePosition(
      agent1.originalPosition,
      agent1.characterId,
    );
    this.teleportPlayer(agent1.characterId, agent1RestorePosition);
    this.combat.stopCombat(agent1.characterId);

    const agent2RestorePosition = this.sanitizeRestorePosition(
      agent2.originalPosition,
      agent2.characterId,
    );
    this.teleportPlayer(agent2.characterId, agent2RestorePosition);
    this.combat.stopCombat(agent2.characterId);

    // Defer flag clear until current death-event dispatch unwinds. If we clear
    // synchronously here, PlayerDeathSystem may treat duel deaths as normal deaths
    // and force a Central Haven respawn before cleanup completes.
    // Use the captured cycle snapshot so async completion cannot clear flags
    // for a newly-started cycle.
    globalThis.queueMicrotask(() => {
      this.clearDuelFlagsForCycleIfInactive(cycleSnapshot);
    });
  }

  isAgentInCurrentCycle(playerId: string): boolean {
    const cycle = this.getCurrentCycle();
    return (
      cycle?.agent1?.characterId === playerId ||
      cycle?.agent2?.characterId === playerId
    );
  }

  // ============================================================================
  // Delegated methods — kept on orchestrator for backward compatibility
  // ============================================================================

  /** @deprecated Use combat.forceStopAgentCombat() directly */
  forceStopAgentCombat(agentId: string): void {
    this.combat.forceStopAgentCombat(agentId);
  }

  /** @deprecated Use combat.stopCombatLoop() directly */
  stopCombatLoop(): void {
    this.combat.stopCombatLoop();
  }

  /** @deprecated Use combat.clearCombatRetryTimeout() directly */
  clearCombatRetryTimeout(): void {
    this.combat.clearCombatRetryTimeout();
  }

  /** @deprecated Use combat.stopCombatAIs() directly */
  stopCombatAIs(): void {
    this.combat.stopCombatAIs();
  }

  /** @deprecated Use combat.updateContestantHp() directly */
  updateContestantHp(): void {
    this.combat.updateContestantHp();
  }

  /** @deprecated Use combat.applyCombatStallNudge() directly */
  applyCombatStallNudge(now: number): void {
    this.combat.applyCombatStallNudge(now);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /** Reset all owned state for destroy cleanup */
  reset(): void {
    this.combat.reset();
    this.gear.reset();
    this._contestantCache.clear();
    this._contestantCacheExpiry = 0;
  }
}
