/**
 * API Configuration
 *
 * Centralized configuration for external service URLs.
 * URLs are set via Vite's define feature in vite.config.ts and can be
 * overridden at runtime by /env.js.
 *
 * In production builds (vite build):
 *   - GAME_API_URL = https://hyperscape-production.up.railway.app
 *   - GAME_WS_URL = wss://hyperscape-production.up.railway.app/ws
 *   - CDN_URL = https://assets.hyperscape.club
 *
 * In development (vite dev):
 *   - GAME_API_URL = http://localhost:5555
 *   - GAME_WS_URL = ws://localhost:5555/ws
 *   - CDN_URL = http://localhost:8080
 */

type PublicRuntimeEnv = {
  PUBLIC_ELIZAOS_URL?: string;
  PUBLIC_API_URL?: string;
  PUBLIC_WS_URL?: string;
  PUBLIC_CDN_URL?: string;
};

type WindowWithRuntimeEnv = Window & { env?: PublicRuntimeEnv };

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function normalizeBaseUrlString(url: URL): string {
  const normalized = url.toString();
  const isRootBase =
    url.pathname === "/" && url.search.length === 0 && url.hash.length === 0;
  if (!isRootBase) {
    return normalized;
  }

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function normalizeBrowserLoopbackUrl(
  value?: string,
): string | undefined {
  if (!value || value === "undefined" || value === "null") {
    return undefined;
  }

  if (typeof window === "undefined") {
    return value;
  }

  try {
    const currentHost = window.location.hostname;
    const parsed = new URL(value, window.location.href);
    if (!isLoopbackHost(currentHost) || !isLoopbackHost(parsed.hostname)) {
      return normalizeBaseUrlString(parsed);
    }
    if (parsed.hostname === currentHost) {
      return normalizeBaseUrlString(parsed);
    }
    parsed.hostname = currentHost;
    return normalizeBaseUrlString(parsed);
  } catch {
    return value;
  }
}

function getRuntimeEnvValue(key: keyof PublicRuntimeEnv): string | undefined {
  if (typeof window === "undefined") return undefined;
  return normalizeBrowserLoopbackUrl(
    (window as WindowWithRuntimeEnv).env?.[key],
  );
}

// =============================================================================
// ElizaOS AI Agent Server (embedded in Hyperscape server)
// =============================================================================
// ElizaOS agent routes are now served directly from the Hyperscape game server.
// No separate ElizaOS process needed - routes are at /api/agents, /api/agents/:id, etc.

export const ELIZAOS_URL: string =
  getRuntimeEnvValue("PUBLIC_ELIZAOS_URL") ??
  getRuntimeEnvValue("PUBLIC_API_URL") ??
  normalizeBrowserLoopbackUrl(import.meta.env.PUBLIC_ELIZAOS_URL) ??
  normalizeBrowserLoopbackUrl(import.meta.env.PUBLIC_API_URL) ??
  normalizeBrowserLoopbackUrl(
    import.meta.env.PROD
      ? "https://hyperscape-production.up.railway.app"
      : "http://localhost:5555",
  ) ??
  "http://localhost:5555";

export const ELIZAOS_API = `${ELIZAOS_URL}/api` as const;

// =============================================================================
// Hyperscape Game Server
// =============================================================================
// These are replaced at build time by Vite's define feature

export const GAME_API_URL: string =
  getRuntimeEnvValue("PUBLIC_API_URL") ??
  normalizeBrowserLoopbackUrl(import.meta.env.PUBLIC_API_URL) ??
  normalizeBrowserLoopbackUrl(
    import.meta.env.PROD
      ? "https://hyperscape-production.up.railway.app"
      : "http://localhost:5555",
  ) ??
  "http://localhost:5555";

export const GAME_WS_URL: string =
  getRuntimeEnvValue("PUBLIC_WS_URL") ??
  normalizeBrowserLoopbackUrl(import.meta.env.PUBLIC_WS_URL) ??
  normalizeBrowserLoopbackUrl(
    import.meta.env.PROD
      ? "wss://hyperscape-production.up.railway.app/ws"
      : "ws://localhost:5555/ws",
  ) ??
  "ws://localhost:5555/ws";

// =============================================================================
// CDN for Static Assets
// =============================================================================

export const CDN_URL: string =
  getRuntimeEnvValue("PUBLIC_CDN_URL") ??
  normalizeBrowserLoopbackUrl(import.meta.env.PUBLIC_CDN_URL) ??
  normalizeBrowserLoopbackUrl(
    import.meta.env.PROD
      ? "https://assets.hyperscape.club"
      : "http://localhost:5555/game-assets",
  ) ??
  "http://localhost:5555/game-assets";
