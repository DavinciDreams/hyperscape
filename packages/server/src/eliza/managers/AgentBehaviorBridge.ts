/**
 * AgentBehaviorBridge — Main-thread coordinator for worker-based agent AI.
 *
 * Replaces the old per-agent setInterval approach. Instead of running agent
 * decision logic on the main thread (which blocked the game tick event loop),
 * this bridge:
 *
 * 1. Collects game state snapshots for due agents
 * 2. Sends them to a worker thread for decision-making
 * 3. Receives action commands back and executes them on the main thread
 *
 * The game tick loop is NEVER blocked by agent AI decisions.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EventType } from "@hyperscape/shared";
import { ITEMS } from "@hyperscape/shared";
import type { World } from "@hyperscape/shared";
import {
  ejectAgentFromCombatArena,
  recoverAgentFromDeathLoop,
} from "../agentRecovery.js";
import { errMsg } from "../../shared/errMsg.js";
import type {
  AgentTickInput,
  AgentTickOutput,
  SharedTickData,
  MainToWorkerMessage,
  WorkerToMainMessage,
  WorkerItemData,
} from "../worker/workerTypes.js";
import type { AgentInstance } from "./AgentBehaviorTicker.js";
import {
  EMBEDDED_BEHAVIOR_TICK_INTERVAL,
  AGENT_STAGGER_OFFSET_MS,
  CRITICAL_HIT_THRESHOLD,
  NEAR_DEATH_THRESHOLD,
  COMBAT_CHAT_COOLDOWN,
} from "./AgentBehaviorTicker.js";

/** How often the bridge checks which agents are due for a tick (ms) */
const BRIDGE_POLL_INTERVAL_MS = 1000;

/** Max agents to process per poll cycle to avoid blocking the event loop */
const MAX_AGENTS_PER_POLL = 5;

/** Yield to the event loop so the tick setTimeout can fire */
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Per-agent scheduling state tracked on the main thread.
 */
interface AgentSchedule {
  nextTickAt: number;
  /** Prevents overlapping ticks for the same agent */
  tickInProgress: boolean;
}

export class AgentBehaviorBridge {
  private worker: Worker | null = null;
  private workerReady = false;
  private schedules = new Map<string, AgentSchedule>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private agentStartIndex = 0;

  /** Pending tick results callback — resolves when worker responds */
  private pendingResolve: ((results: AgentTickOutput[]) => void) | null = null;

  /** Anchor + resource caches (recomputed periodically, not every tick) */
  private spawnAnchorsCache: Array<{
    position: [number, number, number];
    name: string;
  }> = [];
  private worldResourcesCache: Array<{
    position: [number, number, number];
    name: string;
    resourceType: string;
    depleted: boolean;
  }> = [];
  private lastWorldScanTick = -1;
  /** Recompute world scan every N bridge polls (~5s) */
  private static readonly WORLD_SCAN_INTERVAL = 5;
  private worldScanCounter = 0;

  constructor(
    private readonly world: World,
    private readonly getAgent: (
      characterId: string,
    ) => AgentInstance | undefined,
    private readonly getAllAgentIds: () => string[],
  ) {}

  // ─── LIFECYCLE ──────────────────────────────────────────────────────────

  /**
   * Start the worker thread and begin polling for due agents.
   */
  async start(): Promise<void> {
    if (this.worker) return;

    // Spawn worker — resolve relative to this file's compiled output location.
    // esbuild bundles to build/ (dev) or dist/ (prod), with the worker as a
    // sibling file (agentBehaviorWorker.js) in the same directory.
    const thisFile = fileURLToPath(import.meta.url);
    const workerPath = path.join(
      path.dirname(thisFile),
      "agentBehaviorWorker.js",
    );
    this.worker = new Worker(workerPath);

    // Handle messages from worker
    this.worker.on("message", (msg: WorkerToMainMessage) => {
      this.handleWorkerMessage(msg);
    });

    this.worker.on("error", (err) => {
      console.error("[AgentBehaviorBridge] Worker error:", err);
      this.restartWorker();
    });

    this.worker.on("exit", (code) => {
      if (code !== 0) {
        console.warn(
          `[AgentBehaviorBridge] Worker exited with code ${code}, restarting`,
        );
        this.worker = null;
        this.workerReady = false;
        this.restartWorker();
      }
    });

    // Send item data to worker
    await this.initializeWorker();

    // Start polling for due agents
    this.pollInterval = setInterval(() => {
      void this.pollAndDispatch();
    }, BRIDGE_POLL_INTERVAL_MS);

    console.log("[AgentBehaviorBridge] Started with worker thread");
  }

  /**
   * Stop the bridge and terminate the worker.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.worker) {
      this.sendToWorker({ type: "shutdown" });
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }

    this.schedules.clear();
    console.log("[AgentBehaviorBridge] Stopped");
  }

  // ─── AGENT SCHEDULING ──────────────────────────────────────────────────

  /**
   * Register an agent for behavior ticks. Stagger offset is applied automatically.
   */
  startAgent(characterId: string): void {
    const staggerDelay = this.agentStartIndex * AGENT_STAGGER_OFFSET_MS;
    this.agentStartIndex++;

    this.schedules.set(characterId, {
      nextTickAt: Date.now() + 3000 + staggerDelay, // Initial delay + stagger
      tickInProgress: false,
    });
  }

  /**
   * Unregister an agent from behavior ticks.
   */
  stopAgent(characterId: string): void {
    this.schedules.delete(characterId);

    // Best-effort stop so paused/stopped agents don't keep pathing or attacking.
    const instance = this.getAgent(characterId);
    if (instance) {
      void instance.service.executeStop().catch(() => {});
    }
  }

  // ─── COMBAT DAMAGE HANDLER (main thread) ──────────────────────────────

  /**
   * Handle combat damage events to queue chat reactions.
   * Stays on main thread since it reads World entities directly.
   */
  handleCombatDamageDealt(data: unknown): void {
    const payload = data as {
      attackerId: string;
      targetId: string;
      damage: number;
    };
    const { attackerId, targetId, damage } = payload;
    const now = Date.now();

    // Check if attacker is an agent
    const attackerInstance = this.getAgent(attackerId);
    if (attackerInstance && attackerInstance.state === "running") {
      const targetEntity = this.world.entities.get(targetId);
      const targetData = targetEntity?.data as {
        maxHealth?: number;
        health?: number;
        name?: string;
      };

      if (
        targetData?.maxHealth &&
        damage >= targetData.maxHealth * CRITICAL_HIT_THRESHOLD
      ) {
        if (now - attackerInstance.lastCombatChatAt > COMBAT_CHAT_COOLDOWN) {
          attackerInstance.pendingChatReaction = {
            type: "critical_hit_dealt",
            opponentName: targetData.name || "opponent",
            timestamp: now,
          };
        }
      }

      if (targetData?.health && targetData?.maxHealth) {
        const remainingHealthPercent = targetData.health / targetData.maxHealth;
        if (remainingHealthPercent <= NEAR_DEATH_THRESHOLD && damage > 0) {
          if (now - attackerInstance.lastCombatChatAt > COMBAT_CHAT_COOLDOWN) {
            attackerInstance.pendingChatReaction = {
              type: "victory_imminent",
              opponentName: targetData.name || "opponent",
              timestamp: now,
            };
          }
        }
      }
    }

    // Check if target is an agent
    const targetInstance = this.getAgent(targetId);
    if (targetInstance && targetInstance.state === "running") {
      const attackerEntity = this.world.entities.get(attackerId);
      const attackerData = attackerEntity?.data as { name?: string };
      const opponentName = attackerData?.name || "opponent";

      const targetEntity = this.world.entities.get(targetId);
      const targetData = targetEntity?.data as {
        maxHealth?: number;
        health?: number;
      };

      if (
        targetData?.maxHealth &&
        damage >= targetData.maxHealth * CRITICAL_HIT_THRESHOLD
      ) {
        if (now - targetInstance.lastCombatChatAt > COMBAT_CHAT_COOLDOWN) {
          targetInstance.pendingChatReaction = {
            type: "critical_hit_taken",
            opponentName,
            timestamp: now,
          };
        }
      }

      if (targetData?.health && targetData?.maxHealth) {
        const remainingHealthPercent = targetData.health / targetData.maxHealth;
        if (remainingHealthPercent <= NEAR_DEATH_THRESHOLD) {
          if (now - targetInstance.lastCombatChatAt > COMBAT_CHAT_COOLDOWN) {
            targetInstance.pendingChatReaction = {
              type: "near_death",
              opponentName,
              timestamp: now,
            };
          }
        }
      }
    }
  }

  // ─── PRIVATE: WORKER COMMUNICATION ────────────────────────────────────

  private async initializeWorker(): Promise<void> {
    // Serialize ITEMS map for the worker
    const itemsData: Array<[string, WorkerItemData]> = [];
    for (const [id, item] of ITEMS.entries()) {
      const raw = item as unknown as Record<string, unknown>;
      itemsData.push([
        id,
        {
          id,
          name: (raw.name as string) || id,
          type: (raw.type as string) || "misc",
          equipSlot: raw.equipSlot as string | undefined,
          bonuses: raw.bonuses as Record<string, number> | undefined,
          healAmount: raw.healAmount as number | undefined,
          requirements: raw.requirements as Record<string, unknown> | undefined,
        },
      ]);
    }

    // Send init and wait for ready
    return new Promise<void>((resolve) => {
      const onReady = (msg: WorkerToMainMessage) => {
        if (msg.type === "ready") {
          this.worker?.off("message", onReady);
          this.workerReady = true;
          resolve();
        }
      };
      // Temporarily listen for ready
      this.worker!.on("message", onReady);
      this.sendToWorker({ type: "init", itemsData });

      // Timeout after 5s
      setTimeout(() => {
        if (!this.workerReady) {
          this.worker?.off("message", onReady);
          console.error(
            "[AgentBehaviorBridge] Worker did not send ready in 5s",
          );
          resolve(); // Don't block forever
        }
      }, 5000);
    });
  }

  private sendToWorker(msg: MainToWorkerMessage): void {
    if (this.worker) {
      this.worker.postMessage(msg);
    }
  }

  private handleWorkerMessage(msg: WorkerToMainMessage): void {
    switch (msg.type) {
      case "ready":
        this.workerReady = true;
        break;

      case "tickResults":
        if (this.pendingResolve) {
          this.pendingResolve(msg.results);
          this.pendingResolve = null;
        }
        break;

      case "error":
        console.error(
          `[AgentBehaviorBridge] Worker error${msg.characterId ? ` (agent ${msg.characterId})` : ""}: ${msg.error}`,
        );
        // Release pending resolve on error
        if (this.pendingResolve) {
          this.pendingResolve([]);
          this.pendingResolve = null;
        }
        break;
    }
  }

  private async restartWorker(): Promise<void> {
    // Terminate existing worker if still alive
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // Already dead
      }
      this.worker = null;
    }
    this.workerReady = false;

    // Re-spawn after short delay
    setTimeout(() => {
      void this.start().catch((err) => {
        console.error(
          "[AgentBehaviorBridge] Failed to restart worker:",
          errMsg(err),
        );
      });
    }, 100);
  }

  // ─── PRIVATE: POLL AND DISPATCH ───────────────────────────────────────

  /**
   * Called every BRIDGE_POLL_INTERVAL_MS. Finds agents that are due for a
   * behavior tick, collects their snapshots, sends to worker, and applies results.
   */
  private async pollAndDispatch(): Promise<void> {
    if (!this.workerReady || !this.worker) return;
    if (this.pendingResolve) return; // Previous batch still in-flight

    const pollStart = Date.now();
    const now = pollStart;
    const dueAgents: AgentTickInput[] = [];

    // Update world scan caches periodically
    this.worldScanCounter++;
    if (this.worldScanCounter >= AgentBehaviorBridge.WORLD_SCAN_INTERVAL) {
      this.worldScanCounter = 0;
      const t0 = Date.now();
      this.updateWorldScanCaches();
      const scanMs = Date.now() - t0;
      if (scanMs > 50) {
        console.warn(`[AgentBridge] updateWorldScanCaches took ${scanMs}ms`);
      }
    }

    // Collect other agent targets for mob spreading (cheap — just reads instance fields)
    const allAgentIds = this.getAllAgentIds();
    const otherAgentTargets: Array<{
      agentId: string;
      targetId: string | null;
    }> = [];
    for (const id of allAgentIds) {
      const inst = this.getAgent(id);
      if (inst) {
        otherAgentTargets.push({
          agentId: id,
          targetId: inst.currentTargetId,
        });
      }
    }

    const resourceSystemAvailable = !!this.world.getSystem("resource");

    // Compute NPC positions once per poll, shared across all agents in this batch
    let sharedNpcPositions: ReturnType<
      AgentInstance["service"]["getAllNPCPositions"]
    > | null = null;

    let agentsProcessed = 0;

    for (const [characterId, schedule] of this.schedules) {
      if (schedule.tickInProgress) continue;
      if (now < schedule.nextTickAt) continue;

      // Cap agents per poll cycle to avoid blocking the event loop
      if (agentsProcessed >= MAX_AGENTS_PER_POLL) break;

      const instance = this.getAgent(characterId);
      if (!instance || instance.state !== "running") continue;

      // Main-thread-only checks (need direct World access)
      if (
        recoverAgentFromDeathLoop(
          this.world,
          characterId,
          "AgentBehaviorBridge",
        )
      ) {
        instance.lastActivity = Date.now();
        schedule.nextTickAt = now + EMBEDDED_BEHAVIOR_TICK_INTERVAL;
        continue;
      }

      if (
        ejectAgentFromCombatArena(
          this.world,
          characterId,
          "AgentBehaviorBridge",
        )
      ) {
        instance.lastActivity = Date.now();
        schedule.nextTickAt = now + EMBEDDED_BEHAVIOR_TICK_INTERVAL;
        continue;
      }

      const entity = this.world.entities.get(characterId);
      const inStreamingDuel =
        (entity?.data as { inStreamingDuel?: boolean } | undefined)
          ?.inStreamingDuel === true;
      if (inStreamingDuel) {
        schedule.nextTickAt = now + EMBEDDED_BEHAVIOR_TICK_INTERVAL;
        continue;
      }

      // Collect game state snapshot
      const gameState = instance.service.getGameState();
      if (!gameState || !gameState.position) {
        schedule.nextTickAt = now + EMBEDDED_BEHAVIOR_TICK_INTERVAL;
        continue;
      }

      // Compute NPC positions once per poll batch (not per agent)
      if (!sharedNpcPositions) {
        sharedNpcPositions = instance.service.getAllNPCPositions();
      }

      // Per-agent data only — shared data is sent separately to avoid
      // structured clone duplicating large arrays N times
      const tickInput: AgentTickInput = {
        characterId,
        playerId: instance.service.getPlayerId(),
        name: instance.config.name,
        gameState,
        inventoryItems: instance.service.getInventoryItems(),
        equippedItems: instance.service.getEquippedItems(),
        questState: instance.service.getQuestState(),
        availableQuests: instance.service.getAvailableQuests(),
        // Placeholder empty arrays — worker fills from SharedTickData
        npcPositions: [],
        otherAgentTargets: [],
        resourceSystemAvailable,
        spawnAnchors: [],
        worldResources: [],
        agentState: {
          goal: instance.goal,
          questsAccepted: Array.from(instance.questsAccepted),
          currentTargetId: instance.currentTargetId,
          lastAteAt: instance.lastAteAt,
          dropCooldownUntil: instance.dropCooldownUntil,
          lastGatherTargetId: instance.lastGatherTargetId,
          lastGatherQueuedAt: instance.lastGatherQueuedAt,
          pendingChatReaction: instance.pendingChatReaction,
          lastCombatChatAt: instance.lastCombatChatAt,
        },
      };

      dueAgents.push(tickInput);
      schedule.tickInProgress = true;
      schedule.nextTickAt = now + EMBEDDED_BEHAVIOR_TICK_INTERVAL;
      agentsProcessed++;

      // Yield to event loop between agents so tick timer can fire
      if (agentsProcessed < MAX_AGENTS_PER_POLL) {
        await yieldToEventLoop();
      }
    }

    const snapshotMs = Date.now() - pollStart;
    if (dueAgents.length === 0) {
      if (snapshotMs > 50) {
        console.warn(`[AgentBridge] Poll (0 agents) took ${snapshotMs}ms`);
      }
      return;
    }

    if (snapshotMs > 50) {
      console.warn(
        `[AgentBridge] Snapshot collection for ${dueAgents.length} agents took ${snapshotMs}ms`,
      );
    }

    // Build shared data sent ONCE (not duplicated per agent in structured clone)
    const shared: SharedTickData = {
      npcPositions: sharedNpcPositions ?? [],
      spawnAnchors: this.spawnAnchorsCache,
      worldResources: this.worldResourcesCache,
      otherAgentTargets,
      resourceSystemAvailable,
    };

    // Send to worker and wait for results
    const t0 = Date.now();
    const results = await this.sendTickAndWait(dueAgents, shared);
    const workerMs = Date.now() - t0;
    if (workerMs > 100) {
      console.warn(
        `[AgentBridge] Worker round-trip took ${workerMs}ms for ${dueAgents.length} agents`,
      );
    }

    // If worker timed out (empty results), clear tickInProgress for all
    // agents that were in this batch so they aren't permanently stuck.
    if (results.length === 0 && dueAgents.length > 0) {
      for (const agent of dueAgents) {
        const schedule = this.schedules.get(agent.characterId);
        if (schedule) schedule.tickInProgress = false;
      }
    }

    // Apply results on main thread — yield between each to avoid blocking
    const applyStart = Date.now();
    for (const result of results) {
      await this.applyTickResult(result);
      await yieldToEventLoop();
    }
    const applyMs = Date.now() - applyStart;

    const totalMs = Date.now() - pollStart;
    if (totalMs > 100) {
      console.warn(
        `[AgentBridge] Total poll: ${totalMs}ms (snapshot=${snapshotMs}ms, worker=${workerMs}ms, apply=${applyMs}ms, agents=${dueAgents.length})`,
      );
    }
  }

  private sendTickAndWait(
    agents: AgentTickInput[],
    shared: SharedTickData,
  ): Promise<AgentTickOutput[]> {
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.sendToWorker({ type: "tick", agents, shared });

      // Timeout after 5s — don't block agent scheduling forever
      setTimeout(() => {
        if (this.pendingResolve === resolve) {
          console.warn("[AgentBehaviorBridge] Worker tick timed out after 5s");
          this.pendingResolve = null;
          resolve([]);
        }
      }, 5000);
    });
  }

  /**
   * Apply a single agent's tick result: execute side effects, then the main action.
   */
  private async applyTickResult(result: AgentTickOutput): Promise<void> {
    const instance = this.getAgent(result.characterId);
    if (!instance || instance.state !== "running") {
      const schedule = this.schedules.get(result.characterId);
      if (schedule) schedule.tickInProgress = false;
      return;
    }

    try {
      // Update agent state from worker decisions
      const s = result.updatedState;
      instance.goal = s.goal;
      instance.questsAccepted = new Set(s.questsAccepted);
      instance.currentTargetId = s.currentTargetId;
      instance.lastAteAt = s.lastAteAt;
      instance.dropCooldownUntil = s.dropCooldownUntil;
      instance.lastGatherTargetId = s.lastGatherTargetId;
      instance.lastGatherQueuedAt = s.lastGatherQueuedAt;
      instance.lastCombatChatAt = s.lastCombatChatAt;
      instance.pendingChatReaction = null; // Worker consumed it

      // Send combat chat if decided
      if (result.chatMessage) {
        try {
          await instance.service.sendChatMessage(result.chatMessage);
        } catch (err) {
          // Non-critical, don't fail the tick
        }
      }

      // Execute side effects (equip, drop, buy, eat)
      for (const effect of result.sideEffects) {
        try {
          switch (effect.type) {
            case "storeBuy":
              await instance.service.executeStoreBuy(
                effect.storeId,
                effect.itemId,
                effect.quantity,
              );
              break;
            case "drop":
              await instance.service.executeDrop(
                effect.itemId,
                effect.quantity,
              );
              break;
            case "use":
              await instance.service.executeUse(effect.itemId);
              break;
            case "equip":
              await instance.service.executeEquip(effect.itemId);
              break;
          }
        } catch (err) {
          // Individual side effect failure shouldn't stop the main action
        }
      }

      // Execute the main action
      const action = result.action;
      switch (action.type) {
        case "attack":
          await instance.service.executeAttack(action.targetId);
          instance.lastActivity = Date.now();
          break;

        case "gather":
          await instance.service.executeGather(action.targetId);
          instance.lastActivity = Date.now();
          break;

        case "pickup":
          await instance.service.executePickup(action.targetId);
          instance.lastActivity = Date.now();
          break;

        case "lootGravestone":
          this.world.emit(EventType.CORPSE_LOOT_ALL_REQUEST, {
            corpseId: action.gravestoneId,
            playerId: instance.service.getPlayerId(),
          });
          instance.lastActivity = Date.now();
          break;

        case "move":
          await instance.service.executeMove(action.target, action.runMode);
          instance.lastActivity = Date.now();
          break;

        case "firemake":
          await instance.service.executeFiremake(action.logsItemId);
          instance.lastActivity = Date.now();
          break;

        case "questAccept": {
          const accepted = await instance.service.executeQuestAccept(
            action.questId,
          );
          if (accepted) {
            const postAcceptState = instance.service.getQuestState();
            const questStarted = postAcceptState.some(
              (q) => q.questId === action.questId,
            );
            if (questStarted) {
              instance.questsAccepted.add(action.questId);
            }
          }
          instance.lastActivity = Date.now();
          break;
        }

        case "questComplete":
          await instance.service.executeQuestComplete(action.questId);
          instance.goal = null;
          instance.lastActivity = Date.now();
          break;

        case "stop":
          await instance.service.executeStop();
          instance.lastActivity = Date.now();
          break;

        case "idle":
        default:
          break;
      }
    } catch (err) {
      console.warn(
        `[AgentBehaviorBridge] Failed to apply tick result for ${result.characterId}: ${errMsg(err)}`,
      );
    } finally {
      const schedule = this.schedules.get(result.characterId);
      if (schedule) schedule.tickInProgress = false;
    }
  }

  // ─── PRIVATE: WORLD SCAN CACHES ───────────────────────────────────────

  /**
   * Pre-compute spawn anchors and world resources so the worker doesn't
   * need to iterate all world entities.
   */
  private updateWorldScanCaches(): void {
    const anchors: typeof this.spawnAnchorsCache = [];
    const resources: typeof this.worldResourcesCache = [];

    for (const [, entity] of this.world.entities.items.entries()) {
      const data = (entity as { data?: Record<string, unknown> }).data;
      if (!data) continue;

      const name = String(data.name || "").toLowerCase();
      const entityType = String(data.type || "").toLowerCase();
      const resourceType = String(data.resourceType || "").toLowerCase();

      // Collect spawn anchors
      const isAnchor =
        name.includes("starter chest") ||
        name.includes("goblin") ||
        name.includes("bank") ||
        name.includes("spawn") ||
        name.includes("start");

      if (isAnchor) {
        const pos = this.getEntityPosition(entity);
        if (pos) {
          anchors.push({ position: pos, name });
        }
      }

      // Collect resources
      if (entityType === "resource" || resourceType) {
        const pos = this.getEntityPosition(entity);
        if (pos) {
          resources.push({
            position: pos,
            name,
            resourceType,
            depleted: data.depleted === true,
          });
        }
      }
    }

    this.spawnAnchorsCache = anchors;
    this.worldResourcesCache = resources;
  }

  private getEntityPosition(entity: unknown): [number, number, number] | null {
    const e = entity as {
      position?: unknown;
      data?: Record<string, unknown>;
    };

    const directPos = e.position;
    if (Array.isArray(directPos) && directPos.length >= 3) {
      return [directPos[0], directPos[1], directPos[2]];
    }
    if (
      directPos &&
      typeof directPos === "object" &&
      "x" in directPos &&
      "z" in directPos
    ) {
      const p = directPos as { x: number; y?: number; z: number };
      return [p.x, p.y ?? 0, p.z];
    }

    const dataPos = e.data?.position;
    if (Array.isArray(dataPos) && dataPos.length >= 3) {
      return [dataPos[0] as number, dataPos[1] as number, dataPos[2] as number];
    }
    if (
      dataPos &&
      typeof dataPos === "object" &&
      "x" in dataPos &&
      "z" in dataPos
    ) {
      const p = dataPos as { x: number; y?: number; z: number };
      return [p.x, p.y ?? 0, p.z];
    }
    return null;
  }
}
