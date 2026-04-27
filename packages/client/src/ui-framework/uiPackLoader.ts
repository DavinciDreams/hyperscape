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
import { registerUIPack, setActiveUIPack } from "./uiPackRegistry";

/** Options for `loadUIPackOnClient`. */
export interface LoadUIPackOnClientOptions {
  /**
   * If `true` (default), the loaded pack is also registered in the
   * client's `uiPackRegistry`. Pass `false` to skip registration —
   * useful for tests that want a pure validation pass without
   * mutating the singleton.
   */
  register?: boolean;
  /**
   * If `true` (default), the loaded pack is set as the active pack.
   * Pass `false` to register without activating — useful when
   * pre-loading multiple packs at boot before the user picks one.
   */
  setActive?: boolean;
}

/**
 * Load a `UIPackManifest` and apply its theme to the client's
 * theme registry. Returns the engine's `LoadUIPackResult` discriminated
 * union — callers handle `{ ok: false, error }` to surface validation
 * failures.
 *
 * On success the pack is also registered in the client's
 * `uiPackRegistry` and (by default) marked as the active pack.
 * `useActiveUIPack` reads from there. Pass `{ register: false }` to
 * skip registration entirely; pass `{ setActive: false }` to
 * register without activating.
 */
export function loadUIPackOnClient(
  input: unknown | UIPackManifest,
  options: LoadUIPackOnClientOptions = {},
): LoadUIPackResult {
  const { register = true, setActive = true } = options;
  const result = loadUIPack(input, {
    // Adapt themeRegistry's `(theme) => boolean` signature to
    // RegisterThemeFn's `(theme) => void`. Failed registration is
    // logged by the registry itself; loadUIPack does not propagate
    // the boolean back to its return value (the pack still loads —
    // a bad theme just means the layout falls back to the default).
    registerTheme: (theme) => {
      registerTheme(theme);
    },
  });

  if (result.ok && register) {
    registerUIPack(result.loaded);
    if (setActive) setActiveUIPack(result.loaded.id);
  }

  return result;
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
