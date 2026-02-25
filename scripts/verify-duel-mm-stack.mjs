#!/usr/bin/env node
/**
 * Duel + MM Stack Verification Suite
 *
 * Automated smoke test for the unified duel+mm stack:
 * - All 5 health gates (server, duel, stream, betting, MM)
 * - /api/arena/system-health endpoint validation
 * - HLS stream manifest accessibility
 * - Non-zero trade detection (when MM is active)
 *
 * Designed to work gracefully when services are not running (reports status, not crash).
 *
 * Exit codes:
 *   0 = All checks pass (or --report-only mode)
 *   1 = One or more checks failed
 *   2 = Usage error
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ────────────────────────────────────────────────────────────────────────────
// CLI Parsing
// ────────────────────────────────────────────────────────────────────────────

const options = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    // URLs
    "server-url": { type: "string", default: "http://localhost:5555" },
    "betting-port": { type: "string", default: "4179" },
    // Behavior
    "report-only": { type: "boolean" }, // Don't exit non-zero, just report
    "wait-for-services": { type: "boolean" }, // Retry until services come up
    "wait-timeout-ms": { type: "string", default: "60000" },
    "require-mm": { type: "boolean" }, // Fail if MM not healthy
    "require-trades": { type: "boolean" }, // Fail if no trades visible
    // Output
    "json": { type: "boolean" }, // Output JSON report
    verbose: { type: "boolean", short: "v" },
  },
  strict: true,
}).values;

if (options.help) {
  console.log(`
Duel + MM Stack Verification Suite

Automated smoke test that validates all components of the unified duel+mm stack.

Usage:
  bun scripts/verify-duel-mm-stack.mjs [options]
  bun run duel:mm:smoke [options]

Options:
  -h, --help               Show this help
  --server-url <url>       Game server URL (default: http://localhost:5555)
  --betting-port <port>    Betting app port (default: 4179)
  --report-only            Report status without non-zero exit on failure
  --wait-for-services      Wait (with retry) until services are reachable
  --wait-timeout-ms <ms>   Timeout for --wait-for-services (default: 60000)
  --require-mm             Fail if MM workers are not healthy
  --require-trades         Fail if no non-zero trades are visible
  --json                   Output results as JSON
  -v, --verbose            Verbose output

Checks Performed:
  1. Game Server        - /health endpoint returns 2xx
  2. Duel State         - /api/streaming/state returns valid cycle data
  3. HLS Stream         - /live/stream.m3u8 contains valid manifest
  4. Betting UI         - Betting app root returns 2xx
  5. MM Workers         - MM health file is present and fresh
  6. System Health API  - /api/arena/system-health returns valid JSON structure
  7. Market Activity    - (optional) Non-zero trades detected

Exit Codes:
  0 = All required checks pass
  1 = One or more required checks failed
  2 = Usage/configuration error

Examples:
  # Quick smoke test (report results, don't fail)
  bun scripts/verify-duel-mm-stack.mjs --report-only

  # Strict verification (fail if anything wrong)
  bun scripts/verify-duel-mm-stack.mjs --require-mm

  # Wait for stack to come up, then verify
  bun scripts/verify-duel-mm-stack.mjs --wait-for-services --wait-timeout-ms 120000

  # JSON output for CI pipelines
  bun scripts/verify-duel-mm-stack.mjs --json
`);
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

const serverUrl = options["server-url"].replace(/\/$/, "");
const bettingPort = Number.parseInt(options["betting-port"], 10) || 4179;
const bettingUrl = `http://localhost:${bettingPort}`;
const hlsUrl = `http://localhost:${bettingPort}/live/stream.m3u8`;
const healthUrl = `${serverUrl}/api/arena/system-health`;
const reportOnly = options["report-only"] === true;
const waitForServices = options["wait-for-services"] === true;
const waitTimeoutMs = Number.parseInt(options["wait-timeout-ms"], 10) || 60_000;
const requireMm = options["require-mm"] === true;
const requireTrades = options["require-trades"] === true;
const jsonOutput = options["json"] === true;
const verbose = options.verbose === true;

const MM_HEALTH_FILE = path.resolve(
  process.cwd(),
  process.env.MM_HEARTBEAT_FILE || ".runtime-locks/mm-health.json"
);
const MM_STALE_THRESHOLD_MS = 30_000;

// ────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ────────────────────────────────────────────────────────────────────────────

const PASS = "\x1b[32m[PASS]\x1b[0m";
const FAIL = "\x1b[31m[FAIL]\x1b[0m";
const SKIP = "\x1b[33m[SKIP]\x1b[0m";
const INFO = "\x1b[36m[INFO]\x1b[0m";

function log(message) {
  if (!jsonOutput) {
    console.log(message);
  }
}

function logVerbose(message) {
  if (verbose && !jsonOutput) {
    console.log(`${INFO} ${message}`);
  }
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────────────────
// Check Functions
// ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} CheckResult
 * @property {string} name - Check name
 * @property {boolean} passed - Whether check passed
 * @property {boolean} required - Whether check is required for pass
 * @property {string} detail - Human-readable detail
 * @property {any} [data] - Additional data (for JSON output)
 */

/**
 * Check game server health endpoint
 * @returns {Promise<CheckResult>}
 */
async function checkGameServer() {
  const name = "Game Server";
  try {
    const response = await fetchWithTimeout(`${serverUrl}/health`, 5000);
    if (response.ok) {
      return { name, passed: true, required: true, detail: `${serverUrl}/health → ${response.status}` };
    }
    return { name, passed: false, required: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, passed: false, required: true, detail: error.message || "Connection failed" };
  }
}

/**
 * Check duel state API
 * @returns {Promise<CheckResult>}
 */
async function checkDuelState() {
  const name = "Duel State";
  try {
    const response = await fetchWithTimeout(`${serverUrl}/api/streaming/state`, 5000);
    if (!response.ok) {
      return { name, passed: false, required: true, detail: `HTTP ${response.status}` };
    }
    const data = await response.json();
    if (!data || typeof data !== "object") {
      return { name, passed: false, required: true, detail: "Invalid JSON response" };
    }
    const phase = data.cycle?.phase || "unknown";
    return { name, passed: true, required: true, detail: `phase: ${phase}`, data: { phase } };
  } catch (error) {
    return { name, passed: false, required: true, detail: error.message || "Request failed" };
  }
}

/**
 * Check HLS stream manifest
 * @returns {Promise<CheckResult>}
 */
async function checkHlsStream() {
  const name = "HLS Stream";
  try {
    const response = await fetchWithTimeout(hlsUrl, 5000);
    if (!response.ok) {
      return { name, passed: false, required: true, detail: `HTTP ${response.status}` };
    }
    const manifest = await response.text();
    const hasExtM3U = /#EXTM3U/i.test(manifest);
    const hasSegments = /#EXTINF:/m.test(manifest) && /\.(ts|m4s|mp4)(\?|$)/m.test(manifest);
    
    if (hasExtM3U && hasSegments) {
      return { name, passed: true, required: true, detail: "Live segments present" };
    }
    if (hasExtM3U) {
      return { name, passed: true, required: true, detail: "Manifest valid (awaiting segments)" };
    }
    return { name, passed: false, required: true, detail: "Invalid manifest format" };
  } catch (error) {
    return { name, passed: false, required: true, detail: error.message || "Connection failed" };
  }
}

/**
 * Check betting UI accessibility
 * @returns {Promise<CheckResult>}
 */
async function checkBettingUI() {
  const name = "Betting UI";
  try {
    const response = await fetchWithTimeout(bettingUrl, 5000);
    if (response.ok) {
      return { name, passed: true, required: true, detail: `${bettingUrl} → ${response.status}` };
    }
    return { name, passed: false, required: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { name, passed: false, required: true, detail: error.message || "Connection failed" };
  }
}

/**
 * Check MM health file
 * @returns {Promise<CheckResult>}
 */
async function checkMmWorkers() {
  const name = "MM Workers";
  const required = requireMm;
  
  try {
    if (!fs.existsSync(MM_HEALTH_FILE)) {
      return { name, passed: false, required, detail: "Health file not found (MM may not be running)" };
    }
    
    const raw = fs.readFileSync(MM_HEALTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    
    // Determine mode and freshness
    const isMulti = parsed.mode === "multi";
    const updatedAtStr = isMulti ? parsed.updatedAt : parsed.lastCycleAt;
    const updatedAt = new Date(updatedAtStr).getTime();
    const freshMs = Date.now() - updatedAt;
    const isStale = freshMs > MM_STALE_THRESHOLD_MS;
    const status = parsed.status;
    
    if (isStale) {
      return { name, passed: false, required, detail: `Stale (${Math.round(freshMs / 1000)}s old)`, data: { freshMs, status } };
    }
    if (status !== "healthy") {
      return { name, passed: false, required, detail: `Status: ${status}`, data: { freshMs, status } };
    }
    
    const workers = isMulti ? parsed.workers : 1;
    return { name, passed: true, required, detail: `${workers} worker(s), updated ${Math.round(freshMs / 1000)}s ago`, data: { workers, freshMs, status } };
  } catch (error) {
    return { name, passed: false, required, detail: error.message || "Parse error" };
  }
}

/**
 * Check system health API structure
 * @returns {Promise<CheckResult>}
 */
async function checkSystemHealthApi() {
  const name = "System Health API";
  try {
    const response = await fetchWithTimeout(healthUrl, 5000);
    // Health endpoint may return 503 with valid JSON when degraded
    const data = await response.json();
    
    // Validate structure
    const hasOk = typeof data.ok === "boolean";
    const hasTimestamp = typeof data.timestamp === "string";
    const hasServices = data.services && typeof data.services === "object";
    const hasWallets = data.wallets && typeof data.wallets === "object";
    const hasMarket = data.market && typeof data.market === "object";
    
    if (!hasOk || !hasTimestamp || !hasServices || !hasWallets || !hasMarket) {
      return { name, passed: false, required: true, detail: "Response missing required fields", data };
    }
    
    // Check service sub-objects exist
    const requiredServices = ["server", "duelState", "stream", "bettingApi", "mm"];
    const missingServices = requiredServices.filter((s) => !data.services[s]);
    if (missingServices.length > 0) {
      return { name, passed: false, required: true, detail: `Missing services: ${missingServices.join(", ")}`, data };
    }
    
    const statusText = data.ok ? "ok=true" : `ok=false (HTTP ${response.status})`;
    return { name, passed: true, required: true, detail: statusText, data: { ok: data.ok, httpStatus: response.status } };
  } catch (error) {
    return { name, passed: false, required: true, detail: error.message || "Request failed" };
  }
}

/**
 * Check for non-zero market activity
 * @returns {Promise<CheckResult>}
 */
async function checkMarketActivity() {
  const name = "Market Activity";
  const required = requireTrades;
  
  try {
    const response = await fetchWithTimeout(healthUrl, 5000);
    const data = await response.json();
    
    const lastTradeAt = data.market?.lastTradeAt;
    const lastTradeSize = data.market?.lastTradeSize;
    const midPrice = data.market?.midPrice;
    
    if (!lastTradeAt) {
      return { name, passed: false, required, detail: "No trades recorded", data: { lastTradeAt, lastTradeSize } };
    }
    
    const tradeAgeMs = Date.now() - new Date(lastTradeAt).getTime();
    const sizeNum = parseFloat(lastTradeSize) || 0;
    
    if (sizeNum <= 0) {
      return { name, passed: false, required, detail: "Last trade has zero size", data: { lastTradeAt, lastTradeSize } };
    }
    
    return { 
      name, 
      passed: true, 
      required, 
      detail: `Last trade: ${lastTradeSize} @ ${midPrice?.toFixed(3) || "?"}, ${Math.round(tradeAgeMs / 1000)}s ago`,
      data: { lastTradeAt, lastTradeSize, midPrice, tradeAgeMs }
    };
  } catch (error) {
    return { name, passed: false, required, detail: error.message || "Request failed" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main Verification Flow
// ────────────────────────────────────────────────────────────────────────────

async function waitForServerReady() {
  const deadline = Date.now() + waitTimeoutMs;
  const pollMs = 2000;
  
  log(`${INFO} Waiting for services to become ready (timeout: ${waitTimeoutMs / 1000}s)...`);
  
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${serverUrl}/health`, 3000);
      if (response.ok) {
        log(`${INFO} Server is ready`);
        return true;
      }
    } catch {
      // Continue waiting
    }
    logVerbose(`Server not ready, retrying in ${pollMs / 1000}s...`);
    await sleep(pollMs);
  }
  
  return false;
}

async function runAllChecks() {
  /** @type {CheckResult[]} */
  const results = [];
  
  // Core health gates (required)
  results.push(await checkGameServer());
  results.push(await checkDuelState());
  results.push(await checkHlsStream());
  results.push(await checkBettingUI());
  results.push(await checkMmWorkers());
  
  // API structure validation
  results.push(await checkSystemHealthApi());
  
  // Optional market activity check
  results.push(await checkMarketActivity());
  
  return results;
}

function printResults(results) {
  log("");
  log("═══════════════════════════════════════════════════════════════");
  log("           DUEL + MM STACK VERIFICATION RESULTS                 ");
  log("═══════════════════════════════════════════════════════════════");
  log("");
  
  for (const result of results) {
    const icon = result.passed ? PASS : (result.required ? FAIL : SKIP);
    const requiredTag = result.required ? "" : " (optional)";
    log(`${icon} ${result.name}${requiredTag}`);
    log(`      ${result.detail}`);
  }
  
  log("");
}

function printSummary(results) {
  const requiredChecks = results.filter((r) => r.required);
  const passedRequired = requiredChecks.filter((r) => r.passed);
  const failedRequired = requiredChecks.filter((r) => !r.passed);
  
  const optionalChecks = results.filter((r) => !r.required);
  const passedOptional = optionalChecks.filter((r) => r.passed);
  
  log("───────────────────────────────────────────────────────────────");
  log(`Required:  ${passedRequired.length}/${requiredChecks.length} passed`);
  log(`Optional:  ${passedOptional.length}/${optionalChecks.length} passed`);
  log("───────────────────────────────────────────────────────────────");
  
  if (failedRequired.length === 0) {
    log(`\n\x1b[32m✓ All required checks passed\x1b[0m\n`);
  } else {
    log(`\n\x1b[31m✗ ${failedRequired.length} required check(s) failed:\x1b[0m`);
    for (const r of failedRequired) {
      log(`  - ${r.name}: ${r.detail}`);
    }
    log("");
  }
}

function outputJson(results) {
  const requiredChecks = results.filter((r) => r.required);
  const allRequiredPassed = requiredChecks.every((r) => r.passed);
  
  const output = {
    timestamp: new Date().toISOString(),
    passed: allRequiredPassed,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      requiredPassed: requiredChecks.filter((r) => r.passed).length,
      requiredFailed: requiredChecks.filter((r) => !r.passed).length,
    },
    checks: results.map((r) => ({
      name: r.name,
      passed: r.passed,
      required: r.required,
      detail: r.detail,
      data: r.data,
    })),
    config: {
      serverUrl,
      bettingUrl,
      hlsUrl,
      healthUrl,
      requireMm,
      requireTrades,
    },
  };
  
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  if (!jsonOutput) {
    log("");
    log("╔═══════════════════════════════════════════════════════════════╗");
    log("║         Duel + MM Stack Verification Suite                    ║");
    log("╚═══════════════════════════════════════════════════════════════╝");
    log("");
    log(`Server URL:      ${serverUrl}`);
    log(`Betting URL:     ${bettingUrl}`);
    log(`HLS URL:         ${hlsUrl}`);
    log(`Health API:      ${healthUrl}`);
    log(`Require MM:      ${requireMm}`);
    log(`Require Trades:  ${requireTrades}`);
    log("");
  }
  
  // Optional: wait for services to come up
  if (waitForServices) {
    const ready = await waitForServerReady();
    if (!ready) {
      log(`${FAIL} Timed out waiting for services`);
      if (!reportOnly) {
        process.exit(1);
      }
    }
  }
  
  // Run all checks
  const results = await runAllChecks();
  
  // Output results
  if (jsonOutput) {
    outputJson(results);
  } else {
    printResults(results);
    printSummary(results);
  }
  
  // Determine exit code
  const requiredChecks = results.filter((r) => r.required);
  const allRequiredPassed = requiredChecks.every((r) => r.passed);
  
  if (reportOnly) {
    process.exit(0);
  }
  
  process.exit(allRequiredPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("[verify-duel-mm-stack] fatal error:", err);
  process.exit(2);
});
