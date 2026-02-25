#!/usr/bin/env tsx
/**
 * Kill-Switch CLI
 *
 * Usage:
 *   tsx src/kill-switch.ts                    # Cancel all orders, stop placement
 *   tsx src/kill-switch.ts --withdraw         # Also withdraw balances
 *   tsx src/kill-switch.ts --status           # Show current risk state
 *
 * This sends a SIGUSR2 signal to the running bot process, or writes a
 * kill-switch sentinel file that the bot checks on each cycle.
 */

import fs from "node:fs";
import path from "node:path";

const KILL_SWITCH_FILE = path.resolve(
  import.meta.dirname ?? ".",
  "../.kill-switch",
);

const STATUS_FILE = path.resolve(
  import.meta.dirname ?? ".",
  "../.risk-status.json",
);

function printUsage() {
  console.log(`
Kill-Switch CLI for Hyperscape Market Maker Bot

Usage:
  tsx src/kill-switch.ts              Activate kill-switch (cancel orders, stop placement)
  tsx src/kill-switch.ts --withdraw   Activate + request balance withdrawal
  tsx src/kill-switch.ts --reset      Deactivate kill-switch
  tsx src/kill-switch.ts --status     Show current risk status

The kill-switch works via a sentinel file (.kill-switch) in the bot package root.
The bot checks for this file every cycle and will:
  1. Cancel all open orders on all chains
  2. Stop placing new orders
  3. Optionally withdraw balances to configured safe wallets
`);
}

function activate(withdraw: boolean) {
  const payload = {
    activated: true,
    activatedAt: new Date().toISOString(),
    reason: "manual-cli",
    withdraw,
  };
  fs.writeFileSync(KILL_SWITCH_FILE, JSON.stringify(payload, null, 2));
  console.log("🚨 KILL-SWITCH ACTIVATED");
  console.log(`   File: ${KILL_SWITCH_FILE}`);
  console.log(`   Withdraw: ${withdraw}`);
  console.log(`   Time: ${payload.activatedAt}`);
  console.log("");
  console.log("The bot will cancel all orders on the next cycle.");
  if (withdraw) {
    console.log("Balance withdrawal has been requested.");
  }
}

function reset() {
  if (fs.existsSync(KILL_SWITCH_FILE)) {
    fs.unlinkSync(KILL_SWITCH_FILE);
    console.log("✅ Kill-switch deactivated. Bot will resume normal operation.");
  } else {
    console.log("ℹ️  Kill-switch was not active.");
  }
}

function status() {
  // Check sentinel file
  if (fs.existsSync(KILL_SWITCH_FILE)) {
    const data = JSON.parse(fs.readFileSync(KILL_SWITCH_FILE, "utf-8"));
    console.log("🚨 Kill-switch is ACTIVE:");
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log("✅ Kill-switch is NOT active.");
  }

  // Check risk status file
  console.log("");
  if (fs.existsSync(STATUS_FILE)) {
    const riskData = JSON.parse(fs.readFileSync(STATUS_FILE, "utf-8"));
    console.log("📊 Risk Status:");
    console.log(JSON.stringify(riskData, null, 2));
  } else {
    console.log("📊 No risk status file found (bot may not be running).");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
} else if (args.includes("--status")) {
  status();
} else if (args.includes("--reset")) {
  reset();
} else {
  const withdraw = args.includes("--withdraw");
  activate(withdraw);
}
