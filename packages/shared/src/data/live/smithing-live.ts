/**
 * smithing-live.ts
 *
 * Provider-first live-getters for the authored smithing manifest fields that
 * may change at runtime through PIE hot-reload. Reads through the module-
 * level `smithingProvider` singleton and falls back to the boot-frozen
 * `SMITHING_CONSTANTS` values when the provider is unloaded.
 */

import { smithingProvider } from "../SmithingProvider";
import { SMITHING_CONSTANTS } from "../../constants/SmithingConstants";

/** Default ticks required to smelt one bar when the recipe doesn't override. */
export function getDefaultSmeltingTicks(): number {
  return (
    smithingProvider.getManifest()?.timing.defaultSmeltingTicks ??
    SMITHING_CONSTANTS.DEFAULT_SMELTING_TICKS
  );
}

/** Default ticks required to smith one item when the recipe doesn't override. */
export function getDefaultSmithingTicks(): number {
  return (
    smithingProvider.getManifest()?.timing.defaultSmithingTicks ??
    SMITHING_CONSTANTS.DEFAULT_SMITHING_TICKS
  );
}

/** Hammer item ID required for smithing at an anvil. */
export function getHammerItemId(): string {
  return (
    smithingProvider.getManifest()?.items.hammerItemId ??
    SMITHING_CONSTANTS.HAMMER_ITEM_ID
  );
}
