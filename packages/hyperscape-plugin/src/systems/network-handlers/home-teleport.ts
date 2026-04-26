/**
 * Home Teleport Handler
 *
 * Allows players to return to spawn with:
 * - 30-second cooldown
 * - 10-second interruptible cast time
 * - Blocked by combat/death
 */

import type {
  ServerSocket,
  SpawnData,
  HomeTeleportFactory,
  IHomeTeleportManager,
} from "@hyperforge/shared";
import { World, EventType, TerrainSystem, Emotes } from "@hyperforge/shared";

// CombatSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 6).
interface CombatSystem {
  stateService?: { isInCombat(playerId: string): boolean };
}
import {
  getHomeTeleportCastTimeMs,
  getHomeTeleportCastTimeTicks,
  getHomeTeleportCooldownMs,
} from "@hyperforge/shared";

interface CastingState {
  endTick: number;
  targetPosition: [number, number, number];
}

type PlayerData = { properties?: { healthComponent?: { isDead?: boolean } } };
type PlayerEntity = {
  position?: { set: (x: number, y: number, z: number) => void };
  data?: { position?: number[] };
};

export class HomeTeleportManager implements IHomeTeleportManager {
  private cooldowns = new Map<string, number>();
  private castingStates = new Map<string, CastingState>();
  private world: World;
  private spawnPoint: SpawnData;
  private sendFn: (
    name: string,
    data: unknown,
    ignoreSocketId?: string,
  ) => void;

  constructor(
    world: World,
    spawnPoint: SpawnData,
    sendFn: (name: string, data: unknown, ignoreSocketId?: string) => void,
  ) {
    this.world = world;
    this.spawnPoint = spawnPoint;
    this.sendFn = sendFn;
  }

  setSpawnPoint(spawnPoint: SpawnData): void {
    this.spawnPoint = spawnPoint;
  }

  isOnCooldown(playerId: string): boolean {
    const lastTeleport = this.cooldowns.get(playerId);
    return lastTeleport
      ? Date.now() - lastTeleport < getHomeTeleportCooldownMs()
      : false;
  }

  getCooldownRemaining(playerId: string): number {
    const lastTeleport = this.cooldowns.get(playerId);
    if (!lastTeleport) return 0;
    return Math.max(
      0,
      getHomeTeleportCooldownMs() - (Date.now() - lastTeleport),
    );
  }

  isCasting(playerId: string): boolean {
    return this.castingStates.has(playerId);
  }

  /** Start casting. Returns error message or null on success. */
  startCasting(socket: ServerSocket, currentTick: number): string | null {
    const player = socket.player;
    if (!player) return "Player not found";

    const { id: playerId } = player;

    if (this.isCasting(playerId)) return "Already casting home teleport";

    if (this.isOnCooldown(playerId)) {
      const remainingMs = this.getCooldownRemaining(playerId);
      return `Home teleport on cooldown (${formatCooldownRemaining(remainingMs)} remaining)`;
    }

    const combatSystem = this.world.getSystem(
      "combat",
    ) as unknown as CombatSystem | null;
    if (combatSystem?.stateService?.isInCombat(playerId)) {
      return "You can't teleport during combat!";
    }

    // Block home teleport during any duel state (not just active combat)
    const duelSystem = this.world.getSystem("duel") as {
      isPlayerInDuel?: (id: string) => boolean;
    } | null;
    if (duelSystem?.isPlayerInDuel?.(playerId)) {
      return "You can't teleport during a duel!";
    }

    const healthComponent = (player.data as PlayerData)?.properties
      ?.healthComponent;
    if (healthComponent?.isDead) return "You can't teleport while dead!";

    const targetPosition = this.getGroundedSpawnPosition();

    this.castingStates.set(playerId, {
      endTick: currentTick + getHomeTeleportCastTimeTicks(),
      targetPosition,
    });

    this.world.emit(EventType.HOME_TELEPORT_CAST_START, {
      playerId,
      castTimeMs: getHomeTeleportCastTimeMs(),
    });

    socket.send("homeTeleportStart", {
      castTimeMs: getHomeTeleportCastTimeMs(),
    });

    return null;
  }

  cancelCasting(playerId: string, reason: string): void {
    if (!this.castingStates.delete(playerId)) return;

    this.world.emit(EventType.HOME_TELEPORT_CAST_CANCEL, { playerId, reason });
    this.sendFn("entityModified", {
      id: playerId,
      changes: { emote: Emotes.IDLE },
    });
  }

  processTick(
    currentTick: number,
    getSocket: (playerId: string) => ServerSocket | undefined,
  ): void {
    for (const [playerId, state] of this.castingStates) {
      if (currentTick >= state.endTick) {
        this.completeTeleport(playerId, state.targetPosition, getSocket);
      } else {
        const combatSystem = this.world.getSystem(
          "combat",
        ) as unknown as CombatSystem | null;
        if (combatSystem?.stateService?.isInCombat(playerId)) {
          this.cancelCasting(playerId, "Entered combat");
          getSocket(playerId)?.send("homeTeleportFailed", {
            reason: "Interrupted by combat",
          });
        }
      }
    }
  }

  onPlayerMove(playerId: string): void {
    if (this.isCasting(playerId)) this.cancelCasting(playerId, "Player moved");
  }

  onPlayerDisconnect(playerId: string): void {
    this.castingStates.delete(playerId);
  }

  private getGroundedSpawnPosition(): [number, number, number] {
    const [x, baseY, z] = this.spawnPoint.position;
    const terrain = this.world.getSystem("terrain") as InstanceType<
      typeof TerrainSystem
    > | null;
    const terrainHeight = terrain?.getHeightAt(x, z);
    const y = Number.isFinite(terrainHeight) ? terrainHeight! + 0.1 : baseY;
    return [x, y, z];
  }

  private completeTeleport(
    playerId: string,
    targetPosition: [number, number, number],
    getSocket: (playerId: string) => ServerSocket | undefined,
  ): void {
    this.castingStates.delete(playerId);
    this.cooldowns.set(playerId, Date.now());

    const player = this.world.entities.get(playerId) as PlayerEntity | null;
    if (!player?.position) {
      console.warn(`[HomeTeleport] Player ${playerId} not found`);
      return;
    }

    const [x, y, z] = targetPosition;
    player.position.set(x, y, z);
    if (Array.isArray(player.data?.position)) {
      player.data.position = [x, y, z];
    }

    getSocket(playerId)?.send("playerTeleport", {
      playerId,
      position: [x, y, z],
    });

    this.sendFn("entityModified", {
      id: playerId,
      changes: { p: [x, y, z], emote: Emotes.IDLE },
    });

    this.world.emit(EventType.HOME_TELEPORT_COMPLETE, {
      playerId,
      position: { x, y, z },
    });
  }
}

export function formatCooldownRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

/**
 * Plugin-side factory the engine substrate consumes. Installed on
 * `world.homeTeleportFactory` at plugin onEnable; ServerNetwork's
 * `start()` calls it after the spawn point loads, pins the result
 * to `world.homeTeleportManager`, and lifecycle hooks (tick,
 * onPlayerMove, onPlayerDisconnect) lazy-resolve through the
 * pinned reference.
 */
export function createHomeTeleportFactory(world: World): HomeTeleportFactory {
  return (spawnPoint, sendFn) =>
    new HomeTeleportManager(world, spawnPoint, sendFn);
}

/** Resolve the manager from the engine-pinned world property. */
function getManagerFromWorld(world: World): HomeTeleportManager | null {
  const pinned = (world as { homeTeleportManager?: IHomeTeleportManager })
    .homeTeleportManager;
  return (pinned as HomeTeleportManager | undefined) ?? null;
}

export function handleHomeTeleport(
  socket: ServerSocket,
  _data: unknown,
  world: World,
  currentTick: number,
): void {
  const manager = getManagerFromWorld(world);
  if (!manager) {
    console.error("[HomeTeleport] Manager not initialized");
    // Always send a response so clients/tests don't hang
    socket.send("homeTeleportFailed", {
      reason: "Home teleport not available",
    });
    return;
  }

  const error = manager.startCasting(socket, currentTick);
  if (error) {
    const remainingMs = socket.player
      ? manager.getCooldownRemaining(socket.player.id)
      : 0;
    socket.send("homeTeleportFailed", {
      reason: error,
      ...(remainingMs > 0 ? { remainingMs } : {}),
    });
    socket.send("showToast", { message: error, type: "error" });
  }
}

export function handleHomeTeleportCancel(
  socket: ServerSocket,
  _data: unknown,
  world: World,
): void {
  const manager = getManagerFromWorld(world);
  const player = socket.player;
  if (!player || !manager?.isCasting(player.id)) return;

  manager.cancelCasting(player.id, "Canceled by player");
  // Send failed packet so client resets state (consistent with other cancel paths)
  socket.send("homeTeleportFailed", { reason: "Canceled by player" });
  socket.send("showToast", { message: "Home teleport canceled", type: "info" });
}
