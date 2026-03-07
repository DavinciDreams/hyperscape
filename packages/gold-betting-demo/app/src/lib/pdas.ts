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

export function findMarketPda(
  marketProgramId: PublicKey,
  matchPda: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("market"), matchPda.toBuffer()],
    marketProgramId,
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

export function findYesVaultPda(
  marketProgramId: PublicKey,
  marketPda: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("yes_vault"), marketPda.toBuffer()],
    marketProgramId,
  )[0];
}

export function findNoVaultPda(
  marketProgramId: PublicKey,
  marketPda: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("no_vault"), marketPda.toBuffer()],
    marketProgramId,
  )[0];
}

export function findPositionPda(
  marketProgramId: PublicKey,
  marketPda: PublicKey,
  owner: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("position"), marketPda.toBuffer(), owner.toBuffer()],
    marketProgramId,
  )[0];
}
