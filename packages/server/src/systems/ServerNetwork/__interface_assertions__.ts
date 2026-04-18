/**
 * Compile-time structural compatibility assertions.
 *
 * This file exists solely so `tsc` verifies that the concrete server-package
 * repository/service classes match the narrow interfaces declared in
 * `@hyperforge/shared` (PLAN_SERVERNETWORK_MIGRATION.md Step 3). It has no
 * runtime output — the asserted types are only referenced as generic
 * parameters.
 *
 * If a repository adds a method, nothing here changes. If a repository
 * REMOVES or RENAMES a method that ServerNetwork calls via the interface,
 * this file will fail to compile and the breakage surfaces at the boundary
 * rather than at a runtime call site.
 */

import type {
  IBankRepository,
  ICharacterRepository,
  IInventoryRepository,
  IFriendRepository,
  IDatabaseSystem,
  IAgentManager,
  IAgentRuntimeLookup,
  IStreamingAccessTokens,
  IAuthService,
  IPacketHandlerRegistry,
  IBroadcastManager,
  IEventBridge,
  IConnectionHandler,
  IDuelStakeTransfer,
  IServerNetworkManagerFactory,
} from "../../../../shared/src/systems/server/network/interfaces";

import type { BankRepository } from "../../database/repositories/BankRepository";
import type { CharacterRepository } from "../../database/repositories/CharacterRepository";
import type { InventoryRepository } from "../../database/repositories/InventoryRepository";
import type { FriendRepository } from "../../database/repositories/FriendRepository";
import type { DatabaseSystem } from "../DatabaseSystem";
import type { AgentManager } from "../../eliza/AgentManager";
import type { resolveStreamingViewerAccessToken } from "../../streaming/stream-viewer-access-token";
import type { getAgentRuntimeByCharacterId } from "../../eliza/ModelAgentSpawner";
import type { createJWT, verifyJWT } from "../../shared/utils";
import type { AuthBridgeSystem } from "../AuthBridgeSystem";
import type { PacketHandlerBridgeSystem } from "../PacketHandlerBridgeSystem";
import type { BroadcastManager } from "./broadcast";
import type { EventBridge } from "./event-bridge";
import type { ConnectionHandler } from "./connection-handler";
import type { DuelStakeTransferBridgeSystem } from "../DuelStakeTransferBridgeSystem/index.js";

// Each `Assert<T, U>` alias is a compile-time-only statement that the server
// implementation T is assignable to the shared interface U.
type Assert<T extends U, U> = T;

// Repositories ---------------------------------------------------------------
type _BankRepo = Assert<BankRepository, IBankRepository>;
type _CharRepo = Assert<CharacterRepository, ICharacterRepository>;
type _InvRepo = Assert<InventoryRepository, IInventoryRepository>;
type _FriendRepo = Assert<FriendRepository, IFriendRepository>;

// DatabaseSystem -------------------------------------------------------------
type _DbSys = Assert<DatabaseSystem, IDatabaseSystem>;

// Agent manager --------------------------------------------------------------
type _AgentMgr = Assert<AgentManager, IAgentManager>;

// Agent runtime lookup — server exposes a module-level function, wrap it in
// an object shape matching IAgentRuntimeLookup.
type _AgentLookup = Assert<
  { getAgentRuntimeByCharacterId: typeof getAgentRuntimeByCharacterId },
  IAgentRuntimeLookup
>;

// Streaming access tokens — same wrapping pattern.
type _StreamingTokens = Assert<
  {
    resolveStreamingViewerAccessToken: typeof resolveStreamingViewerAccessToken;
  },
  IStreamingAccessTokens
>;

// Auth service ---------------------------------------------------------------
type _Auth = Assert<
  { createJWT: typeof createJWT; verifyJWT: typeof verifyJWT },
  IAuthService
>;

// AuthBridgeSystem structurally satisfies IAuthService and can be registered
// via world.register("auth", AuthBridgeSystem) — Step 5e (JWT wiring).
type _AuthBridge = Assert<AuthBridgeSystem, IAuthService>;

// PacketHandlerBridgeSystem satisfies IPacketHandlerRegistry —
// PLAN_SERVERNETWORK_MIGRATION.md Step 5d alternative.
type _PacketRegistry = Assert<
  PacketHandlerBridgeSystem,
  IPacketHandlerRegistry
>;

// BroadcastManager satisfies IBroadcastManager — Step 6 prerequisite so
// ServerNetwork can depend on the interface instead of the concrete class.
type _Broadcast = Assert<BroadcastManager, IBroadcastManager>;

// EventBridge satisfies IEventBridge — Step 6 prerequisite so ServerNetwork
// only depends on the two lifecycle methods (setupEventListeners, destroy)
// rather than the concrete class (which pulls in BankRepository, pg, drizzle).
type _EventBridgeAsserts = Assert<EventBridge, IEventBridge>;

// ConnectionHandler satisfies IConnectionHandler — Step 6 prerequisite so
// ServerNetwork only depends on `setSpatialIndex` and `handleConnection`
// rather than the concrete class (which pulls in BankRepository,
// CharacterRepository, pg, drizzle, and streaming access tokens).
type _ConnectionHandlerAsserts = Assert<ConnectionHandler, IConnectionHandler>;

// DuelStakeTransferBridgeSystem satisfies IDuelStakeTransfer — registered
// via world.register("duel-stake-transfer", ...). Keeps the server-only
// `executeDuelStakeTransferWithRetry` (Drizzle + InventoryRepository
// transaction) out of ServerNetwork's direct import graph.
type _DuelStakeTransferAsserts = Assert<
  DuelStakeTransferBridgeSystem,
  IDuelStakeTransfer
>;

// ServerNetworkManagerFactoryBridgeSystem satisfies
// IServerNetworkManagerFactory — registered via
// world.register("server-network-factory", ...). Keeps the server-only
// concrete BroadcastManager / EventBridge / ConnectionHandler construction
// behind a single injection point.
import { ServerNetworkManagerFactoryBridgeSystem } from "../ServerNetworkManagerFactoryBridgeSystem";
type _ServerNetworkManagerFactoryAsserts = Assert<
  ServerNetworkManagerFactoryBridgeSystem,
  IServerNetworkManagerFactory
>;

// Silence the unused-type-alias lint — this file is all assertions, not exports.
export type __ServerNetworkInterfaceAssertions = [
  _BankRepo,
  _CharRepo,
  _InvRepo,
  _FriendRepo,
  _DbSys,
  _AgentMgr,
  _AgentLookup,
  _StreamingTokens,
  _Auth,
  _AuthBridge,
  _PacketRegistry,
  _Broadcast,
  _EventBridgeAsserts,
  _ConnectionHandlerAsserts,
  _DuelStakeTransferAsserts,
  _ServerNetworkManagerFactoryAsserts,
];
