/**
 * useActiveUILayout — fetches a team's active UI layout from the
 * World Studio API and returns a parsed `UILayoutManifest`.
 *
 * Discovery order for the studio context (what team / game to fetch):
 *   1. `window.__HYPERIA_STUDIO__` — set by the studio-launched game
 *      client at bootstrap (preferred for production use).
 *   2. URL query string: `?studioTeamId=...&studioGameId=...` — handy
 *      for local "launch game in a tab" iteration.
 *
 * Discovery order for the studio API base URL:
 *   1. `window.__HYPERIA_STUDIO__.apiUrl`
 *   2. `import.meta.env.PUBLIC_STUDIO_API_URL` (Vite build-time define)
 *   3. Fallback: `null` — hook does nothing, caller uses the built-in
 *      `DEFAULT_UI_LAYOUT`.
 *
 * Layout selection precedence (U6):
 *   1. Per-player override persisted via `setPlayerLayoutOverride()`
 *      — keyed by gameId in localStorage.
 *   2. Game's `activeUiLayoutId` set by the author in World Studio.
 *   3. `null` — caller uses the built-in `DEFAULT_UI_LAYOUT`.
 *
 * The hook is defensive: any fetch error, validation failure, or
 * missing context is logged once and silently returns `layout: null`
 * so the HUD can render the default.
 */

import { useEffect, useState } from "react";
import {
  safeLoadLayoutManifest,
  type UILayoutManifest,
} from "@hyperforge/ui-framework";
import { reportSafeLoadFailure } from "./safeLoadReport";

interface StudioContext {
  teamId: string;
  gameId?: string;
  apiUrl?: string;
}

interface WindowWithStudio extends Window {
  __HYPERIA_STUDIO__?: StudioContext;
}

export interface UseActiveUILayoutResult {
  layout: UILayoutManifest | null;
  loading: boolean;
  error: string | null;
}

function readStudioContext(): StudioContext | null {
  if (typeof window === "undefined") return null;

  const fromGlobal = (window as WindowWithStudio).__HYPERIA_STUDIO__;
  if (fromGlobal && fromGlobal.teamId) return fromGlobal;

  try {
    const params = new URLSearchParams(window.location.search);
    const teamId = params.get("studioTeamId");
    if (!teamId) return null;
    const gameId = params.get("studioGameId") ?? undefined;
    return { teamId, gameId };
  } catch {
    return null;
  }
}

function readStudioApiUrl(ctx: StudioContext | null): string | null {
  if (ctx?.apiUrl) return ctx.apiUrl;
  try {
    const env = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env;
    const fromEnv = env?.PUBLIC_STUDIO_API_URL;
    if (fromEnv) return fromEnv;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fetch the game's active layout id, then fetch that layout's manifest.
 * Returns `null` if any step fails.
 *
 * Precedence: per-player override > game's authored `activeUiLayoutId`.
 */
async function fetchActiveLayout(
  apiUrl: string,
  teamId: string,
  gameId: string | undefined,
): Promise<UILayoutManifest | null> {
  if (!gameId) return null; // team-wide active layout is not modelled yet
  const base = apiUrl.replace(/\/$/, "");

  // Player override wins — check localStorage first (U6 switcher).
  const overrideId = readPlayerLayoutOverride(gameId);

  let layoutId: string | null = overrideId;
  if (!layoutId) {
    const gameRes = await fetch(
      `${base}/api/teams/${encodeURIComponent(teamId)}/games/${encodeURIComponent(gameId)}`,
    );
    if (!gameRes.ok) return null;
    const game = (await gameRes.json()) as {
      activeUiLayoutId?: string | null;
    };
    layoutId = game.activeUiLayoutId ?? null;
  }
  if (!layoutId) return null;

  const layoutRes = await fetch(
    `${base}/api/teams/${encodeURIComponent(teamId)}/ui-layouts/${encodeURIComponent(layoutId)}`,
  );
  if (!layoutRes.ok) return null;
  const detail = (await layoutRes.json()) as { manifestData?: unknown };
  if (!detail.manifestData) return null;

  // U11: hardening — `safeLoadLayoutManifest` is a `safeParse` wrapper
  // that also handles null/non-object input without throwing. Failure
  // here falls back to DEFAULT_UI_LAYOUT upstream and is reported via
  // the pluggable telemetry hook so the app can surface a toast.
  const loaded = safeLoadLayoutManifest(detail.manifestData);
  if (loaded.failure) {
    reportSafeLoadFailure("active-layout", loaded.failure);
  }
  return loaded.value;
}

// ----- Player layout override (U6) -----

const PLAYER_OVERRIDE_STORAGE_PREFIX = "hyperforge.ui-layout.override.";

function overrideKey(gameId: string): string {
  return `${PLAYER_OVERRIDE_STORAGE_PREFIX}${gameId}`;
}

/**
 * Read the player's chosen layout id for a given game. Returns `null`
 * when nothing is stored, when we're in a non-browser environment, or
 * if localStorage access throws (Safari private mode, etc.).
 */
export function readPlayerLayoutOverride(gameId: string): string | null {
  if (typeof window === "undefined" || !gameId) return null;
  try {
    return window.localStorage.getItem(overrideKey(gameId));
  } catch {
    return null;
  }
}

/**
 * Persist a player's layout choice. Pass `null` to clear the override
 * and fall back to the game's authored default.
 */
export function setPlayerLayoutOverride(
  gameId: string,
  layoutId: string | null,
): void {
  if (typeof window === "undefined" || !gameId) return;
  try {
    if (layoutId === null) {
      window.localStorage.removeItem(overrideKey(gameId));
    } else {
      window.localStorage.setItem(overrideKey(gameId), layoutId);
    }
  } catch {
    // Ignore quota / security errors — override becomes a no-op.
  }
}

export function useActiveUILayout(): UseActiveUILayoutResult {
  const [layout, setLayout] = useState<UILayoutManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctx = readStudioContext();
    if (!ctx) return;
    const apiUrl = readStudioApiUrl(ctx);
    if (!apiUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchActiveLayout(apiUrl, ctx.teamId, ctx.gameId)
      .then((result) => {
        if (cancelled) return;
        setLayout(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { layout, loading, error };
}

// ----- Listing hook (U6 switcher source) -----

export interface UILayoutSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  isTemplate: boolean;
  isPublic: boolean;
  gameId: string | null;
}

export interface UseGameUILayoutsResult {
  layouts: UILayoutSummary[];
  loading: boolean;
  error: string | null;
}

interface RawLayoutRow {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  version?: string;
  isTemplate?: boolean;
  isPublic?: boolean;
  gameId?: string | null;
}

async function fetchGameLayouts(
  apiUrl: string,
  teamId: string,
  gameId: string,
): Promise<UILayoutSummary[]> {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(
    `${base}/api/teams/${encodeURIComponent(teamId)}/games/${encodeURIComponent(gameId)}/ui-layouts`,
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as RawLayoutRow[];
  if (!Array.isArray(rows)) return [];
  return rows.map<UILayoutSummary>((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? null,
    version: r.version ?? "1.0.0",
    isTemplate: r.isTemplate === true,
    isPublic: r.isPublic === true,
    gameId: r.gameId ?? null,
  }));
}

/**
 * Fetch every layout available to the current studio-launched game.
 * Drives the player-facing layout switcher (U6). Returns an empty
 * list when studio context is missing — callers should hide the
 * switcher in that case rather than treating it as an error.
 */
export function useGameUILayouts(): UseGameUILayoutsResult {
  const [layouts, setLayouts] = useState<UILayoutSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctx = readStudioContext();
    if (!ctx || !ctx.gameId) return;
    const apiUrl = readStudioApiUrl(ctx);
    if (!apiUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGameLayouts(apiUrl, ctx.teamId, ctx.gameId)
      .then((rows) => {
        if (cancelled) return;
        setLayouts(rows);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { layouts, loading, error };
}
