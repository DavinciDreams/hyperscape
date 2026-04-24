/**
 * Banking system constants — MANIFEST FAÇADE
 *
 * As of Phase A7 of PLAN_WORLD_STUDIO_AAA_COMPLETION.md, the source of truth
 * for banking sizes, UI settings, transaction limits, and user-facing
 * messages lives in `banking-constants.json`, validated at module load
 * time against `BankingManifestSchema` from `@hyperforge/manifest-schema`.
 *
 * This TS file preserves the exact legacy export shape
 * (`BANKING_CONSTANTS`, `BankingError`, `BankingMessage`) so the existing
 * consumers don't have to change.
 *
 * The narrow literal-union types `BankingError` / `BankingMessage` are
 * derived from the JSON's pre-parse import type (same pattern as
 * `TreeSubType`), preserving the compile-time check that only known
 * strings satisfy the types.
 */

import { BankingManifestSchema } from "@hyperforge/manifest-schema";

import bankingManifestJson from "./banking-constants.json" with { type: "json" };

const manifest = BankingManifestSchema.parse(bankingManifestJson);

export const BANKING_CONSTANTS = Object.freeze({
  // Bank sizes
  MAX_BANK_SLOTS: manifest.sizes.maxBankSlots,
  SLOTS_PER_TAB: manifest.sizes.slotsPerTab,
  MAX_TABS: manifest.sizes.maxTabs,

  // Default bank configuration
  DEFAULT_TABS: manifest.sizes.defaultTabs,
  DEFAULT_SLOTS: manifest.sizes.defaultSlots,

  // UI Settings
  ITEMS_PER_ROW: manifest.ui.itemsPerRow,

  // Transaction limits
  MAX_ITEM_STACK: manifest.transactionLimits.maxItemStack,
  MIN_ITEM_QUANTITY: manifest.transactionLimits.minItemQuantity,

  // Error messages
  ERRORS: Object.freeze({
    BANK_FULL: manifest.errors.bankFull,
    INVALID_QUANTITY: manifest.errors.invalidQuantity,
    ITEM_NOT_FOUND: manifest.errors.itemNotFound,
    INSUFFICIENT_QUANTITY: manifest.errors.insufficientQuantity,
    INVALID_SLOT: manifest.errors.invalidSlot,
    NO_BANK_DATA: manifest.errors.noBankData,
    BANK_NOT_OPEN: manifest.errors.bankNotOpen,
    // Coin-specific errors
    INSUFFICIENT_POUCH_COINS: manifest.errors.insufficientPouchCoins,
    INSUFFICIENT_BANK_COINS: manifest.errors.insufficientBankCoins,
    COIN_OVERFLOW: manifest.errors.coinOverflow,
  }),

  // Success messages
  MESSAGES: Object.freeze({
    ITEM_DEPOSITED: manifest.messages.itemDeposited,
    ITEM_WITHDRAWN: manifest.messages.itemWithdrawn,
    BANK_OPENED: manifest.messages.bankOpened,
    BANK_CLOSED: manifest.messages.bankClosed,
    // Coin-specific messages
    COINS_DEPOSITED: manifest.messages.coinsDeposited,
    COINS_WITHDRAWN: manifest.messages.coinsWithdrawn,
  }),
});

/**
 * Narrow literal-union types derived from the JSON's pre-parse import
 * type. Using `typeof bankingManifestJson.errors[...]` preserves the
 * string-literal values at compile time (same trick as `TreeSubType`).
 */
type JsonErrors = typeof bankingManifestJson.errors;
type JsonMessages = typeof bankingManifestJson.messages;

export type BankingError = JsonErrors[keyof JsonErrors];
export type BankingMessage = JsonMessages[keyof JsonMessages];
