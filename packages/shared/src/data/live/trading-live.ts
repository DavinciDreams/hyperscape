/**
 * trading-live.ts
 *
 * Provider-first live-getters for the authored trading manifest fields
 * that may change at runtime through PIE hot-reload. Reads through the
 * module-level `tradingProvider` singleton and falls back to the boot-
 * frozen `TRADE_CONSTANTS` values when the provider is unloaded.
 *
 * Schema stores timeouts in seconds; legacy `TRADE_CONSTANTS` stores
 * them in milliseconds. These helpers return milliseconds (matching
 * legacy call sites) and convert on the schema-loaded path.
 */

import { tradingProvider } from "../TradingProvider";
import { TRADE_CONSTANTS } from "../../types/game/trade-types";

/** Maximum items per side per trade session (RS-classic default = 28). */
export function getMaxTradeSlots(): number {
  return (
    tradingProvider.getManifest()?.session.maxItemSlotsPerSide ??
    TRADE_CONSTANTS.MAX_TRADE_SLOTS
  );
}

/** Trade-invite timeout before auto-expire (milliseconds). */
export function getRequestTimeoutMs(): number {
  const sec = tradingProvider.getManifest()?.session.requestTimeoutSec;
  return sec !== undefined ? sec * 1000 : TRADE_CONSTANTS.REQUEST_TIMEOUT_MS;
}

/** Active-session inactivity timeout (milliseconds). */
export function getActivityTimeoutMs(): number {
  const sec = tradingProvider.getManifest()?.session.inactivityTimeoutSec;
  return sec !== undefined ? sec * 1000 : TRADE_CONSTANTS.ACTIVITY_TIMEOUT_MS;
}

/** Minimum interval between trade invites to the same target (milliseconds). */
export function getRequestCooldownMs(): number {
  const sec =
    tradingProvider.getManifest()?.rateLimit.perTargetRequestCooldownSec;
  return sec !== undefined ? sec * 1000 : TRADE_CONSTANTS.REQUEST_COOLDOWN_MS;
}
