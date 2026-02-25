/**
 * System Health Routes Module - Unified health endpoint for arena services
 *
 * Provides a comprehensive health check endpoint that aggregates:
 * - Server basic health and latency
 * - Duel state freshness from StreamingDuelScheduler
 * - Stream source validation (HLS at :4179)
 * - Betting API status
 * - Market maker heartbeat from .runtime-locks/mm-health.json
 * - Wallet connectivity (Solana custody, EVM)
 * - Market state (last trade, mid price, orderbook freshness)
 *
 * Endpoint:
 * - GET /api/arena/system-health
 *
 * Usage:
 * ```typescript
 * import { registerSystemHealthRoutes } from './routes/system-health-routes';
 * registerSystemHealthRoutes(fastify, world);
 * ```
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { World } from "@hyperscape/shared";
import fs from "node:fs";
import path from "node:path";

// MM Health JSON structure (from market-maker-bot)
interface MMHealthStatus {
  instanceId: string;
  status: "healthy" | "degraded" | "error";
  lastCycle: number;
  lastCycleAt: string;
  uptimeMs: number;
  cyclesTotal: number;
  ordersPlaced: number;
  ordersSkipped: number;
  activeChains: string[];
  duelSignalActive: boolean;
  lastDuelPhase: string | null;
  lastMidFinal: number;
  inventoryYes: number;
  inventoryNo: number;
  errors: string[];
}

// Multi-worker MM health (when running with run-multi.ts)
interface MMMultiHealthStatus {
  mode: "multi";
  workers: number;
  status: "healthy" | "degraded" | "error";
  updatedAt: string;
  workerStatuses: MMHealthStatus[];
}

// Internal streaming state response shape
interface StreamingStateResponse {
  cycle?: {
    phase?: string;
    agent1?: { id?: string; hp?: number; maxHp?: number } | null;
    agent2?: { id?: string; hp?: number; maxHp?: number } | null;
  };
  leaderboard?: unknown[];
  cameraTarget?: string | null;
}

// Service health sub-objects
interface ServiceHealth {
  ok: boolean;
  [key: string]: unknown;
}

interface SystemHealthResponse {
  ok: boolean;
  timestamp: string;
  services: {
    server: ServiceHealth;
    duelState: ServiceHealth;
    stream: ServiceHealth;
    bettingApi: ServiceHealth;
    mm: ServiceHealth;
  };
  wallets: {
    solana: { connected: boolean; pubkey: string | null };
    evm: { connected: boolean; address: string | null; chain: string | null };
  };
  market: {
    lastTradeAt: string | null;
    lastTradeSize: string | null;
    orderbookFreshMs: number | null;
    midPrice: number | null;
  };
}

// Constants
const MM_HEALTH_FILE = path.resolve(
  process.cwd(),
  process.env.MM_HEARTBEAT_FILE || ".runtime-locks/mm-health.json",
);
const MM_HEALTH_STALE_MS = 30_000; // Consider MM stale after 30s
const STREAM_URL =
  process.env.STREAM_HLS_URL || "http://127.0.0.1:4179/live/stream.m3u8";

/**
 * Read MM health status from file
 */
function readMMHealth(): {
  ok: boolean;
  mode: "single" | "multi" | null;
  workers: number;
  freshMs: number | null;
  status: string | null;
  error?: string;
} {
  try {
    if (!fs.existsSync(MM_HEALTH_FILE)) {
      return {
        ok: false,
        mode: null,
        workers: 0,
        freshMs: null,
        status: null,
        error: "Health file not found",
      };
    }

    const raw = fs.readFileSync(MM_HEALTH_FILE, "utf8");
    const parsed = JSON.parse(raw) as MMHealthStatus | MMMultiHealthStatus;

    // Multi-worker mode
    if ("mode" in parsed && parsed.mode === "multi") {
      const multi = parsed as MMMultiHealthStatus;
      const updatedAt = new Date(multi.updatedAt).getTime();
      const freshMs = Date.now() - updatedAt;
      const isStale = freshMs > MM_HEALTH_STALE_MS;
      const hasErrors = multi.status !== "healthy";

      return {
        ok: !isStale && !hasErrors,
        mode: "multi",
        workers: multi.workers,
        freshMs,
        status: multi.status,
        error: isStale
          ? `Stale (${Math.round(freshMs / 1000)}s old)`
          : hasErrors
            ? multi.status
            : undefined,
      };
    }

    // Single worker mode
    const single = parsed as MMHealthStatus;
    const lastCycleAt = new Date(single.lastCycleAt).getTime();
    const freshMs = Date.now() - lastCycleAt;
    const isStale = freshMs > MM_HEALTH_STALE_MS;
    const hasErrors = single.status !== "healthy";

    return {
      ok: !isStale && !hasErrors,
      mode: "single",
      workers: 1,
      freshMs,
      status: single.status,
      error: isStale
        ? `Stale (${Math.round(freshMs / 1000)}s old)`
        : hasErrors
          ? single.status
          : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      mode: null,
      workers: 0,
      freshMs: null,
      status: null,
      error: error instanceof Error ? error.message : "Parse error",
    };
  }
}

/**
 * Check if HLS stream is available
 */
async function checkStreamHealth(): Promise<{
  ok: boolean;
  url: string;
  freshMs: number | null;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const startTime = Date.now();
    const response = await fetch(STREAM_URL, {
      method: "HEAD",
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startTime;
    clearTimeout(timeoutId);

    if (response.ok) {
      return { ok: true, url: STREAM_URL, freshMs: latencyMs };
    }

    return {
      ok: false,
      url: STREAM_URL,
      freshMs: latencyMs,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      url: STREAM_URL,
      freshMs: null,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Get duel state from StreamingDuelScheduler
 */
async function checkDuelStateHealth(world: World): Promise<{
  ok: boolean;
  phase: string | null;
  freshMs: number | null;
  error?: string;
}> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getStreamingDuelScheduler } =
      await import("../../systems/StreamingDuelScheduler/index.js");

    const scheduler = getStreamingDuelScheduler();
    if (!scheduler) {
      return {
        ok: false,
        phase: null,
        freshMs: null,
        error: "Scheduler not running",
      };
    }

    const state = scheduler.getStreamingState();
    if (!state || !state.cycle) {
      return {
        ok: false,
        phase: null,
        freshMs: null,
        error: "No cycle state",
      };
    }

    // Scheduler is running and has state - consider it healthy
    // (StreamingDuelScheduler broadcasts continuously, no explicit staleness check needed)
    return {
      ok: true,
      phase: state.cycle.phase ?? "UNKNOWN",
      freshMs: 0, // Scheduler runs continuously, no staleness metric
      error: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      phase: null,
      freshMs: null,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

/**
 * Check betting API health by verifying ArenaService
 */
async function checkBettingApiHealth(world: World): Promise<{
  ok: boolean;
  freshMs: number | null;
  error?: string;
}> {
  try {
    const { ArenaService } = await import("../../arena/ArenaService.js");
    const arena = ArenaService.tryForWorld(world);

    if (!arena) {
      return {
        ok: false,
        freshMs: null,
        error: "ArenaService not initialized",
      };
    }

    // ArenaService is running (ticks every 100ms) - check if it can return data
    const currentRound = arena.getCurrentRound();

    // Service is healthy if it exists and can respond
    // (no staleness check - round.updatedAt only changes on mutations,
    // not on every tick, so normal phases can run >10s without updates)
    return {
      ok: true,
      freshMs: currentRound ? Date.now() - currentRound.updatedAt : 0,
      error: undefined,
    };
  } catch (error) {
    return {
      ok: false,
      freshMs: null,
      error: error instanceof Error ? error.message : "Check failed",
    };
  }
}

/**
 * Get wallet connection status
 */
async function getWalletStatus(world: World): Promise<{
  solana: { connected: boolean; pubkey: string | null };
  evm: { connected: boolean; address: string | null; chain: string | null };
}> {
  // Solana wallet from ArenaService/SolanaArenaOperator
  let solanaPubkey: string | null = null;
  try {
    const { ArenaService } = await import("../../arena/ArenaService.js");
    const arena = ArenaService.tryForWorld(world);
    if (arena) {
      // Access the operator via the context
      const ctx = (arena as any).ctx;
      if (ctx?.solanaOperator?.getCustodyWallet) {
        solanaPubkey = ctx.solanaOperator.getCustodyWallet();
      }
    }
  } catch {
    // Operator not available
  }

  // EVM wallet from environment
  const evmAddress = process.env.EVM_CUSTODY_ADDRESS || null;
  const evmChain =
    process.env.EVM_CHAIN ||
    (process.env.BASE_RPC_URL ? "base-sepolia" : null) ||
    (process.env.BSC_RPC_URL ? "bsc" : null);

  return {
    solana: {
      connected: solanaPubkey !== null,
      pubkey: solanaPubkey,
    },
    evm: {
      connected: evmAddress !== null,
      address: evmAddress,
      chain: evmChain,
    },
  };
}

/**
 * Get market status from ArenaService
 */
async function getMarketStatus(world: World): Promise<{
  lastTradeAt: string | null;
  lastTradeSize: string | null;
  orderbookFreshMs: number | null;
  midPrice: number | null;
}> {
  try {
    const { ArenaService } = await import("../../arena/ArenaService.js");
    const arena = ArenaService.tryForWorld(world);

    if (!arena) {
      return {
        lastTradeAt: null,
        lastTradeSize: null,
        orderbookFreshMs: null,
        midPrice: null,
      };
    }

    const currentRound = arena.getCurrentRound();
    if (!currentRound?.market) {
      return {
        lastTradeAt: null,
        lastTradeSize: null,
        orderbookFreshMs: null,
        midPrice: null,
      };
    }

    const market = currentRound.market;
    const now = Date.now();

    // Extract market data
    const lastTradeAt = (market as any).lastTradeAt
      ? new Date((market as any).lastTradeAt).toISOString()
      : null;
    const lastTradeSize = (market as any).lastTradeSize?.toString() ?? null;
    const orderbookUpdatedAt =
      (market as any).updatedAt ?? currentRound.updatedAt;
    const orderbookFreshMs = now - orderbookUpdatedAt;

    // Mid price from MM health file or market
    let midPrice: number | null = null;
    try {
      if (fs.existsSync(MM_HEALTH_FILE)) {
        const mmData = JSON.parse(fs.readFileSync(MM_HEALTH_FILE, "utf8"));
        // MM stores mid as 0-1000 scale, convert to 0-1
        const rawMid =
          mmData.lastMidFinal ?? mmData.workerStatuses?.[0]?.lastMidFinal;
        if (typeof rawMid === "number") {
          midPrice = rawMid / 1000;
        }
      }
    } catch {
      // Fallback to market data if available
      midPrice = (market as any).midPrice ?? null;
    }

    return {
      lastTradeAt,
      lastTradeSize,
      orderbookFreshMs,
      midPrice,
    };
  } catch {
    return {
      lastTradeAt: null,
      lastTradeSize: null,
      orderbookFreshMs: null,
      midPrice: null,
    };
  }
}

/**
 * Register system health routes
 */
export function registerSystemHealthRoutes(
  fastify: FastifyInstance,
  world: World,
): void {
  fastify.get(
    "/api/arena/system-health",
    {
      config: { rateLimit: false },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();

      // Run health checks in parallel
      const [duelState, streamHealth, bettingApi, wallets, market] =
        await Promise.all([
          checkDuelStateHealth(world),
          checkStreamHealth(),
          checkBettingApiHealth(world),
          getWalletStatus(world),
          getMarketStatus(world),
        ]);

      // MM health is sync (file read)
      const mmHealth = readMMHealth();

      // Server latency is how long this health check took
      const serverLatencyMs = Date.now() - startTime;

      // Build response
      const response: SystemHealthResponse = {
        ok: true, // Will be set to false below if any critical service fails
        timestamp: new Date().toISOString(),
        services: {
          server: {
            ok: true,
            latencyMs: serverLatencyMs,
          },
          duelState: {
            ok: duelState.ok,
            phase: duelState.phase,
            freshMs: duelState.freshMs,
            ...(duelState.error && { error: duelState.error }),
          },
          stream: {
            ok: streamHealth.ok,
            url: streamHealth.url,
            freshMs: streamHealth.freshMs,
            ...(streamHealth.error && { error: streamHealth.error }),
          },
          bettingApi: {
            ok: bettingApi.ok,
            freshMs: bettingApi.freshMs,
            ...(bettingApi.error && { error: bettingApi.error }),
          },
          mm: {
            ok: mmHealth.ok,
            mode: mmHealth.mode,
            workers: mmHealth.workers,
            freshMs: mmHealth.freshMs,
            ...(mmHealth.error && { error: mmHealth.error }),
          },
        },
        wallets,
        market,
      };

      // Determine overall health
      // Critical services: duelState, stream, bettingApi
      // MM is important but not critical (betting can work without MM)
      const criticalServicesOk =
        duelState.ok && streamHealth.ok && bettingApi.ok;

      response.ok = criticalServicesOk;

      // Return appropriate status code
      const statusCode = response.ok ? 200 : 503;
      return reply.code(statusCode).send(response);
    },
  );

  console.log("[API] ✅ System health routes registered");
}
