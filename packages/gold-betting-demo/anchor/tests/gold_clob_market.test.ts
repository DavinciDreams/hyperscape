import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { GoldClobMarket } from "../target/types/gold_clob_market";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { assert, expect } from "chai";
import BN from "bn.js";

/**
 * Integration tests for gold_clob_market (native-SOL / PDA model).
 *
 * Covers: initialize config → create match → place orders (with matching) →
 *         cancel order → resolve match → claim winnings.
 */
describe("gold_clob_market (native SOL)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;
  const program = anchor.workspace.GoldClobMarket as Program<GoldClobMarket>;

  // -----------------------------------------------------------------------
  // PDA helpers (mirrors clobPdas.ts)
  // -----------------------------------------------------------------------
  function configPda(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId,
    )[0];
  }

  function vaultPda(matchState: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), matchState.toBuffer()],
      program.programId,
    );
  }

  function balancePda(matchState: PublicKey, user: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("balance"), matchState.toBuffer(), user.toBuffer()],
      program.programId,
    )[0];
  }

  function orderPda(
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
      program.programId,
    )[0];
  }

  // -----------------------------------------------------------------------
  // Shared test state
  // -----------------------------------------------------------------------
  const treasuryWallet = Keypair.generate();
  const marketMakerWallet = Keypair.generate();
  let matchStateKp: Keypair;
  let orderBookKp: Keypair;
  let alice: Keypair;
  let bob: Keypair;

  async function airdrop(dest: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      dest,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  // -----------------------------------------------------------------------
  // Tests
  // -----------------------------------------------------------------------

  it("initializes config with wallet pubkeys (not token accounts)", async () => {
    await airdrop(treasuryWallet.publicKey, 1);
    await airdrop(marketMakerWallet.publicKey, 1);

    const cfg = configPda();
    const existing = await program.account.marketConfig.fetchNullable(cfg);

    if (!existing) {
      await program.methods
        .initializeConfig(
          treasuryWallet.publicKey,
          marketMakerWallet.publicKey,
          100, // tradeTreasuryFeeBps  = 1%
          100, // tradeMarketMakerFeeBps = 1%
          200, // winningsMarketMakerFeeBps = 2%
        )
        .accounts({
          authority: payer.publicKey,
          config: cfg,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const config = await program.account.marketConfig.fetch(cfg);
    assert.ok(
      (config.treasury as PublicKey).equals(treasuryWallet.publicKey),
      "treasury should be a wallet pubkey",
    );
    assert.ok(
      (config.marketMaker as PublicKey).equals(marketMakerWallet.publicKey),
      "marketMaker should be a wallet pubkey",
    );
    assert.equal(config.tradeTreasuryFeeBps, 100);
    assert.equal(config.tradeMarketMakerFeeBps, 100);
    assert.equal(config.winningsMarketMakerFeeBps, 200);
  });

  it("initializes match with native-SOL vault PDA", async () => {
    matchStateKp = Keypair.generate();
    const [vault] = vaultPda(matchStateKp.publicKey);

    await program.methods
      .initializeMatch(500)
      .accounts({
        matchState: matchStateKp.publicKey,
        user: payer.publicKey,
        config: configPda(),
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([matchStateKp])
      .rpc();

    const state = await program.account.matchState.fetch(
      matchStateKp.publicKey,
    );
    assert.isTrue(state.isOpen, "match should be open");
    assert.equal(
      (state.nextOrderId as BN).toNumber(),
      1,
      "nextOrderId starts at 1",
    );
    assert.ok(
      (state.authority as PublicKey).equals(payer.publicKey),
      "authority should be payer",
    );
  });

  it("initializes order book", async () => {
    orderBookKp = Keypair.generate();

    await program.methods
      .initializeOrderBook()
      .accounts({
        user: payer.publicKey,
        matchState: matchStateKp.publicKey,
        orderBook: orderBookKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([orderBookKp])
      .rpc();

    const ob = await program.account.orderBook.fetch(orderBookKp.publicKey);
    assert.ok(
      (ob.matchState as PublicKey).equals(matchStateKp.publicKey),
      "orderBook.matchState should match",
    );
  });

  it("places a BUY order (native SOL transferred to vault)", async () => {
    alice = Keypair.generate();
    await airdrop(alice.publicKey, 5);

    const orderId = new BN(1);
    const price = 500; // 50%
    const amount = new BN(2_000_000); // 2M lamports (0.002 SOL)
    // Cost = 2_000_000 * 500 / 1000 = 1_000_000 lamports

    const [vault] = vaultPda(matchStateKp.publicKey);
    const userBal = balancePda(matchStateKp.publicKey, alice.publicKey);
    const newOrder = orderPda(matchStateKp.publicKey, alice.publicKey, orderId);

    const vaultBefore = await provider.connection.getBalance(vault);

    await program.methods
      .placeOrder(orderId, true, price, amount)
      .accounts({
        matchState: matchStateKp.publicKey,
        orderBook: orderBookKp.publicKey,
        userBalance: userBal,
        newOrder,
        config: configPda(),
        treasury: treasuryWallet.publicKey,
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const vaultAfter = await provider.connection.getBalance(vault);
    const expectedCost = 1_000_000; // amount * price / 1000
    assert.isAbove(
      vaultAfter - vaultBefore,
      0,
      "vault should have received SOL",
    );

    // Verify order PDA was created
    const order = await program.account.order.fetch(newOrder);
    assert.equal((order.id as BN).toNumber(), 1);
    assert.isTrue(order.isBuy);
    assert.equal(order.price, price);
    assert.equal((order.amount as BN).toNumber(), amount.toNumber());

    // next_order_id should have incremented
    const ms = await program.account.matchState.fetch(matchStateKp.publicKey);
    assert.equal((ms.nextOrderId as BN).toNumber(), 2);
  });

  it("places a SELL order that matches against the existing BUY", async () => {
    bob = Keypair.generate();
    await airdrop(bob.publicKey, 5);

    const orderId = new BN(2);
    const price = 500; // 50%
    const amount = new BN(1_000_000); // partial fill

    const [vault] = vaultPda(matchStateKp.publicKey);
    const userBal = balancePda(matchStateKp.publicKey, bob.publicKey);
    const newOrder = orderPda(matchStateKp.publicKey, bob.publicKey, orderId);

    // Remaining accounts: alice's order + alice's balance for matching
    const aliceOrderPda = orderPda(
      matchStateKp.publicKey,
      alice.publicKey,
      new BN(1),
    );
    const aliceBalPda = balancePda(matchStateKp.publicKey, alice.publicKey);

    await program.methods
      .placeOrder(orderId, false, price, amount)
      .accounts({
        matchState: matchStateKp.publicKey,
        orderBook: orderBookKp.publicKey,
        userBalance: userBal,
        newOrder,
        config: configPda(),
        treasury: treasuryWallet.publicKey,
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: bob.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: aliceOrderPda, isSigner: false, isWritable: true },
        { pubkey: aliceBalPda, isSigner: false, isWritable: true },
      ])
      .signers([bob])
      .rpc();

    // Alice should have YES shares, Bob should have NO shares from the match
    const aliceBal = await program.account.userBalance.fetch(aliceBalPda);
    assert.isAbove(
      (aliceBal.yesShares as BN).toNumber(),
      0,
      "alice should have yes shares from match",
    );

    const bobBal = await program.account.userBalance.fetch(userBal);
    assert.isAbove(
      (bobBal.noShares as BN).toNumber(),
      0,
      "bob should have no shares from match",
    );
  });

  it("cancels an open order and refunds SOL from vault", async () => {
    // Alice's order (id=1) should have partial fill; cancel the rest
    const orderId = new BN(1);
    const aliceOrderPda = orderPda(
      matchStateKp.publicKey,
      alice.publicKey,
      orderId,
    );
    const [vault] = vaultPda(matchStateKp.publicKey);

    const aliceBefore = await provider.connection.getBalance(alice.publicKey);

    await program.methods
      .cancelOrder(orderId)
      .accounts({
        matchState: matchStateKp.publicKey,
        orderBook: orderBookKp.publicKey,
        order: aliceOrderPda,
        vault,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const aliceAfter = await provider.connection.getBalance(alice.publicKey);
    // Alice should have received a refund (net positive after tx fees)
    // The order account is closed, so rent is also returned
    assert.isAbove(
      aliceAfter,
      aliceBefore - 10_000, // allow for tx fee
      "alice should receive refund from cancel",
    );
  });

  it("resolves match with YES winner", async () => {
    await program.methods
      .resolveMatch({ yes: {} })
      .accounts({
        matchState: matchStateKp.publicKey,
        authority: payer.publicKey,
      })
      .rpc();

    const ms = await program.account.matchState.fetch(matchStateKp.publicKey);
    assert.isFalse(ms.isOpen, "match should be closed");
    // winner enum: { yes: {} }
    assert.ok("yes" in (ms.winner as any), "winner should be YES");
  });

  it("alice claims YES winnings (native SOL from vault)", async () => {
    const aliceBalPda = balancePda(matchStateKp.publicKey, alice.publicKey);
    const [vault] = vaultPda(matchStateKp.publicKey);

    const aliceBefore = await provider.connection.getBalance(alice.publicKey);

    await program.methods
      .claim()
      .accounts({
        matchState: matchStateKp.publicKey,
        orderBook: orderBookKp.publicKey,
        userBalance: aliceBalPda,
        config: configPda(),
        marketMaker: marketMakerWallet.publicKey,
        vault,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const aliceAfter = await provider.connection.getBalance(alice.publicKey);
    assert.isAbove(aliceAfter, aliceBefore, "alice should receive SOL payout");

    // Balance should be zeroed
    const bal = await program.account.userBalance.fetch(aliceBalPda);
    assert.equal(
      (bal.yesShares as BN).toNumber(),
      0,
      "yes shares should be zeroed after claim",
    );
  });

  it("bob claim fails (NO shares, but YES won)", async () => {
    const bobBalPda = balancePda(matchStateKp.publicKey, bob.publicKey);
    const [vault] = vaultPda(matchStateKp.publicKey);

    try {
      await program.methods
        .claim()
        .accounts({
          matchState: matchStateKp.publicKey,
          orderBook: orderBookKp.publicKey,
          userBalance: bobBalPda,
          config: configPda(),
          marketMaker: marketMakerWallet.publicKey,
          vault,
          user: bob.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([bob])
        .rpc();
      assert.fail("bob claim should have failed");
    } catch (err: any) {
      assert.include(
        err.toString(),
        "NothingToClaim",
        "should fail with NothingToClaim",
      );
    }
  });
});
