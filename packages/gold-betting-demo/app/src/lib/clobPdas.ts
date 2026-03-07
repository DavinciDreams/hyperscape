import { PublicKey } from "@solana/web3.js";
import { findProgramAddressSync } from "./programAddress";

export function findClobConfigPda(programId: PublicKey): PublicKey {
  return findProgramAddressSync([Buffer.from("config")], programId)[0];
}

export function findClobVaultAuthorityPda(
  programId: PublicKey,
  matchState: PublicKey,
): PublicKey {
  return findProgramAddressSync(
    [Buffer.from("vault_auth"), matchState.toBuffer()],
    programId,
  )[0];
}
