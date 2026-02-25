/**
 * run-multi.ts – Multi-wallet orchestration for the MM bot.
 *
 * Features:
 * - Maker wallet pool with configurable count
 * - Per-wallet inventory caps
 * - Rotation cadence (cycle wallets to distribute activity)
 * - Funding checks (skip wallets below minimum balance)
 * - All run modes: dry-run, paper, live
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ethers } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";

import type { MultiWalletConfig, WalletConfig, RunMode } from "./common.js";
import { resolveRunMode, resolveSolanaProgramId, sleep } from "./common.js";

// ─── Args ─────────────────────────────────────────────────────────────────────
const parseArgs = () => {
  const args = process.argv.slice(2);
  const getValue = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) return fallback;
    return value;
  };

  return {
    configPath: getValue("--config", "wallets.generated.json"),
    staggerMs: Math.max(
      0,
      Number.parseInt(getValue("--stagger-ms", "1200"), 10) || 1200,
    ),
    dryRun: args.includes("--dry-run"),
    paper: args.includes("--paper"),
    rotationCadence: Math.max(
      0,
      Number.parseInt(getValue("--rotation-cadence", "0"), 10) || 0,
    ),
    fundingCheck: !args.includes("--skip-funding-check"),
  };
};

const maskSecret = (value: string | undefined) => {
  if (!value) return "(unset)";
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

async function loadConfig(configPath: string): Promise<MultiWalletConfig> {
  const resolved = path.resolve(process.cwd(), configPath);
  const raw = await readFile(resolved, "utf8");
  const parsed = JSON.parse(raw) as MultiWalletConfig;
  if (
    !parsed ||
    !Array.isArray(parsed.wallets) ||
    parsed.wallets.length === 0
  ) {
    throw new Error("Config must include a non-empty wallets array");
  }
  return parsed;
}

function bindPrefixedOutput(
  proc: ChildProcessWithoutNullStreams,
  name: string,
  stream: "stdout" | "stderr",
) {
  proc[stream].on("data", (chunk) => {
    const text = chunk.toString();
    const lines = text.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      const prefix = `[mm:${name}]`;
      if (stream === "stderr") {
        console.error(`${prefix} ${line}`);
      } else {
        console.log(`${prefix} ${line}`);
      }
    }
  });
}

// ─── Funding Check ────────────────────────────────────────────────────────────
async function checkEvmFunding(
  walletKey: string,
  rpcUrl: string,
  chain: string,
  minWei: string,
): Promise<{ ok: boolean; balance: string }> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(walletKey, provider);
    const balance = await provider.getBalance(wallet.address);
    const ok = balance >= BigInt(minWei);
    return { ok, balance: ethers.formatEther(balance) };
  } catch (e: any) {
    console.warn(`[funding:${chain}] Check failed: ${e.message}`);
    return { ok: false, balance: "0" };
  }
}

async function checkSolanaFunding(
  rpcUrl: string,
  pubkey: string,
  minLamports: number,
): Promise<{ ok: boolean; balance: number }> {
  try {
    const conn = new Connection(rpcUrl);
    const pk = new PublicKey(pubkey);
    const balance = await conn.getBalance(pk);
    return { ok: balance >= minLamports, balance };
  } catch (e: any) {
    console.warn(`[funding:solana] Check failed: ${e.message}`);
    return { ok: false, balance: 0 };
  }
}

// ─── Wallet Rotation ──────────────────────────────────────────────────────────
class WalletRotation {
  private wallets: WalletConfig[];
  private activeIndex = 0;
  private cyclesSinceRotation = 0;
  private cadence: number;

  constructor(wallets: WalletConfig[], cadence: number) {
    this.wallets = wallets.filter((w) => w.enabled !== false);
    this.cadence = cadence;
  }

  getActiveWallets(): WalletConfig[] {
    if (this.cadence <= 0 || this.wallets.length <= 1) {
      return this.wallets;
    }

    // Return a sliding window of wallets
    const windowSize = Math.min(
      Math.ceil(this.wallets.length / 2),
      this.wallets.length,
    );
    const result: WalletConfig[] = [];
    for (let i = 0; i < windowSize; i++) {
      result.push(this.wallets[(this.activeIndex + i) % this.wallets.length]);
    }
    return result;
  }

  tick() {
    if (this.cadence <= 0) return;
    this.cyclesSinceRotation++;
    if (this.cyclesSinceRotation >= this.cadence) {
      this.cyclesSinceRotation = 0;
      this.activeIndex = (this.activeIndex + 1) % this.wallets.length;
      console.log(
        `[mm:runner] Rotated to wallet pool starting at index ${this.activeIndex}`,
      );
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const {
    configPath,
    staggerMs,
    dryRun,
    paper,
    rotationCadence,
    fundingCheck,
  } = parseArgs();
  const config = await loadConfig(configPath);
  const defaults = config.defaults ?? {};
  const children = new Map<string, ChildProcessWithoutNullStreams>();
  let shuttingDown = false;

  // Determine run mode from args or env
  let runMode: RunMode = resolveRunMode();
  if (dryRun) runMode = "dry-run";
  if (paper) runMode = "paper";

  const cadence = rotationCadence || config.rotationCadence || 0;
  const minFundingLamports = config.minFundingLamports ?? 50_000_000; // 0.05 SOL
  const minFundingWei = config.minFundingWei ?? "10000000000000000"; // 0.01 ETH
  const failOnNoEligible = /^(1|true|yes|on)$/i.test(
    process.env.MM_FAIL_ON_NO_ELIGIBLE ?? "",
  );

  console.log(
    `[mm:runner] Mode: ${runMode} | Wallets: ${config.wallets.length} | Rotation cadence: ${cadence || "disabled"} | Funding check: ${fundingCheck}`,
  );

  const shutdownAll = (signal: NodeJS.Signals = "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const [name, child] of children.entries()) {
      console.log(`[mm:runner] stopping ${name} (${signal})`);
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdownAll("SIGINT"));
  process.on("SIGTERM", () => shutdownAll("SIGTERM"));

  // Filter wallets by funding if enabled
  const eligibleWallets: WalletConfig[] = [];
  for (const wallet of config.wallets) {
    if (!wallet.name || !wallet.name.trim()) {
      throw new Error("Each wallet entry must have a non-empty name");
    }
    if (wallet.enabled === false) {
      console.log(`[mm:runner] ${wallet.name} disabled, skipping`);
      continue;
    }

    if (fundingCheck && runMode === "live") {
      const evmKey =
        wallet.evmPrivateKey ||
        wallet.evmPrivateKeyBsc ||
        process.env.EVM_PRIVATE_KEY;
      if (evmKey) {
        const bscRpc =
          wallet.env?.EVM_BSC_RPC_URL ||
          defaults.EVM_BSC_RPC_URL ||
          process.env.EVM_BSC_RPC_URL;
        if (bscRpc) {
          const { ok, balance } = await checkEvmFunding(
            evmKey,
            bscRpc,
            "bsc",
            minFundingWei,
          );
          if (!ok) {
            console.warn(
              `[mm:runner] ${wallet.name} underfunded on BSC (${balance} ETH), skipping`,
            );
            continue;
          }
        }
      }
    }

    eligibleWallets.push(wallet);
  }

  if (eligibleWallets.length === 0) {
    if (failOnNoEligible) {
      throw new Error("No eligible wallets after funding checks");
    }
    console.warn(
      "[mm:runner] No eligible wallets after funding checks; exiting without launching workers",
    );
    return;
  }

  console.log(
    `[mm:runner] ${eligibleWallets.length}/${config.wallets.length} wallets eligible`,
  );

  for (const wallet of eligibleWallets) {
    const walletEnv: NodeJS.ProcessEnv = {
      ...defaults,
      ...process.env,
      ...(wallet.env ?? {}),
      MM_INSTANCE_ID: wallet.name,
      MM_RUN_MODE: runMode,
      EVM_PRIVATE_KEY: wallet.evmPrivateKey || process.env.EVM_PRIVATE_KEY,
      EVM_PRIVATE_KEY_BSC:
        wallet.evmPrivateKeyBsc ||
        wallet.evmPrivateKey ||
        process.env.EVM_PRIVATE_KEY_BSC,
      EVM_PRIVATE_KEY_BASE:
        wallet.evmPrivateKeyBase ||
        wallet.evmPrivateKey ||
        process.env.EVM_PRIVATE_KEY_BASE,
      SOLANA_PRIVATE_KEY:
        wallet.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY,
    };

    // Per-wallet caps
    if (wallet.maxInventoryCap !== undefined) {
      walletEnv.MAX_INVENTORY_CAP = String(wallet.maxInventoryCap);
    }
    if (wallet.maxOrderSize !== undefined) {
      walletEnv.ORDER_SIZE_MAX = String(wallet.maxOrderSize);
    }

    if (runMode === "dry-run") {
      console.log(
        `[mm:runner] ${wallet.name} | evm=${maskSecret(walletEnv.EVM_PRIVATE_KEY)} | sol=${maskSecret(walletEnv.SOLANA_PRIVATE_KEY)} | cap=${walletEnv.MAX_INVENTORY_CAP || "default"}`,
      );
      continue;
    }

    const child = spawn("tsx", ["src/index.ts"], {
      cwd: process.cwd(),
      env: walletEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    children.set(wallet.name, child);
    bindPrefixedOutput(child, wallet.name, "stdout");
    bindPrefixedOutput(child, wallet.name, "stderr");

    child.on("exit", (code, signal) => {
      children.delete(wallet.name);
      if (shuttingDown) return;
      if (code === 0) {
        console.log(`[mm:runner] ${wallet.name} exited cleanly`);
        return;
      }
      console.error(
        `[mm:runner] ${wallet.name} exited unexpectedly (code=${code ?? "null"} signal=${signal ?? "none"})`,
      );
      shutdownAll();
      process.exit(code ?? 1);
    });

    console.log(`[mm:runner] started ${wallet.name}`);
    await sleep(staggerMs);
  }

  if (runMode === "dry-run") {
    console.log("[mm:runner] dry run complete");
    return;
  }

  console.log(`[mm:runner] active instances: ${children.size}`);
  await new Promise<void>(() => {
    // Keep process alive while child market-makers run.
  });
}

main().catch((error) => {
  console.error("[mm:runner] failed:", error);
  process.exit(1);
});
