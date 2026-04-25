/**
 * Game-plugin resolver for the asset-forge editor.
 *
 * `GameSelector.tsx` (the toolbar dropdown), `usePIESession.ts` (the
 * Play-In-Editor hook), and `pluginBoot.ts` (the PIE plugin adapter)
 * all need to agree on the same enumerated game ids and the same
 * localStorage key the editor writes the user's pick to.
 *
 * This module is intentionally small and dependency-free. It mirrors
 * (but does not import) `GamePluginSetId` + `GAME_PLUGIN_LOCAL_STORAGE_KEY`
 * + `resolveGamePluginSetIdFromEnv()` from `@hyperforge/client` — the
 * runtime behavior is identical; we just can't cross the package
 * boundary since asset-forge doesn't depend on client.
 */

export type GamePluginSetId = "hyperscape" | "shooter-demo";

export const GAME_PLUGIN_LOCAL_STORAGE_KEY = "hyperscape:game-plugin";

const DEFAULT_GAME: GamePluginSetId = "hyperscape";

export function isKnownGamePluginSetId(raw: unknown): raw is GamePluginSetId {
  return raw === "hyperscape" || raw === "shooter-demo";
}

/**
 * Resolve the active game plugin set for the editor. Lookup order:
 *
 *   1. `VITE_HYPERSCAPE_GAME_PLUGIN` env var (build-time flag — CI,
 *      preview deploys).
 *   2. `localStorage["hyperscape:game-plugin"]` (runtime — the
 *      GameSelector toolbar dropdown's backing store).
 *   3. Default: `"hyperscape"`.
 *
 * Unknown values fall through silently. A bad env var can't brick
 * the editor — worst case you get the default game.
 */
export function resolveGamePluginSetId(): GamePluginSetId {
  const envRaw =
    typeof import.meta.env === "object"
      ? (import.meta.env as Record<string, string | undefined>)[
          "VITE_HYPERSCAPE_GAME_PLUGIN"
        ]
      : undefined;
  if (isKnownGamePluginSetId(envRaw)) return envRaw;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const lsRaw = window.localStorage.getItem(GAME_PLUGIN_LOCAL_STORAGE_KEY);
      if (isKnownGamePluginSetId(lsRaw)) return lsRaw;
    }
  } catch {
    // localStorage may be blocked; fall through to default.
  }

  return DEFAULT_GAME;
}
