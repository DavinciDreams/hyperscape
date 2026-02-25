#!/usr/bin/env node
/**
 * Unified Duel + Market Maker Stack Launcher
 *
 * Wraps duel-stack.mjs with:
 * - Strict preflight validation with explicit PASS/FAIL gates
 * - Deterministic health checking before stack-online announcement
 * - MM worker eligibility enforcement
 * - Non-zero exit on preflight failures in strict mode
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const options = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    // Stack control
    fresh: { type: "boolean" },
    "with-keeper": { type: "boolean" },
    "verify-only": { type: "boolean" },
    verify: { type: "boolean" },
    // MM control
    "with-mm": { type: "boolean" },
    "mm-mode": { type: "string", default: "auto" },
    "mm-config": { type: "string" },
    "mm-stagger-ms": { type: "string", default: "900" },
    // Preflight control
    "strict-preflight": { type: "boolean", default: true },
    "no-strict-preflight": { type: "boolean" },
    "strict-mm-eligible": { type: "boolean" },
    // Timeouts
    "preflight-timeout-ms": { type: "string", default: "30000" },
    "startup-timeout-ms": { type: "string", default: "420000" },
    // Pass-through
    bots: { type: "string", short: "b", default: "4" },
    "betting-port": { type: "string", default: "4179" },
    "server-url": { type: "string", default: "http://localhost:5555" },
    "ws-url": { type: "string", default: "ws://localhost:5555/ws" },
    "client-url": { type: "string", default: "http://localhost:3333" },
    "skip-stream": { type: "boolean" },
    "skip-betting": { type: "boolean" },
    "skip-bots": { type: "boolean" },
    "remote-betting": { type: "boolean" },
    verbose: { type: "boolean", short: "v" },
  },
  strict: true,
}).values;

if (options.help) {
  console.log(`
Unified Duel + Market Maker Stack Launcher

Usage:
  bun run duel:mm [options]

Options:
  -h, --help                Show this help
  --fresh                   Force fresh restart of all components
  --with-keeper             Include keeper bot (devnet automation)
  --with-mm                 Enable market maker bots (default: true for duel:mm)
  --mm-mode <mode>          MM mode: auto|single|multi (default: auto)
  --mm-config <path>        MM wallet config path
  --mm-stagger-ms <n>       MM startup stagger in ms (default: 900)
  --verify                  Run post-startup verification
  --verify-only             Only run verification (stack must be running)
  --strict-preflight        Require all health gates to pass (default: true)
  --no-strict-preflight     Allow degraded startup (non-fatal preflight failures)
  --strict-mm-eligible      Fail if no MM-eligible markets found
  --preflight-timeout-ms <n>  Preflight check timeout (default: 30000)
  --startup-timeout-ms <n>    Stack startup timeout (default: 420000)
  -b, --bots <n>            Duel bot count (default: 4)
  --betting-port <n>        Betting app port (default: 4179)
  --server-url <url>        Game server URL (default: http://localhost:5555)
  --ws-url <url>            Game WS URL (default: ws://localhost:5555/ws)
  --client-url <url>        Game client URL (default: http://localhost:3333)
  --skip-stream             Skip RTMP/HLS streaming
  --skip-betting            Skip betting app
  --skip-bots               Skip duel matchmaker bots
  --remote-betting          Use external betting platform
  -v, --verbose             Verbose output
`);
  process.exit(0);
}

const ROOT = process.cwd();
const serverUrl = options["server-url"].replace(/\/$/, "");
const clientUrl = options["client-url"].replace(/\/$/, "");
const bettingPort = Number.parseInt(options["betting-port"], 10);
const preflightTimeoutMs = Number.parseInt(options["preflight-timeout-ms"], 10) || 30_000;
const strictPreflight = options["strict-preflight"] && !options["no-strict-preflight"];
const strictMmEligible = options["strict-mm-eligible"] === true;
const verifyOnly = options["verify-only"] === true;
const skipStream = options["skip-stream"] === true;
const skipBetting = options["skip-betting"] === true || options["remote-betting"] === true;
const withMm = options["with-mm"] !== false; // Default true for this launcher
const verbose = options.verbose === true;

// ANSI colors for terminal output
const PASS = "\x1b[32m[PASS]\x1b[0m";
const FAIL = "\x1b[31m[FAIL]\x1b[0m";
const WARN = "\x1b[33m[WARN]\x1b[0m";
const INFO = "\x1b[36m[INFO]\x1b[0m";

function log(message) {
  console.log(`[duel-mm] ${message}`);
}

function logGate(name, passed, detail = "") {
  const status = passed ? PASS : FAIL;
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function logWarn(name, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${WARN} ${name}${suffix}`);
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkHttpEndpoint(url, timeoutMs = 5000) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkJsonEndpoint(url, validator, timeoutMs = 5000) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const data = await response.json();
    const valid = validator ? validator(data) : true;
    return { ok: valid, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Preflight Health Gates
 * Each gate returns { passed: boolean, detail?: string }
 */
const healthGates = {
  async gameServer() {
    const healthUrl = `${serverUrl}/health`;
    const result = await checkHttpEndpoint(healthUrl, preflightTimeoutMs);
    if (result.ok) {
      return { passed: true, detail: healthUrl };
    }
    return { passed: false, detail: result.error || `HTTP ${result.status}` };
  },

  async duelState() {
    const stateUrl = `${serverUrl}/api/streaming/state`;
    const result = await checkJsonEndpoint(
      stateUrl,
      (data) => data && typeof data === "object",
      preflightTimeoutMs
    );
    if (result.ok) {
      const phase = result.data?.cycle?.phase || "unknown";
      return { passed: true, detail: `phase: ${phase}` };
    }
    return { passed: false, detail: result.error || `HTTP ${result.status}` };
  },

  async hlsStream() {
    if (skipStream) {
      return { passed: true, detail: "skipped" };
    }
    const hlsUrl = `http://localhost:${bettingPort}/live/stream.m3u8`;
    try {
      const response = await fetchWithTimeout(hlsUrl, preflightTimeoutMs);
      if (!response.ok) {
        return { passed: false, detail: `HTTP ${response.status}` };
      }
      const manifest = await response.text();
      const hasHeader = /#EXTM3U/i.test(manifest);
      const hasSegments = /#EXTINF:/m.test(manifest) && /\.(ts|m4s|mp4)(\?|$)/m.test(manifest);
      if (hasHeader && hasSegments) {
        return { passed: true, detail: "live segments present" };
      }
      if (hasHeader) {
        return { passed: true, detail: "manifest ready (awaiting segments)" };
      }
      return { passed: false, detail: "invalid manifest format" };
    } catch (error) {
      return { passed: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async bettingUI() {
    if (skipBetting) {
      return { passed: true, detail: "skipped" };
    }
    const bettingUrl = `http://localhost:${bettingPort}`;
    const result = await checkHttpEndpoint(bettingUrl, preflightTimeoutMs);
    if (result.ok) {
      return { passed: true, detail: bettingUrl };
    }
    return { passed: false, detail: result.error || `HTTP ${result.status}` };
  },

  async mmWorkers() {
    if (!withMm) {
      return { passed: true, detail: "disabled" };
    }
    // Check if market maker can find eligible markets
    const arenaUrl = `${serverUrl}/api/arena/rounds?limit=1`;
    const result = await checkJsonEndpoint(
      arenaUrl,
      (data) => data && Array.isArray(data.rounds),
      preflightTimeoutMs
    );
    if (!result.ok) {
      return { passed: false, detail: result.error || `HTTP ${result.status}` };
    }
    
    // Check for duel state which MM uses for signals
    const stateUrl = `${serverUrl}/api/streaming/state`;
    const stateResult = await checkJsonEndpoint(stateUrl, null, preflightTimeoutMs);
    if (!stateResult.ok) {
      return { passed: false, detail: "duel state API unavailable for MM signals" };
    }

    const hasActiveRound = result.data.rounds?.length > 0;
    if (strictMmEligible && !hasActiveRound) {
      return { passed: false, detail: "no MM-eligible rounds found (--strict-mm-eligible)" };
    }

    return { 
      passed: true, 
      detail: hasActiveRound 
        ? `${result.data.rounds.length} round(s) available` 
        : "ready (no active rounds yet)"
    };
  },
};

async function runPreflightChecks() {
  log("running preflight health gates...\n");
  
  const results = {
    gameServer: await healthGates.gameServer(),
    duelState: await healthGates.duelState(),
    hlsStream: await healthGates.hlsStream(),
    bettingUI: await healthGates.bettingUI(),
    mmWorkers: await healthGates.mmWorkers(),
  };

  // Log results with PASS/FAIL
  logGate("Game Server", results.gameServer.passed, results.gameServer.detail);
  logGate("Duel State", results.duelState.passed, results.duelState.detail);
  logGate("HLS Stream", results.hlsStream.passed, results.hlsStream.detail);
  logGate("Betting UI", results.bettingUI.passed, results.bettingUI.detail);
  logGate("MM Workers", results.mmWorkers.passed, results.mmWorkers.detail);

  console.log(""); // blank line

  const allPassed = Object.values(results).every((r) => r.passed);
  const failures = Object.entries(results)
    .filter(([, r]) => !r.passed)
    .map(([name]) => name);

  return { allPassed, failures, results };
}

async function waitForStackReady(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = 3000;

  while (Date.now() < deadline) {
    const serverResult = await healthGates.gameServer();
    const duelResult = await healthGates.duelState();
    
    if (serverResult.passed && duelResult.passed) {
      return true;
    }

    if (verbose) {
      log(`waiting for stack... server=${serverResult.passed} duel=${duelResult.passed}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  
  return false;
}

async function runVerification() {
  log("running full verification suite...");
  
  const verifyArgs = [
    "scripts/verify-duel-stack.mjs",
    "--server-url", serverUrl,
    "--client-url", clientUrl,
    "--timeout-ms", "240000",
    "--fight-timeout-ms", "120000",
  ];

  if (!skipBetting) {
    verifyArgs.push("--betting-url", `http://localhost:${bettingPort}`);
  } else {
    verifyArgs.push("--skip-betting");
  }

  if (skipStream) {
    verifyArgs.push("--skip-stream");
  } else {
    verifyArgs.push("--hls-url", `http://localhost:${bettingPort}/live/stream.m3u8`);
  }

  if (verbose) {
    verifyArgs.push("--verbose");
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", verifyArgs, {
      cwd: ROOT,
      stdio: "inherit",
    });

    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Verification failed with exit code ${code}`));
      }
    });
  });
}

function buildDuelStackArgs() {
  const args = ["scripts/duel-stack.mjs"];

  // Always enable MM for this launcher unless explicitly disabled
  if (withMm) {
    args.push("--with-mm");
  }

  if (options.fresh) {
    args.push("--fresh");
  }

  if (options.verify) {
    args.push("--verify");
  }

  if (options["with-keeper"]) {
    // Don't skip keeper
  } else {
    args.push("--skip-keeper");
  }

  if (options["mm-mode"]) {
    args.push("--mm-mode", options["mm-mode"]);
  }

  if (options["mm-config"]) {
    args.push("--mm-config", options["mm-config"]);
  }

  if (options["mm-stagger-ms"]) {
    args.push("--mm-stagger-ms", options["mm-stagger-ms"]);
  }

  if (options.bots) {
    args.push("--bots", options.bots);
  }

  if (options["betting-port"]) {
    args.push("--betting-port", options["betting-port"]);
  }

  if (options["server-url"]) {
    args.push("--server-url", options["server-url"]);
  }

  if (options["ws-url"]) {
    args.push("--ws-url", options["ws-url"]);
  }

  if (options["client-url"]) {
    args.push("--client-url", options["client-url"]);
  }

  if (options["startup-timeout-ms"]) {
    args.push("--startup-timeout-ms", options["startup-timeout-ms"]);
  }

  if (skipStream) {
    args.push("--skip-stream");
  }

  if (skipBetting) {
    args.push("--skip-betting");
  }

  if (options["skip-bots"]) {
    args.push("--skip-bots");
  }

  if (options["remote-betting"]) {
    args.push("--remote-betting");
  }

  if (verbose) {
    args.push("--verbose");
  }

  return args;
}

async function main() {
  console.log("");
  log("╔═══════════════════════════════════════════════════════════════╗");
  log("║         Unified Duel + MM Stack Launcher                      ║");
  log("╚═══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Set environment for strict MM eligibility check
  if (strictMmEligible) {
    process.env.MM_FAIL_ON_NO_ELIGIBLE = "true";
  }

  // Verify-only mode: just run preflight + verification on existing stack
  if (verifyOnly) {
    log("verify-only mode: checking existing stack...\n");
    
    const { allPassed, failures } = await runPreflightChecks();
    
    if (!allPassed) {
      log(`preflight failed: ${failures.join(", ")}`);
      process.exit(1);
    }

    try {
      await runVerification();
      log("✓ verification complete - stack healthy");
      process.exit(0);
    } catch (error) {
      log(`✗ verification failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Full stack startup mode
  log(`starting duel+mm stack (strict-preflight=${strictPreflight}, with-mm=${withMm})...\n`);

  const duelStackArgs = buildDuelStackArgs();
  if (verbose) {
    log(`invoking: bun ${duelStackArgs.join(" ")}`);
  }

  const duelStackProc = spawn("bun", duelStackArgs, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      DUEL_MM_STRICT_ELIGIBLE: strictMmEligible ? "true" : "false",
    },
  });

  let exitCode = 0;
  let stackExited = false;

  duelStackProc.on("exit", (code, signal) => {
    stackExited = true;
    if (code !== 0 && code !== null) {
      log(`duel-stack exited with code ${code}`);
      process.exit(code);
    }
    if (signal) {
      log(`duel-stack killed by signal ${signal}`);
      process.exit(1);
    }
  });

  duelStackProc.on("error", (error) => {
    log(`failed to spawn duel-stack: ${error.message}`);
    process.exit(1);
  });

  // Handle termination signals
  const cleanup = () => {
    if (!stackExited && duelStackProc.pid) {
      try {
        process.kill(-duelStackProc.pid, "SIGTERM");
      } catch {
        try {
          process.kill(duelStackProc.pid, "SIGTERM");
        } catch {
          // ignore
        }
      }
    }
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);

  // Wait for stack to become ready
  log("waiting for stack components to initialize...");
  const startupTimeoutMs = Number.parseInt(options["startup-timeout-ms"], 10) || 420_000;
  const stackReady = await waitForStackReady(startupTimeoutMs);

  if (!stackReady) {
    log("stack startup timed out");
    cleanup();
    process.exit(1);
  }

  // Give betting UI and HLS a moment to fully initialize
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Run preflight health gates
  console.log("");
  log("═══════════════════════════════════════════════════════════════");
  log("                   PREFLIGHT HEALTH GATES                       ");
  log("═══════════════════════════════════════════════════════════════");
  console.log("");

  const { allPassed, failures, results } = await runPreflightChecks();

  if (!allPassed) {
    if (strictPreflight) {
      log(`\n✗ PREFLIGHT FAILED (strict mode): ${failures.join(", ")}`);
      log("use --no-strict-preflight to allow degraded startup");
      cleanup();
      process.exit(1);
    } else {
      logWarn(`preflight has failures: ${failures.join(", ")} - continuing in degraded mode`);
    }
  }

  // Stack online announcement
  console.log("");
  log("═══════════════════════════════════════════════════════════════");
  log("                      STACK ONLINE                              ");
  log("═══════════════════════════════════════════════════════════════");
  console.log("");

  log(`✓ Game Server:  ${serverUrl}`);
  log(`✓ Duel State:   ${serverUrl}/api/streaming/state`);
  if (!skipStream) {
    log(`✓ HLS Stream:   http://localhost:${bettingPort}/live/stream.m3u8`);
  }
  if (!skipBetting) {
    log(`✓ Betting UI:   http://localhost:${bettingPort}`);
  }
  if (withMm) {
    log(`✓ MM Workers:   enabled (mode: ${options["mm-mode"] || "auto"})`);
  }

  console.log("");
  log("press Ctrl+C to stop");

  // Keep running until interrupted (duel-stack handles the actual work)
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[duel-mm] fatal error:", err);
  process.exit(1);
});
