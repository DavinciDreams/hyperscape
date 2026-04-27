/**
 * uiPackLoader.ts — client-side bridge for loading a `UIPackManifest`.
 *
 * Wraps `loadUIPack` (engine-side, ui-framework) with the client's
 * concrete `themeRegistry` so the pack's theme is automatically
 * registered on load. Additional store integrations (active-layout,
 * customization defaults) will land in subsequent D9.x cuts —
 * keeping this file as the single integration seam means consumers
 * call one function and get the full pack-applied state.
 *
 * Phase D9 client-side glue. The engine's `loadUIPack` is pure +
 * dependency-free; this file is where the host-specific side effects
 * live.
 */

import {
  loadUIPack,
  type LoadUIPackResult,
  type LoadedUIPack,
  type UIPackManifest,
} from "@hyperforge/ui-framework";

import { HYPERSCAPE_UI_PACK } from "./hyperscapePack";
import { registerTheme } from "./themeRegistry";

/**
 * Load a `UIPackManifest` and apply its theme to the client's
 * theme registry. Returns the engine's `LoadUIPackResult` discriminated
 * union — callers handle `{ ok: false, error }` to surface validation
 * failures.
 *
 * The pack object is NOT yet wired through to the active-layout or
 * customization stores; downstream consumers read
 * `result.loaded.defaultLayout` (and friends) directly.
 */
export function loadUIPackOnClient(
  input: unknown | UIPackManifest,
): LoadUIPackResult {
  return loadUIPack(input, {
    // Adapt themeRegistry's `(theme) => boolean` signature to
    // RegisterThemeFn's `(theme) => void`. Failed registration is
    // logged by the registry itself; loadUIPack does not propagate
    // the boolean back to its return value (the pack still loads —
    // a bad theme just means the layout falls back to the default).
    registerTheme: (theme) => {
      registerTheme(theme);
    },
  });
}

/**
 * Convenience: load Hyperscape's reference pack
 * (`HYPERSCAPE_UI_PACK`). Equivalent to
 * `loadUIPackOnClient(HYPERSCAPE_UI_PACK)` but never fails since the
 * pack is constructed at module-load through `UIPackManifestSchema.parse`.
 *
 * Returns the `LoadedUIPack` view directly (no discriminated union)
 * because the input is statically known to validate.
 */
export function loadHyperscapeUIPack(): LoadedUIPack {
  const result = loadUIPackOnClient(HYPERSCAPE_UI_PACK);
  if (!result.ok) {
    // This branch is unreachable — HYPERSCAPE_UI_PACK is validated
    // at module load. Throwing here is a defense-in-depth signal
    // that a regression has slipped past the schema.
    throw new Error(
      `loadHyperscapeUIPack: HYPERSCAPE_UI_PACK failed re-validation. ` +
        `This should never happen; ${result.error.issues.length} ` +
        `issue(s) reported.`,
    );
  }
  return result.loaded;
}
