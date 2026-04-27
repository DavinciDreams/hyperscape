/**
 * hyperscapePack.ts — Hyperscape's reference `UIPackManifest`.
 *
 * Phase D9 proof-of-concept: wraps the already-shipped
 * `DEFAULT_UI_LAYOUT` + `HYPERSCAPE_DARK_THEME` into a single
 * `UIPackManifest`. Demonstrates that existing layouts/themes can be
 * loaded as a pack with no behavior change — the pipeline is data
 * end-to-end.
 *
 * The constant is deliberately built and validated through
 * `UIPackManifestSchema.parse(...)` at module load so any drift in
 * the layout/theme schemas surfaces here instead of at render time.
 *
 * Future cuts (D9.x):
 *   - Persist this constant to disk as `hyperscape.ui-pack.json` so a
 *     plugin browser can load packs by reference.
 *   - Add a `loadUIPack(manifest)` runtime that applies the pack to
 *     the active layout/theme/customization stores.
 */

import {
  UIPackManifestSchema,
  type UIPackManifest,
} from "@hyperforge/ui-framework";
import { HYPERSCAPE_DARK_THEME } from "@hyperforge/ui-framework";

import { DEFAULT_UI_LAYOUT, DEFAULT_UI_LAYOUT_ID } from "./defaultLayout";

export const HYPERSCAPE_UI_PACK_ID = "hyperscape.default";

/**
 * Hyperscape's reference UI Pack — composes DEFAULT_UI_LAYOUT under
 * `layouts.default` and HYPERSCAPE_DARK_THEME as the pack theme.
 *
 * The widget catalog is intentionally left empty for this slice — the
 * plugin browser falls back to the host registry when a pack omits
 * the catalog. A future cut will populate it from
 * `DEFAULT_UI_LAYOUT.instances[].componentId` to give pack authors
 * a precise subset.
 */
export const HYPERSCAPE_UI_PACK: UIPackManifest = UIPackManifestSchema.parse({
  version: 1,
  id: HYPERSCAPE_UI_PACK_ID,
  name: "Hyperscape Default UI Pack",
  author: "@hyperforge/hyperscape",
  description:
    "Default UI surface for Hyperscape — wraps DEFAULT_UI_LAYOUT + " +
    "HYPERSCAPE_DARK_THEME into a shippable ui-pack.json.",
  widgets: [],
  theme: HYPERSCAPE_DARK_THEME,
  layouts: {
    default: DEFAULT_UI_LAYOUT,
  },
  metadata: {
    sourceLayoutId: DEFAULT_UI_LAYOUT_ID,
    builtAt: "module-load",
  },
});
