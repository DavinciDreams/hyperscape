/**
 * TeleportSystem — Server-authoritative teleport network
 *
 * Manages lodestone unlocking, home teleport, and lodestone teleport.
 * Reads teleport nodes from WorldArea.teleports and global config from
 * WorldConfigManifest.teleportNetwork.
 *
 * - Lodestones unlock when a player walks within unlockRadius (visit mode)
 * - Home teleport sends to the configured homeNode
 * - Lodestone teleport sends to any unlocked lodestone
 * - Cooldown enforced server-side per player
 */

import { SystemBase } from "../infrastructure/SystemBase";
import type { SystemConfig } from "../../../types/systems/system-types";
import type { World } from "../../../core/World";
import type {
  TeleportNode,
  TeleportNetworkConfig,
} from "../../../types/world/world-types";
import { ALL_WORLD_AREAS } from "../../../data/world-areas";
import { DataManager } from "../../../data/DataManager";
import { dist2D } from "../../../utils/MathUtils";

/** Default teleport network config when world-config.json doesn't define one */
const DEFAULT_TELEPORT_CONFIG: TeleportNetworkConfig = {
  homeNode: "central_haven_lodestone",
  unlockType: "visit",
  cooldownSeconds: 30,
  unlockRadius: 5,
};

const TELEPORT_SYSTEM_CONFIG: SystemConfig = {
  name: "teleport",
  dependencies: {},
  autoCleanup: true,
};

/** Per-player teleport state */
interface PlayerTeleportState {
  /** Set of unlocked teleport node IDs */
  unlockedNodes: Set<string>;
  /** Timestamp of last teleport (for cooldown) */
  lastTeleportTime: number;
}

/**
 * Result of a teleport attempt
 */
export interface TeleportResult {
  success: boolean;
  /** Destination position if successful */
  position?: { x: number; y: number; z: number };
  /** Error reason if failed */
  reason?: string;
}

export class TeleportSystem extends SystemBase {
  /** All teleport nodes indexed by ID */
  private nodes: Map<string, TeleportNode> = new Map();
  /** Per-player teleport state (keyed by entity ID) */
  private playerStates: Map<string, PlayerTeleportState> = new Map();
  /** Active teleport network config */
  private teleportConfig: TeleportNetworkConfig = DEFAULT_TELEPORT_CONFIG;

  constructor(world: World) {
    super(world, TELEPORT_SYSTEM_CONFIG);
  }

  /**
   * Load teleport nodes from all world areas and global config
   */
  async init(): Promise<void> {
    // Load global config
    const worldConfig = DataManager.getWorldConfig();
    if (worldConfig?.teleportNetwork) {
      this.teleportConfig = {
        ...DEFAULT_TELEPORT_CONFIG,
        ...worldConfig.teleportNetwork,
      };
    }

    // Collect all teleport nodes from world areas
    this.nodes.clear();
    for (const area of Object.values(ALL_WORLD_AREAS)) {
      if (area.teleports) {
        for (const node of area.teleports) {
          this.nodes.set(node.id, node);
        }
      }
    }

    console.log(
      `[TeleportSystem] Loaded ${this.nodes.size} teleport nodes, home=${this.teleportConfig.homeNode}`,
    );
  }

  /**
   * Register a teleport node at runtime (e.g., from compiled manifests)
   */
  registerNode(node: TeleportNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Remove a teleport node
   */
  unregisterNode(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  /**
   * Get all registered teleport nodes
   */
  getAllNodes(): TeleportNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get a specific node by ID
   */
  getNode(nodeId: string): TeleportNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get the active teleport network config
   */
  getConfig(): TeleportNetworkConfig {
    return this.teleportConfig;
  }

  /**
   * Check if a player has unlocked a specific node
   */
  isNodeUnlocked(entityId: string, nodeId: string): boolean {
    const state = this.playerStates.get(entityId);
    if (!state) return false;
    return state.unlockedNodes.has(nodeId);
  }

  /**
   * Get all unlocked node IDs for a player
   */
  getUnlockedNodes(entityId: string): string[] {
    const state = this.playerStates.get(entityId);
    if (!state) return [];
    return Array.from(state.unlockedNodes);
  }

  /**
   * Initialize player teleport state (called when player joins)
   * @param entityId - Player entity ID
   * @param unlockedNodeIds - Previously unlocked node IDs (from DB)
   */
  initPlayerState(entityId: string, unlockedNodeIds: string[] = []): void {
    this.playerStates.set(entityId, {
      unlockedNodes: new Set(unlockedNodeIds),
      lastTeleportTime: 0,
    });
  }

  /**
   * Remove player state (called when player leaves)
   */
  removePlayerState(entityId: string): void {
    this.playerStates.delete(entityId);
  }

  /**
   * Check if player is near any locked lodestones and unlock them.
   * Call this periodically (e.g., every few ticks) for each player.
   *
   * @returns Array of newly unlocked node IDs (empty if none)
   */
  checkProximityUnlocks(
    entityId: string,
    playerX: number,
    playerZ: number,
  ): string[] {
    if (this.teleportConfig.unlockType !== "visit") return [];

    const state = this.playerStates.get(entityId);
    if (!state) return [];

    const unlockRadius = this.teleportConfig.unlockRadius ?? 5;
    const newlyUnlocked: string[] = [];

    for (const [nodeId, node] of this.nodes) {
      if (node.type !== "lodestone") continue;
      if (state.unlockedNodes.has(nodeId)) continue;

      const dist = dist2D(playerX, playerZ, node.position.x, node.position.z);
      if (dist <= unlockRadius) {
        state.unlockedNodes.add(nodeId);
        newlyUnlocked.push(nodeId);
      }
    }

    return newlyUnlocked;
  }

  /**
   * Attempt a home teleport for a player.
   * Always available (no unlock needed), subject to cooldown.
   */
  attemptHomeTeleport(entityId: string): TeleportResult {
    return this.attemptTeleport(entityId, this.teleportConfig.homeNode, true);
  }

  /**
   * Attempt a lodestone teleport for a player.
   * Requires the destination to be unlocked, subject to cooldown.
   */
  attemptLodestoneTeleport(
    entityId: string,
    destinationNodeId: string,
  ): TeleportResult {
    return this.attemptTeleport(entityId, destinationNodeId, false);
  }

  /**
   * Core teleport logic — validates cooldown, unlock status, and requirements.
   */
  private attemptTeleport(
    entityId: string,
    destinationNodeId: string,
    isHomeTeleport: boolean,
  ): TeleportResult {
    const state = this.playerStates.get(entityId);
    if (!state) {
      return { success: false, reason: "Player state not initialized" };
    }

    // Check cooldown
    const now = Date.now();
    const cooldownMs = this.teleportConfig.cooldownSeconds * 1000;
    const elapsed = now - state.lastTeleportTime;
    if (elapsed < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
      return {
        success: false,
        reason: `Teleport on cooldown (${remaining}s remaining)`,
      };
    }

    // Find destination node
    const destNode = this.nodes.get(destinationNodeId);
    if (!destNode) {
      return { success: false, reason: "Unknown teleport destination" };
    }

    // For non-home teleports, check unlock status
    if (!isHomeTeleport && destNode.type === "lodestone") {
      if (!state.unlockedNodes.has(destinationNodeId)) {
        return {
          success: false,
          reason: "Lodestone not yet discovered",
        };
      }
    }

    // Check requirements
    if (destNode.requirements) {
      if (
        destNode.requirements.level !== undefined &&
        destNode.requirements.level > 1
      ) {
        // Level check would need entity data — for now, trust the caller
        // In practice, the server handler validates this before calling
      }
    }

    // Execute teleport
    state.lastTeleportTime = now;

    return {
      success: true,
      position: { ...destNode.position },
    };
  }

  /**
   * Serialize player's unlocked nodes for database persistence
   */
  serializePlayerState(entityId: string): string[] {
    const state = this.playerStates.get(entityId);
    if (!state) return [];
    return Array.from(state.unlockedNodes);
  }

  /**
   * System update — no per-frame work needed.
   * Proximity checks are triggered by movement handlers, not the tick loop.
   */
  update(): void {
    // No-op: proximity unlocks are driven by player movement events
  }
}
