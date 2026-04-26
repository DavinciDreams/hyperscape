/**
 * ServerNetwork - Authoritative multiplayer networking system
 *
 * Coordinates between specialized modules to handle all server networking:
 * - authentication.ts, character-selection.ts, movement modules
 * - socket-management.ts, broadcast.ts, save-manager.ts
 * - position-validator.ts, event-bridge.ts, initialization.ts
 * - connection-handler.ts, duel-events.ts, duel-settlement.ts
 * - handlers/* (chat, combat, inventory, processing, etc.)
 *
 * AUDIT-002 (ASSESSED): File is ~3K lines (116KB). ServerNetwork is already
 * heavily decomposed into 30+ modules including handlers/, services/, movement/
 * directories. This file is the coordinator that ties together:
 * - authentication.ts, character-selection.ts, socket-management.ts
 * - broadcast.ts, save-manager.ts, position-validator.ts, event-bridge.ts
 * - Full handlers/ directory (bank/, duel/, trade/, chat, combat, inventory, etc.)
 * Current structure is appropriate for a central networking coordinator.
 */

// Relocated to `packages/shared/src/systems/server/network/index.ts`
// (PLAN_SERVERNETWORK_MIGRATION.md Step 6). The server package exposes a
// thin re-export shim; all concrete server-only dependencies are reached
// through bridge systems registered on the world
// (`server-network-factory`, `duel-stake-transfer`, `packet-handlers`,
// `agent-manager`, `agent-runtime-lookup`, `auth`).
import type {
  ConnectionParams,
  NetworkWithSocket,
  NodeWebSocket,
  SpawnData,
  ServerSocket,
} from "./server-types";
import type { WorldOptions, SystemDatabase } from "../../../index";
import {
  Socket,
  System,
  hasRole,
  isDatabaseInstance,
  World,
  EventType,
  // CombatSystem migrated to @hyperforge/hyperscape (2026-04-26, Wave 6).
  // Duck-typed inline at the single callsite below.
  // ResourceSystem migrated to @hyperforge/hyperscape (2026-04-25).
  // Duck-typed inline at the single callsite below.
  worldToTile,
  tilesWithinMeleeRange,
  tileChebyshevDistance,
  getItem,
  AttackType,
  WeaponType,
  type EventMap,
  writePacket,
  TICK_DURATION_MS,
  // MobEntity migrated to @hyperforge/hyperscape (2026-04-26).
  // Duck-typed inline at the single callsite below.
  getRandomSpawnPoint,
} from "../../../index";
import { getWaterThreshold } from "../../../data/live/game-live";
import type {
  IBroadcastManager,
  IEventBridge,
  IConnectionHandler,
  IDuelStakeTransfer,
  ISocketPubSubAdapter,
  IServerNetworkManagerFactory,
} from "./interfaces";

// Payload types (extracted to types.ts)
import type {
  QueueItem,
  NetworkHandler,
  PlayerDeathSystemWithTick,
  SpatialBroadcastPayload,
  AttackMobPayload,
  AttackPlayerPayload,
  LegacyInputPayload,
  SetAutocastPayload,
  AgentGoalSyncPayload,
  AgentThoughtSyncPayload,
  PlayerTeleportPayload,
  PlayerMovementCancelPayload,
  CorpseLootAllPayload,
} from "./types";

// Import modular components
import {
  handleEnterWorld,
  collectInitialSyncEntities,
} from "./character-selection";
// TileMovementManager migrated to @hyperforge/hyperscape (Phase E1,
// 2026-04-26). Plugin onEnable owns construction +
// setAntiCheatKickCallback wiring. ServerNetwork uses
// `world.tileMovement` (substrate interface from Phase A4) for the
// few remaining use-sites.
import type { ITileMovementService } from "./substrate/tile-movement-service";
// Local extended duck-type covering the methods ServerNetwork calls
// beyond the ITileMovementService surface. Plugin's concrete class
// structurally satisfies this.
interface TileMovementManager extends ITileMovementService {
  handleMoveRequest(socket: ServerSocket, data: unknown): void;
  onTick(tickNumber: number): void;
  syncPlayerPosition(
    playerId: string,
    position: { x: number; y: number; z: number },
  ): void;
  cleanup(playerId: string): void;
  getPlayerCount(): number;
  resetAgilityProgress(playerId: string): void;
}
// MobTileMovementManager migrated to @hyperforge/hyperscape (Phase E2,
// 2026-04-26). Plugin onEnable owns construction. ServerNetwork
// resolves via `world.mobTileMovement` lookup.
interface MobTileMovementManager {
  onTick(tickNumber: number): void;
  requestMoveTo(
    mobId: string,
    targetPos: { x: number; y: number; z: number },
    targetEntityId?: string | null,
    tilesPerTick?: number,
    combatRange?: number,
  ): void;
  initializeMob(
    mobId: string,
    position: { x: number; y: number; z: number },
    tilesPerTick?: number,
  ): void;
  cleanup(mobId: string): void;
}
import { ActionQueue } from "./action-queue";
import { TickSystem, TickPriority } from "../TickSystem";
import { SocketManager } from "./socket-management";
// BroadcastManager, EventBridge, ConnectionHandler are constructed via the
// IServerNetworkManagerFactory bridge (registered in startup/world.ts as
// "server-network-factory"). Their concrete implementations live in server
// because they depend on uWebSockets.js / Drizzle. ServerNetwork references
// them only by interface.
import { PacketPriority } from "./BandwidthBudget";
import { SpatialIndex } from "./SpatialIndex";
import type { ISpatialIndex } from "./substrate/spatial-index";
import type { IBroadcastService } from "./substrate/broadcast-service";
import type { IRegionSubscriptionService } from "./substrate/region-subscription-service";
import type { IConnectionRegistry } from "./substrate/connection-registry";
import { RegionSubscriptionService } from "./RegionSubscriptionService";
// `ITileMovementService` already imported at the top of this file
// (Phase E1 — see TileMovementManager local duck-type).
import { SaveManager } from "./save-manager";
import { PositionValidator } from "./position-validator";
import { InitializationManager } from "./initialization";
import { InteractionSessionManager } from "./InteractionSessionManager";
import {
  destroyAllRateLimiters,
  getGlobalSocketRateLimiter,
  getUnknownMessageRateLimiter,
} from "./services/SlidingWindowRateLimiter";
// `handleAttackPlayer` migrated to @hyperforge/hyperscape (Phase F3
// batch-9, 2026-04-26). The engine inline `onAttackPlayer` block
// resolves `world.combatAttackService` via the
// `ICombatAttackService` substrate and calls `attackPlayer()`
// AFTER its own preprocessing (target lookup, range check,
// pending-attack queueing).
import type { ICombatAttackService } from "./substrate/combat-attack-service";
import type { ProcessingHandlerContext } from "./substrate/processing-handler-context";
// PendingAttackManager migrated to @hyperforge/hyperscape (Phase D3,
// 2026-04-26). Duck-typed locally — covers every method ServerNetwork
// calls. Plugin's concrete class structurally satisfies it.
interface PendingAttackManager {
  processTick(tickNumber: number): void;
  onPlayerDisconnect(playerId: string): void;
  cancelPendingAttack(playerId: string): void;
  hasPendingAttack(playerId: string): boolean;
  getPendingAttackTarget(playerId: string): string | undefined;
  queuePendingAttack(
    playerId: string,
    targetId: string,
    currentTick: number,
    attackRange: number,
    mode: "mob" | "player",
    attackType?: unknown,
  ): void;
}
// PendingGatherManager migrated to @hyperforge/hyperscape (Phase D5,
// 2026-04-26).
interface PendingGatherManager {
  processTick(tickNumber: number): void;
  onPlayerDisconnect(playerId: string): void;
  queuePendingGather(
    playerId: string,
    resourceId: string,
    currentTick: number,
    runMode?: boolean,
  ): void;
}
// PendingCookManager migrated to @hyperforge/hyperscape (Phase D4,
// 2026-04-26). Duck-type covers everything ServerNetwork + handlers
// need; the wider surface (queuePendingCook) is reached through the
// `getProcessingHandlerContext()` return shape.
interface PendingCookManager {
  processTick(tickNumber: number): void;
  onPlayerDisconnect(playerId: string): void;
  queuePendingCook(
    playerId: string,
    sourceId: string,
    sourcePosition: { x: number; y: number; z: number },
    currentTick: number,
    runMode?: boolean,
    fishSlot?: number,
  ): void;
}
// PendingTradeManager migrated to @hyperforge/hyperscape (Phase D1,
// 2026-04-26). ServerNetwork resolves the instance via
// `world.pendingTradeManager` at use-site (tick callback +
// disconnect handler). Duck-typed locally to keep shared off the
// plugin dep graph; plugin's concrete class structurally satisfies
// this shape.
interface PendingTradeManager {
  processTick(): void;
  onPlayerDisconnect(playerId: string): void;
  cancelPendingTrade(playerId: string): void;
}
// PendingDuelChallengeManager migrated to @hyperforge/hyperscape
// (Phase D2, 2026-04-26). Duck-typed locally — only the methods
// ServerNetwork actually calls.
interface PendingDuelChallengeManager {
  processTick(): void;
  onPlayerDisconnect(playerId: string): void;
  cancelPendingChallenge(playerId: string): void;
}
// FollowManager migrated to @hyperforge/hyperscape (Phase D6,
// 2026-04-26). Shape matches the existing IFollowManager interface
// in `interfaces.ts` (used by `handleFollowPlayer` handler) plus the
// extra methods ServerNetwork calls.
interface FollowManager {
  processTick(tickNumber: number): void;
  onPlayerDisconnect(playerId: string): void;
  stopFollowing(playerId: string): void;
  startFollowing(followerId: string, targetId: string): void;
}
// FaceDirectionManager migrated to @hyperforge/hyperscape (Phase D7,
// 2026-04-26).
interface FaceDirectionManager {
  processFaceDirection(playerIds: string[]): void;
  resetMovementFlags(): void;
  setSendFunction(fn: (name: string, data: unknown) => void): void;
  setCardinalFaceTarget(
    playerId: string,
    anchorTile: { x: number; z: number },
    footprintX: number,
    footprintZ: number,
  ): void;
  setFaceTarget(playerId: string, target: unknown): void;
  markPlayerMoved(playerId: string): void;
}
// handleFollowPlayer migrated to @hyperforge/hyperscape (Phase F3,
// 2026-04-26). Plugin onEnable registers `onFollowPlayer` via
// `world.connectionRegistry`. Pre-handler logic that cancelled
// `pendingAttackManager` lives plugin-side now.
// HomeTeleportManager migrated to @hyperforge/hyperscape (Phase F3
// batch-7, 2026-04-26). Plugin onEnable installs
// `world.homeTeleportFactory`; ServerNetwork.start() calls it after
// the spawn point loads and pins the result to
// `world.homeTeleportManager`. Lifecycle hooks (tick callback,
// onPlayerMove, onPlayerDisconnect) lazy-resolve the manager.
import type {
  IHomeTeleportManager,
  HomeTeleportFactory,
} from "./substrate/home-teleport-service";
// TradingSystem migrated to @hyperforge/hyperscape (2026-04-26).
// Plugin onEnable owns its lifecycle (instantiate + init + destroy)
// and pins it to `world.tradingSystem` so trade handlers' lookup
// helper works unchanged.
// DuelSystem migrated to @hyperforge/hyperscape (2026-04-26). Plugin
// onEnable owns the lifecycle; ServerNetwork resolves the instance
// via `world.duelSystem` (typed as the DuelSystem duck-type interface
// from system-interfaces) for tick + lifecycle hooks.
import type { DuelSystem } from "../../../types/systems/system-interfaces";
import { registerDuelEventListeners } from "./duel-events";

const DEBUG_ATTACK_MOB =
  process.env.DEBUG_ATTACK_MOB === "true" ||
  process.env.DEBUG_ATTACK_MOB === "1";
const DEBUG_AGENT_DASHBOARD_SYNC =
  process.env.DEBUG_AGENT_DASHBOARD_SYNC === "true" ||
  process.env.DEBUG_AGENT_DASHBOARD_SYNC === "1";
const DEBUG_DUEL_PACKET_TRAFFIC =
  process.env.DEBUG_DUEL_PACKET_TRAFFIC === "true" ||
  process.env.DEBUG_DUEL_PACKET_TRAFFIC === "1";

interface NetworkMessageMetric {
  method: string;
  received: number;
  inFlight: number;
  peakInFlight: number;
  errors: number;
  lastSeenAt: number;
}
const IS_PLAYWRIGHT_TEST = process.env.PLAYWRIGHT_TEST === "true";
const PLAYWRIGHT_LOG_THROTTLE_MS = Math.max(
  1000,
  parseInt(process.env.PLAYWRIGHT_LOG_THROTTLE_MS || "15000", 10),
);
const playwrightWarningLogAt = new Map<string, number>();

function warnPlaywrightThrottled(
  key: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!IS_PLAYWRIGHT_TEST) {
    if (data) console.warn(message, data);
    else console.warn(message);
    return;
  }
  const now = Date.now();
  const last = playwrightWarningLogAt.get(key) ?? 0;
  if (now - last < PLAYWRIGHT_LOG_THROTTLE_MS) return;
  playwrightWarningLogAt.set(key, now);
  if (data) console.warn(message, data);
  else console.warn(message);
}

function traceAttackMob(stage: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ATTACK_MOB) return;
  if (data && Object.keys(data).length > 0) {
    console.log(`[AttackMobTrace] ${stage}`, JSON.stringify(data));
    return;
  }
  console.log(`[AttackMobTrace] ${stage}`);
}

/** Initial spawn — replaced by loadSpawnPoint() from manifests during init */
function getDefaultSpawn(): SpawnData {
  const pt = getRandomSpawnPoint();
  return { position: [pt.x, pt.y, pt.z], quaternion: [0, 0, 0, 1] };
}

/**
 * ServerNetwork - Authoritative multiplayer networking system
 *
 * Coordinates between specialized modules to handle all server networking.
 * This refactored version delegates most logic to focused modules while
 * maintaining the same external API.
 */
export class ServerNetwork extends System implements NetworkWithSocket {
  /** Unique network ID (incremented for each connection) */
  id: number;

  /** Counter for assigning network IDs */
  ids: number;

  /** Map of all active WebSocket connections by socket ID */
  sockets: Map<string, ServerSocket>;

  /** Flag indicating this is the server network (true) */
  isServer: boolean;

  /** Flag indicating this is a client network (false) */
  isClient: boolean;

  /** Queue of outgoing messages to be batched and sent */
  queue: QueueItem[];

  /** Database instance for persistence operations */
  db!: SystemDatabase;

  /** Default spawn point for new players */
  spawn: SpawnData;

  /** Maximum upload file size in bytes */
  maxUploadSize: number;

  /** Handler method registry */
  private handlers: Record<string, NetworkHandler> = {};

  /** Idempotency guard: prevents double-settlement of duel stakes */
  private processedDuelSettlements: Set<string> = new Set();

  /** Agent goal storage (characterId -> goal data) for dashboard display */
  static agentGoals: Map<string, unknown> = new Map();

  /** Agent available goals storage (characterId -> available goals) for dashboard selection */
  static agentAvailableGoals: Map<string, unknown[]> = new Map();

  /** Per-phase timing (ms) for tickHealth diagnostics */
  private _lastMobAITime = 0;
  private _lastMobMoveTime = 0;
  private _lastCombatTime = 0;

  /** Agent goals paused state (characterId -> boolean) for dashboard display */
  static agentGoalsPaused: Map<string, boolean> = new Map();

  /** Character ID to socket mapping for sending goal overrides */
  static characterSockets: Map<string, ServerSocket> = new Map();

  /** Agent personality traits (characterId -> traits) for dashboard display */
  static agentPersonality: Map<
    string,
    {
      sociability: number;
      helpfulness: number;
      adventurousness: number;
      chattiness: number;
      aggression: number;
      patience: number;
    }
  > = new Map();

  /** Agent desire scores (characterId -> scored candidates) for dashboard display */
  static agentDesireScores: Map<
    string,
    Array<{ goalType: string; score: number; breakdown: string }>
  > = new Map();

  /** Agent thought storage (characterId -> recent thoughts) for dashboard display */
  static agentThoughts: Map<
    string,
    Array<{
      id: string;
      type: "situation" | "evaluation" | "thinking" | "decision" | "action";
      content: string;
      timestamp: number;
      health?: {
        current: number;
        max: number;
        percent: number;
        urgency: "critical" | "warning" | "safe";
      };
      decisionPath?:
        | "short-circuit"
        | "llm"
        | "scripted"
        | "planner"
        | "curiosity";
      providers?: string[];
    }>
  > = new Map();

  /** Long-term build / playstyle vision for embedded agents (dashboard + LLM refresh). */
  static agentCharacterVision: Map<
    string,
    {
      narrative: string;
      pillars: string[];
      updatedAt: number;
      source: "seed" | "llm" | "operator";
    }
  > = new Map();

  /** Maximum number of thoughts to keep per agent */
  static MAX_THOUGHTS_PER_AGENT = 50;

  /** Max distinct agent dashboard entries to retain in memory */
  static MAX_AGENT_DASHBOARD_ENTRIES = 512;

  /** Modular managers */
  // TileMovementManager removed (Phase E1) — plugin owns the
  // lifecycle. Use-sites resolve `world.tileMovement` lazily via
  // the helper getter below.
  // MobTileMovementManager removed (Phase E2) — plugin owns the
  // lifecycle.
  // PendingAttackManager removed (Phase D3) — plugin owns the
  // lifecycle. ServerNetwork resolves via the helper below.
  // PendingGatherManager removed (Phase D5) — plugin owns the
  // lifecycle.
  // PendingCookManager removed (Phase D4) — plugin owns the
  // lifecycle.
  // PendingTradeManager removed (Phase D1) — plugin owns the
  // lifecycle. ServerNetwork resolves via `world.pendingTradeManager`.
  // PendingDuelChallengeManager removed (Phase D2) — plugin owns the
  // lifecycle. ServerNetwork resolves via
  // `world.pendingDuelChallengeManager`.
  // FollowManager removed (Phase D6) — plugin owns the lifecycle.
  // TradingSystem field removed (2026-04-26) — plugin onEnable now owns
  // the lifecycle. Handlers reach the instance via
  // `getTradingSystem(world)` which reads `world.tradingSystem`.
  // DuelSystem field removed (2026-04-26) — plugin onEnable now owns
  // the lifecycle. ServerNetwork resolves the instance via
  // `world.duelSystem` for processTick + onPlayerDisconnect /
  // onPlayerReconnect.
  // DuelScheduler / DuelBettingBridge — no longer owned by ServerNetwork
  // after Step 6; constructed directly in startup/world.ts.
  private actionQueue!: ActionQueue;
  private tickSystem!: TickSystem;
  private socketManager!: SocketManager;
  private broadcastManager!: IBroadcastManager;
  private spatialIndex!: SpatialIndex;
  private regionSubscriptions!: RegionSubscriptionService;

  /**
   * PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative: packet handlers
   * that have been migrated to the `IPacketHandlerRegistry` bridge look up
   * their closed-over ServerNetwork-internal state through this accessor
   * rather than through captured `this` references. Kept narrow to only
   * the pieces migrated handlers actually read.
   */
  getBroadcastManager(): IBroadcastManager {
    return this.broadcastManager;
  }

  /**
   * Processing/skill handlers share a common context (world + pending-managers
   * + tick system + a rate-limit gate). Exposed here so the registry-based
   * wiring module can build a stable handler closure without touching
   * ServerNetwork-private fields. Safe because the managers are initialized
   * during `init()` before any packet dispatch runs.
   */
  getProcessingHandlerContext(): ProcessingHandlerContext {
    return {
      world: this.world,
      pendingGatherManager: (
        this.world as { pendingGatherManager?: PendingGatherManager }
      ).pendingGatherManager as PendingGatherManager,
      pendingCookManager: (
        this.world as { pendingCookManager?: PendingCookManager }
      ).pendingCookManager as PendingCookManager,
      tileMovementManager: (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement as TileMovementManager,
      tickSystem: this.tickSystem,
      canProcessRequest: this.canProcessRequest.bind(this),
    };
  }

  /**
   * Current game tick (monotonic counter incremented at 600ms cadence).
   * Exposed for migrated handlers that need to timestamp actions — see
   * home-teleport, pending-action, and combat-queue handlers.
   */
  getCurrentTick(): number {
    return this.tickSystem.getCurrentTick();
  }

  /**
   * Index of spectator sockets grouped by the player they're following.
   * Avoids O(N) scan over all sockets when updating region subscriptions.
   */
  private spectatorsByPlayer = new Map<string, Set<string>>();
  private saveManager!: SaveManager;
  private positionValidator!: PositionValidator;
  private eventBridge!: IEventBridge;
  private initializationManager!: InitializationManager;
  private connectionHandler!: IConnectionHandler;
  private interactionSessionManager!: InteractionSessionManager;
  // FaceDirectionManager removed (Phase D7) — plugin owns the
  // lifecycle.

  /** Time sync state - broadcast world time every 5 seconds for day/night sync */
  private worldTimeSyncAccumulator = 0;
  private readonly WORLD_TIME_SYNC_INTERVAL = 5; // seconds

  // Rate Limiting for Processing Requests
  /** Rate limiter for processing requests (playerId -> lastRequestTime) */
  private readonly processingRateLimiter = new Map<string, number>();
  /** Minimum time between processing requests (500ms) */
  private readonly PROCESSING_COOLDOWN_MS = 500;
  /** Prune stale processing cooldown entries after 10 minutes */
  private readonly PROCESSING_RATE_LIMIT_TTL_MS = 10 * 60 * 1000;

  /** World listeners tracked for deterministic teardown */
  private worldListeners: Array<{
    event: string;
    fn: (...args: unknown[]) => void;
  }> = [];

  /** Cleanup function for duel event listeners */
  private cleanupDuelEventListeners: (() => void) | null = null;
  private _lagProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private _stopLagProbe: (() => void) | null = null;
  private readonly messageMetrics = new Map<string, NetworkMessageMetric>();

  constructor(world: World) {
    super(world);
    this.id = 0;
    this.ids = -1;
    this.sockets = new Map();
    this.isServer = true;
    this.isClient = false;
    this.queue = [];
    this.spawn = getDefaultSpawn();
    this.maxUploadSize = 50; // Default 50MB upload limit

    // Phase B (PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26): construct
    // engine substrate at register-time and pin to world. Plugin-side
    // consumers (post-migration Pending- and Follow-managers,
    // TileMovementManager) resolve via `world.X` lookup — works in
    // both server boot order (`register → onEnable → init`) and PIE
    // boot order (`register → init → onEnable`) because the
    // constructor fires at register time in both.
    //
    // Order matters: SpatialIndex first (no deps), BroadcastManager
    // second (needs the `server-network-factory` bridge — both hosts
    // register it before ServerNetwork), then wire them.
    this.spatialIndex = new SpatialIndex();
    (world as { spatialIndex?: ISpatialIndex }).spatialIndex =
      this.spatialIndex;

    this.broadcastManager = this.getManagerFactory().createBroadcastManager(
      this.sockets,
    );
    this.broadcastManager.setSpatialIndex(this.spatialIndex);
    (world as { broadcast?: IBroadcastService }).broadcast =
      this.broadcastManager;

    // Region subscription service (Phase B3) — wraps the per-player
    // pubsub-topic update logic that used to live in ServerNetwork's
    // private `updatePlayerRegionSubscriptions` /
    // `resubscribePlayerRegionTopics` methods. Plugin-side movement
    // code resolves it via `world.regionSubscriptions` lookup.
    this.regionSubscriptions = new RegionSubscriptionService({
      spatialIndex: this.spatialIndex,
      broadcastService: this.broadcastManager,
      getSpectatorsForPlayer: (playerId) =>
        this.spectatorsByPlayer.get(playerId),
    });
    (
      world as { regionSubscriptions?: IRegionSubscriptionService }
    ).regionSubscriptions = this.regionSubscriptions;

    // ConnectionRegistry (Phase F2, 2026-04-26) — resolve the
    // packet-handler bridge that the host registered before
    // ServerNetwork (server: `PacketHandlerBridgeSystem`; PIE:
    // `PIEPacketHandlerStub`) and pin to `world.connectionRegistry`
    // for substrate-style access. Plugin onEnable registers handlers
    // via `world.connectionRegistry.register(name, handler)`. The
    // existing `getPacketRegistryHandler` getSystem lookup is kept
    // as the dispatch path — both reach the same registry instance.
    const connectionRegistry = world.getSystem(
      "packet-handlers",
    ) as unknown as IConnectionRegistry | null;
    if (connectionRegistry) {
      (
        world as { connectionRegistry?: IConnectionRegistry }
      ).connectionRegistry = connectionRegistry;
    }

    // TickSystem and TileMovementManager (Phase B4). TMM's broadcast
    // TileMovementManager — migrated to @hyperforge/hyperscape (Phase
    // E1, 2026-04-26). Plugin onEnable owns construction (with the
    // broadcast callback closing over `world.broadcast` /
    // `world.spatialIndex` / `world.regionSubscriptions` substrate)
    // and pins to `world.tileMovement` BEFORE any Pending-/Follow-
    // manager construction (the Phase D managers' constructors throw
    // if `world.tileMovement` isn't set).
    this.tickSystem = new TickSystem();

    // uWS-app wiring (`setUwsApp`) and pub/sub enabling
    // (`enablePubSub`) stay in init() — they depend on late-bound
    // transport state.
  }

  // Rate Limiting Helper

  /**
   * Check if a player can make a processing request (rate limiting).
   * Prevents spam by requiring PROCESSING_COOLDOWN_MS between requests.
   *
   * @param playerId - The player ID to check
   * @returns true if request is allowed, false if rate limited
   */
  private canProcessRequest(playerId: string): boolean {
    const now = Date.now();
    if (this.processingRateLimiter.size > 1024) {
      this.pruneProcessingRateLimiter(now);
    }
    const lastRequest = this.processingRateLimiter.get(playerId) ?? 0;

    if (now - lastRequest < this.PROCESSING_COOLDOWN_MS) {
      console.warn(
        `[ServerNetwork] Rate limited processing request from ${playerId}`,
      );
      return false;
    }

    this.processingRateLimiter.set(playerId, now);
    return true;
  }

  private pruneProcessingRateLimiter(now: number): void {
    const cutoff = now - this.PROCESSING_RATE_LIMIT_TTL_MS;
    for (const [playerId, lastRequest] of this.processingRateLimiter) {
      if (lastRequest < cutoff) {
        this.processingRateLimiter.delete(playerId);
      }
    }
  }

  private onWorld<T = unknown>(event: string, fn: (payload: T) => void): void {
    const listener = fn as unknown as (...args: unknown[]) => void;
    this.world.on(event, listener);
    this.worldListeners.push({ event, fn: listener });
  }

  private clearWorldListeners(): void {
    for (const { event, fn } of this.worldListeners) {
      this.world.off(event, fn);
    }
    this.worldListeners = [];
  }

  private static capAgentDashboardMap<T>(map: Map<string, T>): void {
    while (map.size > ServerNetwork.MAX_AGENT_DASHBOARD_ENTRIES) {
      const oldestKey = map.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      map.delete(oldestKey);
    }
  }

  private trimAgentDashboardCaches(): void {
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentGoals);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentAvailableGoals);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentGoalsPaused);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentThoughts);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.characterSockets);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentPersonality);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentDesireScores);
    ServerNetwork.capAgentDashboardMap(ServerNetwork.agentCharacterVision);
  }

  /**
   * Initialize managers after database is available
   *
   * Managers need access to world and database, so we initialize them
   * after world.init() sets world.db.
   */
  /**
   * Look up the `"server-network-factory"` bridge. Throws if it has not
   * been registered — it must always be registered before ServerNetwork
   * so the manager factory is available during `initializeManagers()`
   * and `init()`.
   */
  private getManagerFactory(): IServerNetworkManagerFactory {
    const factory = this.world.getSystem(
      "server-network-factory",
    ) as unknown as IServerNetworkManagerFactory | null;
    if (!factory) {
      throw new Error(
        "[ServerNetwork] server-network-factory bridge must be registered before ServerNetwork.init()",
      );
    }
    return factory;
  }

  private initializeManagers(): void {
    // SpatialIndex + BroadcastManager moved to ServerNetwork constructor
    // (Phase B1 + B2, PLAN_ENGINE_API_EXTRACTION.md). Both are pinned to
    // `world.spatialIndex` / `world.broadcast` from constructor so plugin
    // consumers can resolve them at register-time.
    //
    // Note: uWS pub/sub is wired later via enablePubSub() after uWS server starts

    // TickSystem + TileMovementManager moved to constructor (Phase B4,
    // PLAN_ENGINE_API_EXTRACTION.md). TMM is pinned to
    // `world.tileMovement` so plugin-side game managers can resolve
    // it via lookup at register-time.

    // Action queue for OSRS-style input processing
    this.actionQueue = new ActionQueue();

    // Set up action queue handlers - these execute the actual game logic
    this.actionQueue.setHandlers({
      movement: (socket, data) => {
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.handleMoveRequest(socket, data);
      },
      combat: (socket, data) => {
        // Combat actions trigger the combat system
        const playerEntity = socket.player;
        if (!playerEntity) {
          traceAttackMob("action_queue:drop:no_player_on_socket", {
            socketId: socket.id,
          });
          return;
        }

        const payload = data as AttackMobPayload;
        const targetId = payload.mobId || payload.targetId;
        if (!targetId) {
          traceAttackMob("action_queue:drop:missing_target_id", {
            playerId: playerEntity.id,
            socketId: socket.id,
          });
          return;
        }
        traceAttackMob("action_queue:emit_combat_attack_request", {
          playerId: playerEntity.id,
          targetId,
          tick: this.world.currentTick,
        });
        this.world.emit(EventType.COMBAT_ATTACK_REQUEST, {
          attackerId: playerEntity.id,
          targetId,
          attackerType: "player",
          targetType: "mob",
          attackType: AttackType.MELEE,
        });
      },
      interaction: (socket, data) => {
        // Generic interaction handler - can be extended for object/NPC interactions
        console.log(
          `[ActionQueue] Interaction from ${socket.player?.id}:`,
          data,
        );
      },
    });

    if (DEBUG_ATTACK_MOB) {
      this.onWorld(EventType.COMBAT_ATTACK_REQUEST, (event) => {
        const payload =
          event as EventMap[typeof EventType.COMBAT_ATTACK_REQUEST];
        if (payload.attackerType !== "player" || payload.targetType !== "mob") {
          return;
        }
        traceAttackMob("event:combat_attack_request_emitted", {
          attackerId: payload.attackerId,
          targetId: payload.targetId,
          attackType: payload.attackType,
          tick: this.world.currentTick,
        });
      });
    }

    // FIRST: Update world.currentTick on each tick so all systems can read it
    // This must run before any other tick processing (INPUT is earliest priority)
    // Mobs use this to run AI only once per tick instead of every frame
    this.tickSystem.onTick(
      (tickNumber) => {
        this.world.currentTick = tickNumber;
      },
      TickPriority.INPUT,
      "currentTick",
    );

    // SECOND: Process duel state transitions BEFORE action queue
    // CRITICAL: Must run before ActionQueue so COUNTDOWN→FIGHTING transition
    // happens before movement validation (which calls canMove())
    // Without this ordering, there's a race condition where movement requests
    // are rejected because they see COUNTDOWN state, but state changes to
    // FIGHTING later in the same tick
    this.tickSystem.onTick(
      () => {
        const duelSystem = (this.world as { duelSystem?: DuelSystem })
          .duelSystem;
        duelSystem?.processTick();
      },
      TickPriority.INPUT,
      "duelSystem",
    );

    // Register action queue to process inputs at INPUT priority
    this.tickSystem.onTick(
      (tickNumber) => {
        this.actionQueue.processTick(tickNumber);
      },
      TickPriority.INPUT,
      "actionQueue",
    );

    // Register tile movement to run on each tick (after inputs)
    this.tickSystem.onTick(
      (tickNumber) => {
        const t0 = Date.now();
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.onTick(tickNumber);
        const elapsed = Date.now() - t0;
        if (elapsed > 50) {
          console.warn(
            `[Tick] playerMovement: ${elapsed}ms for ${(this.world as { tileMovement?: TileMovementManager }).tileMovement?.getPlayerCount()} players`,
          );
        }
      },
      TickPriority.MOVEMENT,
      "playerMovement",
    );

    // MobTileMovementManager — migrated to @hyperforge/hyperscape
    // (Phase E2, 2026-04-26). Plugin onEnable owns construction.

    // OSRS-ACCURATE: Process mob AI BEFORE mob movement each tick
    // AI state machine (IDLE → WANDER → CHASE → ATTACK → RETURN) decides movement targets,
    // then mob tile movement executes the path on the same tick.
    // Without this, mobs stand idle forever because MobEntity.serverUpdate() defers
    // AI ticking to the tick system for deterministic OSRS ordering.
    const MOB_AI_DELTA_SECONDS = TICK_DURATION_MS / 1000;

    // Use type-indexed entity lookup instead of iterating all 221+ entities
    const getEntityManager = () =>
      this.world.getSystem("entity-manager") as
        | { getEntitiesByType?: (type: string) => Array<{ id: string }> }
        | undefined;

    this.tickSystem.onTick(
      () => {
        const t0 = Date.now();
        const em = getEntityManager();
        const mobs = em?.getEntitiesByType?.("mob") ?? [];
        let mobCount = 0;
        for (const entry of mobs) {
          const entity = this.world.entities.get(entry.id);
          // Duck-type MobEntity by `runAITick` method presence.
          const mob = entity as { runAITick?: (dt: number) => void } | null;
          if (!mob || typeof mob.runAITick !== "function") continue;
          // Run for ALL mobs including dead ones — runAITick handles death state
          // (position locking, respawn timer) since mobs are no longer in the hot set
          mob.runAITick(MOB_AI_DELTA_SECONDS);
          mobCount++;
        }
        const mobAIMs = Date.now() - t0;
        this._lastMobAITime = mobAIMs;
        if (mobAIMs > 30) {
          console.warn(`[Tick] MobAI: ${mobAIMs}ms for ${mobCount} mobs`);
        }
      },
      TickPriority.MOVEMENT,
      "mobAI",
    );

    // Register mob tile movement to run on each tick (same priority as player movement)
    // Runs AFTER mob AI so paths set by AI are executed this tick
    this.tickSystem.onTick(
      (tickNumber) => {
        const t0 = Date.now();
        (
          this.world as { mobTileMovement?: MobTileMovementManager }
        ).mobTileMovement?.onTick(tickNumber);
        this._lastMobMoveTime = Date.now() - t0;
      },
      TickPriority.MOVEMENT,
      "mobMovement",
    );

    // PendingAttackManager migrated to @hyperforge/hyperscape (Phase
    // D3, 2026-04-26). Plugin onEnable owns construction + the
    // getMobPosition / isMobAlive closures (which only need
    // `world.entities` — no ServerNetwork-internal state). Tick
    // callback resolves the instance lazily via `world.pendingAttackManager`.
    this.tickSystem.onTick(
      (tickNumber) => {
        const pam = (
          this.world as { pendingAttackManager?: PendingAttackManager }
        ).pendingAttackManager;
        pam?.processTick(tickNumber);
      },
      TickPriority.MOVEMENT,
      "pendingAttack",
    );

    // Water hazard recovery - automatically teleport agents out of water
    this.tickSystem.onTick(
      () => {
        const terrain = this.world.getSystem("terrain") as {
          getHeightAt?: (x: number, z: number) => number;
        } | null;

        if (!terrain?.getHeightAt) return;

        // Only check agent players, not all 221+ entities
        const em = getEntityManager();
        const players = em?.getEntitiesByType?.("player") ?? [];
        for (const entry of players) {
          const entity = this.world.entities.get(entry.id);
          if (entity && entity.data?.isAgent && entity.position) {
            const { x, z } = entity.position;
            const y = terrain.getHeightAt(x, z);

            if (
              typeof y === "number" &&
              Number.isFinite(y) &&
              y < getWaterThreshold()
            ) {
              console.warn(
                `[WaterRecovery] Agent ${entity.id} is in water (y=${y}), teleporting home.`,
              );

              // Get safe spawn position
              const [spawnX, baseY, spawnZ] = this.spawn.position;
              const spawnTerrainHeight = terrain.getHeightAt(spawnX, spawnZ);
              const safeY =
                typeof spawnTerrainHeight === "number" &&
                Number.isFinite(spawnTerrainHeight)
                  ? spawnTerrainHeight + 0.1
                  : baseY;

              this.world.emit("player:teleport", {
                playerId: entity.id,
                position: { x: spawnX, y: safeY, z: spawnZ },
                rotation: 0,
              });
            }
          }
        }
      },
      TickPriority.MOVEMENT,
      "waterRecovery",
    );

    // PendingGatherManager — migrated to @hyperforge/hyperscape
    // (Phase D5, 2026-04-26). Plugin onEnable owns construction +
    // the broadcast-callback closure. Tick callback resolves lazily.
    this.tickSystem.onTick(
      (tickNumber) => {
        const pgm = (
          this.world as { pendingGatherManager?: PendingGatherManager }
        ).pendingGatherManager;
        pgm?.processTick(tickNumber);
      },
      TickPriority.MOVEMENT,
      "pendingGather",
    );

    // PendingCookManager — migrated to @hyperforge/hyperscape
    // (Phase D4, 2026-04-26). Plugin onEnable owns construction +
    // the FireRegistry injection (looks up
    // `world.getSystem("processing")` itself). Tick callback
    // resolves lazily.
    this.tickSystem.onTick(
      (tickNumber) => {
        const pcm = (this.world as { pendingCookManager?: PendingCookManager })
          .pendingCookManager;
        pcm?.processTick(tickNumber);
      },
      TickPriority.MOVEMENT,
      "pendingCook",
    );

    // Follow manager — server-authoritative tracking of players
    // following other players. Constructor resolves
    // `world.tileMovement` (Phase B4 pinning) instead of taking the
    // service as a parameter.
    // FollowManager — migrated to @hyperforge/hyperscape (Phase D6,
    // 2026-04-26). Plugin onEnable owns construction.

    // Register follow processing (same priority as movement)
    // Pass tick number for OSRS-accurate 1-tick delay tracking
    this.tickSystem.onTick(
      (tickNumber) => {
        (
          this.world as { followManager?: FollowManager }
        ).followManager?.processTick(tickNumber);
      },
      TickPriority.MOVEMENT,
      "followManager",
    );

    // Pending trade manager — migrated to @hyperforge/hyperscape
    // (Phase D1). Plugin onEnable owns construction + pinning to
    // `world.pendingTradeManager`. ServerNetwork registers the tick
    // callback here; the callback resolves the instance lazily so
    // the order between `world.init()` (this code path) and
    // plugin.onEnable doesn't matter — by the first tick fire,
    // plugin has pinned the instance.
    this.tickSystem.onTick(
      () => {
        const ptm = (
          this.world as { pendingTradeManager?: PendingTradeManager }
        ).pendingTradeManager;
        ptm?.processTick();
      },
      TickPriority.MOVEMENT,
      "pendingTrade",
    );

    // Pending duel challenge manager — server-authoritative
    // "walk to player and challenge" system. Constructor resolves
    // PendingDuelChallengeManager — migrated to
    // @hyperforge/hyperscape (Phase D2). Plugin onEnable owns
    // construction + pinning to `world.pendingDuelChallengeManager`.
    // ServerNetwork registers the tick callback with lazy lookup.
    this.tickSystem.onTick(
      () => {
        const pdcm = (
          this.world as {
            pendingDuelChallengeManager?: PendingDuelChallengeManager;
          }
        ).pendingDuelChallengeManager;
        pdcm?.processTick();
      },
      TickPriority.MOVEMENT,
      "pendingDuel",
    );

    // Trading system instantiation moved to @hyperforge/hyperscape
    // plugin onEnable (2026-04-26). Plugin pins the instance to
    // `world.tradingSystem` so the existing `getTradingSystem(world)`
    // helper resolves unchanged.

    // Duel system instantiation + `world.duelSystem` pinning +
    // `systemsByName.set("duel", ...)` moved to @hyperforge/hyperscape
    // plugin onEnable (2026-04-26). Plugin owns the lifecycle. The
    // tickSystem callback + onPlayerDisconnect/Reconnect handlers
    // resolve `world.duelSystem` lazily, so plugin onEnable can run
    // either before or after ServerNetwork.init() — by the first
    // tick the property is set.

    // Look up the duel-stake-transfer bridge (registered in
    // startup/world.ts). It resolves ServerNetwork's socket accessor
    // lazily via `world.getSystem("network")`, so no wiring is needed
    // here.
    const duelStakeTransfer = this.world.getSystem(
      "duel-stake-transfer",
    ) as unknown as IDuelStakeTransfer | null;
    if (!duelStakeTransfer) {
      throw new Error(
        "[ServerNetwork] duel-stake-transfer bridge must be registered before ServerNetwork.init()",
      );
    }

    // Register duel world-event listeners before DuelSystem.init() so the duel
    // stake-settlement safety check sees the listener graph in its ready state.
    this.cleanupDuelEventListeners = registerDuelEventListeners({
      world: this.world,
      broadcastManager: this.broadcastManager,
      getSocketByPlayerId: this.getSocketByPlayerId.bind(this),
      processedDuelSettlements: this.processedDuelSettlements,
      executeDuelStakeTransferWithRetry: (winnerId, loserId, stakes, duelId) =>
        duelStakeTransfer.executeDuelStakeTransferWithRetry(
          winnerId,
          loserId,
          stakes,
          duelId,
        ),
    });

    // duelSystem.init() now owned by plugin onEnable (2026-04-26).

    // DuelScheduler and DuelBettingBridge construction moved to
    // startup/world.ts (post-world.init) as part of PLAN_SERVERNETWORK_MIGRATION.md
    // Step 6. Both classes are purely fire-and-forget after construction
    // (ServerNetwork never referenced the stored fields post-init), so
    // keeping them outside ServerNetwork removes two more server-only
    // imports blocking the relocation to shared.

    // Listen for player teleport events (used by duel system)
    this.onWorld("player:teleport", (event) => {
      const { playerId, position, rotation, suppressEffect } =
        event as PlayerTeleportPayload;

      // Validate position before processing
      if (
        !position ||
        typeof position.x !== "number" ||
        typeof position.z !== "number" ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.z)
      ) {
        console.warn(
          `[ServerNetwork] player:teleport received invalid position for ${playerId}:`,
          position,
        );
        return;
      }

      // Update player position on server
      const player = this.world.entities.players?.get(playerId);
      if (player?.position) {
        player.position.x = position.x;
        player.position.y = position.y ?? 0;
        player.position.z = position.z;
      }

      // CRITICAL: Update spatial index so sendToNearby() finds players at new location.
      // Without this, post-teleport tile movement broadcasts (e.g., combat follow)
      // won't reach players whose spatial index is still at their pre-teleport position.
      const teleportRegionChange = this.spatialIndex.updatePlayerPosition(
        playerId,
        position.x,
        position.z,
      );
      // Full region resubscription on teleport (may jump many regions)
      if (teleportRegionChange) {
        this.resubscribePlayerRegionTopics(
          playerId,
          teleportRegionChange.oldKey,
          position.x,
          position.z,
        );
      }

      // Clear any in-progress movement by cleaning up the player's movement state
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.cleanup(playerId);

      // CRITICAL: Sync position to TileMovementManager after teleport
      // Without this, movement system uses stale position and player appears stuck
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.syncPlayerPosition(playerId, position);

      // Clear any pending actions from before teleport (e.g., queued movements, combat actions)
      // This prevents stale actions from executing after teleport
      this.actionQueue.cleanup(playerId);

      // Send teleport to the teleporting player
      const socket = this.getSocketByPlayerId(playerId);
      const teleportPacket = {
        playerId,
        position: [position.x, position.y, position.z] as [
          number,
          number,
          number,
        ],
        rotation,
        ...(suppressEffect ? { suppressEffect: true } : {}),
      };
      if (socket) {
        socket.send("playerTeleport", teleportPacket);
      }

      // Broadcast teleport to ALL other clients so they see the teleport
      // This is critical for duel arena - both players need to see each other teleport
      // We send playerTeleport (not entityModified) because remote players have tile state
      // and entityModified position updates are skipped for tile-controlled entities
      this.broadcastManager.sendToAll(
        "playerTeleport",
        teleportPacket,
        socket?.id,
      );

      // CRITICAL: Sync animation state after teleport to prevent T-pose
      // Without this, remote players may show default pose until next animation change
      this.broadcastManager.sendToAll("entityModified", {
        id: playerId,
        changes: {
          e: "idle",
        },
      });
    });

    // Listen for movement cancel events (used by duel system to prevent escaping arena)
    this.onWorld("player:movement:cancel", (event) => {
      const { playerId } = event as PlayerMovementCancelPayload;

      // Clear movement state
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.cleanup(playerId);
    });

    // FaceDirectionManager — migrated to @hyperforge/hyperscape
    // (Phase D7, 2026-04-26). Plugin onEnable owns construction +
    // setSendFunction wiring. Tick callbacks (processFaceDirection
    // at COMBAT priority, resetMovementFlags at INPUT priority)
    // resolve `world.faceDirectionManager` lazily.
    this.tickSystem.onTick(
      () => {
        const fdm = (
          this.world as { faceDirectionManager?: FaceDirectionManager }
        ).faceDirectionManager;
        if (!fdm) return;

        const entitiesSystem = this.world.entities as {
          players?: Map<string, { id: string }>;
        } | null;
        if (!entitiesSystem?.players) return;

        const playerIds: string[] = [];
        for (const [playerId] of entitiesSystem.players) {
          playerIds.push(playerId);
        }
        if (playerIds.length > 0) {
          fdm.processFaceDirection(playerIds);
        }
      },
      TickPriority.COMBAT,
      "faceDirection",
    );

    this.tickSystem.onTick(
      () => {
        const fdm = (
          this.world as { faceDirectionManager?: FaceDirectionManager }
        ).faceDirectionManager;
        fdm?.resetMovementFlags();
      },
      TickPriority.INPUT,
      "resetMoveFlags",
    );

    // Register combat system to process on each tick (after movement, before AI)
    // This is OSRS-accurate: combat runs on the game tick, not per-frame
    this.tickSystem.onTick(
      (tickNumber) => {
        const t0 = Date.now();
        const combatSystem = this.world.getSystem("combat") as unknown as {
          processCombatTick(n: number): void;
        } | null;
        if (combatSystem) {
          combatSystem.processCombatTick(tickNumber);
        }
        this._lastCombatTime = Date.now() - t0;
      },
      TickPriority.COMBAT,
      "combat",
    );

    // Register death system to process on each tick (after combat)
    // Handles gravestone expiration and ground item despawn (OSRS-accurate tick-based timing)
    this.tickSystem.onTick(
      (tickNumber) => {
        const playerDeathSystem = this.world.getSystem(
          "player-death",
        ) as unknown as PlayerDeathSystemWithTick | undefined;
        if (
          playerDeathSystem &&
          typeof playerDeathSystem.processTick === "function"
        ) {
          playerDeathSystem.processTick(tickNumber);
        }
      },
      TickPriority.COMBAT,
      "playerDeath",
    );

    // Register loot system to process on each tick (after combat)
    // Handles mob corpse despawn (OSRS-accurate tick-based timing)
    this.tickSystem.onTick(
      (tickNumber) => {
        const lootSystem = this.world.getSystem("loot") as unknown as
          | PlayerDeathSystemWithTick
          | undefined;
        if (lootSystem && typeof lootSystem.processTick === "function") {
          lootSystem.processTick(tickNumber);
        }
      },
      TickPriority.COMBAT,
      "loot",
    );

    // Register resource gathering system to process on each tick (after combat)
    // OSRS-accurate: Woodcutting attempts every 4 ticks (2.4 seconds)
    this.tickSystem.onTick(
      (tickNumber) => {
        // ResourceSystem migrated. Duck-typed inline — only
        // `processGatheringTick` is called here.
        const resourceSystem = this.world.getSystem("resource") as unknown as {
          processGatheringTick?(tick: number): void;
        } | null;
        if (
          resourceSystem &&
          typeof resourceSystem.processGatheringTick === "function"
        ) {
          resourceSystem.processGatheringTick(tickNumber);
        }
      },
      TickPriority.RESOURCES,
      "resources",
    );

    // Register home teleport system to process on each tick
    // Handles cast completion and combat interruption checks
    this.tickSystem.onTick(
      (tickNumber) => {
        const manager = (
          this.world as { homeTeleportManager?: IHomeTeleportManager }
        ).homeTeleportManager;
        if (manager) {
          manager.processTick(tickNumber, (playerId: string) => {
            return this.broadcastManager.getPlayerSocket(playerId);
          });
        }
      },
      TickPriority.RESOURCES,
      "homeTeleport",
    );

    // Event loop lag detector — measures max time the event loop was blocked
    // between ticks using a high-frequency setTimeout probe
    let _maxEventLoopLag = 0;
    let _lagProbeExpected = Date.now();
    let _lagProbeStopped = false;
    const lagProbe = () => {
      if (_lagProbeStopped) return;
      const now = Date.now();
      const lag = now - _lagProbeExpected - 50; // Subtract expected 50ms interval
      if (lag > 0) {
        if (lag > _maxEventLoopLag) {
          _maxEventLoopLag = lag;
        }
        // Log significant blocks to server console to help identify the source
        if (lag > 200) {
          console.warn(
            `[EventLoop] ⚠️ Blocked for ${lag}ms at tick ${this.world.currentTick}`,
          );
        }
      }
      _lagProbeExpected = now + 50;
      this._lagProbeTimer = setTimeout(lagProbe, 50);
    };
    this._lagProbeTimer = setTimeout(lagProbe, 50);
    // Expose stop function for destroy() cleanup
    this._stopLagProbe = () => {
      _lagProbeStopped = true;
      if (this._lagProbeTimer) {
        clearTimeout(this._lagProbeTimer);
        this._lagProbeTimer = null;
      }
    };

    // Broadcast tick health stats to clients for DevStats panel (every 5th tick = 3s)
    this.tickSystem.onTick(
      (tickNumber) => {
        if (tickNumber % 5 !== 0) return;
        const stats = this.tickSystem.getTickHealthStats();
        // Include per-phase timing breakdown so DevStats can show WHERE time goes
        const phaseTimings = {
          mobAI: this._lastMobAITime,
          mobMove: this._lastMobMoveTime,
          combat: this._lastCombatTime,
        };
        const eventLoopLag = _maxEventLoopLag;
        _maxEventLoopLag = 0; // Reset after reporting
        const broadcastMs = this.broadcastManager.drainSendTimeMs();
        const pubsubPublishes = this.broadcastManager.drainPubsubStats();
        const payload: Record<string, unknown> = {
          ...stats,
          phaseTimings,
          eventLoopLag,
          broadcastMs,
          pubsubPublishes,
        };
        // Only expose internal server state in non-production environments
        if (process.env.NODE_ENV !== "production") {
          payload.transport =
            process.env.UWS_ENABLED !== "false" ? "uws" : "ws";
          payload.connections = this.sockets.size;
        }
        this.broadcastManager.sendToAll("tickHealth", payload);
      },
      TickPriority.BROADCAST,
      "tickHealthBroadcast",
    );

    // NOTE: Explicit GC scheduling removed — Bun.gc(false) callbacks piled up
    // when ticks fell behind, creating a death spiral of competing GC passes.
    // Let the runtime handle GC naturally.

    // Socket manager
    this.socketManager = new SocketManager(
      this.sockets,
      this.world,
      this.broadcastManager.sendToAll.bind(this.broadcastManager),
    );
    this.socketManager.setBroadcastManager(this.broadcastManager);

    // Clean up player state when player disconnects (prevents memory leak)
    this.onWorld(EventType.PLAYER_LEFT, (event: { playerId: string }) => {
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.cleanup(event.playerId);
      this.actionQueue.cleanup(event.playerId);
      this.spatialIndex.removePlayer(event.playerId);
      const entityManager = this.world.getSystem("entity-manager") as {
        unregisterPlayer?: (playerId: string) => void;
      } | null;
      entityManager?.unregisterPlayer?.(event.playerId);
      this.processingRateLimiter.delete(event.playerId);
      // Release agent dashboard socket reference so disconnected socket can be GC'd
      ServerNetwork.characterSockets.delete(event.playerId);
      ServerNetwork.agentGoals.delete(event.playerId);
      ServerNetwork.agentAvailableGoals.delete(event.playerId);
      ServerNetwork.agentGoalsPaused.delete(event.playerId);
      ServerNetwork.agentThoughts.delete(event.playerId);
      ServerNetwork.agentPersonality.delete(event.playerId);
      ServerNetwork.agentDesireScores.delete(event.playerId);
    });

    // Seed spatial index on initial join so sendToNearby() works from first tick
    // Also subscribe the socket to its 9 region topics for pub/sub
    this.onWorld(EventType.PLAYER_JOINED, (payload: unknown) => {
      const event = payload as {
        playerId: string;
        player: { position: { x: number; z: number } };
      };
      if (event.player?.position) {
        this.spatialIndex.updatePlayerPosition(
          event.playerId,
          event.player.position.x,
          event.player.position.z,
        );
        // Subscribe to region topics for pub/sub
        this.subscribePlayerRegionTopics(
          event.playerId,
          event.player.position.x,
          event.player.position.z,
        );
      }
    });

    // Keep spatial index updated so sendToNearby() works
    // Also update pub/sub region subscriptions on region change
    this.onWorld(EventType.PLAYER_POSITION_UPDATED, (payload: unknown) => {
      const event = payload as {
        playerId: string;
        position: { x: number; z: number };
      };
      const regionChange = this.spatialIndex.updatePlayerPosition(
        event.playerId,
        event.position.x,
        event.position.z,
      );
      // Update pub/sub subscriptions on region change
      if (regionChange) {
        this.updatePlayerRegionSubscriptions(
          event.playerId,
          regionChange.oldKey,
          regionChange.newKey,
        );
      }
    });

    // Reset agility progress on death (small penalty - lose accumulated tiles toward next XP grant)
    this.onWorld(EventType.ENTITY_DEATH, (eventData) => {
      const event = eventData as { entityId: string; entityType: string };
      if (event.entityType === "player") {
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.resetAgilityProgress(event.entityId);
      }
    });

    // Sync tile position when player respawns at spawn point
    // CRITICAL: Without this, TileMovementManager has stale tile position from death location
    // and paths would be calculated from wrong starting tile
    this.onWorld(EventType.PLAYER_RESPAWNED, (eventData) => {
      const event = eventData as EventMap[typeof EventType.PLAYER_RESPAWNED];
      if (event.playerId && event.spawnPosition) {
        const pos = event.spawnPosition;
        // spawnPosition can be {x,y,z} or number[] — normalize
        const position = Array.isArray(pos)
          ? { x: pos[0], y: pos[1], z: pos[2] }
          : pos;
        // Validate position before syncing
        if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
          console.warn(
            `[ServerNetwork] PLAYER_RESPAWNED invalid position for ${event.playerId}:`,
            position,
          );
          return;
        }
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.syncPlayerPosition(event.playerId, position);
        const respawnRegionChange = this.spatialIndex.updatePlayerPosition(
          event.playerId,
          position.x,
          position.z,
        );
        // Full region resubscription on respawn
        if (respawnRegionChange) {
          this.resubscribePlayerRegionTopics(
            event.playerId,
            respawnRegionChange.oldKey,
            position.x,
            position.z,
          );
        }
        // Also clear any pending actions from before death
        this.actionQueue.cleanup(event.playerId);
        console.log(
          `[ServerNetwork] Synced tile position for respawned player ${event.playerId} at (${position.x}, ${position.z})`,
        );
      }
    });

    // Sync tile position when player teleports home
    // CRITICAL: Without this, TileMovementManager has stale tile position from pre-teleport location
    // and paths would be calculated from wrong starting tile, causing player to snap back
    this.onWorld(EventType.HOME_TELEPORT_COMPLETE, (eventData) => {
      const event = eventData as {
        playerId: string;
        position: { x: number; y: number; z: number };
      };
      if (event.playerId && event.position) {
        // Validate position before syncing
        if (
          !Number.isFinite(event.position.x) ||
          !Number.isFinite(event.position.z)
        ) {
          console.warn(
            `[ServerNetwork] HOME_TELEPORT_COMPLETE invalid position for ${event.playerId}:`,
            event.position,
          );
          return;
        }
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.syncPlayerPosition(event.playerId, event.position);
        // Clear any pending actions from before teleport
        this.actionQueue.cleanup(event.playerId);
      }
    });

    // Handle mob tile movement requests from MobEntity AI
    this.onWorld(EventType.MOB_NPC_MOVE_REQUEST, (event) => {
      const moveEvent = event as {
        mobId: string;
        targetPos: { x: number; y: number; z: number };
        targetEntityId?: string;
        tilesPerTick?: number;
      };
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.requestMoveTo(
        moveEvent.mobId,
        moveEvent.targetPos,
        moveEvent.targetEntityId || null,
        moveEvent.tilesPerTick,
      );
    });

    // Initialize mob tile movement state on spawn
    // This ensures mobs have proper tile state from the moment they're created
    this.onWorld(EventType.MOB_NPC_SPAWNED, (event) => {
      const spawnEvent = event as {
        mobId: string;
        mobType: string;
        position: { x: number; y: number; z: number };
      };
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.initializeMob(
        spawnEvent.mobId,
        spawnEvent.position,
        2, // Default walk speed: 2 tiles per tick
      );
    });

    // Clean up mob tile movement state on mob death
    // This immediately clears stale tile state when mob dies
    this.onWorld(EventType.NPC_DIED, (event) => {
      const diedEvent = event as EventMap[typeof EventType.NPC_DIED];
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.cleanup(diedEvent.mobId);
    });

    // Clean up mob tile movement state on mob despawn (backup cleanup)
    this.onWorld(EventType.MOB_NPC_DESPAWNED, (event) => {
      const despawnEvent = event as { mobId: string };
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.cleanup(despawnEvent.mobId);
    });

    // CRITICAL: Reinitialize mob tile state on respawn
    // Without this, the mob's tile state has stale currentTile from death location
    // causing teleportation when the mob starts moving again
    this.onWorld(EventType.MOB_NPC_RESPAWNED, (event) => {
      const respawnEvent =
        event as EventMap[typeof EventType.MOB_NPC_RESPAWNED];
      // Clear old state and initialize at new spawn position
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.cleanup(respawnEvent.mobId);
      (
        this.world as { mobTileMovement?: MobTileMovementManager }
      ).mobTileMovement?.initializeMob(
        respawnEvent.mobId,
        respawnEvent.position,
        2, // Default walk speed: 2 tiles per tick
      );
    });

    // Combat follow: When player is in combat but out of range, move toward target
    // OSRS-style: "if the clicked entity is an NPC or player, a new pathfinding attempt
    // will be started every tick, until a target tile can be found"
    this.onWorld(EventType.COMBAT_FOLLOW_TARGET, (event) => {
      const followEvent =
        event as EventMap[typeof EventType.COMBAT_FOLLOW_TARGET];
      // Use OSRS-style pathfinding with appropriate range and type
      // MELEE: Cardinal-only for range 1, RANGED/MAGIC: Chebyshev distance
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.movePlayerToward(
        followEvent.playerId,
        followEvent.targetPosition,
        true, // Run toward target
        followEvent.attackRange ?? 1, // Default to standard melee range
        followEvent.attackType ?? AttackType.MELEE, // Default to melee if not specified
      );
    });

    // OSRS-accurate: Cancel pending attack when player clicks elsewhere
    this.onWorld(EventType.PENDING_ATTACK_CANCEL, (event) => {
      const { playerId } =
        event as EventMap[typeof EventType.PENDING_ATTACK_CANCEL];
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.cancelPendingAttack(playerId);
    });

    // OSRS-accurate: Move player to adjacent tile after lighting fire
    // Priority: West → East → South → North (handled by ProcessingSystem)
    // Uses proper tile movement for smooth walking animation (not teleport)
    this.onWorld(EventType.FIREMAKING_MOVE_REQUEST, (event) => {
      const payload =
        event as EventMap[typeof EventType.FIREMAKING_MOVE_REQUEST];
      const { playerId, position } = payload;

      // Get player entity
      const socket = this.broadcastManager.getPlayerSocket(playerId);
      const player = socket?.player;
      if (!player) {
        console.warn(
          `[ServerNetwork] Cannot find player for firemaking move: ${playerId}`,
        );
        return;
      }

      // OSRS-accurate: Use tile movement system for smooth walking animation
      // Walking (not running) to adjacent tile, meleeRange=0 means go directly to tile
      // This sends tileMovementStart packet for smooth client interpolation
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.movePlayerToward(
        playerId,
        position,
        false, // OSRS firemaking step is a walk, not a run
        0, // meleeRange=0 = non-combat, go directly to the tile
      );
    });

    // Handle player emote changes from ProcessingSystem (firemaking, cooking)
    this.onWorld(EventType.PLAYER_SET_EMOTE, (event) => {
      const { playerId, emote } =
        event as EventMap[typeof EventType.PLAYER_SET_EMOTE];

      // Broadcast emote change to nearby clients
      const entity = this.world.entities?.get(playerId);
      if (entity?.position) {
        this.broadcastManager.sendToNearby(
          "entityModified",
          { id: playerId, changes: { e: emote } },
          entity.position.x,
          entity.position.z,
        );
      } else {
        this.broadcastManager.sendToAll("entityModified", {
          id: playerId,
          changes: { e: emote },
        });
      }
    });

    // Save manager
    this.saveManager = new SaveManager(this.world, this.db);

    // Position validator - pass getSocketByPlayerId for client reconciliation
    this.positionValidator = new PositionValidator(
      this.world,
      this.sockets,
      this.broadcastManager,
      this.getSocketByPlayerId.bind(this),
    );

    // Event bridge — created via the server-network factory bridge.
    this.eventBridge = this.getManagerFactory().createEventBridge(
      this.world,
      this.broadcastManager,
    );

    // Interaction session manager (server-authoritative UI sessions)
    this.interactionSessionManager = new InteractionSessionManager(
      this.world,
      this.broadcastManager,
    );
    this.interactionSessionManager.initialize(this.tickSystem);

    // Store session manager on world so handlers can access it (single source of truth)
    // This replaces the previous pattern of storing entity IDs on socket properties
    (
      this.world as { interactionSessionManager?: InteractionSessionManager }
    ).interactionSessionManager = this.interactionSessionManager;

    // Clean up interaction sessions, pending attacks, follows, gathers, cooks, trades, duels, and home teleport when player disconnects
    this.onWorld(EventType.PLAYER_LEFT, (event: { playerId: string }) => {
      this.interactionSessionManager.onPlayerDisconnect(event.playerId);
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.onPlayerDisconnect(event.playerId);
      (
        this.world as { followManager?: FollowManager }
      ).followManager?.onPlayerDisconnect(event.playerId);
      const pgm = (
        this.world as { pendingGatherManager?: PendingGatherManager }
      ).pendingGatherManager;
      pgm?.onPlayerDisconnect(event.playerId);
      const pcm = (this.world as { pendingCookManager?: PendingCookManager })
        .pendingCookManager;
      pcm?.onPlayerDisconnect(event.playerId);
      const ptm = (this.world as { pendingTradeManager?: PendingTradeManager })
        .pendingTradeManager;
      ptm?.onPlayerDisconnect(event.playerId);
      const pdcm = (
        this.world as {
          pendingDuelChallengeManager?: PendingDuelChallengeManager;
        }
      ).pendingDuelChallengeManager;
      pdcm?.onPlayerDisconnect(event.playerId);
      const duelSystem = (this.world as { duelSystem?: DuelSystem }).duelSystem;
      duelSystem?.onPlayerDisconnect(event.playerId);
      const homeTeleportManager = (
        this.world as { homeTeleportManager?: IHomeTeleportManager }
      ).homeTeleportManager;
      homeTeleportManager?.onPlayerDisconnect(event.playerId);
    });

    // Handle player reconnection (clears disconnect timer if active duel)
    this.onWorld(EventType.PLAYER_JOINED, (event: { playerId: string }) => {
      const duelSystem = (this.world as { duelSystem?: DuelSystem }).duelSystem;
      duelSystem?.onPlayerReconnect(event.playerId);
    });

    // Initialization manager
    this.initializationManager = new InitializationManager(this.world, this.db);

    // Connection handler — created via the server-network factory bridge.
    this.connectionHandler = this.getManagerFactory().createConnectionHandler({
      world: this.world,
      sockets: this.sockets,
      broadcastManager: this.broadcastManager,
      db: this.db as unknown as import("./interfaces").IDatabaseSystem,
      spectatorsByPlayer: this.spectatorsByPlayer,
    });
    this.connectionHandler.setSpatialIndex(this.spatialIndex);

    // Register handlers
    this.registerHandlers();

    // Start the core game tick loop
    // Without this, the server is completely frozen (no movement, combat, or AI processing)
    this.tickSystem.start();
  }

  /**
   * Register all packet handlers
   *
   * Sets up the handler registry with delegates to modular handlers.
   */
  private registerHandlers(): void {
    this.handlers["enterWorld"] = (socket, data) =>
      this.handleEnterWorldWithReconnect(socket, data);

    // "onPing" has been migrated to the IPacketHandlerRegistry bridge —
    // see packages/server/src/startup/packetHandlerRegistration.ts.
    // PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative.

    // "onChatAdded" migrated to the IPacketHandlerRegistry bridge —
    // see packages/server/src/startup/packetHandlerRegistration.ts.

    // "onCommand" migrated to the IPacketHandlerRegistry bridge —
    // see packages/server/src/startup/packetHandlerRegistration.ts.

    // "onEntityModified", "onEntityEvent", "onEntityRemoved", and
    // "onSettingsModified" migrated to the IPacketHandlerRegistry bridge —
    // see packages/server/src/startup/packetHandlerRegistration.ts.

    // Processing/skill handlers (onResourceInteract, onResourceGather,
    // onCooking*, onFiremakingRequest, onSmelting*, onSmithing*,
    // onProcessing*, onCrafting*, onFletching*, onRunecraftingAltarInteract,
    // and their legacy aliases `firemakingRequest`, `cookingRequest`,
    // `runecraftingAltarInteract`) all migrated to the
    // IPacketHandlerRegistry bridge — see
    // packages/server/src/startup/packetHandlerRegistration.ts.

    // Movement is processed immediately — pathfinding and tileMovementStart broadcast
    // happen on packet receipt, not at the next tick boundary. Walking itself still
    // advances on the 600ms tick schedule via onTick(). This matches the documented
    // 30 Hz client input rate and removes the 0–600ms ActionQueue delay.
    this.handlers["onMoveRequest"] = (socket, data) => {
      // Cancel any pending actions when player moves elsewhere (OSRS behavior)
      if (socket.player) {
        this.cancelAllPendingActions(socket.player.id, socket);
      }
      (
        this.world as { tileMovement?: TileMovementManager }
      ).tileMovement?.handleMoveRequest(socket, data);
    };

    this.handlers["onInput"] = (socket, data) => {
      // Legacy input handler - convert clicks to immediate move request
      const payload = data as LegacyInputPayload;
      if (payload.type === "click" && Array.isArray(payload.target)) {
        // Cancel any pending actions when player moves elsewhere (OSRS behavior)
        if (socket.player) {
          this.cancelAllPendingActions(socket.player.id, socket);
        }
        (
          this.world as { tileMovement?: TileMovementManager }
        ).tileMovement?.handleMoveRequest(socket, {
          target: payload.target,
          runMode: payload.runMode,
        });
      }
    };

    // Combat - server-authoritative "walk to and attack" system
    // OSRS-style: If in attack range, start combat immediately; otherwise queue pending attack
    // Melee range is CARDINAL ONLY for range 1, ranged/magic use Chebyshev distance
    this.handlers["onAttackMob"] = (socket, data) => {
      const playerEntity = socket.player;
      if (!playerEntity) {
        traceAttackMob("drop:no_player_on_socket", {
          socketId: socket.id,
          accountId: socket.accountId,
        });
        return;
      }

      const payload = data as AttackMobPayload;
      const targetId = payload.mobId || payload.targetId;
      traceAttackMob("packet:received", {
        socketId: socket.id,
        playerId: playerEntity.id,
        payloadMobId: payload.mobId,
        payloadTargetId: payload.targetId,
        tick: this.world.currentTick,
      });
      if (!targetId) {
        traceAttackMob("drop:missing_target_id", {
          socketId: socket.id,
          playerId: playerEntity.id,
        });
        return;
      }

      // Get mob entity directly from world entities
      const mobEntity = this.world.entities.get(targetId) as {
        position?: { x: number; y: number; z: number };
        config?: { currentHealth?: number; maxHealth?: number };
        type?: string;
      } | null;

      if (!mobEntity || !mobEntity.position) {
        traceAttackMob("drop:target_not_found_or_no_position", {
          playerId: playerEntity.id,
          targetId,
          hasMobEntity: Boolean(mobEntity),
        });
        return;
      }

      const redundantReason = this.getRedundantAttackReason(
        playerEntity.id,
        targetId,
        "mob",
      );
      if (redundantReason) {
        traceAttackMob("action:noop_redundant_same_target", {
          playerId: playerEntity.id,
          targetId,
          reason: redundantReason,
          tick: this.world.currentTick,
        });
        return;
      }

      // Cancel any existing combat, pending attacks, and queued actions when switching targets.
      // Re-clicking the same active/pending target is intentionally ignored above so repeated
      // clicks cannot reset attack timers or stall combat.
      this.world.emit(EventType.COMBAT_STOP_ATTACK, {
        attackerId: playerEntity.id,
      });
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.cancelPendingAttack(playerEntity.id);
      this.actionQueue.cancelActions(playerEntity.id);
      (
        this.world as { followManager?: FollowManager }
      ).followManager?.stopFollowing(playerEntity.id);
      if (mobEntity.type !== "mob") {
        traceAttackMob("drop:target_not_mob", {
          playerId: playerEntity.id,
          targetId,
          targetType: mobEntity.type ?? null,
        });
        return;
      }
      const targetHealth = mobEntity.config?.currentHealth ?? 0;
      if (targetHealth <= 0) {
        traceAttackMob("drop:target_dead", {
          playerId: playerEntity.id,
          targetId,
          targetHealth,
        });
        return;
      }

      // Get player's weapon range and attack type from equipment system
      const attackRange = this.getPlayerWeaponRange(playerEntity.id);
      const attackType = this.getPlayerAttackType(playerEntity.id);

      // Get tiles for range check
      const playerPos = playerEntity.position;
      const playerTile = worldToTile(playerPos.x, playerPos.z);
      const targetTile = worldToTile(
        mobEntity.position.x,
        mobEntity.position.z,
      );
      const inRange = this.isInAttackRange(
        playerTile,
        targetTile,
        attackType,
        attackRange,
      );

      traceAttackMob("range:checked", {
        playerId: playerEntity.id,
        targetId,
        attackType,
        attackRange,
        playerTileX: playerTile.x,
        playerTileZ: playerTile.z,
        targetTileX: targetTile.x,
        targetTileZ: targetTile.z,
        inRange,
      });

      // Check if in attack range (melee uses cardinal-only, ranged/magic use Chebyshev)
      if (inRange) {
        // In range - start combat immediately via action queue
        traceAttackMob("action:queue_combat_now", {
          playerId: playerEntity.id,
          targetId,
          tick: this.world.currentTick,
        });
        this.actionQueue.queueCombat(socket, data);
      } else {
        // Not in range - queue pending attack (server handles OSRS-style pathfinding)
        traceAttackMob("action:queue_pending_attack", {
          playerId: playerEntity.id,
          targetId,
          attackRange,
          attackType,
          tick: this.world.currentTick,
        });
        (
          this.world as { pendingAttackManager?: PendingAttackManager }
        ).pendingAttackManager?.queuePendingAttack(
          playerEntity.id,
          targetId,
          this.world.currentTick,
          attackRange,
          "mob",
          attackType,
        );
      }
    };

    // PvP - attack another player (only in PvP zones)
    this.handlers["onAttackPlayer"] = (socket, data) => {
      const playerEntity = socket.player;
      if (!playerEntity) return;

      const payload = data as AttackPlayerPayload;
      const targetPlayerId = payload.targetPlayerId;
      if (!targetPlayerId) return;

      // Get target player entity
      const targetPlayer = this.world.entities?.players?.get(
        targetPlayerId,
      ) as {
        position?: { x: number; y: number; z: number };
      } | null;

      if (!targetPlayer || !targetPlayer.position) return;

      const redundantReason = this.getRedundantAttackReason(
        playerEntity.id,
        targetPlayerId,
        "player",
      );
      if (redundantReason) return;

      // Cancel any existing combat, pending attacks, and queued actions when switching targets.
      // Re-clicking the same active/pending target is intentionally ignored above so repeated
      // clicks cannot reset attack timers or stall combat.
      this.world.emit(EventType.COMBAT_STOP_ATTACK, {
        attackerId: playerEntity.id,
      });
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.cancelPendingAttack(playerEntity.id);
      this.actionQueue.cancelActions(playerEntity.id);
      (
        this.world as { followManager?: FollowManager }
      ).followManager?.stopFollowing(playerEntity.id);

      // Get player's weapon range and attack type from equipment system
      const attackRange = this.getPlayerWeaponRange(playerEntity.id);
      const attackType = this.getPlayerAttackType(playerEntity.id);

      // Get tiles for range check
      const playerPos = playerEntity.position;
      const playerTile = worldToTile(playerPos.x, playerPos.z);
      const targetTile = worldToTile(
        targetPlayer.position.x,
        targetPlayer.position.z,
      );

      // Check if in attack range (melee uses cardinal-only, ranged/magic use Chebyshev)
      if (
        this.isInAttackRange(playerTile, targetTile, attackType, attackRange)
      ) {
        // In range - delegate to plugin's combat attack service for
        // duel/PvP-zone validation + COMBAT_ATTACK_REQUEST emit.
        // The plugin installs `world.combatAttackService` at onEnable
        // (Phase F3 batch-9 substrate). If absent (PIE editor / tests
        // without the plugin loaded), the call is a silent no-op.
        const combatAttackService = (
          this.world as { combatAttackService?: ICombatAttackService }
        ).combatAttackService;
        combatAttackService?.attackPlayer(socket, data, this.world);
      } else {
        // Not in range - validate zones first, then queue pending attack
        // Zone validation happens in handleAttackPlayer, so we do basic checks here
        const zoneSystem = this.world.getSystem("zone-detection") as {
          isPvPEnabled?: (pos: { x: number; z: number }) => boolean;
        } | null;

        if (zoneSystem?.isPvPEnabled) {
          const attackerPos = playerEntity.position;
          if (
            !attackerPos ||
            !zoneSystem.isPvPEnabled({ x: attackerPos.x, z: attackerPos.z })
          ) {
            // Attacker not in PvP zone - silently ignore
            return;
          }
          if (
            !zoneSystem.isPvPEnabled({
              x: targetPlayer.position.x,
              z: targetPlayer.position.z,
            })
          ) {
            // Target not in PvP zone - silently ignore
            return;
          }
        }

        // Queue pending attack - will move toward target and attack when in range
        (
          this.world as { pendingAttackManager?: PendingAttackManager }
        ).pendingAttackManager?.queuePendingAttack(
          playerEntity.id,
          targetPlayerId,
          this.world.currentTick,
          attackRange,
          "player", // PvP target type
          attackType,
        );
      }
    };

    // Follow another player (OSRS-style) migrated to @hyperforge/hyperscape
    // (Phase F3 batch-2, 2026-04-26). Plugin onEnable registers
    // `onFollowPlayer` via `world.connectionRegistry`; pre-handler logic
    // (cancelPendingAttack) is inlined plugin-side.

    // Combat-style toggles (onChangeAttackStyle, onSetAutoRetaliate),
    // inventory (onPickup/Drop/Equip/Use/Unequip/Move/CoinPouchWithdraw/
    // XpLampUse), prayer (onPrayerToggle + alias, onPrayerDeactivateAll +
    // alias, onAltarPray + alias), magic (onSetAutocast + alias),
    // action-bar (onActionBarSave + alias, onActionBarLoad + alias), and
    // corpse-loot (onCorpseLootAll + alias) migrated to the
    // IPacketHandlerRegistry bridge — see
    // packages/server/src/startup/packetHandlerRegistration.ts.

    // Player name change, death/respawn, home teleport, character selection
    // (list/create/selected) handlers
    // have been migrated to the IPacketHandlerRegistry bridge —
    // see packages/server/src/startup/packetHandlerRegistration.ts.

    this.handlers["onEnterWorld"] = (socket, data) =>
      this.handleEnterWorldWithReconnect(socket, data);
    this.handlers["enterWorld"] = (socket, data) =>
      this.handleEnterWorldWithReconnect(socket, data);

    // Client ready handler - player is now active and can be targeted
    // Sent by client when all assets have finished loading
    this.handlers["onClientReady"] = (socket) => {
      if (!socket.player) {
        // Spectators do not own a player entity and still emit clientReady after
        // finishing viewport load. Treat this as expected.
        if (socket.isSpectator === true) {
          return;
        }

        const isRegistered = this.sockets.has(socket.id);
        const hasIdentity =
          !!socket.accountId ||
          !!socket.characterId ||
          !!socket.selectedCharacterId;

        // Ignore stale clientReady packets from sockets already removed from
        // active registry (observed during rapid reconnect/disconnect churn).
        if (!isRegistered) {
          if (IS_PLAYWRIGHT_TEST) {
            warnPlaywrightThrottled(
              "clientReady_stale_socket",
              "[PlayerLoading] Ignoring clientReady from stale socket",
              {
                socketId: socket.id,
                accountId: socket.accountId,
                characterId: socket.characterId,
                selectedCharacterId: socket.selectedCharacterId,
              },
            );
          }
          return;
        }

        // Anonymous sockets should not buffer readiness in E2E mode.
        if (IS_PLAYWRIGHT_TEST && !hasIdentity) {
          warnPlaywrightThrottled(
            "clientReady_missing_identity",
            "[PlayerLoading] Ignoring clientReady without account/character identity",
            {
              socketId: socket.id,
              isRegistered,
            },
          );
          return;
        }

        socket.pendingClientReady = true;
        warnPlaywrightThrottled(
          "clientReady_buffered",
          "[PlayerLoading] clientReady received before player attach; buffering",
          {
            socketId: socket.id,
            accountId: socket.accountId,
            characterId: socket.characterId,
            selectedCharacterId: socket.selectedCharacterId,
            isRegistered,
          },
        );
        return;
      }

      const player = socket.player;

      // Validate ownership - only the owning socket can mark player as ready
      if (player.data.owner !== socket.id) {
        console.warn(
          `[PlayerLoading] clientReady rejected: socket ${socket.id} doesn't own player ${player.id}`,
        );
        return;
      }

      // Ignore duplicate clientReady packets (idempotent)
      if (!player.data.isLoading) {
        return;
      }

      console.log(
        `[PlayerLoading] Received clientReady from player ${player.id}`,
      );
      console.log(
        `[PlayerLoading] Player ${player.id} isLoading: ${player.data.isLoading} -> false`,
      );

      // Mark player as no longer loading
      player.data.isLoading = false;
      if (socket.clientReadyTimeoutId) {
        clearTimeout(socket.clientReadyTimeoutId);
        socket.clientReadyTimeoutId = undefined;
      }

      // Broadcast state change to all clients
      this.broadcastManager.sendToAll("entityModified", {
        id: player.id,
        changes: { isLoading: false },
      });

      console.log(
        `[PlayerLoading] Player ${player.id} now active and targetable`,
      );

      // Emit event for other systems
      this.world.emit(EventType.PLAYER_READY, {
        playerId: player.id,
      });
    };

    // Agent goal sync handler - stores goal and available goals for dashboard display
    this.handlers["onSyncGoal"] = (socket, data) => {
      const goalData = data as AgentGoalSyncPayload;
      if (goalData.characterId) {
        // Store goal
        ServerNetwork.agentGoals.set(goalData.characterId, goalData.goal);

        // Store available goals if provided
        if (goalData.availableGoals) {
          ServerNetwork.agentAvailableGoals.set(
            goalData.characterId,
            goalData.availableGoals,
          );
        }

        // Store personality traits if provided
        if (goalData.personality) {
          ServerNetwork.agentPersonality.set(
            goalData.characterId,
            goalData.personality,
          );
        }

        // Store desire scores if provided
        if (goalData.desireScores) {
          ServerNetwork.agentDesireScores.set(
            goalData.characterId,
            goalData.desireScores,
          );
        }

        // Track socket for this character (for sending goal overrides)
        ServerNetwork.characterSockets.set(goalData.characterId, socket);
        this.trimAgentDashboardCaches();

        if (DEBUG_AGENT_DASHBOARD_SYNC) {
          console.log(
            `[ServerNetwork] Goal synced for character ${goalData.characterId}:`,
            goalData.goal ? "active" : "cleared",
            goalData.availableGoals
              ? `(${goalData.availableGoals.length} available goals)`
              : "",
          );
        }
      }
    };

    // Agent thought sync handler - stores agent thought process for dashboard display
    this.handlers["onSyncAgentThought"] = (_socket, data) => {
      const thoughtData = data as AgentThoughtSyncPayload;

      if (thoughtData.characterId && thoughtData.thought) {
        // Get existing thoughts or create new array
        const thoughts =
          ServerNetwork.agentThoughts.get(thoughtData.characterId) || [];

        // Add new thought at the beginning (most recent first)
        thoughts.unshift(thoughtData.thought);

        // Limit stored thoughts
        if (thoughts.length > ServerNetwork.MAX_THOUGHTS_PER_AGENT) {
          thoughts.length = ServerNetwork.MAX_THOUGHTS_PER_AGENT;
        }

        ServerNetwork.agentThoughts.set(thoughtData.characterId, thoughts);
        this.trimAgentDashboardCaches();

        if (DEBUG_AGENT_DASHBOARD_SYNC) {
          console.log(
            `[ServerNetwork] Agent thought synced for character ${thoughtData.characterId}: [${thoughtData.thought.type}]`,
          );
        }
      }
    };

    // All bank handlers (onBankOpen/Deposit/Withdraw/etc. + every `bank*`
    // alias), onRequestBankState (+ `requestBankState` alias), and keepalive
    // (+ alias) migrated to the IPacketHandlerRegistry bridge — see
    // packages/server/src/startup/packetHandlerRegistration.ts.

    // NPC interact, generic entity interact, quest mutations
    // (onQuestAccept/Abandon/Complete + aliases), and store handlers
    // (onStoreOpen/Buy/Sell/Close) migrated to the IPacketHandlerRegistry
    // bridge — see packages/server/src/startup/packetHandlerRegistration.ts.

    // Trade handlers (onTradeRequest/RequestRespond/AddItem/RemoveItem/
    // SetItemQuantity/Accept/CancelAccept/Cancel + all legacy aliases)
    // migrated to the IPacketHandlerRegistry bridge — see
    // packages/server/src/startup/packetHandlerRegistration.ts.

    // Duel handlers (challenge/challenge:respond/toggle:rule/toggle:equipment/
    // accept:rules/cancel/add:stake/remove:stake/accept:stakes/accept:final/
    // forfeit + `onDuel:*` aliases) migrated to the IPacketHandlerRegistry
    // bridge — see packages/server/src/startup/packetHandlerRegistration.ts.

    // Friend/social/ignore/private-message handlers (onFriendRequest/Accept/
    // Decline/Remove, onIgnoreAdd/Remove, onPrivateMessage + aliases)
    // migrated to the IPacketHandlerRegistry bridge — see
    // packages/server/src/startup/packetHandlerRegistration.ts.
  }

  /**
   * Enter world handler with reconnection support.
   *
   * If the player disconnected within the 30-second grace period, their entity
   * is still alive in-world. This method checks for that case first and
   * re-associates the entity with the new socket, skipping the full spawn flow.
   */
  private async handleEnterWorldWithReconnect(
    socket: ServerSocket,
    data: unknown,
  ): Promise<void> {
    const accountId = socket.accountId;
    if (accountId) {
      const reconnectedPlayerId = this.socketManager.tryReconnect(
        accountId,
        socket,
      );
      if (reconnectedPlayerId) {
        const sendToFn = this.broadcastManager.sendToSocket.bind(
          this.broadcastManager,
        );
        const sendFn = this.broadcastManager.sendToAll.bind(
          this.broadcastManager,
        );

        // Update entity ownership to new socket
        const entity = this.world.entities?.get(reconnectedPlayerId);
        if (entity) {
          entity.data.owner = socket.id;
        }

        const relevantEntities =
          entity && "position" in entity
            ? collectInitialSyncEntities(
                this.world,
                entity.position.x,
                entity.position.z,
                reconnectedPlayerId,
              )
            : [];
        const relevantEntityIds = new Set(
          relevantEntities.map((entry) => entry.id),
        );

        if (entity) {
          sendToFn(socket.id, "entityAdded", entity.serialize());
        }
        for (const ent of relevantEntities) {
          sendToFn(socket.id, "entityAdded", ent.serialize());
        }

        // Re-emit PLAYER_JOINED so systems re-initialize for this session
        this.world.emit(EventType.PLAYER_JOINED, {
          playerId: reconnectedPlayerId,
          userId: reconnectedPlayerId,
          // PlayerLocal migrated to @hyperforge/hyperscape (2026-04-26).
          player: socket.player as never,
          isReconnect: true,
        });

        // Re-send existing players' equipment to the reconnected client
        // (initial join flow sends this but packets may be lost during socket reconnect)
        const equipSys = this.world.getSystem?.("equipment") as
          | {
              getPlayerEquipment?: (
                id: string,
              ) => Record<string, unknown> | undefined;
            }
          | undefined;
        if (equipSys?.getPlayerEquipment && this.world.entities?.items) {
          for (const [entityId, ent] of this.world.entities.items.entries()) {
            if (
              entityId !== reconnectedPlayerId &&
              relevantEntityIds.has(entityId) &&
              (ent as { type?: string }).type === "player"
            ) {
              const eq = equipSys.getPlayerEquipment(entityId);
              if (eq) {
                sendToFn(socket.id, "equipmentUpdated", {
                  playerId: entityId,
                  equipment: eq,
                });
              }
            }
          }
        }

        // Notify client of successful reconnection
        sendToFn(socket.id, "reconnected", {
          characterId: reconnectedPlayerId,
        });

        // Also send enterWorldApproved so client proceeds to game
        sendToFn(socket.id, "enterWorldApproved", {
          characterId: reconnectedPlayerId,
        });

        // Broadcast updated entity ownership to other clients
        sendFn(
          "entityModified",
          { id: reconnectedPlayerId, changes: { owner: socket.id } },
          socket.id,
        );

        console.log(
          `[ServerNetwork] Reconnected player ${reconnectedPlayerId} on socket ${socket.id}`,
        );
        return;
      }
    }

    // Normal spawn flow
    return handleEnterWorld(
      socket,
      data,
      this.world,
      this.spawn,
      this.broadcastManager.sendToAll.bind(this.broadcastManager),
      this.broadcastManager.sendToSocket.bind(this.broadcastManager),
    );
  }

  async init(options: WorldOptions): Promise<void> {
    // Validate that db exists and has the expected shape
    if (!options.db || !isDatabaseInstance(options.db)) {
      throw new Error(
        "[ServerNetwork] Valid database instance not provided in options",
      );
    }

    this.db = options.db;

    // Initialize managers now that db is available
    this.initializeManagers();
  }

  async start(): Promise<void> {
    if (!this.db) {
      throw new Error("[ServerNetwork] Database not available in start method");
    }

    // Load spawn configuration
    this.spawn = await this.initializationManager.loadSpawnPoint();

    // Initialize home teleport manager with spawn point. The plugin
    // installs `world.homeTeleportFactory` at onEnable; we call it
    // here (after spawn loads) and pin the result to
    // `world.homeTeleportManager` for lifecycle hooks to consume.
    const factory = (
      this.world as { homeTeleportFactory?: HomeTeleportFactory }
    ).homeTeleportFactory;
    if (factory) {
      (
        this.world as { homeTeleportManager?: IHomeTeleportManager }
      ).homeTeleportManager = factory(
        this.spawn,
        this.broadcastManager.sendToAll.bind(this.broadcastManager),
      );
    } else {
      console.warn(
        "[ServerNetwork] world.homeTeleportFactory not installed — home teleport handler will be unavailable",
      );
    }

    // Hydrate entities from database
    await this.initializationManager.hydrateEntities();

    // Load world settings
    await this.initializationManager.loadSettings();

    // Start save manager (timer + settings watcher)
    this.saveManager.start();

    // Setup event bridge (world events → network messages)
    this.eventBridge.setupEventListeners();

    // Start tick system (600ms RuneScape-style ticks)
    this.tickSystem.start();
    console.log(
      "[ServerNetwork] Tick system started (600ms ticks) with action queue",
    );
  }

  override destroy(): void {
    this.clearWorldListeners();
    this.processingRateLimiter.clear();
    this.processedDuelSettlements.clear();
    this.queue.length = 0;
    ServerNetwork.characterSockets.clear();
    ServerNetwork.agentGoals.clear();
    ServerNetwork.agentAvailableGoals.clear();
    ServerNetwork.agentGoalsPaused.clear();
    ServerNetwork.agentThoughts.clear();
    ServerNetwork.agentPersonality.clear();
    ServerNetwork.agentDesireScores.clear();

    // Clean up duel event listeners to prevent memory leak
    if (this.cleanupDuelEventListeners) {
      this.cleanupDuelEventListeners();
      this.cleanupDuelEventListeners = null;
    }

    // Trading system teardown owned by @hyperforge/hyperscape plugin
    // scope disposer (2026-04-26).

    // Duel system teardown owned by @hyperforge/hyperscape plugin
    // scope disposer (2026-04-26).

    this.socketManager.destroy();
    this.spatialIndex.destroy();
    delete (this.world as { spatialIndex?: ISpatialIndex }).spatialIndex;
    delete (this.world as { broadcast?: IBroadcastService }).broadcast;
    delete (this.world as { regionSubscriptions?: IRegionSubscriptionService })
      .regionSubscriptions;
    delete (this.world as { tileMovement?: ITileMovementService }).tileMovement;
    delete (this.world as { connectionRegistry?: IConnectionRegistry })
      .connectionRegistry;
    this.saveManager.destroy();
    this.interactionSessionManager.destroy();
    this.eventBridge.destroy();
    destroyAllRateLimiters();
    this.messageMetrics.clear();
    this.tickSystem.stop();

    // Stop event loop lag probe to prevent leaked setTimeout loop
    if (this._stopLagProbe) {
      this._stopLagProbe();
      this._stopLagProbe = null;
    }

    for (const [_id, socket] of this.sockets) {
      socket.close?.();
    }
    this.sockets.clear();
  }

  override preFixedUpdate(): void {
    const qLen = this.queue.length;
    const t0 = Date.now();
    this.flush();
    const elapsed = Date.now() - t0;
    if (elapsed > 50) {
      console.warn(
        `[ServerNetwork] flush() took ${elapsed}ms for ${qLen} queued messages`,
      );
    }
  }

  override update(dt: number): void {
    // Validate player positions periodically
    this.positionValidator.update(dt);

    // Broadcast world time periodically for day/night cycle sync
    this.worldTimeSyncAccumulator += dt;
    if (this.worldTimeSyncAccumulator >= this.WORLD_TIME_SYNC_INTERVAL) {
      this.worldTimeSyncAccumulator = 0;
      this.broadcastManager.sendToAll("worldTimeSync", {
        worldTime: this.world.getTime(),
      });
    }
  }

  /**
   * Broadcast message to all connected clients
   *
   * Delegates to BroadcastManager.
   */
  send<T = unknown>(name: string, data: T, ignoreSocketId?: string): void {
    this.broadcastManager.sendToAll(name, data, ignoreSocketId);
  }

  /**
   * Enable uWS native pub/sub broadcasting.
   * Called from main.ts after the uWS server is created.
   */
  enablePubSub(uwsApp: unknown): void {
    this.broadcastManager.setUwsApp(
      uwsApp as import("uWebSockets.js").TemplatedApp,
    );
    console.log("[ServerNetwork] uWS pub/sub broadcasting enabled");
  }

  /**
   * Broadcast message with HIGH priority (bypasses bandwidth throttling for
   * NORMAL-priority traffic). Use for batched entity spawns that must not be
   * silently dropped by the per-connection bandwidth budget.
   */
  sendHighPriority<T = unknown>(
    name: string,
    data: T,
    ignoreSocketId?: string,
  ): void {
    this.broadcastManager.sendToAll(
      name,
      data,
      ignoreSocketId,
      PacketPriority.HIGH,
    );
  }

  /**
   * Broadcast message to spectator sockets only.
   *
   * Delegates to BroadcastManager.sendToSpectators().
   */
  sendToSpectators<T = unknown>(name: string, data: T): void {
    this.broadcastManager.sendToSpectators(name, data);
  }

  /**
   * Send message to specific socket
   *
   * Delegates to BroadcastManager.
   */
  sendTo<T = unknown>(socketId: string, name: string, data: T): void {
    this.broadcastManager.sendToSocket(socketId, name, data);
  }

  /**
   * Delegate socket health checking to SocketManager
   */
  checkSockets(): void {
    this.socketManager.checkSockets();
  }

  /**
   * Get socket by player ID
   */
  getSocketByPlayerId(playerId: string): ServerSocket | undefined {
    // Try using BroadcastManager first
    if (this.broadcastManager?.getPlayerSocket) {
      return this.broadcastManager.getPlayerSocket(playerId);
    }

    // Fallback to searching sockets map
    for (const [, socket] of this.sockets) {
      if (socket.player?.id === playerId) {
        return socket;
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Pub/Sub subscription helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the pub/sub adapter for a player's socket.
   * Returns undefined if player not connected or not on a pub/sub
   * transport (e.g. InMemorySocket in PIE mode).
   */
  private getUwsAdapterForPlayer(
    playerId: string,
  ): ISocketPubSubAdapter | undefined {
    const socket = this.getSocketByPlayerId(playerId);
    if (!socket) return undefined;
    return this.broadcastManager.getAdapter(socket.id);
  }

  /**
   * Subscribe a player's socket to 9 region topics around a position.
   * Called on PLAYER_JOINED.
   */
  private subscribePlayerRegionTopics(
    playerId: string,
    worldX: number,
    worldZ: number,
  ): void {
    const adapter = this.getUwsAdapterForPlayer(playerId);
    if (!adapter) return;
    const regionKeys = this.spatialIndex.getAdjacentRegionKeys(worldX, worldZ);
    for (let i = 0; i < 9; i++) {
      adapter.subscribe(this.spatialIndex.getRegionTopic(regionKeys[i]));
    }
  }

  /**
   * Update region pubsub subscriptions when a player crosses a region
   * boundary. Phase B3 (PLAN_ENGINE_API_EXTRACTION.md, 2026-04-26):
   * delegates to the standalone RegionSubscriptionService pinned to
   * `world.regionSubscriptions`. ServerNetwork keeps the wrapper
   * method for in-shared callers; new callers should resolve via
   * `world.regionSubscriptions.updatePlayerRegionSubscriptions(...)`.
   */
  private updatePlayerRegionSubscriptions(
    playerId: string,
    oldKey: number,
    newKey: number,
  ): void {
    this.regionSubscriptions.updatePlayerRegionSubscriptions(
      playerId,
      oldKey,
      newKey,
    );
  }

  /**
   * Full region resubscription — unsub all old 9, sub all new 9.
   * Called on teleport/respawn where the player may jump many regions.
   * Phase B3: delegates to RegionSubscriptionService.
   */
  private resubscribePlayerRegionTopics(
    playerId: string,
    oldKey: number,
    worldX: number,
    worldZ: number,
  ): void {
    this.regionSubscriptions.resubscribePlayerRegionTopics(
      playerId,
      oldKey,
      worldX,
      worldZ,
    );
  }

  /**
   * Server-initiated player movement for non-socket actors (embedded agents).
   * Routes through the same tile movement pipeline as normal player input.
   */
  requestServerMove(
    playerId: string,
    target: [number, number, number],
    options?: { runMode?: boolean },
  ): boolean {
    if (
      !(this.world as { tileMovement?: TileMovementManager }).tileMovement ||
      !this.world.entities.get(playerId)
    ) {
      return false;
    }

    (
      this.world as { tileMovement?: TileMovementManager }
    ).tileMovement?.movePlayerToward(
      playerId,
      { x: target[0], y: target[1], z: target[2] },
      options?.runMode ?? false,
      0, // non-combat destination
    );
    return true;
  }

  /**
   * Server-initiated movement cancel for non-socket actors (embedded agents).
   */
  cancelServerMove(playerId: string): boolean {
    if (
      !(this.world as { tileMovement?: TileMovementManager }).tileMovement ||
      !this.world.entities.get(playerId)
    ) {
      return false;
    }

    (
      this.world as { tileMovement?: TileMovementManager }
    ).tileMovement?.stopPlayer(playerId);
    return true;
  }

  /**
   * Determine whether an incoming attack request is redundant.
   * Re-clicking the same active/pending target should be a no-op so we don't
   * reset combat state and push nextAttackTick forward.
   */
  private getRedundantAttackReason(
    playerId: string,
    targetId: string,
    targetType: "mob" | "player",
  ): "active_same_target" | "pending_same_target" | null {
    const combatSystem = this.world.getSystem("combat") as {
      getCombatData?: (entityId: string) => {
        inCombat?: boolean;
        targetId?: string;
        targetType?: "mob" | "player";
      } | null;
    } | null;

    const combatData = combatSystem?.getCombatData?.(playerId);
    if (
      combatData?.inCombat &&
      combatData.targetType === targetType &&
      String(combatData.targetId ?? "") === targetId
    ) {
      return "active_same_target";
    }

    if (
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.hasPendingAttack(playerId) &&
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.getPendingAttackTarget(playerId) === targetId
    ) {
      return "pending_same_target";
    }

    return null;
  }

  /**
   * Server-initiated attack for non-socket actors (embedded agents).
   * Uses the same walk-to-and-attack pipeline as real players.
   */
  requestServerAttack(
    playerId: string,
    targetId: string,
    targetType: "mob" | "player" = "mob",
  ): boolean {
    const playerEntity = this.world.entities.get(playerId);
    if (
      !(this.world as { tileMovement?: TileMovementManager }).tileMovement ||
      !playerEntity
    ) {
      return false;
    }

    const targetEntity = this.world.entities.get(targetId) as {
      position?: { x: number; y: number; z: number };
    } | null;
    if (!targetEntity?.position) {
      return false;
    }

    (
      this.world as { pendingAttackManager?: PendingAttackManager }
    ).pendingAttackManager?.cancelPendingAttack(playerId);

    const attackRange = this.getPlayerWeaponRange(playerId);
    const attackType = this.getPlayerAttackType(playerId);

    const playerTile = worldToTile(
      playerEntity.position.x,
      playerEntity.position.z,
    );
    const targetTile = worldToTile(
      targetEntity.position.x,
      targetEntity.position.z,
    );

    if (this.isInAttackRange(playerTile, targetTile, attackType, attackRange)) {
      this.world.emit(EventType.COMBAT_ATTACK_REQUEST, {
        attackerId: playerId,
        targetId,
        attackerType: "player",
        targetType,
        attackType,
      });
    } else {
      (
        this.world as { pendingAttackManager?: PendingAttackManager }
      ).pendingAttackManager?.queuePendingAttack(
        playerId,
        targetId,
        this.world.currentTick,
        attackRange,
        targetType,
        attackType,
      );
    }
    return true;
  }

  /**
   * PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative: look up a packet
   * handler from the shared IPacketHandlerRegistry bridge system. Returns
   * undefined if the system isn't registered (e.g. in a stripped PIE world)
   * or if no handler is registered for the given packet. Callers must still
   * fall back to the legacy `this.handlers[...]` dict until all handlers are
   * migrated to the bridge.
   */
  private getPacketRegistryHandler(method: string): NetworkHandler | undefined {
    const registry = this.world.getSystem("packet-handlers") as
      | { getHandler?(name: string): NetworkHandler | undefined }
      | undefined;
    return registry?.getHandler?.(method);
  }

  private getOrCreateMessageMetric(method: string): NetworkMessageMetric {
    let metric = this.messageMetrics.get(method);
    if (!metric) {
      metric = {
        method,
        received: 0,
        inFlight: 0,
        peakInFlight: 0,
        errors: 0,
        lastSeenAt: 0,
      };
      this.messageMetrics.set(method, metric);
    }
    return metric;
  }

  getMessageDiagnostics(limit: number = 20): NetworkMessageMetric[] {
    return Array.from(this.messageMetrics.values())
      .sort((a, b) => {
        if (b.inFlight !== a.inFlight) {
          return b.inFlight - a.inFlight;
        }
        if (b.peakInFlight !== a.peakInFlight) {
          return b.peakInFlight - a.peakInFlight;
        }
        return b.received - a.received;
      })
      .slice(0, limit)
      .map((metric) => ({ ...metric }));
  }

  enqueue(socket: ServerSocket | Socket, method: string, data: unknown): void {
    // CRITICAL SECURITY: Global rate limiting to prevent DoS attacks (100 msg/sec per socket)
    const socketId = (socket as ServerSocket).id;
    if (socketId) {
      const globalLimiter = getGlobalSocketRateLimiter();
      if (!globalLimiter.check(socketId)) {
        // Rate limit exceeded - kick the socket
        console.warn(
          `[ServerNetwork] Socket ${socketId} exceeded global rate limit (100/sec), disconnecting`,
        );
        try {
          (socket as ServerSocket).send("error", {
            code: "RATE_LIMITED",
            message: "Too many requests",
          });
          // Use ws.close with code/reason since Socket.close() takes no args
          (socket as ServerSocket).ws?.close?.(4029, "Rate limited");
        } catch {
          // Socket may already be closing
        }
        return;
      }
    }
    const metric = this.getOrCreateMessageMetric(method);
    metric.received++;
    metric.lastSeenAt = Date.now();
    this.queue.push([socket as ServerSocket, method, data]);
  }

  /**
   * Delegate disconnection handling to SocketManager
   */
  onDisconnect(socket: ServerSocket | Socket, code?: number | string): void {
    // Clean up spectator index before socket is removed
    const ss = socket as ServerSocket;
    if (ss.isSpectator && ss.spectatingCharacterId) {
      const set = this.spectatorsByPlayer.get(ss.spectatingCharacterId);
      if (set) {
        set.delete(ss.id);
        if (set.size === 0)
          this.spectatorsByPlayer.delete(ss.spectatingCharacterId);
      }
    }
    this.socketManager.handleDisconnect(ss, code);
  }

  flush(): void {
    if (this.queue.length === 0) {
      return;
    }

    const queuedMessages = this.queue;
    this.queue = [];

    for (const [socket, method, data] of queuedMessages) {
      // Debug: Log duel-related packets
      if (
        DEBUG_DUEL_PACKET_TRAFFIC &&
        (method.includes("duel") || method.includes("Duel"))
      ) {
        console.log(`[ServerNetwork] Received duel packet: ${method}`, data);
      }

      // PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative: dispatch first
      // checks the shared IPacketHandlerRegistry bridge, then falls back to the
      // legacy static `this.handlers[...]` dict. Once all handlers are
      // registered through the bridge, the static dict can be dropped and this
      // dispatcher (plus its enclosing file) can move to @hyperforge/shared
      // untouched — because the handler modules stay server-side.
      const registryHandler = this.getPacketRegistryHandler(method);
      const handler = registryHandler ?? this.handlers[method];
      if (handler) {
        const metric = this.getOrCreateMessageMetric(method);
        const result = handler.call(this, socket, data);
        if (result && typeof result.then === "function") {
          metric.inFlight++;
          if (metric.inFlight > metric.peakInFlight) {
            metric.peakInFlight = metric.inFlight;
          }
          result
            .catch((err: Error) => {
              metric.errors++;
              console.error(
                `[ServerNetwork] Error in async handler ${method}:`,
                err,
              );
            })
            .finally(() => {
              metric.inFlight = Math.max(0, metric.inFlight - 1);
            });
        }
      } else {
        // SECURITY: Rate limit unknown message types to prevent log spam DoS
        const socketId = socket.id;
        if (socketId) {
          const unknownLimiter = getUnknownMessageRateLimiter();
          if (unknownLimiter.check(socketId)) {
            // Only log if under rate limit to prevent log spam attacks
            console.warn(`[ServerNetwork] No handler for packet: ${method}`);
          }
          // If rate limited, silently drop to prevent log flooding
        } else {
          console.warn(`[ServerNetwork] No handler for packet: ${method}`);
        }
      }
    }
  }

  getTime(): number {
    return performance.now() / 1000; // seconds
  }

  isAdmin(player: { data?: { roles?: string[] } }): boolean {
    return hasRole(player.data?.roles as string[] | undefined, "admin");
  }

  /**
   * Check if player has moderator permissions (mod or admin role)
   * Moderators can use advanced commands like /teleport
   */
  isMod(player: { data?: { roles?: string[] } }): boolean {
    return hasRole(player.data?.roles as string[] | undefined, "mod", "admin");
  }

  isBuilder(player: { data?: { roles?: string[] } }): boolean {
    return this.world.settings.public || this.isAdmin(player);
  }

  /**
   * Get player's attack range in tiles
   * Cancel all pending actions for a player (attack, follow, trade, duel, home teleport).
   * Called when a player initiates a new action that supersedes existing ones.
   */
  private cancelAllPendingActions(
    playerId: string,
    socket?: { send: (name: string, data: unknown) => void },
  ): void {
    (
      this.world as { pendingAttackManager?: PendingAttackManager }
    ).pendingAttackManager?.cancelPendingAttack(playerId);
    (
      this.world as { followManager?: FollowManager }
    ).followManager?.stopFollowing(playerId);
    const ptm = (this.world as { pendingTradeManager?: PendingTradeManager })
      .pendingTradeManager;
    ptm?.cancelPendingTrade(playerId);
    const pdcmCancel = (
      this.world as {
        pendingDuelChallengeManager?: PendingDuelChallengeManager;
      }
    ).pendingDuelChallengeManager;
    pdcmCancel?.cancelPendingChallenge(playerId);
    const homeTeleportManager = (
      this.world as { homeTeleportManager?: IHomeTeleportManager }
    ).homeTeleportManager;
    if (homeTeleportManager?.isCasting(playerId)) {
      homeTeleportManager.cancelCasting(playerId, "Player moved");
      if (socket) {
        socket.send("homeTeleportFailed", {
          reason: "Interrupted by movement",
        });
        socket.send("showToast", {
          message: "Home teleport canceled",
          type: "info",
        });
      }
    }
  }

  /**
   * Spell selection takes priority (magic range = 10)
   * Otherwise uses equipped weapon's attackRange from manifest
   * Returns 1 for unarmed (punching)
   */
  getPlayerWeaponRange(playerId: string): number {
    // Check if player has a spell selected - if so, use magic range regardless of weapon
    const playerEntity = this.world.getPlayer?.(playerId);
    const selectedSpell = (playerEntity?.data as { selectedSpell?: string })
      ?.selectedSpell;

    if (selectedSpell) {
      return 10; // Standard magic attack range
    }

    const equipmentSystem = this.world.getSystem("equipment") as
      | {
          getPlayerEquipment?: (id: string) => {
            weapon?: {
              item?: {
                attackRange?: number;
                attackType?: string;
                id?: string;
              };
            };
          } | null;
        }
      | undefined;

    if (equipmentSystem?.getPlayerEquipment) {
      const equipment = equipmentSystem.getPlayerEquipment(playerId);

      if (equipment?.weapon?.item) {
        const weaponItem = equipment.weapon.item;

        // OSRS-accurate: Magic weapons (staffs/wands) without autocast
        // default to melee range (1 tile bonk). The selectedSpell check above
        // already returns 10 for magic range when a spell is selected.
        const isMagicWeapon =
          String(weaponItem.attackType || "").toLowerCase() === "magic" ||
          (weaponItem.id &&
            String(getItem(weaponItem.id)?.attackType || "").toLowerCase() ===
              "magic");

        if (!isMagicWeapon) {
          // Non-magic weapons use their attackRange (e.g., bows)
          if (weaponItem.attackRange) {
            return weaponItem.attackRange;
          }

          // Fallback: look up from items manifest
          if (weaponItem.id) {
            const itemData = getItem(weaponItem.id);
            if (itemData?.attackRange) {
              return itemData.attackRange;
            }
          }
        }
        // Magic weapons without autocast fall through to melee range (1)
      }
    }

    // Default to 1 tile (unarmed/punching, or magic weapon without autocast)
    return 1;
  }

  /**
   * Get the attack type from the player's equipped weapon or selected spell
   * Returns AttackType.MELEE if no weapon or melee weapon equipped and no spell selected
   *
   * OSRS-accurate: You can cast spells without a staff - the staff just provides
   * magic attack bonus and elemental staves give infinite runes
   */
  getPlayerAttackType(playerId: string): AttackType {
    // Check if player has a spell selected - if so, use magic regardless of weapon
    const playerEntity = this.world.getPlayer?.(playerId);
    const selectedSpell = (playerEntity?.data as { selectedSpell?: string })
      ?.selectedSpell;

    if (selectedSpell) {
      return AttackType.MAGIC;
    }

    const equipmentSystem = this.world.getSystem("equipment") as
      | {
          getPlayerEquipment?: (id: string) => {
            weapon?: {
              item?: {
                attackType?: AttackType;
                weaponType?: WeaponType;
              };
            };
          } | null;
        }
      | undefined;

    if (equipmentSystem?.getPlayerEquipment) {
      const equipment = equipmentSystem.getPlayerEquipment(playerId);

      if (equipment?.weapon?.item) {
        const weaponItem = equipment.weapon.item;

        // Check explicit attackType first
        if (weaponItem.attackType) {
          // OSRS-accurate: Magic weapons (staffs/wands) without autocast use
          // melee crush attack (bonk). The selectedSpell check above already
          // returns MAGIC when a spell is selected.
          const isMagicAttackType =
            String(weaponItem.attackType).toLowerCase() === "magic";
          if (!isMagicAttackType) {
            return weaponItem.attackType as AttackType;
          }
          // Magic attack type without autocast → melee bonk
          return AttackType.MELEE;
        }

        // Fall back to weaponType for legacy compatibility
        if (weaponItem.weaponType === WeaponType.BOW) {
          return AttackType.RANGED;
        }
        // OSRS-accurate: Staffs/wands without autocast use melee (crush bonk)
        // The selectedSpell check above already handles the autocast case
        if (
          weaponItem.weaponType === WeaponType.STAFF ||
          weaponItem.weaponType === WeaponType.WAND
        ) {
          return AttackType.MELEE;
        }
      }
    }

    return AttackType.MELEE;
  }

  /**
   * Check if player is within attack range based on attack type
   * Melee uses cardinal-only for range 1, ranged/magic uses Chebyshev distance
   */
  isInAttackRange(
    attackerTile: { x: number; z: number },
    targetTile: { x: number; z: number },
    attackType: AttackType,
    range: number,
  ): boolean {
    if (attackType === AttackType.MELEE) {
      return tilesWithinMeleeRange(attackerTile, targetTile, range);
    }

    // Ranged/Magic use Chebyshev distance (8-directional)
    const distance = tileChebyshevDistance(attackerTile, targetTile);
    return distance <= range && distance > 0;
  }

  /**
   * Handle incoming WebSocket connection
   *
   * Delegates to ConnectionHandler for the full connection flow.
   */
  async onConnection(
    ws: NodeWebSocket,
    params: ConnectionParams,
  ): Promise<void> {
    await this.connectionHandler.handleConnection(ws, params);
  }
}
