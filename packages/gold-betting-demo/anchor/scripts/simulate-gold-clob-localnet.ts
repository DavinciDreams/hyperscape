import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

/**
 * Localnet simulation for gold_clob_market (native-SOL / PDA model).
 *
 * Creates 40 wallets, runs 3 rounds with various betting strategies,
 * then collects PnL stats.
 */

type Strategy =
  | "cabal_against_house"
  | "mev"
  | "random"
  | "always_winner"
  | "highest_spread";

type Winner = "YES" | "NO";

type Bettor = {
  wallet: Keypair;
  strategy: Strategy;
  initialBalance: bigint;
};

type RoundSummary = {
  round: number;
  winner: Winner;
  houseBias: Winner;
  betsPlaced: number;
  winningClaims: number;
};

const STRATEGIES: Strategy[] = [
  "cabal_against_house",
  "mev",
  "random",
  "always_winner",
  "highest_spread",
];

const WALLET_COUNT = 40;
const ROUNDS = 3;
const INITIAL_SOL = 2; // SOL per bettor
const BASE_ORDER_AMOUNT = 3_000_000n; // lamports
const HOUSE_LIQUIDITY = 90_000_000n; // lamports

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------

function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  )[0];
}

function vaultPda(
  programId: PublicKey,
  matchState: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), matchState.toBuffer()],
    programId,
  );
}

function balancePda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), matchState.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

function orderPda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
  orderId: BN,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("order"),
      matchState.toBuffer(),
      user.toBuffer(),
      orderId.toArrayLike(Buffer, "le", 8),
    ],
    programId,
  )[0];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRng(seed: bigint): () => number {
  let state = seed;
  return () => {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    const out = Number(state & 0xffff_ffffn);
    return Math.abs(out) / 0xffff_ffff;
  };
}

function clampPrice(price: number): number {
  return Math.max(1, Math.min(999, Math.floor(price)));
}

function toU64Bn(value: bigint): BN {
  return new BN(value.toString());
}

function pickWinner(rng: () => number): Winner {
  return rng() > 0.5 ? "YES" : "NO";
}

function orderFromStrategy(
  strategy: Strategy,
  winner: Winner,
  houseBias: Winner,
  rng: () => number,
): { isBuy: boolean; price: number; amount: bigint } {
  const amountBump = BigInt(Math.floor(rng() * 1_000_000));
  const amount = BASE_ORDER_AMOUNT + amountBump;

  if (strategy === "always_winner") {
    return winner === "YES"
      ? { isBuy: true, price: clampPrice(620 + rng() * 120), amount }
      : { isBuy: false, price: clampPrice(380 - rng() * 120), amount };
  }

  if (strategy === "cabal_against_house") {
    return houseBias === "YES"
      ? { isBuy: false, price: clampPrice(450 - rng() * 80), amount }
      : { isBuy: true, price: clampPrice(550 + rng() * 80), amount };
  }

  if (strategy === "mev") {
    if (rng() > 0.5) {
      return { isBuy: true, price: clampPrice(520 + rng() * 160), amount };
    }
    return { isBuy: false, price: clampPrice(480 - rng() * 160), amount };
  }

  if (strategy === "highest_spread") {
    if (rng() > 0.5) {
      return { isBuy: true, price: 999, amount };
    }
    return { isBuy: false, price: 1, amount };
  }

  if (rng() > 0.5) {
    return { isBuy: true, price: clampPrice(500 + rng() * 250), amount };
  }
  return { isBuy: false, price: clampPrice(500 - rng() * 250), amount };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const workspaceDir = join(scriptDir, "..");
  const idlPath = join(workspaceDir, "target", "idl", "gold_clob_market.json");

  const rpcUrl = process.env.ANCHOR_PROVIDER_URL ?? "http://127.0.0.1:8899";
  const walletPath =
    process.env.ANCHOR_WALLET ?? `${process.env.HOME}/.config/solana/id.json`;

  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8")) as number[]),
  );
  const connection = new anchor.web3.Connection(rpcUrl, "confirmed");
  const wallet = new anchor.Wallet(authority);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(readFileSync(idlPath, "utf8")) as anchor.Idl & {
    address: string;
  };
  const programId = new PublicKey(idl.address);
  const program = new anchor.Program(idl, provider) as anchor.Program<any>;

  const signatures: string[] = [];
  const roundSummaries: RoundSummary[] = [];
  const rng = createRng(0x5eedn);
  const executionStats = {
    betAttempts: 0,
    betSuccess: 0,
    betFailures: 0,
    claimAttempts: 0,
    claimSuccess: 0,
    claimFailures: 0,
  };

  async function record(signaturePromise: Promise<string>) {
    const sig = await signaturePromise;
    signatures.push(sig);
    return sig;
  }

  async function sendSol(to: PublicKey, lamports: number) {
    const sig = await connection.requestAirdrop(to, lamports);
    await connection.confirmTransaction(sig, "confirmed");
    signatures.push(sig);
  }

  const [cfgPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId,
  );

  // Fee wallets (plain SOL wallets, not token accounts)
  const treasuryOwner = Keypair.generate();
  const marketMakerOwner = Keypair.generate();
  await Promise.all([
    sendSol(treasuryOwner.publicKey, Math.floor(0.2 * LAMPORTS_PER_SOL)),
    sendSol(marketMakerOwner.publicKey, Math.floor(0.2 * LAMPORTS_PER_SOL)),
  ]);

  await record(
    program.methods
      .initializeConfig(
        treasuryOwner.publicKey,
        marketMakerOwner.publicKey,
        100,
        100,
        200,
      )
      .accountsStrict({
        authority: authority.publicKey,
        config: cfgPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  ).catch(async () => {
    await record(
      program.methods
        .updateConfig(
          treasuryOwner.publicKey,
          marketMakerOwner.publicKey,
          100,
          100,
          200,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: cfgPda,
        })
        .rpc(),
    );
  });

  const treasuryStartBalance = await connection.getBalance(
    treasuryOwner.publicKey,
    "confirmed",
  );
  const mmStartBalance = await connection.getBalance(
    marketMakerOwner.publicKey,
    "confirmed",
  );

  // House wallets (bid = YES, ask = NO)
  const houseBid = Keypair.generate();
  const houseAsk = Keypair.generate();
  await Promise.all([
    sendSol(houseBid.publicKey, 5 * LAMPORTS_PER_SOL),
    sendSol(houseAsk.publicKey, 5 * LAMPORTS_PER_SOL),
  ]);

  // Create bettors
  const bettors: Bettor[] = [];
  for (let i = 0; i < WALLET_COUNT; i += 1) {
    const walletKeypair = Keypair.generate();
    await sendSol(walletKeypair.publicKey, INITIAL_SOL * LAMPORTS_PER_SOL);

    const initialBalance = BigInt(
      await connection.getBalance(walletKeypair.publicKey, "confirmed"),
    );

    bettors.push({
      wallet: walletKeypair,
      strategy: STRATEGIES[i % STRATEGIES.length],
      initialBalance,
    });
  }

  for (let round = 1; round <= ROUNDS; round += 1) {
    const matchState = Keypair.generate();
    const orderBook = Keypair.generate();
    const [vault] = vaultPda(programId, matchState.publicKey);

    await record(
      program.methods
        .initializeMatch(500)
        .accountsStrict({
          matchState: matchState.publicKey,
          user: authority.publicKey,
          config: cfgPda,
          vault,
          systemProgram: SystemProgram.programId,
        })
        .signers([matchState])
        .rpc(),
    );

    await record(
      program.methods
        .initializeOrderBook()
        .accountsStrict({
          user: authority.publicKey,
          matchState: matchState.publicKey,
          orderBook: orderBook.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([orderBook])
        .rpc(),
    );

    const winner = pickWinner(rng);
    const houseBias: Winner = round % 2 === 0 ? "YES" : "NO";

    // Track next order ID
    let nextOrderId = 1;

    // House BUY order
    const houseBuyOrderPda = orderPda(
      programId,
      matchState.publicKey,
      houseBid.publicKey,
      new BN(nextOrderId),
    );
    const houseBuyBalPda = balancePda(
      programId,
      matchState.publicKey,
      houseBid.publicKey,
    );
    await record(
      program.methods
        .placeOrder(new BN(nextOrderId), true, 450, toU64Bn(HOUSE_LIQUIDITY))
        .accountsStrict({
          matchState: matchState.publicKey,
          orderBook: orderBook.publicKey,
          userBalance: houseBuyBalPda,
          newOrder: houseBuyOrderPda,
          config: cfgPda,
          treasury: treasuryOwner.publicKey,
          marketMaker: marketMakerOwner.publicKey,
          vault,
          user: houseBid.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([houseBid])
        .rpc(),
    );
    nextOrderId += 1;

    // House SELL order
    const houseSellOrderPda = orderPda(
      programId,
      matchState.publicKey,
      houseAsk.publicKey,
      new BN(nextOrderId),
    );
    const houseSellBalPda = balancePda(
      programId,
      matchState.publicKey,
      houseAsk.publicKey,
    );
    await record(
      program.methods
        .placeOrder(new BN(nextOrderId), false, 550, toU64Bn(HOUSE_LIQUIDITY))
        .accountsStrict({
          matchState: matchState.publicKey,
          orderBook: orderBook.publicKey,
          userBalance: houseSellBalPda,
          newOrder: houseSellOrderPda,
          config: cfgPda,
          treasury: treasuryOwner.publicKey,
          marketMaker: marketMakerOwner.publicKey,
          vault,
          user: houseAsk.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([houseAsk])
        .rpc(),
    );
    nextOrderId += 1;

    let betsPlaced = 0;
    for (const bettor of bettors) {
      const order = orderFromStrategy(bettor.strategy, winner, houseBias, rng);
      executionStats.betAttempts += 1;

      // Read current next_order_id from chain
      const ms = await program.account.matchState.fetch(matchState.publicKey);
      const orderId = (ms.nextOrderId as BN).toNumber();

      const userBalPda = balancePda(
        programId,
        matchState.publicKey,
        bettor.wallet.publicKey,
      );
      const newOrderPda = orderPda(
        programId,
        matchState.publicKey,
        bettor.wallet.publicKey,
        new BN(orderId),
      );

      try {
        await record(
          program.methods
            .placeOrder(
              new BN(orderId),
              order.isBuy,
              order.price,
              toU64Bn(order.amount),
            )
            .accountsStrict({
              matchState: matchState.publicKey,
              orderBook: orderBook.publicKey,
              userBalance: userBalPda,
              newOrder: newOrderPda,
              config: cfgPda,
              treasury: treasuryOwner.publicKey,
              marketMaker: marketMakerOwner.publicKey,
              vault,
              user: bettor.wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([bettor.wallet])
            .rpc(),
        );
        executionStats.betSuccess += 1;
        betsPlaced += 1;
      } catch {
        executionStats.betFailures += 1;
      }
    }

    await record(
      program.methods
        .resolveMatch(winner === "YES" ? { yes: {} } : { no: {} })
        .accountsStrict({
          matchState: matchState.publicKey,
          authority: authority.publicKey,
        })
        .rpc(),
    );

    let winningClaims = 0;

    // Claim for house wallets
    for (const houseWallet of [houseBid, houseAsk]) {
      const houseBalPda = balancePda(
        programId,
        matchState.publicKey,
        houseWallet.publicKey,
      );
      try {
        await record(
          program.methods
            .claim()
            .accountsStrict({
              matchState: matchState.publicKey,
              orderBook: orderBook.publicKey,
              userBalance: houseBalPda,
              config: cfgPda,
              marketMaker: marketMakerOwner.publicKey,
              vault,
              user: houseWallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([houseWallet])
            .rpc(),
        );
        winningClaims += 1;
      } catch {
        // no winning shares
      }
    }

    // Claim for bettors
    for (const bettor of bettors) {
      executionStats.claimAttempts += 1;
      const userBalPda = balancePda(
        programId,
        matchState.publicKey,
        bettor.wallet.publicKey,
      );
      try {
        await record(
          program.methods
            .claim()
            .accountsStrict({
              matchState: matchState.publicKey,
              orderBook: orderBook.publicKey,
              userBalance: userBalPda,
              config: cfgPda,
              marketMaker: marketMakerOwner.publicKey,
              vault,
              user: bettor.wallet.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .signers([bettor.wallet])
            .rpc(),
        );
        executionStats.claimSuccess += 1;
        winningClaims += 1;
      } catch {
        executionStats.claimFailures += 1;
      }
    }

    roundSummaries.push({
      round,
      winner,
      houseBias,
      betsPlaced,
      winningClaims,
    });
  }

  const walletPnl = [];
  for (const bettor of bettors) {
    const finalBalance = BigInt(
      await connection.getBalance(bettor.wallet.publicKey, "confirmed"),
    );
    walletPnl.push({
      address: bettor.wallet.publicKey.toBase58(),
      strategy: bettor.strategy,
      initialBalance: bettor.initialBalance.toString(),
      finalBalance: finalBalance.toString(),
      pnl: (finalBalance - bettor.initialBalance).toString(),
    });
  }

  const byStrategy = new Map<
    Strategy,
    { total: bigint; wallets: number; positive: number }
  >();
  for (const strategy of STRATEGIES) {
    byStrategy.set(strategy, { total: 0n, wallets: 0, positive: 0 });
  }

  for (const row of walletPnl) {
    const agg = byStrategy.get(row.strategy as Strategy)!;
    const pnl = BigInt(row.pnl);
    agg.total += pnl;
    agg.wallets += 1;
    if (pnl > 0n) agg.positive += 1;
  }

  const strategyPnl = STRATEGIES.map((strategy) => {
    const agg = byStrategy.get(strategy)!;
    return {
      strategy,
      wallets: agg.wallets,
      totalPnl: agg.total.toString(),
      averagePnl:
        agg.wallets === 0 ? "0" : (agg.total / BigInt(agg.wallets)).toString(),
      positiveWallets: agg.positive,
    };
  });

  let verifiedSignatures = 0;
  for (const group of chunk(signatures, 256)) {
    const statuses = await connection.getSignatureStatuses(group, {
      searchTransactionHistory: true,
    });
    for (const status of statuses.value) {
      if (status && !status.err) {
        verifiedSignatures += 1;
      }
    }
  }

  const treasuryEndBalance = await connection.getBalance(
    treasuryOwner.publicKey,
    "confirmed",
  );
  const mmEndBalance = await connection.getBalance(
    marketMakerOwner.publicKey,
    "confirmed",
  );

  const report = {
    generatedAt: new Date().toISOString(),
    rpcUrl,
    programId: programId.toBase58(),
    wallets: WALLET_COUNT,
    rounds: ROUNDS,
    feeFlows: {
      tradingFeesToTreasury: (
        treasuryEndBalance - treasuryStartBalance
      ).toString(),
      allFeesToMarketMaker: (mmEndBalance - mmStartBalance).toString(),
    },
    chainVerification: {
      signaturesSubmitted: signatures.length,
      signaturesVerified: verifiedSignatures,
      verificationPassed: signatures.length === verifiedSignatures,
    },
    executionStats,
    roundsSummary: roundSummaries,
    strategyPnl,
    walletPnl,
  };

  const outputDir = join(workspaceDir, "simulations");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, "solana-clob-localnet-pnl.json");
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log("\n=== Solana CLOB Localnet Simulation Complete ===");
  console.log(`Wallets: ${WALLET_COUNT}`);
  console.log(`Rounds: ${ROUNDS}`);
  console.log(
    `Signatures verified: ${verifiedSignatures}/${signatures.length}`,
  );
  console.log(
    `Trading fees -> treasury: ${report.feeFlows.tradingFeesToTreasury}`,
  );
  console.log(
    `All fees -> market maker: ${report.feeFlows.allFeesToMarketMaker}`,
  );
  console.log(`Report: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
