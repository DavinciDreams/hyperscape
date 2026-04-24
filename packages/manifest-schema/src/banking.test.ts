/**
 * Faithfulness test: a banking manifest built from the values currently
 * hardcoded in `packages/shared/src/constants/BankingConstants.ts` MUST
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { BankingManifestSchema, type BankingManifest } from "./banking.js";

const hyperscapeBankingManifest: BankingManifest = {
  $schema: "hyperforge.banking.v1",
  sizes: {
    maxBankSlots: 480,
    slotsPerTab: 40,
    maxTabs: 12,
    defaultTabs: 1,
    defaultSlots: 40,
  },
  ui: {
    itemsPerRow: 8,
  },
  transactionLimits: {
    maxItemStack: 2147483647,
    minItemQuantity: 1,
  },
  errors: {
    bankFull: "Bank is full",
    invalidQuantity: "Invalid quantity",
    itemNotFound: "Item not found",
    insufficientQuantity: "Insufficient quantity in bank",
    invalidSlot: "Invalid slot number",
    noBankData: "No bank data found",
    bankNotOpen: "Bank is not open",
    insufficientPouchCoins: "Not enough coins in money pouch",
    insufficientBankCoins: "Not enough coins in bank",
    coinOverflow: "Cannot carry that many coins",
  },
  messages: {
    itemDeposited: "Item deposited successfully",
    itemWithdrawn: "Item withdrawn successfully",
    bankOpened: "Bank opened",
    bankClosed: "Bank closed",
    coinsDeposited: "Coins deposited to bank",
    coinsWithdrawn: "Coins withdrawn from bank",
  },
};

describe("BankingManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = BankingManifestSchema.safeParse(hyperscapeBankingManifest);
    if (!result.success) {
      throw new Error(
        `Hyperscape banking manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects wrong schema version", () => {
    const wrong = {
      ...hyperscapeBankingManifest,
      $schema: "hyperforge.banking.v0",
    };
    const result = BankingManifestSchema.safeParse(wrong);
    expect(result.success).toBe(false);
  });

  it("rejects negative bank size", () => {
    const bad = {
      ...hyperscapeBankingManifest,
      sizes: { ...hyperscapeBankingManifest.sizes, maxBankSlots: -1 },
    };
    const result = BankingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty error message", () => {
    const bad = {
      ...hyperscapeBankingManifest,
      errors: { ...hyperscapeBankingManifest.errors, bankFull: "" },
    };
    const result = BankingManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
