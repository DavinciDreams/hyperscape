/**
 * Trade System Types
 *
 * Type definitions for player-to-player trading system.
 * Follows tile-based-MMORPG-style trade mechanics with mutual acceptance.
 *
 * Trade Flow:
 * 1. Player A requests trade with Player B (tradeRequest)
 * 2. Player B receives request modal (tradeIncoming)
 * 3. Player B accepts/declines (tradeRequestRespond)
 * 4. If accepted, both receive trade window (tradeStarted)
 * 5. Players add/remove items (tradeAddItem, tradeRemoveItem)
 * 6. Players accept trade (tradeAccept) - acceptance resets if offers change
 * 7. When both accept, items are swapped (tradeCompleted)
 *
 * @see packages/server/src/systems/TradingSystem for server implementation
 * @see packages/client/src/game/panels/TradePanel for UI implementation
 */

import type { PlayerID, ItemID, SlotNumber } from "@hyperforge/shared";

// ============================================================================
// Trade Session Types
// ============================================================================

/**
 * Trade session status
 * - pending: Trade request sent, waiting for response
 * - active: Trade window open, players adding/removing items (offer screen)
 * - confirming: Both players accepted, showing confirmation screen
 * - completed: Trade completed successfully
 * - cancelled: Trade cancelled
 */
export type TradeStatus =
  | "pending"
  | "active"
  | "confirming"
  | "completed"
  | "cancelled";

/**
 * Reason for trade cancellation
 */
export type TradeCancelReason =
  | "declined" // Recipient declined the trade request
  | "timeout" // Trade request timed out (30s)
  | "cancelled" // Either party cancelled active trade
  | "disconnected" // Either party disconnected
  | "player_died" // Either party died
  | "inventory_full" // Can't complete - recipient has no space
  | "invalid_items" // Items became invalid during trade
  | "server_error"; // Internal server error

/**
 * An item offered in a trade
 */
export type TradeOfferItem = {
  /** Original inventory slot the item came from */
  inventorySlot: SlotNumber;
  /** Item definition ID */
  itemId: ItemID;
  /** Quantity being traded (for stackable items) */
  quantity: number;
  /** Position in trade window (0-27) */
  tradeSlot: number;
};

/**
 * A participant in a trade session
 */
export type TradeParticipant = {
  /** Player's unique ID */
  playerId: PlayerID;
  /** Player's display name */
  playerName: string;
  /** Socket ID for network communication */
  socketId: string;
  /** Items the player is offering */
  offeredItems: TradeOfferItem[];
  /** Whether player has accepted current trade state */
  accepted: boolean;
};

/**
 * A trade session between two players
 */
export type TradeSession = {
  /** Unique trade session ID (UUID) */
  id: string;
  /** Current status of the trade */
  status: TradeStatus;
  /** Player who initiated the trade */
  initiator: TradeParticipant;
  /** Player who received the trade request */
  recipient: TradeParticipant;
  /** Unix timestamp when trade was created */
  createdAt: number;
  /** Unix timestamp when trade request expires (for pending trades) */
  expiresAt: number;
  /** Unix timestamp of last activity (for timeout detection) */
  lastActivityAt: number;
};

// ============================================================================
// Client → Server Packet Payloads
// ============================================================================

/**
 * Request to initiate trade with another player
 */
export type TradeRequestPayload = {
  /** ID of player to trade with */
  targetPlayerId: PlayerID;
};

/**
 * Response to incoming trade request
 */
export type TradeRequestRespondPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Whether to accept the trade request */
  accept: boolean;
};

/**
 * Add item from inventory to trade offer
 */
export type TradeAddItemPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Inventory slot to add from */
  inventorySlot: SlotNumber;
  /** Quantity to add (for stackable items, default: all) */
  quantity?: number;
};

/**
 * Remove item from trade offer back to inventory
 */
export type TradeRemoveItemPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Trade slot to remove from */
  tradeSlot: number;
};

/**
 * Set quantity for stackable item in trade
 */
export type TradeSetQuantityPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Trade slot containing the item */
  tradeSlot: number;
  /** New quantity */
  quantity: number;
};

/**
 * Accept current trade state
 */
export type TradeAcceptPayload = {
  /** Trade session ID */
  tradeId: string;
};

/**
 * Cancel acceptance (usually after offer changes)
 */
export type TradeCancelAcceptPayload = {
  /** Trade session ID */
  tradeId: string;
};

/**
 * Cancel/close trade session
 */
export type TradeCancelPayload = {
  /** Trade session ID */
  tradeId: string;
};

// ============================================================================
// Server → Client Packet Payloads
// ============================================================================

/**
 * Incoming trade request notification
 */
export type TradeIncomingPayload = {
  /** Trade session ID */
  tradeId: string;
  /** ID of player requesting trade */
  fromPlayerId: PlayerID;
  /** Display name of player requesting trade */
  fromPlayerName: string;
  /** Combat level for display */
  fromPlayerLevel: number;
};

/**
 * Trade session started
 */
export type TradeStartedPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Trading partner's ID */
  partnerId: PlayerID;
  /** Trading partner's name */
  partnerName: string;
  /** Trading partner's combat level */
  partnerLevel: number;
  /** Number of free inventory slots partner has (tile-based-MMORPG-style indicator) */
  partnerFreeSlots?: number;
};

/**
 * Client-side view of trade offer (for rendering)
 */
export type TradeOfferView = {
  /** Items in the offer */
  items: TradeOfferItem[];
  /** Whether player has accepted */
  accepted: boolean;
};

/**
 * Trade state update
 */
export type TradeUpdatedPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Local player's offer */
  myOffer: TradeOfferView;
  /** Partner's offer */
  theirOffer: TradeOfferView;
  /** Number of free inventory slots partner has (tile-based-MMORPG-style indicator) */
  partnerFreeSlots?: number;
};

/**
 * Trade completed successfully
 */
export type TradeCompletedPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Items received from partner */
  receivedItems: Array<{
    itemId: ItemID;
    quantity: number;
  }>;
};

/**
 * Trade cancelled
 */
export type TradeCancelledPayload = {
  /** Trade session ID */
  tradeId: string;
  /** Reason for cancellation */
  reason: TradeCancelReason;
  /** Human-readable message */
  message: string;
};

/**
 * Trade operation error
 */
export type TradeErrorPayload = {
  /** Error message */
  message: string;
  /** Error code for programmatic handling */
  code:
    | "NOT_IN_TRADE"
    | "INVALID_TRADE"
    | "INVALID_ITEM"
    | "INVALID_SLOT"
    | "INVALID_QUANTITY"
    | "INVENTORY_FULL"
    | "ALREADY_IN_TRADE"
    | "PLAYER_BUSY"
    | "PLAYER_OFFLINE"
    | "RATE_LIMITED"
    | "SELF_TRADE"
    | "UNTRADEABLE_ITEM"
    | "TOO_FAR"
    | "INTERFACE_OPEN";
};

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Trade screen type for two-screen confirmation flow (tile-based-MMORPG-style)
 * - offer: Main trading screen where players add/remove items
 * - confirm: Confirmation screen showing final summary
 */
export type TradeScreen = "offer" | "confirm";

/**
 * Trade window UI state
 */
export type TradeWindowState = {
  /** Whether trade window is open */
  isOpen: boolean;
  /** Current trade session ID */
  tradeId: string | null;
  /** Current screen in two-screen flow */
  screen: TradeScreen;
  /** Trading partner info */
  partner: {
    id: PlayerID;
    name: string;
    level: number;
  } | null;
  /** Local player's offered items */
  myOffer: TradeOfferItem[];
  /** Local player's acceptance state */
  myAccepted: boolean;
  /** Partner's offered items */
  theirOffer: TradeOfferItem[];
  /** Partner's acceptance state */
  theirAccepted: boolean;
  /** Total value of local player's offer (for wealth transfer indicator) */
  myOfferValue: number;
  /** Total value of partner's offer (for wealth transfer indicator) */
  theirOfferValue: number;
  /** Number of free inventory slots partner has (tile-based-MMORPG-style indicator) */
  partnerFreeSlots: number;
};

/**
 * Trade request modal state
 */
export type TradeRequestModalState = {
  /** Whether modal is visible */
  visible: boolean;
  /** Trade session ID */
  tradeId: string | null;
  /** Requesting player info */
  fromPlayer: {
    id: PlayerID;
    name: string;
    level: number;
  } | null;
};

// ============================================================================
// Constants
// ============================================================================

/**
 * Trade system constants
 */
export const TRADE_CONSTANTS = {
  /** Maximum items per trade offer (matches classic MMORPG inventory size) */
  MAX_TRADE_SLOTS: 28,

  /** Trade request timeout in milliseconds (30 seconds) */
  REQUEST_TIMEOUT_MS: 30_000,

  /** Active trade inactivity timeout in milliseconds (5 minutes) */
  ACTIVITY_TIMEOUT_MS: 5 * 60_000,

  /** Minimum interval between trade requests to same player (3 seconds) */
  REQUEST_COOLDOWN_MS: 3_000,

  /** Rate limit for trade operations (per second) */
  OPERATION_RATE_LIMIT: 10,
} as const;

// ============================================================================
// TradingSystem duck-type interface
// ============================================================================
// Migrated from `@hyperforge/shared/types/systems/system-interfaces`
// 2026-04-27 (top-10 #8 cleanup) so the duck-type contract lives with
// the implementation. Concrete `TradingSystem` class is a plain class
// (not a `System` subclass), so this is purely structural — no
// `extends System`. Resolved via `world.tradingSystem`.

/** Trading system result type. */
export interface TradeOperationResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * TradingSystem - server-authoritative player-to-player trading.
 *
 * Manages trade sessions between players with full validation,
 * atomic item swaps, and proper cleanup on disconnection.
 *
 * Trade Flow:
 *  1. Player A requests trade with Player B
 *  2. Player B receives request notification
 *  3. Player B accepts/declines
 *  4. If accepted, trade window opens for both
 *  5. Players add/remove items from their offers
 *  6. Both players must accept the final offer
 *  7. Server atomically swaps items between inventories
 */
export interface TradingSystem {
  // Trade Lifecycle
  createTradeRequest(
    initiatorId: string,
    initiatorName: string,
    initiatorSocketId: string,
    recipientId: string,
  ): TradeOperationResult & { tradeId?: string };

  respondToTradeRequest(
    tradeId: string,
    recipientId: string,
    recipientName: string,
    recipientSocketId: string,
    accept: boolean,
  ): TradeOperationResult;

  // Trade Operations
  addItemToTrade(
    tradeId: string,
    playerId: string,
    inventorySlot: number,
    itemId: string,
    quantity: number,
  ): TradeOperationResult;

  removeItemFromTrade(
    tradeId: string,
    playerId: string,
    tradeSlot: number,
  ): TradeOperationResult;

  setAcceptance(
    tradeId: string,
    playerId: string,
    accepted: boolean,
  ): TradeOperationResult & {
    bothAccepted?: boolean;
    moveToConfirming?: boolean;
  };

  moveToConfirmation(tradeId: string): TradeOperationResult;
  returnToOfferScreen(tradeId: string): TradeOperationResult;

  completeTrade(tradeId: string): TradeOperationResult & {
    initiatorReceives?: unknown[];
    recipientReceives?: unknown[];
    initiatorId?: string;
    recipientId?: string;
  };

  cancelTrade(
    tradeId: string,
    reason: string,
    cancelledBy?: string,
  ): TradeOperationResult;

  // Queries
  getTradeSession(tradeId: string): TradeSession | undefined;
  getPlayerTrade(playerId: string): TradeSession | undefined;
  getPlayerTradeId(playerId: string): string | undefined;
  isPlayerInTrade(playerId: string): boolean;
  getTradePartner(playerId: string): TradeParticipant | undefined;
  isPlayerOnline(playerId: string): boolean;
}
