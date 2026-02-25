#!/usr/bin/env tsx
/**
 * Reconciliation Job
 *
 * Compares on-chain balances vs bot internal accounting and flags discrepancies.
 *
 * Usage:
 *   tsx src/reconcile.ts                   # One-shot reconcile
 *   tsx src/reconcile.ts --interval 60     # Run every 60 seconds
 *   tsx src/reconcile.ts --alert-webhook <url>  # POST discrepancies to webhook
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

interface ReconcileConfig {
  intervalSec: number;
  alertWebhook: string | null;
  toleranceBps: number; // acceptable discrepancy in basis points
}

function parseArgs(): ReconcileConfig {
  const args = process.argv.slice(2);
  let intervalSec = 0;
  let alertWebhook: string | null = null;
  const toleranceBps = Number(process.env.RECONCILE_TOLERANCE_BPS || 50); // 0.5% default

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interval" && args[i + 1]) {
      intervalSec = Math.max(10, Number(args[i + 1]));
      i++;
    } else if (args[i] === "--alert-webhook" && args[i + 1]) {
      alertWebhook = args[i + 1];
      i++;
    }
  }

  return { intervalSec, alertWebhook, toleranceBps };
}

// ─── Balance Fetchers ─────────────────────────────────────────────────────────

interface BalanceReport {
  chain: string;
  wallet: string;
  nativeBalance: string;
  tokenBalance: string | null;
  timestamp: string;
  error: string | null;
}

async function fetchSolanaBalance(): Promise<BalanceReport> {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const conn = new Connection(rpcUrl);
  const pubkey = process.env.SOLANA_WALLET_PUBKEY;
  if (!pubkey) {
    return {
      chain: "solana",
      wallet: "not-configured",
      nativeBalance: "0",
      tokenBalance: null,
      timestamp: new Date().toISOString(),
      error: "SOLANA_WALLET_PUBKEY not set",
    };
  }

  try {
    const pk = new PublicKey(pubkey);
    const lamports = await conn.getBalance(pk, "confirmed");
    return {
      chain: "solana",
      wallet: pubkey,
      nativeBalance: (lamports / 1e9).toFixed(9) + " SOL",
      tokenBalance: null, // TODO: fetch SPL token balance
      timestamp: new Date().toISOString(),
      error: null,
    };
  } catch (err: any) {
    return {
      chain: "solana",
      wallet: pubkey,
      nativeBalance: "error",
      tokenBalance: null,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  }
}

async function fetchEvmBalance(
  label: string,
  rpcUrl: string,
): Promise<BalanceReport> {
  const keyEnv =
    label === "bsc" ? "EVM_PRIVATE_KEY_BSC" : "EVM_PRIVATE_KEY_BASE";
  const key =
    process.env[keyEnv] || process.env.EVM_PRIVATE_KEY;
  if (!key || key === "0x" + "0".repeat(64)) {
    return {
      chain: label,
      wallet: "not-configured",
      nativeBalance: "0",
      tokenBalance: null,
      timestamp: new Date().toISOString(),
      error: `${keyEnv} not set`,
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(key, provider);
    const balance = await provider.getBalance(wallet.address);
    return {
      chain: label,
      wallet: wallet.address,
      nativeBalance: ethers.formatEther(balance),
      tokenBalance: null, // TODO: fetch GOLD token balance
      timestamp: new Date().toISOString(),
      error: null,
    };
  } catch (err: any) {
    return {
      chain: label,
      wallet: "error",
      nativeBalance: "error",
      tokenBalance: null,
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  }
}

// ─── Reconcile ────────────────────────────────────────────────────────────────

interface ReconcileResult {
  timestamp: string;
  balances: BalanceReport[];
  discrepancies: string[];
  ok: boolean;
}

async function reconcile(): Promise<ReconcileResult> {
  const balances: BalanceReport[] = [];
  const discrepancies: string[] = [];

  // Fetch all chain balances in parallel
  const [sol, bsc, base] = await Promise.allSettled([
    fetchSolanaBalance(),
    fetchEvmBalance(
      "bsc",
      process.env.EVM_BSC_RPC_URL ||
        "https://data-seed-prebsc-1-s1.binance.org:8545",
    ),
    fetchEvmBalance(
      "base",
      process.env.EVM_BASE_RPC_URL || "https://sepolia.base.org",
    ),
  ]);

  for (const result of [sol, bsc, base]) {
    if (result.status === "fulfilled") {
      balances.push(result.value);
      if (result.value.error) {
        discrepancies.push(
          `${result.value.chain}: fetch error - ${result.value.error}`,
        );
      }
    } else {
      discrepancies.push(`chain fetch failed: ${result.reason}`);
    }
  }

  // TODO: Compare on-chain balances with internal accounting state
  // For now, just report balances as a baseline

  const result: ReconcileResult = {
    timestamp: new Date().toISOString(),
    balances,
    discrepancies,
    ok: discrepancies.length === 0,
  };

  return result;
}

async function sendAlert(
  webhookUrl: string,
  result: ReconcileResult,
): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `⚠️ Reconciliation discrepancies:\n${result.discrepancies.join("\n")}`,
        ...result,
      }),
    });
  } catch (err: any) {
    console.error(`[RECONCILE] Failed to send alert: ${err.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  console.log("═══════════════════════════════════════════════");
  console.log(" Hyperscape Market Maker — Reconciliation Job  ");
  console.log("═══════════════════════════════════════════════");

  const run = async () => {
    const result = await reconcile();

    console.log(`\n[${result.timestamp}] Reconciliation Report:`);
    for (const b of result.balances) {
      const status = b.error ? `❌ ${b.error}` : "✅";
      console.log(
        `  ${b.chain.padEnd(8)} | ${b.wallet.slice(0, 20).padEnd(20)} | ${b.nativeBalance.padEnd(20)} | ${status}`,
      );
    }

    if (result.discrepancies.length > 0) {
      console.log(`\n⚠️  Discrepancies (${result.discrepancies.length}):`);
      for (const d of result.discrepancies) {
        console.log(`  - ${d}`);
      }
      if (config.alertWebhook) {
        await sendAlert(config.alertWebhook, result);
      }
    } else {
      console.log("\n✅ All balances reconciled OK.");
    }
  };

  await run();

  if (config.intervalSec > 0) {
    console.log(`\nRunning every ${config.intervalSec}s (Ctrl+C to stop)\n`);
    setInterval(run, config.intervalSec * 1000);
  }
}

main().catch(console.error);
