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
  recipient: PublicKey,
  sol = 5,
): Promise<void> {
  const sig = await connection.requestAirdrop(
    recipient,
    sol * LAMPORTS_PER_SOL,
  );
  await confirmSignatureByPolling(connection, sig);
}

async function ensureOracleReady(
  program: Program<FightOracle>,
  payer: Keypair,
): Promise<PublicKey> {
  const oracleConfig = deriveOracleConfigPda(program.programId);
  const existingConfig =
    await program.account.oracleConfig.fetchNullable(oracleConfig);
  if (!existingConfig) {
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
  }
  return oracleConfig;
}

async function ensureClobConfig(
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

async function createBoundClobMarket(
  fightProgram: Program<FightOracle>,
  clobProgram: Program<GoldClobMarket>,
  payer: Keypair,
): Promise<{
  configPda: PublicKey;
  oracleMatch: PublicKey;
  matchState: Keypair;
  orderBook: Keypair;
  vault: PublicKey;
}> {
  const oracleConfig = await ensureOracleReady(fightProgram, payer);
  const configPda = await ensureClobConfig(clobProgram, payer);

  const matchId = new anchor.BN(
    Date.now() + Math.floor(Math.random() * 10_000),
  );
  const oracleMatch = deriveOracleMatchPda(fightProgram.programId, matchId);
  await fightProgram.methods
    .createMatch(matchId, new anchor.BN(2), "demo")
    .accountsPartial({
      authority: payer.publicKey,
      oracleConfig,
      matchResult: oracleMatch,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer])
    .rpc();

  const matchState = Keypair.generate();
  const orderBook = Keypair.generate();
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), matchState.publicKey.toBuffer()],
    clobProgram.programId,
  );

  await clobProgram.methods
    .initializeMatch(500)
    .accountsPartial({
      matchState: matchState.publicKey,
      user: payer.publicKey,
      config: configPda,
      oracleMatch,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer, matchState])
    .rpc();

  await clobProgram.provider.sendAndConfirm(
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: vault,
        lamports: Math.floor(0.05 * LAMPORTS_PER_SOL),
      }),
    ),
    [payer],
  );

  await clobProgram.methods
    .initializeOrderBook()
    .accountsPartial({
      user: payer.publicKey,
      matchState: matchState.publicKey,
      orderBook: orderBook.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([payer, orderBook])
    .rpc();

  return { configPda, oracleMatch, matchState, orderBook, vault };
}

describe("gold-betting-demo", () => {
  const provider = configureAnchorTests();

  const payer = (provider.wallet as anchor.Wallet & { payer: Keypair }).payer;
  const fightProgram = anchor.workspace.FightOracle as Program<FightOracle>;
  const clobProgram = anchor.workspace
    .GoldClobMarket as Program<GoldClobMarket>;

  it("binds each CLOB market to a specific fight_oracle match", async () => {
    const market = await createBoundClobMarket(
      fightProgram,
      clobProgram,
      payer,
    );
    const state = await clobProgram.account.matchState.fetch(
      market.matchState.publicKey,
    );
    assert.ok((state.oracleMatch as PublicKey).equals(market.oracleMatch));
  });

  it("refuses to resolve a CLOB market before the oracle match is resolved", async () => {
    const market = await createBoundClobMarket(
      fightProgram,
      clobProgram,
      payer,
    );

    try {
      await clobProgram.methods
        .resolveMatch()
        .accountsPartial({
          matchState: market.matchState.publicKey,
          oracleMatch: market.oracleMatch,
        })
        .rpc();
      assert.fail("Expected unresolved oracle match to block resolution");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(message.includes("OracleMatchNotResolved"));
    }
  });

  it("resolves from oracle output and allows winners to claim", async () => {
    const market = await createBoundClobMarket(
      fightProgram,
      clobProgram,
      payer,
    );
    const maker = Keypair.generate();
    const trader = Keypair.generate();
    await airdrop(provider.connection, maker.publicKey);
    await airdrop(provider.connection, trader.publicKey);

    const makerOrderId = new anchor.BN(1);
    await clobProgram.methods
      .placeOrder(makerOrderId, false, 500, new anchor.BN(1000))
      .accountsPartial({
        matchState: market.matchState.publicKey,
        orderBook: market.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          clobProgram.programId,
          market.matchState.publicKey,
          maker.publicKey,
        ),
        newOrder: deriveOrderPda(
          clobProgram.programId,
          market.matchState.publicKey,
          maker.publicKey,
          makerOrderId,
        ),
        config: market.configPda,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: market.vault,
        user: maker.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([maker])
      .rpc();

    const takerOrderId = new anchor.BN(2);
    await clobProgram.methods
      .placeOrder(takerOrderId, true, 500, new anchor.BN(1000))
      .accountsPartial({
        matchState: market.matchState.publicKey,
        orderBook: market.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          clobProgram.programId,
          market.matchState.publicKey,
          trader.publicKey,
        ),
        newOrder: deriveOrderPda(
          clobProgram.programId,
          market.matchState.publicKey,
          trader.publicKey,
          takerOrderId,
        ),
        config: market.configPda,
        treasury: payer.publicKey,
        marketMaker: payer.publicKey,
        vault: market.vault,
        user: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        {
          pubkey: deriveOrderPda(
            clobProgram.programId,
            market.matchState.publicKey,
            maker.publicKey,
            makerOrderId,
          ),
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: deriveUserBalancePda(
            clobProgram.programId,
            market.matchState.publicKey,
            maker.publicKey,
          ),
          isSigner: false,
          isWritable: true,
        },
      ])
      .signers([trader])
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const oracleConfig = deriveOracleConfigPda(fightProgram.programId);
    await fightProgram.methods
      .postResult({ yes: {} }, new anchor.BN(7), Array.from(new Uint8Array(32)))
      .accountsPartial({
        authority: payer.publicKey,
        oracleConfig,
        matchResult: market.oracleMatch,
      })
      .signers([payer])
      .rpc();

    await clobProgram.methods
      .resolveMatch()
      .accountsPartial({
        matchState: market.matchState.publicKey,
        oracleMatch: market.oracleMatch,
      })
      .rpc();

    const beforeClaim = await provider.connection.getBalance(trader.publicKey);
    await clobProgram.methods
      .claim()
      .accountsPartial({
        matchState: market.matchState.publicKey,
        orderBook: market.orderBook.publicKey,
        userBalance: deriveUserBalancePda(
          clobProgram.programId,
          market.matchState.publicKey,
          trader.publicKey,
        ),
        config: market.configPda,
        marketMaker: payer.publicKey,
        vault: market.vault,
        user: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();
    const afterClaim = await provider.connection.getBalance(trader.publicKey);

    assert.ok(afterClaim > beforeClaim);
  });
});
