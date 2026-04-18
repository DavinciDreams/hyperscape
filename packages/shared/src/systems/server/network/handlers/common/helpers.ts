/**
 * Pure Handler Helper Functions (shared package portion)
 *
 * Contains only helpers that do NOT depend on pg, drizzle, or the server's
 * database schema. `getDatabase` remains in the server package.
 *
 * Part of the ServerNetwork → @hyperforge/shared migration
 * (PLAN_SERVERNETWORK_MIGRATION.md Step 5b).
 */

import type { ServerSocket } from "../../server-types";
import type { World } from "../../../../../index";

// ============================================================================
// SOCKET HELPERS
// ============================================================================

/**
 * Extract player ID from authenticated socket.
 * Returns null if socket has no authenticated player.
 */
export function getPlayerId(socket: ServerSocket): string | null {
  return socket.player?.id || null;
}

/**
 * Send packet to socket with null safety.
 * No-op if socket.send is not available.
 */
export function sendToSocket(
  socket: ServerSocket,
  packet: string,
  data: unknown,
): void {
  if (socket.send) {
    socket.send(packet, data);
  }
}

/**
 * Send error toast to player.
 * Convenience wrapper for common error pattern.
 */
export function sendErrorToast(socket: ServerSocket, message: string): void {
  sendToSocket(socket, "showToast", { message, type: "error" });
}

/**
 * Send success toast to player.
 * Convenience wrapper for common success pattern.
 */
export function sendSuccessToast(socket: ServerSocket, message: string): void {
  sendToSocket(socket, "showToast", { message, type: "success" });
}

// ============================================================================
// WORLD / SESSION HELPERS
// ============================================================================

/**
 * Session type returned by session manager
 */
export interface SessionInfo {
  targetEntityId: string;
  type?: string;
}

/**
 * Get session manager from world.
 * Returns undefined if session manager is not available.
 *
 * Session manager is single source of truth for UI sessions (store, bank, dialogue).
 */
export function getSessionManager(
  world: World,
): { getSession: (playerId: string) => SessionInfo | undefined } | undefined {
  return (
    world as {
      interactionSessionManager?: {
        getSession: (playerId: string) => SessionInfo | undefined;
      };
    }
  ).interactionSessionManager;
}

/**
 * Check if player has an active UI session (store, bank, dialogue)
 * Players with active sessions should not be able to initiate certain actions
 */
export function hasActiveInterfaceSession(
  world: World,
  playerId: string,
): boolean {
  const sessionManager = getSessionManager(world);
  if (!sessionManager) return false;
  return sessionManager.getSession(playerId) !== undefined;
}

// ============================================================================
// ENTITY HELPERS
// ============================================================================

/**
 * Position type for entity lookups.
 * Uses x/z for ground plane (OSRS-style), y optional for elevation.
 */
export interface EntityPosition {
  readonly x: number;
  readonly z: number;
  readonly y?: number;
}

/**
 * Get entity position from entity object.
 * Handles both .position and .base?.position patterns.
 * Returns null if no position found.
 */
export function getEntityPosition(entity: unknown): EntityPosition | null {
  if (!entity) return null;

  const typed = entity as {
    position?: EntityPosition;
    base?: { position?: EntityPosition };
  };

  return typed.position || typed.base?.position || null;
}
