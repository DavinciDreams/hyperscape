import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import * as assert from "assert";

import { GoldPerpsMarket } from "../target/types/gold_perps_market";
import {
  DEFAULT_FUNDING_VELOCITY,
  DEFAULT_LIQUIDATION_FEE_BPS,
  DEFAULT_MAINTENANCE_MARGIN_BPS,
  DEFAULT_MAX_LEVERAGE,
  DEFAULT_MAX_ORACLE_STALENESS_SECONDS,
  DEFAULT_MIN_MARGIN,
  DEFAULT_SKEW_SCALE,
  PRICE,
  SOL,
  airdrop,
  configPda,
  ensurePerpsConfig,
  hasProgramError,
  marketPda,
  num,
  positionPda,
  refreshMarketOracle,
  seedMarket,
  toBn,
  uniqueMarketId,
  waitForOracleToExpire,
} from "./perps-test-helpers";
import { configureAnchorTests } from "./test-anchor";

describe("gold_perps_market", () => {
  const provider = configureAnchorTests();
  anchor.setProvider(provider);

  const program = anchor.workspace.GoldPerpsMarket as Program<GoldPerpsMarket>;
  const authority = (provider.wallet as anchor.Wallet & { payer: Keypair })
    .payer;
  const liquidator = Keypair.generate();

  before(async () => {
    await airdrop(provider.connection, liquidator.publicKey, 25);
    await ensurePerpsConfig(program, authority);
  });

  it("initializes config with the expected controls", async () => {
    const config = await program.account.configState.fetch(
      configPda(program.programId),
    );

    assert.ok(config.authority.equals(authority.publicKey));
    assert.ok(config.keeperAuthority.equals(authority.publicKey));
    assert.strictEqual(num(config.defaultSkewScale), DEFAULT_SKEW_SCALE);
    assert.strictEqual(
      num(config.defaultFundingVelocity),
      DEFAULT_FUNDING_VELOCITY,
    );
    assert.strictEqual(
      num(config.maxOracleStalenessSeconds),
      DEFAULT_MAX_ORACLE_STALENESS_SECONDS,
    );
    assert.strictEqual(num(config.maxLeverage), DEFAULT_MAX_LEVERAGE);
    assert.strictEqual(num(config.minMarginLamports), DEFAULT_MIN_MARGIN);
    assert.strictEqual(
      config.maintenanceMarginBps,
      DEFAULT_MAINTENANCE_MARGIN_BPS,
    );
    assert.strictEqual(config.liquidationFeeBps, DEFAULT_LIQUIDATION_FEE_BPS);
  });

  it("initializes market state and tracks insurance deposits", async () => {
    const marketId = uniqueMarketId(2_000);
    const market = await seedMarket(program, authority, marketId, PRICE(100));
    const lamportsBeforeDeposit = await provider.connection.getBalance(market);

    await program.methods
      .depositInsurance(marketId, toBn(SOL(3)))
      .accountsPartial({
        market,
        payer: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const marketState = await program.account.marketState.fetch(market);
    const lamportsAfterDeposit = await provider.connection.getBalance(market);
    assert.strictEqual(num(marketState.marketId), marketId);
    assert.strictEqual(num(marketState.spotIndex), PRICE(100));
    assert.strictEqual(num(marketState.totalLongOi), 0);
    assert.strictEqual(num(marketState.totalShortOi), 0);
    assert.strictEqual(num(marketState.insuranceFund), SOL(3));
    assert.ok(lamportsAfterDeposit >= lamportsBeforeDeposit + SOL(3));
  });

  it("opens and expands a long position while updating open interest", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_001);
    await seedMarket(program, authority, marketId, PRICE(100), SOL(5));

    const market = marketPda(program.programId, marketId);
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    await refreshMarketOracle(program, authority, marketId, PRICE(100));

    await program.methods
      .modifyPosition(marketId, toBn(SOL(0.5)), toBn(SOL(1)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const marketState = await program.account.marketState.fetch(market);
    const positionState = await program.account.positionState.fetch(position);

    assert.ok(num(positionState.margin) >= SOL(1.49));
    assert.ok(num(positionState.margin) <= SOL(1.5));
    assert.strictEqual(num(positionState.size), SOL(3));
    assert.ok(num(positionState.entryPrice) > PRICE(100));
    assert.strictEqual(num(marketState.totalLongOi), SOL(3));
    assert.strictEqual(num(marketState.totalShortOi), 0);
  });

  it("settles a profitable long and closes the position account", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_002);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(5),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    await program.methods
      .updateMarketOracle(
        marketId,
        toBn(PRICE(130)),
        toBn(PRICE(130)),
        toBn(PRICE(13)),
      )
      .accountsPartial({
        config: configPda(program.programId),
        market,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const traderBalanceBeforeClose = await provider.connection.getBalance(
      trader.publicKey,
    );

    await program.methods
      .modifyPosition(marketId, toBn(0), toBn(-SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const traderBalanceAfterClose = await provider.connection.getBalance(
      trader.publicKey,
    );
    const marketState = await program.account.marketState.fetch(market);
    const closedPosition =
      await program.account.positionState.fetchNullable(position);

    assert.strictEqual(closedPosition, null);
    assert.strictEqual(num(marketState.totalLongOi), 0);
    assert.ok(traderBalanceAfterClose > traderBalanceBeforeClose);
  });

  it("settles a profitable short when the oracle price drops", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_003);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(5),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(-SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    await program.methods
      .updateMarketOracle(
        marketId,
        toBn(PRICE(80)),
        toBn(PRICE(80)),
        toBn(PRICE(8)),
      )
      .accountsPartial({
        config: configPda(program.programId),
        market,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const traderBalanceBeforeClose = await provider.connection.getBalance(
      trader.publicKey,
    );

    await program.methods
      .modifyPosition(marketId, toBn(0), toBn(SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const traderBalanceAfterClose = await provider.connection.getBalance(
      trader.publicKey,
    );
    const marketState = await program.account.marketState.fetch(market);

    assert.strictEqual(num(marketState.totalShortOi), 0);
    assert.ok(traderBalanceAfterClose > traderBalanceBeforeClose);
  });

  it("drifts funding positive when longs dominate open interest", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_004);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(5),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(3)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    const marketBefore = await program.account.marketState.fetch(market);
    await waitForOracleToExpire();

    await program.methods
      .updateMarketOracle(
        marketId,
        toBn(PRICE(100)),
        toBn(PRICE(100)),
        toBn(PRICE(10)),
      )
      .accountsPartial({
        config: configPda(program.programId),
        market,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const marketAfter = await program.account.marketState.fetch(market);
    assert.ok(
      num(marketAfter.currentFundingRate) >
        num(marketBefore.currentFundingRate),
    );
  });

  it("rejects stale opens", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_005);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(5),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await waitForOracleToExpire();

    try {
      await program.methods
        .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(2)))
        .accountsPartial({
          config: configPda(program.programId),
          market,
          position,
          trader: trader.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader])
        .rpc();
      assert.fail("stale-oracle open succeeded");
    } catch (error: unknown) {
      assert.ok(
        hasProgramError(error, "StaleOracle"),
        `expected StaleOracle, got ${String(error)}`,
      );
    }
  });

  it("rejects stale closes until the market oracle is refreshed", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_006);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(5),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    await waitForOracleToExpire();

    try {
      await program.methods
        .modifyPosition(marketId, toBn(0), toBn(-SOL(2)))
        .accountsPartial({
          config: configPda(program.programId),
          market,
          position,
          trader: trader.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([trader])
        .rpc();
      assert.fail("stale-oracle close succeeded");
    } catch (error: unknown) {
      assert.ok(
        hasProgramError(error, "StaleOracle"),
        `expected StaleOracle, got ${String(error)}`,
      );
    }

    await program.methods
      .updateMarketOracle(
        marketId,
        toBn(PRICE(110)),
        toBn(PRICE(110)),
        toBn(PRICE(11)),
      )
      .accountsPartial({
        config: configPda(program.programId),
        market,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    await program.methods
      .modifyPosition(marketId, toBn(0), toBn(-SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();
  });

  it("liquidates underwater positions and rewards the liquidator", async () => {
    const trader = Keypair.generate();
    await airdrop(provider.connection, trader.publicKey, 10);

    const marketId = uniqueMarketId(2_007);
    const market = await seedMarket(
      program,
      authority,
      marketId,
      PRICE(100),
      SOL(8),
    );
    const position = positionPda(program.programId, trader.publicKey, marketId);

    await program.methods
      .modifyPosition(marketId, toBn(SOL(1)), toBn(SOL(4)))
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        trader: trader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([trader])
      .rpc();

    await program.methods
      .updateMarketOracle(
        marketId,
        toBn(PRICE(79)),
        toBn(PRICE(79)),
        toBn(PRICE(7.9)),
      )
      .accountsPartial({
        config: configPda(program.programId),
        market,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const liquidatorBalanceBefore = await provider.connection.getBalance(
      liquidator.publicKey,
    );

    await program.methods
      .liquidatePosition(marketId)
      .accountsPartial({
        config: configPda(program.programId),
        market,
        position,
        owner: trader.publicKey,
        liquidator: liquidator.publicKey,
      })
      .signers([liquidator])
      .rpc();

    const liquidatorBalanceAfter = await provider.connection.getBalance(
      liquidator.publicKey,
    );
    const marketState = await program.account.marketState.fetch(market);
    const closedPosition =
      await program.account.positionState.fetchNullable(position);

    assert.strictEqual(closedPosition, null);
    assert.strictEqual(num(marketState.totalLongOi), 0);
    assert.ok(liquidatorBalanceAfter > liquidatorBalanceBefore);
  });

  it("keeps market state isolated across market ids", async () => {
    const longMarketId = uniqueMarketId(2_008);
    const shortMarketId = uniqueMarketId(2_009);
    const isolatedLongTrader = Keypair.generate();
    const isolatedShortTrader = Keypair.generate();

    await Promise.all([
      airdrop(provider.connection, isolatedLongTrader.publicKey, 10),
      airdrop(provider.connection, isolatedShortTrader.publicKey, 10),
    ]);

    const longMarket = await seedMarket(
      program,
      authority,
      longMarketId,
      PRICE(100),
      SOL(5),
    );
    const shortMarket = await seedMarket(
      program,
      authority,
      shortMarketId,
      PRICE(200),
      SOL(5),
    );

    await refreshMarketOracle(program, authority, longMarketId, PRICE(100));
    await refreshMarketOracle(program, authority, shortMarketId, PRICE(200));

    await program.methods
      .modifyPosition(longMarketId, toBn(SOL(1)), toBn(SOL(2)))
      .accountsPartial({
        config: configPda(program.programId),
        market: longMarket,
        position: positionPda(
          program.programId,
          isolatedLongTrader.publicKey,
          longMarketId,
        ),
        trader: isolatedLongTrader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([isolatedLongTrader])
      .rpc();

    await program.methods
      .modifyPosition(shortMarketId, toBn(SOL(1)), toBn(-SOL(3)))
      .accountsPartial({
        config: configPda(program.programId),
        market: shortMarket,
        position: positionPda(
          program.programId,
          isolatedShortTrader.publicKey,
          shortMarketId,
        ),
        trader: isolatedShortTrader.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([isolatedShortTrader])
      .rpc();

    const longMarketState = await program.account.marketState.fetch(longMarket);
    const shortMarketState =
      await program.account.marketState.fetch(shortMarket);

    assert.strictEqual(num(longMarketState.spotIndex), PRICE(100));
    assert.strictEqual(num(longMarketState.totalLongOi), SOL(2));
    assert.strictEqual(num(longMarketState.totalShortOi), 0);
    assert.strictEqual(num(shortMarketState.spotIndex), PRICE(200));
    assert.strictEqual(num(shortMarketState.totalLongOi), 0);
    assert.strictEqual(num(shortMarketState.totalShortOi), SOL(3));
  });
});
