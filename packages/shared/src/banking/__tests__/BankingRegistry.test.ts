import { BankingManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { BankingNotLoadedError, BankingRegistry } from "../BankingRegistry.js";

function manifest() {
  return BankingManifestSchema.parse({
    $schema: "hyperforge.banking.v1",
    sizes: {
      maxBankSlots: 816,
      slotsPerTab: 56,
      maxTabs: 9,
      defaultTabs: 1,
      defaultSlots: 56,
    },
    ui: { itemsPerRow: 8 },
    transactionLimits: {
      maxItemStack: 2_147_483_647,
      minItemQuantity: 1,
    },
    errors: {
      bankFull: "x",
      invalidQuantity: "x",
      itemNotFound: "x",
      insufficientQuantity: "x",
      invalidSlot: "x",
      noBankData: "x",
      bankNotOpen: "x",
      insufficientPouchCoins: "x",
      insufficientBankCoins: "x",
      coinOverflow: "x",
    },
    messages: {
      itemDeposited: "x",
      itemWithdrawn: "x",
      bankOpened: "x",
      bankClosed: "x",
      coinsDeposited: "x",
      coinsWithdrawn: "x",
    },
  });
}

describe("BankingRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new BankingRegistry().manifest).toThrow(BankingNotLoadedError);
  });

  it("totalSlotsForTabs scales by slotsPerTab, capped at maxBankSlots", () => {
    const r = new BankingRegistry(manifest());
    expect(r.totalSlotsForTabs(1)).toBe(56);
    expect(r.totalSlotsForTabs(9)).toBe(504);
    // Over-cap requests clamp to maxTabs first
    expect(r.totalSlotsForTabs(100)).toBe(504);
    // 0 or negative clamped to 1
    expect(r.totalSlotsForTabs(0)).toBe(56);
  });

  it("isStackAmountValid enforces min/max", () => {
    const r = new BankingRegistry(manifest());
    expect(r.isStackAmountValid(1)).toBe(true);
    expect(r.isStackAmountValid(0)).toBe(false);
    expect(r.isStackAmountValid(2_147_483_647)).toBe(true);
    expect(r.isStackAmountValid(2_147_483_648)).toBe(false);
  });
});
