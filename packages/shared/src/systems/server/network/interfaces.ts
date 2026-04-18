/**
 * ServerNetwork External Integration Interfaces
 *
 * Narrow interfaces capturing only the methods ServerNetwork actually calls on
 * server-package-specific integrations (database repositories, Eliza agents,
 * auth services, streaming tokens). Real implementations stay in the server
 * package; these interfaces let ServerNetwork (living in shared) depend on
 * abstractions instead of concrete classes.
 *
 * Each interface is derived from a grep of ServerNetwork call sites — if a
 * repository method isn't invoked from ServerNetwork it is deliberately
 * omitted, keeping the abstraction surface minimal.
 *
 * Mirroring strategy:
 * - Row / DTO types are duplicated structurally (Bank*, Friend*, Ignore*,
 *   Inventory*) so shared has no runtime dependency on Drizzle or the
 *   server database schema. Real repository row types must remain
 *   structurally compatible with the mirrors here.
 */

// ============================================================================
// BANK REPOSITORY
// ============================================================================

export interface BankItem {
  itemId: string;
  quantity: number;
  slot: number;
  tabIndex: number;
}

export interface BankTab {
  tabIndex: number;
  iconItemId: string | null;
}

export interface IBankRepository {
  getPlayerBank(playerId: string): Promise<BankItem[]>;
  getPlayerTabs(playerId: string): Promise<BankTab[]>;
  getAlwaysSetPlaceholder(playerId: string): Promise<boolean>;
}

// ============================================================================
// CHARACTER REPOSITORY
// ============================================================================

export interface CharacterSummary {
  id: string;
  name: string;
  avatar?: string | null;
  wallet?: string | null;
  isAgent?: boolean;
  combatLevel?: number | null;
  constitutionLevel?: number | null;
}

export interface ICharacterRepository {
  getCharactersAsync(accountId: string): Promise<CharacterSummary[]>;
  createCharacter(
    accountId: string,
    id: string,
    name: string,
    avatar?: string,
    wallet?: string,
    isAgent?: boolean,
  ): Promise<boolean>;
  updateCharacterName(characterId: string, name: string): Promise<boolean>;
}

// ============================================================================
// INVENTORY REPOSITORY
// ============================================================================

export interface InventoryRow {
  playerId: string;
  itemId: string;
  quantity: number;
  slotIndex: number;
  metadata: string | null;
}

export interface IInventoryRepository {
  getPlayerInventoryAsync(playerId: string): Promise<InventoryRow[]>;
}

// ============================================================================
// FRIEND REPOSITORY
// ============================================================================

export type FriendRow = {
  id: number;
  playerId: string;
  friendId: string;
  friendName: string;
  friendLevel: number;
  lastLogin: number;
  createdAt: number;
  note: string | null;
};

export type FriendRequestRow = {
  id: string;
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  createdAt: number;
};

export type IgnoreRow = {
  id: number;
  playerId: string;
  ignoredPlayerId: string;
  ignoredPlayerName: string;
  createdAt: number;
};

export interface IFriendRepository {
  getFriendsAsync(playerId: string): Promise<FriendRow[]>;
  addFriendAsync(playerId: string, friendId: string): Promise<void>;
  removeFriendAsync(playerId: string, friendId: string): Promise<void>;
  areFriendsAsync(player1: string, player2: string): Promise<boolean>;
  getFriendCountAsync(playerId: string): Promise<number>;
  getFriendIdsAsync(playerId: string): Promise<string[]>;

  getPendingRequestsAsync(playerId: string): Promise<FriendRequestRow[]>;
  createRequestAsync(fromId: string, toId: string): Promise<string>;
  acceptRequestAsync(requestId: string, playerId: string): Promise<boolean>;
  declineRequestAsync(requestId: string, playerId: string): Promise<boolean>;
  getRequestAsync(requestId: string): Promise<FriendRequestRow | null>;
  hasRequestAsync(fromId: string, toId: string): Promise<boolean>;

  getIgnoreListAsync(playerId: string): Promise<IgnoreRow[]>;
  addToIgnoreAsync(playerId: string, targetId: string): Promise<void>;
  removeFromIgnoreAsync(playerId: string, targetId: string): Promise<void>;
  getIgnoreCountAsync(playerId: string): Promise<number>;
  isIgnoredByAsync(senderId: string, receiverId: string): Promise<boolean>;

  findPlayerByNameAsync(
    name: string,
  ): Promise<{ id: string; name: string } | null>;
}

// ============================================================================
// DATABASE SYSTEM
// ============================================================================

/** Equipment slot row (structurally mirrors server EquipmentRow). */
export interface EquipmentSlotRow {
  playerId: string;
  slotType: string;
  itemId: string | null;
  quantity: number;
}

/** Player row — narrow projection, only fields shared-side callers read. */
export interface PlayerDataRow {
  playerId?: string;
  id?: string;
  accountId?: string;
  name?: string;
  combatLevel?: number;
  attackLevel: number;
  strengthLevel: number;
  defenseLevel: number;
  constitutionLevel: number;
  rangedLevel: number;
  magicLevel?: number;
  woodcuttingLevel?: number;
  miningLevel?: number;
  fishingLevel?: number;
  firemakingLevel?: number;
  cookingLevel?: number;
  smithingLevel?: number;
  agilityLevel?: number;
  craftingLevel?: number;
  fletchingLevel?: number;
  runecraftingLevel?: number;
  attackXp: number;
  strengthXp: number;
  defenseXp: number;
  constitutionXp: number;
  rangedXp: number;
  magicXp?: number;
  woodcuttingXp?: number;
  miningXp?: number;
  fishingXp?: number;
  firemakingXp?: number;
  cookingXp?: number;
  smithingXp?: number;
  agilityXp?: number;
  craftingXp?: number;
  fletchingXp?: number;
  runecraftingXp?: number;
  health?: number;
  maxHealth?: number;
  coins?: number;
  positionX?: number;
  positionY?: number | null;
  positionZ?: number;
  attackStyle?: string;
  autoRetaliate?: number;
  selectedSpell?: string;
  prayerLevel?: number;
  prayerXp?: number;
  prayerPoints?: number;
  prayerMaxPoints?: number;
  activePrayers?: string[];
}

/**
 * Narrow view of the server-side DatabaseSystem exposing only the repository
 * accessors and async readers that handlers living in shared need. The
 * concrete DatabaseSystem class in server satisfies this shape structurally
 * via its repository fields and repository-delegated async methods.
 *
 * Handlers in shared access repositories via:
 *   const dbSystem = world.getSystem("database") as IDatabaseSystem;
 *   await dbSystem.characterRepository.updateCharacterName(id, name);
 */
export interface IDatabaseSystem {
  getCharacterRepository(): ICharacterRepository;
  getBankRepository(): IBankRepository;
  getInventoryRepository(): IInventoryRepository;
  getFriendRepository(): IFriendRepository;

  /** Async readers used by character-selection and enter-world hydration. */
  getPlayerAsync(playerId: string): Promise<PlayerDataRow | null>;
  getPlayerInventoryAsync(playerId: string): Promise<InventoryRow[]>;
  getPlayerEquipmentAsync(playerId: string): Promise<EquipmentSlotRow[]>;

  /**
   * Passthrough character methods — DatabaseSystem exposes these as
   * convenience wrappers over characterRepository.
   */
  getCharactersAsync(accountId: string): Promise<CharacterSummary[]>;
  createCharacter(
    accountId: string,
    id: string,
    name: string,
    avatar?: string,
    wallet?: string,
    isAgent?: boolean,
  ): Promise<boolean>;

  /**
   * Raw Drizzle handle escape hatch. Returned as `unknown` so shared has
   * no compile-time dependency on Drizzle or the server schema; callers
   * type-assert at the use site. May return null if DB not yet initialized.
   */
  getDb(): unknown | null;
}

// ============================================================================
// FOLLOW MANAGER
// ============================================================================

/**
 * Narrow interface for the FollowManager — only the methods called by handlers.
 * Real implementation stays in server's ServerNetwork/FollowManager.ts.
 */
export interface IFollowManager {
  startFollowing(followerId: string, targetId: string): void;
}

// ============================================================================
// AGENT MANAGER (Eliza)
// ============================================================================

/**
 * ServerNetwork only needs to know whether a character currently has an
 * active embedded agent — everything else in AgentManager is Eliza-specific
 * runtime machinery that stays in server.
 */
export interface IAgentManager {
  hasAgent(characterId: string): boolean;
}

/**
 * ModelAgentSpawner lookup — ServerNetwork uses this to resolve the Eliza
 * AgentRuntime for a character. The runtime type is intentionally `unknown`
 * here so shared has no compile-time dependency on @elizaos/core; server-side
 * code casts it to the real runtime type at the call site.
 */
export interface IAgentRuntimeLookup {
  getAgentRuntimeByCharacterId(characterId: string): unknown | null;
}

// ============================================================================
// STREAMING
// ============================================================================

/**
 * Resolves the shared access token used to authenticate streaming viewer
 * connections. ServerNetwork calls this during connection setup.
 */
export interface IStreamingAccessTokens {
  resolveStreamingViewerAccessToken(): string;
}

// ============================================================================
// AUTH SERVICE
// ============================================================================

/**
 * JWT create/verify abstraction — ServerNetwork.authentication uses these
 * to issue session tokens and verify client-supplied tokens. Real impl in
 * server wraps `jose` / `jsonwebtoken`; shared has no JWT dependency.
 */
export interface IAuthService {
  createJWT(data: Record<string, unknown>): Promise<string>;
  verifyJWT(token: string): Promise<Record<string, unknown> | null>;
}

// ============================================================================
// TILE MOVEMENT MANAGER
// ============================================================================

import type { TileCoord, AttackType } from "../../../index";

/**
 * Narrow interface for the server-only TileMovementManager, capturing only
 * the methods called by Pending* managers and FollowManager. The concrete
 * class lives in `packages/server/src/systems/ServerNetwork/tile-movement.ts`
 * (2129 lines, with cascading deps on MovementInputValidator/AntiCheat/
 * SlidingWindowRateLimiter).
 *
 * Shared-side managers depend on this interface so they can be moved without
 * pulling in the full movement implementation. Structural typing: the
 * concrete class satisfies this interface without `implements`.
 */
export interface ITileMovementManager {
  /**
   * Server-initiated movement toward a target position.
   * Used for combat follow, pending interactions, and post-teleport routing.
   */
  movePlayerToward(
    playerId: string,
    targetPosition: { x: number; y: number; z: number },
    running?: boolean,
    attackRange?: number,
    attackType?: AttackType,
  ): void;

  /** Cancel any active path for a player. */
  stopPlayer(playerId: string): void;

  /** Whether the player is currently running (vs walking). */
  getIsRunning(playerId: string): boolean;

  /**
   * BFS outward from a world position for the closest walkable tile.
   * Returns null if no walkable tile is found within the search radius.
   */
  findClosestWalkableTile(
    targetPos: { x: number; z: number },
    maxSearchRadius?: number,
  ): TileCoord | null;

  /**
   * Register an emote to play when the player arrives at their destination.
   * Used for gathering animations (fishing, etc.).
   */
  setArrivalEmote(playerId: string, emote: string): void;

  /**
   * Return the tile the player occupied before their current tile. Used by
   * FollowManager to implement OSRS-style follow mechanics.
   */
  getPreviousTile(playerId: string): TileCoord;
}

// ============================================================================
// PACKET HANDLER REGISTRY
// ============================================================================

/**
 * Function signature for a packet handler: called with the originating
 * socket and the arbitrary packet payload. Return value is ignored; errors
 * should be caught by the handler itself or the dispatcher.
 */
export type PacketHandler = (
  socket: ServerSocket,
  data: unknown,
) => void | Promise<void>;

/**
 * Registry of name → handler lookups used by ServerNetwork to dispatch
 * incoming packets without depending on the server-local handler modules.
 *
 * The concrete implementation in server (`PacketHandlerBridgeSystem`)
 * owns the 199-entry registration map of `this.handlers[...]` that today
 * lives inside `ServerNetwork/index.ts::registerHandlers()`. Moving that
 * map behind this interface is the unblocker for Step 6 — it lets
 * `ServerNetwork/index.ts` relocate to shared without pulling in
 * `handlers/bank/*`, `handlers/store.ts`, etc.
 *
 * PIE can implement a minimal registry that only wires the packets
 * needed by the editor (movement, chat, interaction) and no-ops the rest.
 */
export interface IPacketHandlerRegistry {
  /** Look up a handler by packet name. Returns `undefined` if none registered. */
  getHandler(packetName: string): PacketHandler | undefined;

  /** Register (or replace) a packet handler at runtime. */
  register(packetName: string, handler: PacketHandler): void;

  /** Remove a packet handler. */
  unregister(packetName: string): void;

  /** All currently registered packet names (for debugging / introspection). */
  listPackets(): string[];
}

// ============================================================================
// BROADCAST MANAGER
// ============================================================================

import type { ServerSocket } from "./server-types";

/**
 * Narrow interface for the server-only BroadcastManager, capturing only the
 * methods called from migratable leaves (duel-events, position-validator,
 * socket-management, InteractionSessionManager). The concrete class lives in
 * `packages/server/src/systems/ServerNetwork/broadcast.ts` and depends on
 * server-only transport (uWebSockets.js, UwsWebSocketAdapter) so cannot be
 * relocated.
 *
 * Real implementation satisfies this via structural typing.
 */
/**
 * Narrow shape for the pub/sub adapter exposed per socket. ServerNetwork
 * only needs topic subscribe/unsubscribe — the concrete UwsWebSocketAdapter
 * has much more surface, but those methods are internal.
 */
export interface ISocketPubSubAdapter {
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
}

export interface IBroadcastManager {
  /**
   * Broadcast a packet to every connected socket. Returns the number of
   * clients that received the message.
   */
  sendToAll<T = unknown>(
    name: string,
    data: T,
    ignoreSocketId?: string,
    priority?: import("./BandwidthBudget").PacketPriority,
  ): number;

  /**
   * Register the spatial region index used by region-topic pub/sub.
   * Called once by ServerNetwork after constructing the manager.
   */
  setSpatialIndex(index: SpatialIndex): void;

  /**
   * Register the uWebSockets.js app used for zero-copy pub/sub
   * broadcast. Parameter is typed `unknown` to keep shared engine-agnostic.
   * Server-only wiring passes the concrete uWS.TemplatedApp.
   */
  setUwsApp(app: unknown): void;

  /**
   * Send a packet directly to the socket backing a given player id.
   * Returns true if delivered, false if the player has no active socket.
   */
  sendToPlayer<T = unknown>(playerId: string, name: string, data: T): boolean;

  /** Return the active socket for a player id, or undefined if offline. */
  getPlayerSocket(playerId: string): ServerSocket | undefined;

  /**
   * Notify the broadcast layer that a socket has disconnected so it can
   * drop subscriptions, clear buffered packets, etc.
   */
  onSocketDisconnected(socketId: string): void;

  /**
   * Send a packet to a specific socket by its transport id.
   * Returns `true` if the socket is connected and received the packet.
   * Step 6 prerequisite — needed by ServerNetwork to move to shared.
   */
  sendToSocket<T = unknown>(socketId: string, name: string, data: T): boolean;

  /**
   * Broadcast to every socket flagged as a spectator. Returns the number of
   * spectators that received the message (or -1 when using pub/sub fast
   * path where exact count is unavailable).
   */
  sendToSpectators<T = unknown>(name: string, data: T): number;

  /**
   * Broadcast to every socket in the 3×3 region around (worldX, worldZ),
   * plus spectators. Returns the number of clients reached.
   */
  sendToNearby<T = unknown>(
    name: string,
    data: T,
    worldX: number,
    worldZ: number,
    ignoreSocketId?: string,
  ): number;

  /**
   * Drain and return the cumulative time (ms) spent in sendBufferedPacket
   * since the last call. Used for tick-health reporting.
   */
  drainSendTimeMs(): number;

  /**
   * Drain and return the cumulative pub/sub publish count since last call.
   * Used for tick-health reporting.
   */
  drainPubsubStats(): number;

  /**
   * Retrieve the pub/sub adapter for a socket, or `undefined` if the
   * socket is not on a pub/sub-capable transport. ServerNetwork uses
   * this to subscribe/unsubscribe sockets to region topics without
   * depending on the concrete UwsWebSocketAdapter type.
   */
  getAdapter(socketId: string): ISocketPubSubAdapter | undefined;
}

// ============================================================================
// EVENT BRIDGE
// ============================================================================

/**
 * Narrow interface for the server-only EventBridge. ServerNetwork only needs
 * `setupEventListeners()` at startup and `destroy()` at shutdown — all other
 * logic is internal to EventBridge. The concrete class depends on Drizzle
 * + pg for bank/inventory queries and therefore stays server-only.
 *
 * Step 6 prerequisite: lets ServerNetwork depend on the interface instead
 * of the concrete class, so it can move to shared while EventBridge stays
 * in `packages/server/`.
 */
export interface IEventBridge {
  /**
   * Register all world event → network packet forwarders. Call once during
   * ServerNetwork init().
   */
  setupEventListeners(): void;

  /**
   * Remove all registered listeners and clear internal caches. Call during
   * ServerNetwork destroy() to prevent memory leaks.
   */
  destroy(): void;
}

// ============================================================================
// CONNECTION HANDLER
// ============================================================================

import type { SpatialIndex } from "./SpatialIndex";
import type { NodeWebSocket, ConnectionParams } from "./server-types";

/**
 * Narrow interface for the server-only ConnectionHandler. ServerNetwork only
 * calls two methods: `setSpatialIndex()` during init and `handleConnection()`
 * per incoming websocket. All auth, character selection, snapshot building,
 * and spectator plumbing is internal.
 *
 * Step 6 prerequisite: lets ServerNetwork depend on the interface instead
 * of the concrete class, so ServerNetwork can move to shared while
 * ConnectionHandler stays in `packages/server/` (it imports
 * BankRepository, CharacterRepository, pg, drizzle, and streaming access
 * tokens — all permanently server-only).
 */
export interface IConnectionHandler {
  /**
   * Register the spatial region index used to compute region-topic
   * subscriptions on connect. Called once during ServerNetwork init()
   * after the SpatialIndex is constructed.
   */
  setSpatialIndex(index: SpatialIndex): void;

  /**
   * Run the full connection handshake for a newly-opened websocket:
   * authentication, character selection, snapshot emission, spectator
   * wiring. Called per `ws:open` event from the websocket adapter.
   */
  handleConnection(ws: NodeWebSocket, params: ConnectionParams): Promise<void>;
}

// ============================================================================
// DUEL STAKE TRANSFER
// ============================================================================

/**
 * Stake item payload shape — mirror of the `StakeItem` interface in
 * `packages/server/src/systems/ServerNetwork/duel-settlement.ts`. Duplicated
 * structurally so shared has no runtime dependency on server duel code.
 */
export interface DuelStakeItem {
  inventorySlot: number;
  itemId: string;
  quantity: number;
  value: number;
}

/**
 * Narrow interface for the server-only duel stake settlement routine.
 * ServerNetwork passes this closure into `registerDuelEventListeners` as
 * the atomic stake-transfer callback. The real implementation runs a
 * Drizzle transaction on the InventoryRepository, so the concrete code
 * stays server-only. Step 6 moves ServerNetwork to shared and it calls
 * this via `world.getSystem("duel-stake-transfer")`.
 */
export interface IDuelStakeTransfer {
  executeDuelStakeTransferWithRetry(
    winnerId: string,
    loserId: string,
    stakes: DuelStakeItem[],
    duelId?: string,
  ): Promise<void>;
}

/**
 * Arguments required to construct a ConnectionHandler concrete instance.
 * Defined as a structural type so ServerNetwork (soon living in shared)
 * can hand everything the factory needs without the factory importing
 * private server types.
 */
export interface ConnectionHandlerFactoryArgs {
  world: import("../../../index").World;
  sockets: Map<string, ServerSocket>;
  broadcastManager: IBroadcastManager;
  db: IDatabaseSystem;
  spectatorsByPlayer: Map<string, Set<string>>;
}

/**
 * Factory that constructs the three remaining server-only ServerNetwork
 * sub-managers (BroadcastManager, EventBridge, ConnectionHandler) whose
 * concrete implementations depend on uWebSockets.js, Drizzle, or other
 * server-exclusive runtime state and therefore cannot live in shared.
 *
 * Registered as a world bridge system under the name
 * `"server-network-factory"` by server startup. ServerNetwork (post-Step 6
 * relocation) looks the factory up lazily during `initializeManagers()`
 * and `init()` instead of importing the concrete classes directly.
 */
export interface IServerNetworkManagerFactory {
  createBroadcastManager(sockets: Map<string, ServerSocket>): IBroadcastManager;

  createEventBridge(
    world: import("../../../index").World,
    broadcastManager: IBroadcastManager,
  ): IEventBridge;

  createConnectionHandler(
    args: ConnectionHandlerFactoryArgs,
  ): IConnectionHandler;
}
