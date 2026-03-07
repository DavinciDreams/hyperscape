import { describe, expect, it } from "vitest";
import { validateArenaDeployEnv } from "../../../src/startup/arena-deploy-config";

describe("validateArenaDeployEnv", () => {
  it("does nothing when arena deploy paths are disabled", () => {
    expect(validateArenaDeployEnv({})).toEqual({
      missing: [],
      warnings: [],
    });
  });

  it("requires explicit Solana deploy env when arena betting is enabled", () => {
    expect(
      validateArenaDeployEnv({
        DUEL_BETTING_ENABLED: "true",
      }),
    ).toEqual({
      missing: [
        "SOLANA_RPC_URL",
        "SOLANA_WS_URL",
        "SOLANA_ARENA_MARKET_PROGRAM_ID",
        "SOLANA_GOLD_MINT",
      ],
      warnings: ["SOLANA_ARENA_AUTHORITY_SECRET"],
    });
  });

  it("warns when BSC external verification is only partially configured", () => {
    const validation = validateArenaDeployEnv({
      DUEL_BETTING_ENABLED: "true",
      SOLANA_RPC_URL: "https://solana-rpc.example",
      SOLANA_WS_URL: "wss://solana-rpc.example",
      SOLANA_ARENA_MARKET_PROGRAM_ID: "market_program",
      SOLANA_GOLD_MINT: "gold_mint",
      BSC_RPC_URL: "https://bsc-rpc.example",
    });

    expect(validation.missing).toEqual([]);
    expect(validation.warnings).toContain("SOLANA_ARENA_AUTHORITY_SECRET");
    expect(validation.warnings).toContain(
      "BSC_RPC_URL and BSC_GOLD_CLOB_ADDRESS (both required for BSC external points verification)",
    );
  });
});
