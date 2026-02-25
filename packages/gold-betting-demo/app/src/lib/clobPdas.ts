import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * PDA helpers for the gold_clob_market program.
 *
 * All seeds match the on-chain Anchor program definitions exactly:
 *   config  → ["config"]
 *   vault   → ["vault",   matchState]
 *   balance → ["balance", matchState, user]
 *   order   → ["order",   matchState, user, orderId (le bytes)]
 */

export function findClobConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  )[0];
}

export function findClobVaultPda(
  programId: PublicKey,
  matchState: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), matchState.toBuffer()],
    programId,
  );
}

export function findClobUserBalancePda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), matchState.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

export function findClobOrderPda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
  orderId: BN | bigint | number,
): PublicKey {
  const orderIdBn =
    orderId instanceof BN ? orderId : new BN(orderId.toString());
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      matchState.toBuffer(),
      user.toBuffer(),
      orderIdBn.toArrayLike(Buffer, "le", 8),
    ],
    programId,
  )[0];
}
