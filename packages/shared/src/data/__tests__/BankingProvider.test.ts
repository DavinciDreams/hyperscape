/**
 * Tests for the BankingProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bankingProvider } from "../BankingProvider";

beforeEach(() => {
  bankingProvider.unload();
});
afterEach(() => {
  bankingProvider.unload();
});

const validManifest = {
  $schema: "hyperforge.banking.v1" as const,
  sizes: {
    maxBankSlots: 800,
    slotsPerTab: 100,
    maxTabs: 8,
    defaultTabs: 1,
    defaultSlots: 100,
  },
  ui: { itemsPerRow: 10 },
  transactionLimits: { maxItemStack: 2147483647, minItemQuantity: 1 },
  errors: {
    bankFull: "Bank is full.",
    invalidQuantity: "Invalid quantity.",
    itemNotFound: "Item not found.",
    insufficientQuantity: "Insufficient quantity.",
    invalidSlot: "Invalid slot.",
    noBankData: "No bank data.",
    bankNotOpen: "Bank not open.",
    insufficientPouchCoins: "Not enough coins in pouch.",
    insufficientBankCoins: "Not enough coins in bank.",
    coinOverflow: "Coin overflow.",
  },
  messages: {
    itemDeposited: "Deposited {item}.",
    itemWithdrawn: "Withdrew {item}.",
    bankOpened: "Bank opened.",
    bankClosed: "Bank closed.",
    coinsDeposited: "Coins deposited.",
    coinsWithdrawn: "Coins withdrawn.",
  },
};

describe("BankingProvider", () => {
  it("starts unloaded", () => {
    expect(bankingProvider.isLoaded()).toBe(false);
    expect(bankingProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline", () => {
    expect(() => bankingProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid minimal manifest", () => {
    const parsed = bankingProvider.loadRaw(validManifest);
    expect(parsed.$schema).toBe("hyperforge.banking.v1");
    expect(parsed.sizes.maxBankSlots).toBe(800);
  });

  it("loadRaw() rejects non-positive maxBankSlots", () => {
    const bad = {
      ...validManifest,
      sizes: { ...validManifest.sizes, maxBankSlots: 0 },
    };
    expect(() => bankingProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = bankingProvider.loadRaw(validManifest);
    bankingProvider.unload();
    bankingProvider.load(parsed);
    expect(bankingProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    bankingProvider.loadRaw(validManifest);
    bankingProvider.hotReload(null);
    expect(bankingProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    bankingProvider.loadRaw(validManifest);
    bankingProvider.unload();
    expect(bankingProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(bankingProvider).toBe(bankingProvider);
  });
});
