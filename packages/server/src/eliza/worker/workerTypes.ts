/**
 * Worker Thread Types — shared between main thread and agent behavior worker.
 *
 * All types here must be serializable via structured clone (no functions,
 * no class instances, no Maps/Sets — only plain objects, arrays, primitives).
 */

import type {
  EmbeddedGameState,
  AgentQuestProgress,
  AgentQuestInfo,
} from "../types.js";

import type {
  AgentGoal,
  PendingChatReaction,
  EmbeddedBehaviorAction,
} from "../managers/AgentBehaviorTicker.js";

// ─── Item data (sent once at init) ──────────────────────────────────────────

/** Serializable item data for worker-side getItem() */
export interface WorkerItemData {
  id: string;
  name: string;
  type: string;
  equipSlot?: string;
  bonuses?: Record<string, number>;
  healAmount?: number;
  requirements?: Record<string, unknown>;
}

// ─── Shared world data (sent once per tick batch, not per agent) ─────────────

/** Data that is identical for all agents in a tick batch */
export interface SharedTickData {
  npcPositions: Array<{
    id: string;
    name: string;
    npcId: string;
    position: [number, number, number];
  }>;
  spawnAnchors: Array<{
    position: [number, number, number];
    name: string;
  }>;
  worldResources: Array<{
    position: [number, number, number];
    name: string;
    resourceType: string;
    depleted: boolean;
  }>;
  stationPositions: Array<{
    position: [number, number, number];
    name: string;
    stationType: string;
  }>;
  otherAgentTargets: Array<{ agentId: string; targetId: string | null }>;
  resourceSystemAvailable: boolean;
}

// ─── Per-agent tick input ───────────────────────────────────────────────────

/** Snapshot of agent state sent to worker for decision-making */
export interface AgentTickInput {
  characterId: string;
  playerId: string | null;
  name: string;
  gameState: EmbeddedGameState;
  inventoryItems: Array<{ slot: number; itemId: string; quantity: number }>;
  equippedItems: Record<string, string | null>;
  questState: AgentQuestProgress[];
  availableQuests: AgentQuestInfo[];
  agentState: {
    goal: AgentGoal | null;
    questsAccepted: string[];
    currentTargetId: string | null;
    lastAteAt: number;
    dropCooldownUntil: number;
    lastGatherTargetId: string | null;
    lastGatherQueuedAt: number;
    pendingChatReaction: PendingChatReaction | null;
    lastCombatChatAt: number;
  };

  /** When true, skip autonomous action picking (operator sent a dashboard command).
   *  Survival tasks (eating, equipment, shopping) still run. */
  operatorGrace?: boolean;

  // ── Legacy fields kept for backward compat with AgentBehaviorEngine ──
  // These are populated from SharedTickData by the worker before processing
  npcPositions: Array<{
    id: string;
    name: string;
    npcId: string;
    position: [number, number, number];
  }>;
  otherAgentTargets: Array<{ agentId: string; targetId: string | null }>;
  resourceSystemAvailable: boolean;
  spawnAnchors: Array<{
    position: [number, number, number];
    name: string;
  }>;
  worldResources: Array<{
    position: [number, number, number];
    name: string;
    resourceType: string;
    depleted: boolean;
  }>;
  stationPositions: Array<{
    position: [number, number, number];
    name: string;
    stationType: string;
  }>;
}

// ─── Per-agent tick output ──────────────────────────────────────────────────

/** Side effects to execute on the main thread before the main action */
export type AgentSideEffect =
  | { type: "storeBuy"; storeId: string; itemId: string; quantity: number }
  | { type: "drop"; itemId: string; quantity: number }
  | { type: "use"; itemId: string }
  | { type: "equip"; itemId: string };

/** Result of worker decision-making for one agent */
export interface AgentTickOutput {
  characterId: string;
  action: EmbeddedBehaviorAction;
  sideEffects: AgentSideEffect[];
  updatedState: {
    goal: AgentGoal | null;
    questsAccepted: string[];
    currentTargetId: string | null;
    lastAteAt: number;
    dropCooldownUntil: number;
    lastGatherTargetId: string | null;
    lastGatherQueuedAt: number;
    lastCombatChatAt: number;
  };
  chatMessage?: string;
}

// ─── Message protocol ───────────────────────────────────────────────────────

export type MainToWorkerMessage =
  | { type: "init"; itemsData: Array<[string, WorkerItemData]> }
  | { type: "tick"; agents: AgentTickInput[]; shared: SharedTickData }
  | { type: "shutdown" };

export type WorkerToMainMessage =
  | { type: "ready" }
  | { type: "tickResults"; results: AgentTickOutput[] }
  | { type: "error"; characterId?: string; error: string };
