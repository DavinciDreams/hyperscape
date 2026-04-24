/**
 * featureFlag.ts — default-on gate for the manifest-driven HUD.
 *
 * U11 graduated the manifest HUD to the default render path. This
 * file now reads an *opt-out* signal instead of an opt-in signal —
 * the manifest HUD is always on unless explicitly disabled. The
 * legacy hand-coded HUD remains in the tree as a temporary fallback
 * for bisecting regressions; a follow-up commit will delete it once
 * the manifest HUD has soaked in production.
 *
 * Disable via any of:
 *   - `VITE_DISABLE_MANIFEST_HUD=true` at build time
 *   - `localStorage.setItem("hyperscape.manifestHud", "0")` at runtime
 *   - `?manifestHud=0` query string on the game URL
 */

function readEnvDisable(): boolean {
  // `import.meta.env` is Vite-provided at build time. Guarded so
  // non-Vite test environments (vitest with node env) don't throw.
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })
      .env;
    if (env && env.VITE_DISABLE_MANIFEST_HUD === "true") return true;
  } catch {
    // ignore
  }
  return false;
}

function readLocalStorageDisable(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem("hyperscape.manifestHud");
    return raw === "0" || raw === "false";
  } catch {
    return false;
  }
}

function readQueryStringDisable(): boolean {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("manifestHud");
    return raw === "0" || raw === "false";
  } catch {
    return false;
  }
}

/**
 * Returns `true` when the manifest-driven HUD should mount — default
 * on. Developers can flip it off at runtime with
 * `localStorage.setItem("hyperscape.manifestHud", "0")` or at build
 * time with `VITE_DISABLE_MANIFEST_HUD=true`.
 *
 * Computed fresh per call — cheap, and avoids stale caching across
 * HMR reloads when a developer toggles the flag in devtools.
 */
export function isManifestHudEnabled(): boolean {
  if (readEnvDisable()) return false;
  if (readLocalStorageDisable()) return false;
  if (readQueryStringDisable()) return false;
  return true;
}
