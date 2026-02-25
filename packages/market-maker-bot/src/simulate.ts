import { CrossChainMarketMaker } from "./index.ts";
import { sleep } from "./common.ts";

const DEFAULT_DEV_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bootstrapDefaults() {
  if (!process.env.EVM_PRIVATE_KEY) {
    process.env.EVM_PRIVATE_KEY = DEFAULT_DEV_PRIVATE_KEY;
  }
  if (!process.env.EVM_BSC_RPC_URL) {
    process.env.EVM_BSC_RPC_URL = "http://127.0.0.1:8545";
  }
  if (!process.env.EVM_BASE_RPC_URL) {
    process.env.EVM_BASE_RPC_URL = process.env.EVM_BSC_RPC_URL;
  }
  if (!process.env.SOLANA_RPC_URL) {
    process.env.SOLANA_RPC_URL = "http://127.0.0.1:8899";
  }
  // Default to paper mode for simulation
  if (!process.env.MM_RUN_MODE) {
    process.env.MM_RUN_MODE = "paper";
  }
}

async function main() {
  bootstrapDefaults();

  const cycles = parsePositiveInt(process.env.SIM_CYCLES, 20);
  const delayMs = parsePositiveInt(process.env.SIM_DELAY_MS, 200);

  const mm = new CrossChainMarketMaker();

  console.log(
    `[simulate] Starting bounded MM simulation: cycles=${cycles}, delayMs=${delayMs}, mode=${mm.getRunMode()}`,
  );

  for (let i = 0; i < cycles; i += 1) {
    await mm.marketMakeCycle();
    await sleep(delayMs);
  }

  const config = mm.getConfig();
  const inventory = mm.getInventory();
  const activeOrders = mm.getActiveOrders();

  console.log("[simulate] Completed.");
  console.log(
    JSON.stringify(
      {
        cycles,
        runMode: config.runMode,
        aggressiveness: config.aggressivenessTier,
        chainStatus: {
          bsc: config.bscEnabled,
          base: config.baseEnabled,
          solana: config.solanaEnabled,
        },
        inventory,
        activeOrderCount: activeOrders.length,
        allOrdersNonZero: activeOrders.every((o) => o.amount > 0),
      },
      null,
      2,
    ),
  );

  if (!config.bscEnabled && !config.baseEnabled && !config.solanaEnabled) {
    throw new Error("No chain endpoints were reachable");
  }
}

main().catch((error) => {
  console.error("[simulate] Failed:", (error as Error).message);
  process.exit(1);
});
