import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { __bettingPoolManagerTestInternals as internals } from "../../../../src/systems/DuelScheduler/BettingPoolManager.js";

describe("BettingPoolManager input validation", () => {
  it("accepts bounded positive decimal bet amounts", () => {
    expect(internals.isValidPositiveDecimalAmount("1")).toBe(true);
    expect(internals.isValidPositiveDecimalAmount("0.00000001")).toBe(true);
    expect(
      internals.isValidPositiveDecimalAmount("999999999999999999.12345678"),
    ).toBe(true);
  });

  it("rejects zero, negative, over-precision, and oversized bet amounts", () => {
    for (const amount of [
      "0",
      "0.0",
      "-1",
      "1.123456789",
      "1000000000000000000",
      "1e6",
      "NaN",
      "Infinity",
      "",
    ]) {
      expect(internals.isValidPositiveDecimalAmount(amount), amount).toBe(
        false,
      );
    }
  });

  it("validates Solana-style wallet addresses without accepting malformed strings", () => {
    expect(
      internals.isValidSolanaWalletAddress(
        Keypair.generate().publicKey.toBase58(),
      ),
    ).toBe(true);

    for (const wallet of [
      "",
      "0".repeat(32),
      "O".repeat(32),
      "I".repeat(32),
      "l".repeat(32),
      "short",
      "1".repeat(45),
    ]) {
      expect(internals.isValidSolanaWalletAddress(wallet), wallet).toBe(false);
    }
  });
});
