/**
 * interaction-live.ts
 *
 * Provider-first live-getters for authored input-validation and
 * interaction tuning fields that may change at runtime through
 * PIE hot-reload. Reads through the `interactionProvider` singleton
 * and falls back to the boot-captured `INPUT_LIMITS` values when
 * the provider is unloaded.
 *
 * NOTE: `INPUT_LIMITS.MAX_BANK_SLOTS` is sourced from the banking
 * manifest (not the interaction manifest) — bank capacity is a
 * banking concern, not a network-input concern. Use
 * `banking-live.ts::getMaxBankSlots()` for that value.
 */

import { interactionProvider } from "../InteractionProvider";
import {
  INPUT_LIMITS,
  INTERACTION_DISTANCE,
  SESSION_CONFIG,
  TRANSACTION_RATE_LIMIT_MS,
} from "../../constants/interaction";
import type { SessionType } from "../../constants/interaction";

/** Maximum allowed length for item IDs in network payloads. */
export function getMaxItemIdLength(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxItemIdLength ??
    INPUT_LIMITS.MAX_ITEM_ID_LENGTH
  );
}

/** Maximum allowed length for store IDs in network payloads. */
export function getMaxStoreIdLength(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxStoreIdLength ??
    INPUT_LIMITS.MAX_STORE_ID_LENGTH
  );
}

/** Maximum allowed item quantity value. */
export function getMaxQuantity(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxQuantity ??
    INPUT_LIMITS.MAX_QUANTITY
  );
}

/** Maximum valid inventory slot index (exclusive upper bound). */
export function getMaxInventorySlotsInputLimit(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxInventorySlots ??
    INPUT_LIMITS.MAX_INVENTORY_SLOTS
  );
}

/** Maximum acceptable client-clock age for an input (milliseconds). */
export function getMaxRequestAgeMs(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxRequestAgeMs ??
    INPUT_LIMITS.MAX_REQUEST_AGE_MS
  );
}

/** Maximum acceptable forward clock-skew for an input (milliseconds). */
export function getMaxClockSkewMs(): number {
  return (
    interactionProvider.getManifest()?.inputLimits.maxClockSkewMs ??
    INPUT_LIMITS.MAX_CLOCK_SKEW_MS
  );
}

// ============================================================================
// INTERACTION DISTANCE (per session-type)
// ============================================================================

/**
 * Maximum Chebyshev distance (tiles) between a player and an interaction
 * target for the given session type. Honored by both
 * `InteractionSessionManager` (per-tick validator) and `ValidationService`
 * (transaction-time gate) so PIE edits apply without restart.
 */
export function getInteractionDistanceFor(sessionType: SessionType): number {
  const manifest = interactionProvider.getManifest();
  if (manifest) {
    const d = manifest.interactionDistance;
    if (sessionType === "store") return d.store;
    if (sessionType === "bank") return d.bank;
    if (sessionType === "dialogue") return d.dialogue;
  }
  return INTERACTION_DISTANCE[sessionType];
}

// ============================================================================
// TRANSACTION RATE LIMIT
// ============================================================================

/** Minimum milliseconds between consecutive transactions for a session. */
export function getTransactionRateLimitMs(): number {
  return (
    interactionProvider.getManifest()?.transactionRateLimitMs ??
    TRANSACTION_RATE_LIMIT_MS
  );
}

// ============================================================================
// SESSION VALIDATION TIMING
// ============================================================================

/** Ticks between interaction-session distance/timeout validations. */
export function getSessionValidationIntervalTicks(): number {
  return (
    interactionProvider.getManifest()?.sessionConfig.validationIntervalTicks ??
    SESSION_CONFIG.VALIDATION_INTERVAL_TICKS
  );
}

/** Grace period (ticks) after opening a session before validation starts. */
export function getSessionGracePeriodTicks(): number {
  return (
    interactionProvider.getManifest()?.sessionConfig.gracePeriodTicks ??
    SESSION_CONFIG.GRACE_PERIOD_TICKS
  );
}

/** Maximum session duration in ticks before auto-close (zombie cleanup). */
export function getSessionMaxSessionTicks(): number {
  return (
    interactionProvider.getManifest()?.sessionConfig.maxSessionTicks ??
    SESSION_CONFIG.MAX_SESSION_TICKS
  );
}
