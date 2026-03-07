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
import { configureAnchorTests } from "./test-anchor";

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
  sol = 5,
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

async function ensureOracleReady(
  program: Program<FightOracle>,
  payer: Keypair,
): Promise<PublicKey> {
  const oracleConfig = deriveOracleConfigPda(program.programId);
  await program.methods
    .initializeOracle()
    .accountsPartial({
      authority: payer.publicKey,
      oracleConfig,
      program: program.programId,
      programData: deriveProgramDataAddress(program.programId),
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();
  return oracleConfig;
}

async function createOracleMatch(
  program: Program<FightOracle>,
  payer: Keypair,
): Promise<PublicKey> {
  const oracleConfig = await ensureOracleReady(program, payer);
  const matchId = new anchor.BN(
    Date.now() + Math.floor(Math.random() * 10_000),
  );
  const oracleMatch = deriveOracleMatchPda(program.programId, matchId);

  await program.methods
    .createMatch(matchId, new anchor.BN(3600), "clob-security")
    .accountsPartial({
      authority: payer.publicKey,
      oracleConfig,
      matchResult: oracleMatch,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  return oracleMatch;
}

async function ensureConfig(
  program: Program<GoldClobMarket>,
  payer: Keypair,
): Promise<PublicKey> {
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );
  const existingConfig =
    await program.account.marketConfig.fetchNullable(configPda);

  if (!existingConfig) {
    await program.methods
      .initializeConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
      .accountsPartial({
        authority: payer.publicKey,
        config: configPda,
        program: program.programId,
        programData: deriveProgramDataAddress(program.programId),
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
  } else {
    await program.methods
      .updateConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
      .accountsPartial({
        authority: payer.publicKey,
        config: configPda,
      })
      .signers([payer])
      .rpc();
  }

  return configPda;
}

async function createMatchAndBook(
  program: Program<GoldClobMarket>,
  fightProgram: Program<FightOracle>,
  payer: Keypair,
  config: PublicKey,
) {
  const matchState = Keypair.generate();
  const orderBook = Keypair.generate();
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), matchState.publicKey.toBuffer()],
    program.programId,
  );
  const oracleMatch = await createOracleMatch(fightProgram, payer);

  await program.methods
    .initializeMatch(500)
    .accountsPartial({
      matchState: matchState.publicKey,
      user: payer.publicKey,
      config,
      oracleMatch,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer, matchState])
    .rpc();

  await anchor.web3.sendAndConfirmTransaction(
    program.provider.connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: vault,
        lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
      }),
    ),
    [payer],
  );

  await program.methods
    .initializeOrderBook()
    .accountsPartial({
      user: payer.publicKey,
      matchState: matchState.publicKey,
      orderBook: orderBook.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer, orderBook])
    .rpc();

  return { matchState, orderBook, vault };
}

describe("gold_clob_market — native SOL security regressions", () => {
  const provider = configureAnchorTests();

  const fightProgram = anchor.workspace.FightOracle as Program<FightOracle>;
  const program = anchor.workspace.GoldClobMarket as Program<GoldClobMarket>;
  const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;

  it("rejects maker balances from a different match", async () => {
    const maker = Keypair.generate();
    const taker = Keypair.generate();
    await Promise.all([
      airdrop(provider.connection, maker.publicKey),
      airdrop(provider.connection, taker.publicKey),
    ]);

    const config = await ensureConfig(program, payer);
    const matchOne = await createMatchAndBook(
      program,
      fightProgram,
      payer,
      config,
    );
    const matchTwo = await createMatchAndBook(
      program,
      fightProgram,
      payer,
      config,
    );

    const makerOrderIdOne = new anchor.BN(
      (
        await program.account.matchState.fetch(matchOne.matchState.publicKey)
      ).nextOrderId.toString(),
    );

    await program.methods
      .placeOrder(makerOrderIdOne, false, 600, new anchor.BN(1000))
      .accountsPartial({
        matchState: matchOne.matchState.publicKey,
        orderBook: matchOne.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          program.programId,
          matchOne.matchState.publicKey,
          maker.publicKey,
        ),
        newOrder: deriveOrderPda(
          program.programId,
          matchOne.matchState.publicKey,
          maker.publicKey,
          makerOrderIdOne,
        ),
        config,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: matchOne.vault,
        user: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const makerOrderIdTwo = new anchor.BN(
      (
        await program.account.matchState.fetch(matchTwo.matchState.publicKey)
      ).nextOrderId.toString(),
    );

    await program.methods
      .placeOrder(makerOrderIdTwo, true, 500, new anchor.BN(1000))
      .accountsPartial({
        matchState: matchTwo.matchState.publicKey,
        orderBook: matchTwo.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          program.programId,
          matchTwo.matchState.publicKey,
          maker.publicKey,
        ),
        newOrder: deriveOrderPda(
          program.programId,
          matchTwo.matchState.publicKey,
          maker.publicKey,
          makerOrderIdTwo,
        ),
        config,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: matchTwo.vault,
        user: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const takerOrderId = new anchor.BN(
      (
        await program.account.matchState.fetch(matchOne.matchState.publicKey)
      ).nextOrderId.toString(),
    );

    try {
      await program.methods
        .placeOrder(takerOrderId, true, 600, new anchor.BN(1000))
        .accountsPartial({
          matchState: matchOne.matchState.publicKey,
          orderBook: matchOne.orderBook.publicKey,
          userBalance: deriveUserBalancePda(
            program.programId,
            matchOne.matchState.publicKey,
            taker.publicKey,
          ),
          newOrder: deriveOrderPda(
            program.programId,
            matchOne.matchState.publicKey,
            taker.publicKey,
            takerOrderId,
          ),
          config,
          treasury: payer.publicKey,
          marketMaker: payer.publicKey,
          vault: matchOne.vault,
          user: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          {
            pubkey: deriveOrderPda(
              program.programId,
              matchOne.matchState.publicKey,
              maker.publicKey,
              makerOrderIdOne,
            ),
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: deriveUserBalancePda(
              program.programId,
              matchTwo.matchState.publicKey,
              maker.publicKey,
            ),
            isSigner: false,
            isWritable: true,
          },
        ])
        .signers([taker])
        .rpc();
      assert.fail(
        "Cross-match maker balance poisoning succeeded! Vulnerability present.",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(
        message.includes("InvalidRemainingAccount"),
        "Cross-match maker balance corruption is sealed (InvalidRemainingAccount).",
      );
    }
  });

  it("increments next_order_id even when the taker order is fully matched", async () => {
    const maker = Keypair.generate();
    const taker = Keypair.generate();
    await Promise.all([
      airdrop(provider.connection, maker.publicKey),
      airdrop(provider.connection, taker.publicKey),
    ]);

    const config = await ensureConfig(program, payer);
    const matchState = await createMatchAndBook(
      program,
      fightProgram,
      payer,
      config,
    );

    const makerOrderId = new anchor.BN(
      (
        await program.account.matchState.fetch(matchState.matchState.publicKey)
      ).nextOrderId.toString(),
    );

    await program.methods
      .placeOrder(makerOrderId, false, 600, new anchor.BN(1000))
      .accountsPartial({
        matchState: matchState.matchState.publicKey,
        orderBook: matchState.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          program.programId,
          matchState.matchState.publicKey,
          maker.publicKey,
        ),
        newOrder: deriveOrderPda(
          program.programId,
          matchState.matchState.publicKey,
          maker.publicKey,
          makerOrderId,
        ),
        config,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: matchState.vault,
        user: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const takerOrderId = new anchor.BN(
      (
        await program.account.matchState.fetch(matchState.matchState.publicKey)
      ).nextOrderId.toString(),
    );

    await program.methods
      .placeOrder(takerOrderId, true, 600, new anchor.BN(1000))
      .accountsPartial({
        matchState: matchState.matchState.publicKey,
        orderBook: matchState.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          program.programId,
          matchState.matchState.publicKey,
          taker.publicKey,
        ),
        newOrder: deriveOrderPda(
          program.programId,
          matchState.matchState.publicKey,
          taker.publicKey,
          takerOrderId,
        ),
        config,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: matchState.vault,
        user: taker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        {
          pubkey: deriveOrderPda(
            program.programId,
            matchState.matchState.publicKey,
            maker.publicKey,
            makerOrderId,
          ),
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: deriveUserBalancePda(
            program.programId,
            matchState.matchState.publicKey,
            maker.publicKey,
          ),
          isSigner: false,
          isWritable: true,
        },
      ])
      .signers([taker])
      .rpc();

    const updatedMatch = await program.account.matchState.fetch(
      matchState.matchState.publicKey,
    );
    assert.strictEqual(updatedMatch.nextOrderId.toString(), "3");

    const takerOrder = await program.account.order.fetch(
      deriveOrderPda(
        program.programId,
        matchState.matchState.publicKey,
        taker.publicKey,
        takerOrderId,
      ),
    );
    assert.strictEqual(takerOrder.id.toString(), "2");
    assert.strictEqual(takerOrder.amount.toString(), "1000");
    assert.strictEqual(takerOrder.filled.toString(), "1000");
  });
});
