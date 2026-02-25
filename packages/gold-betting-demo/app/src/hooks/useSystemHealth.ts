/**
 * useSystemHealth - Hook for polling system health status from /api/arena/system-health
 *
 * Provides real-time health monitoring for:
 * - Server connectivity and latency
 * - Duel state (scheduler phase)
 * - Stream availability (HLS)
 * - Betting API status
 * - Market maker status
 * - Wallet connectivity (Solana + EVM)
 * - Market data (last trade, orderbook freshness, mid price)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GAME_API_URL } from "../lib/config";

// ----------------------------------------------------------------------------
// Types matching the API response from system-health-routes.ts
// ----------------------------------------------------------------------------

export interface ServiceHealth {
  ok: boolean;
  latencyMs?: number;
  phase?: string | null;
  freshMs?: number | null;
  url?: string;
  mode?: "single" | "multi" | null;
  workers?: number;
  error?: string;
}

export interface WalletStatus {
  connected: boolean;
  pubkey?: string | null;
  address?: string | null;
  chain?: string | null;
}

export interface MarketStatus {
  lastTradeAt: string | null;
  lastTradeSize: string | null;
  orderbookFreshMs: number | null;
  midPrice: number | null;
}

export interface SystemHealthResponse {
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
    solana: WalletStatus;
    evm: WalletStatus;
  };
  market: MarketStatus;
}

export type HealthStatus = "healthy" | "degraded" | "error" | "unknown";

export interface UseSystemHealthResult {
  /** Full health response from API */
  health: SystemHealthResponse | null;
  /** Loading state for initial fetch */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Time since last successful fetch (ms) */
  lastFetchAgoMs: number;
  /** Overall system status */
  overallStatus: HealthStatus;
  /** Force an immediate refresh */
  refresh: () => Promise<void>;
}

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 4000;

// ----------------------------------------------------------------------------
// Hook
// ----------------------------------------------------------------------------

export function useSystemHealth(): UseSystemHealthResult {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number>(0);
  const [lastFetchAgoMs, setLastFetchAgoMs] = useState<number>(0);
  const mountedRef = useRef(true);

  const fetchHealth = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(`${GAME_API_URL}/api/arena/system-health`, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeoutId);

      if (!mountedRef.current) return;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `HTTP ${response.status}${text ? `: ${text.slice(0, 100)}` : ""}`,
        );
      }

      const data = (await response.json()) as SystemHealthResponse;
      setHealth(data);
      setError(null);
      setLastFetchAt(Date.now());
    } catch (err) {
      clearTimeout(timeoutId);
      if (!mountedRef.current) return;

      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out (server unreachable)"
            : err.message
          : "Unknown error";
      setError(message);
      // Keep previous health data but mark error
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    mountedRef.current = true;
    void fetchHealth();

    const pollInterval = setInterval(() => {
      void fetchHealth();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(pollInterval);
    };
  }, [fetchHealth]);

  // Update "last fetch ago" every second
  useEffect(() => {
    const tickInterval = setInterval(() => {
      if (lastFetchAt > 0) {
        setLastFetchAgoMs(Date.now() - lastFetchAt);
      }
    }, 1000);

    return () => clearInterval(tickInterval);
  }, [lastFetchAt]);

  // Compute overall status
  const overallStatus: HealthStatus = (() => {
    if (error && !health) return "error";
    if (!health) return "unknown";

    // Critical services
    const critical = [
      health.services.duelState.ok,
      health.services.stream.ok,
      health.services.bettingApi.ok,
    ];
    const allCriticalOk = critical.every(Boolean);
    const someCriticalOk = critical.some(Boolean);

    // MM is important but not critical
    const mmOk = health.services.mm.ok;

    if (allCriticalOk && mmOk) return "healthy";
    if (allCriticalOk) return "degraded"; // MM down but core works
    if (someCriticalOk) return "degraded";
    return "error";
  })();

  return {
    health,
    loading,
    error,
    lastFetchAgoMs,
    overallStatus,
    refresh: fetchHealth,
  };
}

// ----------------------------------------------------------------------------
// Helpers for components
// ----------------------------------------------------------------------------

/** Format milliseconds as "Xs ago" or "Xm ago" */
export function formatFreshness(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "never";
  if (ms < 1000) return "just now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** Shorten a wallet address/pubkey */
export function shortenAddress(addr: string | null | undefined): string {
  if (!addr) return "—";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Get status color for a service */
export function getStatusColor(ok: boolean | undefined): string {
  if (ok === undefined) return "#888"; // unknown
  return ok ? "#22c55e" : "#ef4444"; // green / red
}

/** Get status color for overall health */
export function getOverallStatusColor(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "#22c55e"; // green
    case "degraded":
      return "#eab308"; // yellow
    case "error":
      return "#ef4444"; // red
    default:
      return "#888"; // gray
  }
}
