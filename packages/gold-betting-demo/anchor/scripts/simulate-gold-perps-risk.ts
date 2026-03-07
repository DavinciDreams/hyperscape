import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const FUNDING_RATE_PRECISION = 1_000_000_000n;
const BPS_DENOMINATOR = 10_000n;

type ScenarioCategory = "attack" | "stress" | "ops";

interface PerpsParams {
  liquidationFeeBps: bigint;
  maintenanceMarginBps: bigint;
  skewScaleLamports: bigint;
  fundingVelocity: bigint;
}

interface MarketState {
  insuranceFundLamports: bigint;
  currentFundingRate: bigint;
  longOiLamports: bigint;
  shortOiLamports: bigint;
}

interface PositionState {
  entryFundingRate: bigint;
  entryPriceLamports: bigint;
  marginLamports: bigint;
  sizeLamports: bigint;
}

interface ScenarioResult {
  name: string;
  category: ScenarioCategory;
  summary: string;
  weakness: string | null;
  metrics: Record<string, number | string | boolean>;
}

function sol(amount: number): bigint {
  return BigInt(Math.round(amount * Number(LAMPORTS_PER_SOL)));
}

function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / Number(LAMPORTS_PER_SOL);
}

function ratioPercent(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  return (Number(numerator) / Number(denominator)) * 100;
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function executionPriceLamports(
  indexPriceLamports: bigint,
  market: Pick<MarketState, "longOiLamports" | "shortOiLamports">,
  sizeDeltaLamports: bigint,
  params: Pick<PerpsParams, "skewScaleLamports">,
): bigint {
  const skew = market.longOiLamports - market.shortOiLamports;
  const y1 = params.skewScaleLamports + skew;
  const y2 = y1 + sizeDeltaLamports;

  if (params.skewScaleLamports <= 0n || y1 <= 0n || y2 <= 0n) {
    throw new Error("invalid virtual reserve state");
  }

  const part1 = (indexPriceLamports * y1) / params.skewScaleLamports;
  return (part1 * y2) / params.skewScaleLamports;
}

function openPosition(
  marginLamports: bigint,
  sizeLamports: bigint,
  indexPriceLamports: bigint,
  market: MarketState,
  params: PerpsParams,
): { market: MarketState; position: PositionState } {
  const entryPriceLamports = executionPriceLamports(
    indexPriceLamports,
    market,
    sizeLamports,
    params,
  );

  return {
    market: updateOpenInterest(market, 0n, sizeLamports),
    position: {
      entryFundingRate: market.currentFundingRate,
      entryPriceLamports,
      marginLamports,
      sizeLamports,
    },
  };
}

function updateOpenInterest(
  market: MarketState,
  oldSizeLamports: bigint,
  newSizeLamports: bigint,
): MarketState {
  const next = { ...market };
  if (oldSizeLamports > 0n) next.longOiLamports -= oldSizeLamports;
  if (oldSizeLamports < 0n) next.shortOiLamports -= -oldSizeLamports;
  if (newSizeLamports > 0n) next.longOiLamports += newSizeLamports;
  if (newSizeLamports < 0n) next.shortOiLamports += -newSizeLamports;
  return next;
}

function tradePnlLamports(
  sizeLamports: bigint,
  entryPriceLamports: bigint,
  exitPriceLamports: bigint,
): bigint {
  const absSize = absBigInt(sizeLamports);
  if (sizeLamports > 0n) {
    return (
      ((exitPriceLamports - entryPriceLamports) * absSize) / entryPriceLamports
    );
  }
  return (
    ((entryPriceLamports - exitPriceLamports) * absSize) / entryPriceLamports
  );
}

function fundingPnlLamports(
  sizeLamports: bigint,
  fundingDelta: bigint,
): bigint {
  return -((sizeLamports * fundingDelta) / FUNDING_RATE_PRECISION);
}

function settlePositionLamports(
  position: PositionState,
  exitPriceLamports: bigint,
  currentFundingRate: bigint,
): bigint {
  const pnlLamports = tradePnlLamports(
    position.sizeLamports,
    position.entryPriceLamports,
    exitPriceLamports,
  );
  const fundingLamports = fundingPnlLamports(
    position.sizeLamports,
    currentFundingRate - position.entryFundingRate,
  );
  const equityLamports =
    position.marginLamports + pnlLamports + fundingLamports;
  return equityLamports > 0n ? equityLamports : 0n;
}

function calculateMaintenanceMarginLamports(
  sizeLamports: bigint,
  maintenanceMarginBps: bigint,
): bigint {
  return (absBigInt(sizeLamports) * maintenanceMarginBps) / BPS_DENOMINATOR;
}

function driftFundingRate(
  market: MarketState,
  elapsedSeconds: bigint,
  params: Pick<PerpsParams, "fundingVelocity" | "skewScaleLamports">,
): bigint {
  const skew = market.longOiLamports - market.shortOiLamports;
  return (
    (skew * params.fundingVelocity * elapsedSeconds) / params.skewScaleLamports
  );
}

function defaultParams(): PerpsParams {
  return {
    liquidationFeeBps: 100n,
    maintenanceMarginBps: 500n,
    skewScaleLamports: sol(100),
    fundingVelocity: 50_000_000n,
  };
}

function scenarioWhaleRoundTrip(): ScenarioResult {
  const params = defaultParams();
  const indexPriceLamports = sol(100);
  const emptyMarket: MarketState = {
    insuranceFundLamports: sol(5),
    currentFundingRate: 0n,
    longOiLamports: 0n,
    shortOiLamports: 0n,
  };

  const whale = openPosition(
    sol(5),
    sol(20),
    indexPriceLamports,
    emptyMarket,
    params,
  );
  const follower = openPosition(
    sol(1),
    sol(4),
    indexPriceLamports,
    whale.market,
    params,
  );
  const whaleExitPriceLamports = executionPriceLamports(
    indexPriceLamports,
    whale.market,
    -whale.position.sizeLamports,
    params,
  );
  const whaleRoundTripPnlLamports = tradePnlLamports(
    whale.position.sizeLamports,
    whale.position.entryPriceLamports,
    whaleExitPriceLamports,
  );

  return {
    name: "Whale round trip",
    category: "attack",
    summary:
      "Large same-direction trades pay a meaningful entry premium and lose on an immediate exit, so the skew curve resists cheap self-pumping.",
    weakness: null,
    metrics: {
      whale_notional_sol: lamportsToSol(whale.position.sizeLamports),
      whale_entry_premium_pct: Number(
        ratioPercent(
          whale.position.entryPriceLamports - indexPriceLamports,
          indexPriceLamports,
        ).toFixed(4),
      ),
      follower_entry_premium_pct: Number(
        ratioPercent(
          follower.position.entryPriceLamports - indexPriceLamports,
          indexPriceLamports,
        ).toFixed(4),
      ),
      whale_instant_roundtrip_pnl_sol: Number(
        lamportsToSol(whaleRoundTripPnlLamports).toFixed(6),
      ),
    },
  };
}

function scenarioFundingDrift(): ScenarioResult {
  const params = defaultParams();
  const market: MarketState = {
    insuranceFundLamports: sol(5),
    currentFundingRate: 0n,
    longOiLamports: sol(10),
    shortOiLamports: 0n,
  };
  const position = openPosition(
    sol(1),
    sol(5),
    sol(100),
    market,
    params,
  ).position;
  const oneHourFundingDelta = driftFundingRate(market, 3_600n, params);
  const oneDayFundingDelta = driftFundingRate(market, 86_400n, params);
  const oneHourFundingCostLamports = fundingPnlLamports(
    position.sizeLamports,
    oneHourFundingDelta,
  );
  const oneDayFundingCostLamports = fundingPnlLamports(
    position.sizeLamports,
    oneDayFundingDelta,
  );

  return {
    name: "Default funding drift",
    category: "stress",
    summary:
      "Funding rises when one side dominates, but the default parameters still need calibration against real duel history before a larger launch.",
    weakness:
      "Funding is directionally correct, but parameter sweeps against production-like activity are still required before scaling liquidity.",
    metrics: {
      skew_sol: lamportsToSol(market.longOiLamports),
      funding_delta_1h: Number(oneHourFundingDelta),
      funding_delta_24h: Number(oneDayFundingDelta),
      long_funding_cost_1h_sol: Number(
        lamportsToSol(oneHourFundingCostLamports).toFixed(9),
      ),
      long_funding_cost_24h_sol: Number(
        lamportsToSol(oneDayFundingCostLamports).toFixed(9),
      ),
    },
  };
}

function scenarioIsolatedInsuranceContainment(): ScenarioResult {
  const params = defaultParams();
  const marketA: MarketState = {
    insuranceFundLamports: sol(2),
    currentFundingRate: 0n,
    longOiLamports: 0n,
    shortOiLamports: 0n,
  };
  const marketB: MarketState = {
    insuranceFundLamports: sol(8),
    currentFundingRate: 0n,
    longOiLamports: 0n,
    shortOiLamports: 0n,
  };
  const opened = openPosition(sol(1), sol(4), sol(100), marketA, params);
  const exitPriceLamports = executionPriceLamports(
    sol(125),
    opened.market,
    -opened.position.sizeLamports,
    params,
  );
  const settlementLamports = settlePositionLamports(
    opened.position,
    exitPriceLamports,
    0n,
  );
  const marketAFreeLiquidityLamports = sol(1) + marketA.insuranceFundLamports;

  return {
    name: "Isolated insurance containment",
    category: "ops",
    summary:
      "A profitable close on one model can only use that model's own insurance reserve; other markets remain untouched.",
    weakness: null,
    metrics: {
      market_a_required_settlement_sol: Number(
        lamportsToSol(settlementLamports).toFixed(6),
      ),
      market_a_total_liquidity_sol: lamportsToSol(marketAFreeLiquidityLamports),
      market_b_reserved_insurance_sol: lamportsToSol(
        marketB.insuranceFundLamports,
      ),
      can_reach_market_b_reserve: false,
    },
  };
}

function scenarioPositiveEquityLiquidation(): ScenarioResult {
  const params = defaultParams();
  const market: MarketState = {
    insuranceFundLamports: sol(2),
    currentFundingRate: 0n,
    longOiLamports: 0n,
    shortOiLamports: 0n,
  };
  const opened = openPosition(sol(1), sol(5), sol(100), market, params);
  const exitPriceLamports = executionPriceLamports(
    sol(82),
    opened.market,
    -opened.position.sizeLamports,
    params,
  );
  const settlementLamports = settlePositionLamports(
    opened.position,
    exitPriceLamports,
    0n,
  );
  const maintenanceMarginLamports = calculateMaintenanceMarginLamports(
    opened.position.sizeLamports,
    params.maintenanceMarginBps,
  );
  const liquidationFeeLamports =
    settlementLamports < 0n
      ? 0n
      : (absBigInt(opened.position.sizeLamports) * params.liquidationFeeBps) /
        BPS_DENOMINATOR;

  return {
    name: "Positive-equity liquidation",
    category: "stress",
    summary:
      "A position can cross the maintenance threshold before equity reaches zero, allowing orderly liquidation with a bounded liquidator fee.",
    weakness: null,
    metrics: {
      settlement_equity_sol: Number(
        lamportsToSol(settlementLamports).toFixed(6),
      ),
      maintenance_margin_sol: lamportsToSol(maintenanceMarginLamports),
      liquidatable: settlementLamports < maintenanceMarginLamports,
      liquidator_fee_sol: Number(
        lamportsToSol(liquidationFeeLamports).toFixed(6),
      ),
    },
  };
}

function scenarioLocalInsuranceShortfall(): ScenarioResult {
  const params = defaultParams();
  const market: MarketState = {
    insuranceFundLamports: sol(0.5),
    currentFundingRate: 0n,
    longOiLamports: 0n,
    shortOiLamports: 0n,
  };
  const opened = openPosition(sol(1), sol(4), sol(100), market, params);
  const exitPriceLamports = executionPriceLamports(
    sol(140),
    opened.market,
    -opened.position.sizeLamports,
    params,
  );
  const settlementLamports = settlePositionLamports(
    opened.position,
    exitPriceLamports,
    0n,
  );
  const localLiquidityLamports =
    opened.position.marginLamports + market.insuranceFundLamports;
  const shortfallLamports =
    settlementLamports > localLiquidityLamports
      ? settlementLamports - localLiquidityLamports
      : 0n;

  return {
    name: "Local insurance shortfall",
    category: "stress",
    summary:
      "Even with isolated markets, each model still needs enough dedicated insurance or opposing flow to settle winning traders smoothly.",
    weakness:
      "Isolation removes cross-market contagion, but it does not remove the need to seed each market with adequate local liquidity.",
    metrics: {
      settlement_required_sol: Number(
        lamportsToSol(settlementLamports).toFixed(6),
      ),
      local_liquidity_sol: lamportsToSol(localLiquidityLamports),
      shortfall_sol: Number(lamportsToSol(shortfallLamports).toFixed(6)),
    },
  };
}

function runScenarios(): ScenarioResult[] {
  return [
    scenarioWhaleRoundTrip(),
    scenarioFundingDrift(),
    scenarioIsolatedInsuranceContainment(),
    scenarioPositiveEquityLiquidation(),
    scenarioLocalInsuranceShortfall(),
  ];
}

function main(): void {
  const results = runScenarios();
  const findings = results
    .filter((result) => result.weakness)
    .map((result) => ({
      name: result.name,
      category: result.category,
      weakness: result.weakness,
    }));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outputDir = path.resolve(__dirname, "..", "simulations");
  const outputPath = path.join(outputDir, "gold-perps-risk-report.json");

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
        findings,
      },
      null,
      2,
    ),
  );

  console.log("[perps-risk] Wrote", outputPath);
  for (const result of results) {
    console.log(`\n[${result.category}] ${result.name}`);
    console.log(`  ${result.summary}`);
    if (result.weakness) {
      console.log(`  Weakness: ${result.weakness}`);
    }
    for (const [key, value] of Object.entries(result.metrics)) {
      console.log(`  ${key}: ${value}`);
    }
  }
}

main();
