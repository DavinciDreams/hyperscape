import { PublicKey } from "@solana/web3.js";

import { FIGHT_ORACLE_IDL } from "./generated/fightOracleIdl.js";

export type { FightOracle } from "./generated/fightOracleTypes.js";
export { FIGHT_ORACLE_IDL } from "./generated/fightOracleIdl.js";

export const DUEL_ORACLE_SOLANA_PROGRAM_IDS = {
  devnet: "6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD",
  mainnet: "6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD",
} as const;

export type DuelOracleSolanaNetwork =
  keyof typeof DUEL_ORACLE_SOLANA_PROGRAM_IDS;

const encoder = new TextEncoder();
const ORACLE_CONFIG_SEED = encoder.encode("oracle_config");
const DUEL_STATE_SEED = encoder.encode("duel");

function hexToBytes(value: string): Uint8Array {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Expected a 32-byte hex duel key");
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    const offset = i * 2;
    out[i] = Number.parseInt(normalized.slice(offset, offset + 2), 16);
  }
  return out;
}

function normalizeDuelKey(duelKey: string | Uint8Array): Uint8Array {
  if (typeof duelKey === "string") {
    return hexToBytes(duelKey);
  }
  if (duelKey.length !== 32) {
    throw new Error("Expected duel key to be exactly 32 bytes");
  }
  return duelKey;
}

export function getDuelOracleSolanaProgramId(
  network: DuelOracleSolanaNetwork = "devnet",
): PublicKey {
  return new PublicKey(DUEL_ORACLE_SOLANA_PROGRAM_IDS[network]);
}

export function findFightOracleConfigPda(
  programId: PublicKey = new PublicKey(FIGHT_ORACLE_IDL.address),
): readonly [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ORACLE_CONFIG_SEED], programId);
}

export function findFightOracleDuelStatePda(
  duelKey: string | Uint8Array,
  programId: PublicKey = new PublicKey(FIGHT_ORACLE_IDL.address),
): readonly [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DUEL_STATE_SEED, normalizeDuelKey(duelKey)],
    programId,
  );
}
