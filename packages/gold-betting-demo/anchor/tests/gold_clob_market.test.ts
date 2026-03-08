import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as assert from "assert";
import { configureAnchorTests, confirmSignatureByPolling } from "./test-anchor";

import { FightOracle } from "../target/types/fight_oracle";
import { GoldClobMarket } from "../target/types/gold_clob_market";

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
}

function deriveOracleConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_config")],
    programId,
  )[0];
}

function deriveOracleMatchPda(
  programId: PublicKey,
  matchId: anchor.BN,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), matchId.toArrayLike(Buffer, "le", 8)],
    programId,
  )[0];
}

function deriveUserBalancePda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), matchState.toBuffer(), user.toBuffer()],
    programId,
  )[0];
}

function deriveOrderPda(
  programId: PublicKey,
  matchState: PublicKey,
  user: PublicKey,
  orderId: anchor.BN,
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

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 2,
) {
  const signature = await connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL,
  );
  await confirmSignatureByPolling(connection, signature);
}

describe("gold_clob_market (native SOL settlement)", () => {
  anchor.setProvider(configureAnchorTests());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;

  const fightProgram = anchor.workspace.FightOracle as Program<FightOracle>;
  const clobProgram = anchor.workspace
    .GoldClobMarket as Program<GoldClobMarket>;

  it("initializes config and match state bound to an oracle match", async () => {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      clobProgram.programId,
    );

    const existingConfig =
      await clobProgram.account.marketConfig.fetchNullable(configPda);
    if (!existingConfig) {
      await clobProgram.methods
        .initializeConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
          program: clobProgram.programId,
          programData: deriveProgramDataAddress(clobProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } else {
      await clobProgram.methods
        .updateConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
        })
        .rpc();
    }

    const oracleConfig = deriveOracleConfigPda(fightProgram.programId);
    const existingOracleConfig =
      await fightProgram.account.oracleConfig.fetchNullable(oracleConfig);
    if (!existingOracleConfig) {
      await fightProgram.methods
        .initializeOracle()
        .accountsPartial({
          authority: payer.publicKey,
          oracleConfig,
          program: fightProgram.programId,
          programData: deriveProgramDataAddress(fightProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const matchId = new anchor.BN(Date.now());
    const oracleMatch = deriveOracleMatchPda(fightProgram.programId, matchId);
    await fightProgram.methods
      .createMatch(matchId, new anchor.BN(3600), "clob-init")
      .accountsPartial({
        authority: payer.publicKey,
        oracleConfig,
        matchResult: oracleMatch,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const matchState = anchor.web3.Keypair.generate();
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), matchState.publicKey.toBuffer()],
      clobProgram.programId,
    );

    await clobProgram.methods
      .initializeMatch(500)
      .accountsPartial({
        matchState: matchState.publicKey,
        user: provider.wallet.publicKey,
        config: configPda,
        oracleMatch,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([matchState])
      .rpc();

    const state = await clobProgram.account.matchState.fetch(
      matchState.publicKey,
    );
    assert.ok(state.isOpen);
    assert.strictEqual(state.nextOrderId.toNumber(), 1);
    assert.ok((state.oracleMatch as PublicKey).equals(oracleMatch));
  });

  it("routes prediction fees to treasury and market maker and leaves live liquidity to trade against", async () => {
    const treasury = Keypair.generate();
    const marketMakerWallet = Keypair.generate();
    const maker = Keypair.generate();
    const taker = Keypair.generate();

    await Promise.all([
      airdrop(provider.connection, treasury.publicKey),
      airdrop(provider.connection, marketMakerWallet.publicKey),
      airdrop(provider.connection, maker.publicKey),
      airdrop(provider.connection, taker.publicKey),
    ]);

    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      clobProgram.programId,
    );
    const existingConfig =
      await clobProgram.account.marketConfig.fetchNullable(configPda);
    if (!existingConfig) {
      await clobProgram.methods
        .initializeConfig(
          treasury.publicKey,
          marketMakerWallet.publicKey,
          100,
          100,
          200,
        )
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
          program: clobProgram.programId,
          programData: deriveProgramDataAddress(clobProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } else {
      await clobProgram.methods
        .updateConfig(
          treasury.publicKey,
          marketMakerWallet.publicKey,
          100,
          100,
          200,
        )
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
        })
        .rpc();
    }

    const oracleConfig = deriveOracleConfigPda(fightProgram.programId);
    const existingOracleConfig =
      await fightProgram.account.oracleConfig.fetchNullable(oracleConfig);
    if (!existingOracleConfig) {
      await fightProgram.methods
        .initializeOracle()
        .accountsPartial({
          authority: payer.publicKey,
          oracleConfig,
          program: fightProgram.programId,
          programData: deriveProgramDataAddress(fightProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const matchId = new anchor.BN(Date.now() + 1);
    const oracleMatch = deriveOracleMatchPda(fightProgram.programId, matchId);
    await fightProgram.methods
      .createMatch(matchId, new anchor.BN(1), "clob-fees")
      .accountsPartial({
        authority: payer.publicKey,
        oracleConfig,
        matchResult: oracleMatch,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const matchState = anchor.web3.Keypair.generate();
    const orderBook = anchor.web3.Keypair.generate();
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), matchState.publicKey.toBuffer()],
      clobProgram.programId,
    );

    await clobProgram.methods
      .initializeMatch(500)
      .accountsPartial({
        matchState: matchState.publicKey,
        user: provider.wallet.publicKey,
        config: configPda,
        oracleMatch,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([matchState])
      .rpc();

    const minimumVaultLamports =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    await provider.sendAndConfirm(
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: vault,
          lamports: minimumVaultLamports,
        }),
      ),
      [payer],
    );

    await clobProgram.methods
      .initializeOrderBook()
      .accountsPartial({
        user: provider.wallet.publicKey,
        matchState: matchState.publicKey,
        orderBook: orderBook.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([orderBook])
      .rpc();

    const makerAmount = new anchor.BN(1_000_000);
    const makerOrderId = new anchor.BN(1);
    const takerOrderId = new anchor.BN(2);
    const makerBalance = deriveUserBalancePda(
      clobProgram.programId,
      matchState.publicKey,
      maker.publicKey,
    );
    const takerBalance = deriveUserBalancePda(
      clobProgram.programId,
      matchState.publicKey,
      taker.publicKey,
    );
    const makerOrder = deriveOrderPda(
      clobProgram.programId,
      matchState.publicKey,
      maker.publicKey,
      makerOrderId,
    );
    const takerOrder = deriveOrderPda(
      clobProgram.programId,
      matchState.publicKey,
      taker.publicKey,
      takerOrderId,
    );

    const treasuryBefore = await provider.connection.getBalance(
      treasury.publicKey,
      "confirmed",
    );
    const marketMakerBefore = await provider.connection.getBalance(
      marketMakerWallet.publicKey,
      "confirmed",
    );

    await clobProgram.methods
      .placeOrder(makerOrderId, false, 600, makerAmount)
      .accountsPartial({
        matchState: matchState.publicKey,
        orderBook: orderBook.publicKey,
        userBalance: makerBalance,
        newOrder: makerOrder,
        config: configPda,
        treasury: treasury.publicKey,
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const makerOrderAccount = await clobProgram.account.order.fetch(makerOrder);
    assert.strictEqual(makerOrderAccount.filled.toString(), "0");

    await clobProgram.methods
      .placeOrder(takerOrderId, true, 600, makerAmount)
      .accountsPartial({
        matchState: matchState.publicKey,
        orderBook: orderBook.publicKey,
        userBalance: takerBalance,
        newOrder: takerOrder,
        config: configPda,
        treasury: treasury.publicKey,
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: taker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        {
          pubkey: makerOrder,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: makerBalance,
          isSigner: false,
          isWritable: true,
        },
      ])
      .signers([taker])
      .rpc();

    const treasuryAfterTrades = await provider.connection.getBalance(
      treasury.publicKey,
      "confirmed",
    );
    const marketMakerAfterTrades = await provider.connection.getBalance(
      marketMakerWallet.publicKey,
      "confirmed",
    );
    assert.strictEqual(treasuryAfterTrades - treasuryBefore, 10_000);
    assert.strictEqual(marketMakerAfterTrades - marketMakerBefore, 10_000);

    await new Promise((resolve) => setTimeout(resolve, 1_200));

    await fightProgram.methods
      .postResult({ yes: {} }, new anchor.BN(1), Array(32).fill(7))
      .accountsPartial({
        authority: payer.publicKey,
        oracleConfig,
        matchResult: oracleMatch,
      })
      .rpc();

    await clobProgram.methods
      .resolveMatch()
      .accountsPartial({
        matchState: matchState.publicKey,
        oracleMatch,
      })
      .rpc();

    await clobProgram.methods
      .claim()
      .accountsPartial({
        matchState: matchState.publicKey,
        orderBook: orderBook.publicKey,
        userBalance: takerBalance,
        config: configPda,
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: taker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([taker])
      .rpc();

    const marketMakerAfterClaim = await provider.connection.getBalance(
      marketMakerWallet.publicKey,
      "confirmed",
    );
    assert.strictEqual(marketMakerAfterClaim - marketMakerAfterTrades, 20_000);
  });
});
