/**
 * Interaction System Constants — MANIFEST FAÇADE
 *
 * As of Phase A10 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the tuning
 * values previously hardcoded here live in `interaction.json`,
 * validated at module load time against `InteractionManifestSchema`
 * from `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`SessionType`, `INTERACTION_DISTANCE`, `TRANSACTION_RATE_LIMIT_MS`,
 * `SESSION_CONFIG`, `INPUT_LIMITS`) so the existing consumers don't
 * have to change.
 *
 * `INPUT_LIMITS.MAX_BANK_SLOTS` continues to come from
 * `BANKING_CONSTANTS` — banking is the single source of truth for
 * bank slot counts.
 */

import { InteractionManifestSchema } from "@hyperforge/manifest-schema";

import { BANKING_CONSTANTS } from "./BankingConstants";
import interactionManifestJson from "./interaction.json" with { type: "json" };

const manifest = InteractionManifestSchema.parse(interactionManifestJson);

// ============================================================================
// SESSION TYPES
// ============================================================================

/**
 * Narrow literal union. Hardcoded for exhaustive-switch ergonomics
 * (consumers rely on literal narrowing in switch statements).
 * The runtime JSON values are asserted equal below; Zod has already
 * validated the JSON at parse time, so any drift fails fast.
 */
export type SessionType = "store" | "bank" | "dialogue";

export const SessionType = Object.freeze({
  STORE: "store",
  BANK: "bank",
  DIALOGUE: "dialogue",
} as const satisfies Record<string, SessionType>);

// Drift check — if the manifest ever diverges from the hardcoded union
// above, fail fast at module load.
{
  const expected: Record<"store" | "bank" | "dialogue", string> = {
    store: manifest.sessionTypes.store,
    bank: manifest.sessionTypes.bank,
    dialogue: manifest.sessionTypes.dialogue,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (value !== key) {
      throw new Error(
        `interaction manifest drift: sessionTypes.${key} must equal "${key}", got "${value}"`,
      );
    }
  }
}

// ============================================================================
// DISTANCE CONFIGURATION (tile-based-MMORPG-style Chebyshev)
// ============================================================================

/**
 * Maximum interaction distances per session type.
 * Uses Chebyshev distance (max of |dx|, |dz|) - classic MMORPG standard.
 */
export const INTERACTION_DISTANCE: Readonly<Record<SessionType, number>> =
  Object.freeze({
    [SessionType.STORE]: manifest.interactionDistance.store,
    [SessionType.BANK]: manifest.interactionDistance.bank,
    [SessionType.DIALOGUE]: manifest.interactionDistance.dialogue,
  });

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Milliseconds between allowed transactions.
 * 50ms = ~20 ops/sec. Sufficient for gameplay, blocks automation.
 */
export const TRANSACTION_RATE_LIMIT_MS = manifest.transactionRateLimitMs;

// ============================================================================
// SESSION VALIDATION TIMING
// ============================================================================

export const SESSION_CONFIG = Object.freeze({
  /** Ticks between distance validations (600ms ticks x 1 = 0.6s for responsive UI closing) */
  VALIDATION_INTERVAL_TICKS: manifest.sessionConfig.validationIntervalTicks,
  /** Grace period after opening before validation starts */
  GRACE_PERIOD_TICKS: manifest.sessionConfig.gracePeriodTicks,
  /** Maximum session duration in ticks before auto-close */
  MAX_SESSION_TICKS: manifest.sessionConfig.maxSessionTicks,
});

// ============================================================================
// INPUT VALIDATION LIMITS
// ============================================================================

export const INPUT_LIMITS = Object.freeze({
  MAX_ITEM_ID_LENGTH: manifest.inputLimits.maxItemIdLength,
  MAX_STORE_ID_LENGTH: manifest.inputLimits.maxStoreIdLength,
  MAX_QUANTITY: manifest.inputLimits.maxQuantity,
  MAX_INVENTORY_SLOTS: manifest.inputLimits.maxInventorySlots,
  /** Single source of truth: BankingConstants.ts */
  MAX_BANK_SLOTS: BANKING_CONSTANTS.MAX_BANK_SLOTS,
  /** Max age for request timestamps - prevents replay attacks */
  MAX_REQUEST_AGE_MS: manifest.inputLimits.maxRequestAgeMs,
  /** Max clock skew tolerance (into future) */
  MAX_CLOCK_SKEW_MS: manifest.inputLimits.maxClockSkewMs,
});
