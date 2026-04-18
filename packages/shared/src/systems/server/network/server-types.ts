/**
 * Server Network Types — relocated from `packages/server/src/shared/types/`
 * as part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5 prerequisite).
 *
 * Pure types with no runtime dependencies outside shared. Real implementations
 * (sockets, player entities) live in the server package but structurally
 * match these type contracts.
 */

import type { Entity } from "../../../index";
import { Socket } from "../../../index";

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/**
 * Node.js WebSocket type with server-specific methods
 *
 * Extends the standard WebSocket interface with Node.js ws library methods
 * like ping(), terminate(), and event handlers.
 */
export type NodeWebSocket = WebSocket & {
  on: (event: string, listener: Function) => void;
  removeListener?: (event: string, listener: Function) => void;
  removeAllListeners?: () => void;
  listenerCount?: (event: string) => number;
  ping: () => void;
  terminate: () => void;
  __wsId?: string;
  __remoteAddress?: string;
};

/**
 * Player entity with server-specific properties
 *
 * Extends the base Entity type with player-specific data and methods.
 * Includes roles for permission checks (admin, builder, etc).
 */
export type PlayerEntity = Entity & {
  data: {
    id: string;
    userId?: string;
    roles?: string[];
    [key: string]: unknown;
  };
  serialize: () => unknown;
};

/**
 * Server-side socket with player and authentication data
 */
export interface ServerSocket extends Socket {
  player?: PlayerEntity;
  ws: NodeWebSocket;
  network: NetworkWithSocket;

  accountId?: string;
  selectedCharacterId?: string;
  characterId?: string;
  pendingClientReady?: boolean;
  createdAt?: number;
  clientReadyTimeoutId?: NodeJS.Timeout;
  isSpectator?: boolean;
  spectatingCharacterId?: string;
  spectatingDuelParticipantIds?: string[];
}

// ============================================================================
// CONNECTION TYPES
// ============================================================================

export interface ConnectionParams {
  authToken?: string;
  name?: string;
  avatar?: string;
  privyUserId?: string;
  mode?: string;
  followEntity?: string;
  characterId?: string;
  streamToken?: string;
}

export interface NetworkWithSocket {
  onConnection: (ws: NodeWebSocket, params: ConnectionParams) => Promise<void>;
  sockets: Map<string, ServerSocket>;
  enqueue: (socket: Socket, method: string, data: unknown) => void;
  onDisconnect: (socket: Socket, code?: number | string) => void;
}

export interface ServerNetworkWithSockets {
  sockets: Map<
    string,
    ServerSocket & {
      player: PlayerEntity | null;
    }
  >;
}

// ============================================================================
// WORLD / GAME TYPES
// ============================================================================

export interface SpawnData {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export type TerrainSystem = {
  getHeightAt: (x: number, z: number) => number;
  isReady: () => boolean;
};

export interface ResourceEntity {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  isAvailable: boolean;
  lastDepleted?: number;
  respawnTime?: number;
}

export interface ResourceSystem {
  getAllResources?: () => ResourceEntity[];
}

export interface InventorySystemData {
  getInventoryData?: (playerId: string) => {
    items: unknown[];
    coins: number;
    maxSlots: number;
  };
}

export interface ServerStats {
  currentCPU: number;
  currentMemory: number;
  maxMemory: number;
}

// ============================================================================
// CHAT SYSTEM
// ============================================================================

export type ChatMessageType =
  | "chat"
  | "system"
  | "activity"
  | "warning"
  | "news"
  | "trade"
  | "private";

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  channel?: string;
  type?: ChatMessageType;
}
