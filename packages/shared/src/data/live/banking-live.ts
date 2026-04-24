/**
 * banking-live.ts
 *
 * Provider-first live-getters for authored banking tuning fields
 * (capacity / UI / transaction limits) that may change at runtime
 * through PIE hot-reload. Reads through the module-level
 * `bankingProvider` singleton and falls back to the boot-captured
 * `BANKING_CONSTANTS` values when the provider is unloaded.
 */

import { bankingProvider } from "../BankingProvider";
import { BANKING_CONSTANTS } from "../../constants/BankingConstants";

/** Maximum number of slots a player bank can hold. */
export function getMaxBankSlots(): number {
  return (
    bankingProvider.getManifest()?.sizes.maxBankSlots ??
    BANKING_CONSTANTS.MAX_BANK_SLOTS
  );
}

/** Slots rendered per bank tab. */
export function getBankSlotsPerTab(): number {
  return (
    bankingProvider.getManifest()?.sizes.slotsPerTab ??
    BANKING_CONSTANTS.SLOTS_PER_TAB
  );
}

/** Maximum number of tabs a player bank supports. */
export function getMaxBankTabs(): number {
  return (
    bankingProvider.getManifest()?.sizes.maxTabs ?? BANKING_CONSTANTS.MAX_TABS
  );
}

/** Default number of tabs created for a new player bank. */
export function getDefaultBankTabs(): number {
  return (
    bankingProvider.getManifest()?.sizes.defaultTabs ??
    BANKING_CONSTANTS.DEFAULT_TABS
  );
}

/** Default visible slot count for a new player bank. */
export function getDefaultBankSlots(): number {
  return (
    bankingProvider.getManifest()?.sizes.defaultSlots ??
    BANKING_CONSTANTS.DEFAULT_SLOTS
  );
}
