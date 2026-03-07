import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { findProgramAddressSync } from "./programAddress";

export function findOracleConfigPda(
  fightOracleProgramId: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("oracle_config")],
    fightOracleProgramId,
  )[0];
}

export function findMarketConfigPda(marketProgramId: PublicKey): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("market_config")],
    marketProgramId,
  )[0];
}

export function findMatchPda(
  fightOracleProgramId: PublicKey,
  matchId: BN,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("match"), matchId.toArrayLike(Buffer, "le", 8)],
    fightOracleProgramId,
  )[0];
}

export function findVaultAuthorityPda(
  marketProgramId: PublicKey,
  marketPda: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("vault_auth"), marketPda.toBuffer()],
    marketProgramId,
  )[0];
}
