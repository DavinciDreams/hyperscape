import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDuelArenaOracleConfig } from "../../../src/oracle/config.js";

const ORIGINAL_ENV = { ...process.env };

function clearOracleEnv() {
  for (const key in process.env) {
    if (key.startsWith("DUEL_ARENA_ORACLE_")) {
      vi.stubEnv(key, "");
    }
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  clearOracleEnv();
});

describe("getDuelArenaOracleConfig", () => {
  it("builds local Anvil and Solana localnet targets for the local profile", () => {
    process.env.DUEL_ARENA_ORACLE_ENABLED = "true";
    process.env.DUEL_ARENA_ORACLE_PROFILE = "local";
    process.env.DUEL_ARENA_ORACLE_ANVIL_CONTRACT_ADDRESS =
      "0x1111111111111111111111111111111111111111";
    process.env.DUEL_ARENA_ORACLE_ANVIL_PRIVATE_KEY =
      "0x1111111111111111111111111111111111111111111111111111111111111111";
    process.env.DUEL_ARENA_ORACLE_SOLANA_LOCALNET_AUTHORITY_SECRET =
      "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    process.env.DUEL_ARENA_ORACLE_SOLANA_LOCALNET_PROGRAM_ID =
      "6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD";

    const config = getDuelArenaOracleConfig();

    expect(config.enabled).toBe(true);
    expect(config.profile).toBe("local");
    expect(config.evmTargets).toHaveLength(1);
    expect(config.evmTargets[0]?.key).toBe("anvil");
    expect(config.evmTargets[0]?.rpcUrl).toBe("http://127.0.0.1:8545");
    expect(config.solanaTargets).toHaveLength(1);
    expect(config.solanaTargets[0]?.key).toBe("solanaLocalnet");
    expect(config.solanaTargets[0]?.rpcUrl).toBe("http://127.0.0.1:8899");
    expect(config.solanaTargets[0]?.wsUrl).toBe("ws://127.0.0.1:8900");
  });

  it("does not activate local targets without the required credentials", () => {
    process.env.DUEL_ARENA_ORACLE_ENABLED = "true";
    process.env.DUEL_ARENA_ORACLE_PROFILE = "local";

    const config = getDuelArenaOracleConfig();

    expect(config.evmTargets).toHaveLength(0);
    expect(config.solanaTargets).toHaveLength(0);
  });

  it("uses shared EVM and Solana secrets when target-specific ones are unset", () => {
    process.env.DUEL_ARENA_ORACLE_ENABLED = "true";
    process.env.DUEL_ARENA_ORACLE_PROFILE = "testnet";
    process.env.DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY =
      "0x2222222222222222222222222222222222222222222222222222222222222222";
    process.env.DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET =
      "base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    process.env.DUEL_ARENA_ORACLE_BASE_SEPOLIA_CONTRACT_ADDRESS =
      "0x1111111111111111111111111111111111111111";
    process.env.DUEL_ARENA_ORACLE_BSC_TESTNET_CONTRACT_ADDRESS =
      "0x2222222222222222222222222222222222222222";
    process.env.DUEL_ARENA_ORACLE_AVAX_FUJI_CONTRACT_ADDRESS =
      "0x3333333333333333333333333333333333333333";

    const config = getDuelArenaOracleConfig();

    expect(config.evmTargets).toHaveLength(3);
    expect(config.evmTargets.map((target) => target.privateKey)).toEqual([
      process.env.DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY,
      process.env.DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY,
      process.env.DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY,
    ]);
    expect(config.solanaTargets).toHaveLength(1);
    expect(config.solanaTargets[0]?.authoritySecret).toBe(
      process.env.DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET,
    );
    expect(config.solanaTargets[0]?.reporterSecret).toBeNull();
  });
});
