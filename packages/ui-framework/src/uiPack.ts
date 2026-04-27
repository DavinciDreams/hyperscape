/**
 * UIPackManifest — the wrapper schema that bundles a game's complete
 * UI surface into a single shippable manifest.
 *
 * Phase D9 of the AAA-completion plan. The closing artifact for the
 * "UI as data" goal: a single `ui-pack.json` per game module that
 * contains the widget catalog, layout variants, theme, and per-widget
 * customization. Loading a different ui-pack swaps the entire UI.
 *
 * Final shape (per `PLAN_UI_PACK_AAA.md`):
 *
 * ```
 * game-module/ui/
 *   widgets.json        # widget catalog this module uses
 *   layouts/
 *     default.json      # UILayoutManifest — Desktop/Tablet/Mobile variants
 *     minimal.json
 *   theme.json          # ThemeManifest
 *   customization.json  # cross-widget defaults (grid size, hold-key, …)
 * ```
 *
 * The split-file layout above is the **on-disk** authoring shape.
 * `UIPackManifest` is the **runtime / wire** shape — the host loads
 * one JSON document and gets the entire UI surface in one parse.
 * `loadUIPack` (D9.x) is the bridge that reads the split files and
 * produces a `UIPackManifest`.
 *
 * Versioning: `version: 1` is the first stable shape. Migration of
 * legacy `UILayoutManifest`-only files to a UIPackManifest is
 * non-destructive — a layout-only file is structurally equivalent to
 * a UIPackManifest with empty `widgets` + no theme + no customization.
 */

import { z } from "zod";

import { UILayoutManifestSchema, WidgetCustomizationSchema } from "./layout";
import { ThemeManifestSchema } from "./theme";
import { WidgetManifestSchema } from "./widget";

/**
 * Catalog entry — references a widget by id and optionally pins
 * default props. The widget itself must be registered in the host's
 * `WidgetRegistry`; the catalog is just the per-module subset list
 * (so the Plugin Browser knows what UI a pack expects to render).
 */
export const UIPackWidgetCatalogEntrySchema = z.object({
  /** Widget id, matches `WidgetManifest.id` of a registered widget. */
  id: z.string().min(1, "widget id cannot be empty"),
  /**
   * Optional widget-level overrides applied on top of the registered
   * widget's defaults. Useful for per-pack tweaks (e.g. shooter-pack's
   * action-bar with 6 slots vs hyperscape-pack's 12).
   */
  defaults: z.record(z.string(), z.unknown()).optional(),
});

export type UIPackWidgetCatalogEntry = z.infer<
  typeof UIPackWidgetCatalogEntrySchema
>;

/**
 * Cross-widget customization defaults — values that apply to every
 * widget instance in this pack unless the layout overrides per
 * instance. Subset of the per-instance `WidgetCustomizationSchema` so
 * pack authors can set "sensible defaults" without restating them on
 * every widget.
 *
 * This is intentionally a partial of the per-instance shape: a pack
 * can omit any field, and instances with their own customization
 * override the pack default.
 */
export const UIPackCustomizationDefaultsSchema =
  WidgetCustomizationSchema.partial();

export type UIPackCustomizationDefaults = z.infer<
  typeof UIPackCustomizationDefaultsSchema
>;

/**
 * Named layout variant inside a pack. Each variant is a full
 * `UILayoutManifest` — the pack just keeps a map from variant name
 * (e.g. `"default"`, `"minimal"`, `"mobile"`) to its layout. A pack
 * with a single layout still wraps it as `{ default: <layout> }`.
 */
export const UIPackLayoutsSchema = z
  .record(z.string(), UILayoutManifestSchema)
  .refine((record) => Object.keys(record).length > 0, {
    message: "ui-pack must declare at least one layout",
  })
  .refine((record) => "default" in record, {
    message: "ui-pack layouts must include a 'default' entry",
  });

export type UIPackLayouts = z.infer<typeof UIPackLayoutsSchema>;

/**
 * Full UI Pack manifest. One per game module.
 */
export const UIPackManifestSchema = z.object({
  /**
   * Schema version. Bumped when the ui-pack shape itself changes; not
   * the same as the pack's content version.
   */
  version: z.literal(1),

  /**
   * Human-readable id (e.g. `"hyperscape-default"`). Used by the
   * Plugin Browser to identify the pack and as the base name of the
   * on-disk `ui-pack.json` file.
   */
  id: z.string().min(1, "ui-pack id cannot be empty"),

  /** Display name shown in the editor. */
  name: z.string().min(1, "ui-pack name cannot be empty"),

  /** Pack author / publisher (e.g. plugin id). */
  author: z.string().min(1).optional(),

  /** Free-form description for the editor. */
  description: z.string().optional(),

  /**
   * Widget catalog — the subset of registered widgets this pack
   * actually uses. The host warns (but does not throw) when a
   * layout references a widget id not in this catalog.
   */
  widgets: z.array(UIPackWidgetCatalogEntrySchema).default([]),

  /**
   * Theme. Optional — packs that omit the theme inherit the host's
   * default. When present, the host applies it before mounting any
   * layout from this pack.
   */
  theme: ThemeManifestSchema.optional(),

  /**
   * Layout variants keyed by name. `"default"` is required; additional
   * entries (e.g. `"minimal"`, `"mobile"`) are picked at runtime by
   * `useActiveUILayout` / variant negotiation.
   */
  layouts: UIPackLayoutsSchema,

  /**
   * Cross-widget customization defaults. Applied to every widget
   * instance unless its layout entry overrides per instance.
   */
  customization: UIPackCustomizationDefaultsSchema.optional(),

  /**
   * Free-form metadata bag — pack tools / Plugin Browser / asset
   * pipelines can stash data here without changing the schema.
   * Values must be JSON-safe.
   */
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UIPackManifest = z.infer<typeof UIPackManifestSchema>;

/**
 * Validate a candidate `UIPackManifest`. Mirrors the `LoadResult`
 * shape used by `safe-load.ts` so a future `loadUIPack` can stay
 * consistent.
 */
export function validateUIPackManifest(
  input: unknown,
): { ok: true; data: UIPackManifest } | { ok: false; error: z.ZodError } {
  const parsed = UIPackManifestSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error };
}

/**
 * Re-export the inner schemas so callers building a pack inline can
 * compose them without reaching across the barrel.
 */
export { WidgetManifestSchema };

// ============================================================================
// loadUIPack runtime — D9.x
// ============================================================================

/** Callback shape for handing a pack's theme to the host's registry. */
export type RegisterThemeFn = (theme: import("./theme").ThemeManifest) => void;

/** Options for `loadUIPack` — host-side hooks to apply the pack. */
export interface LoadUIPackOptions {
  /**
   * Register the pack's theme with the host's theme registry. Called
   * exactly once when the pack is loaded, only if the pack carries a
   * `theme` block. Hosts using `client/ui-framework/themeRegistry`
   * pass its `registerTheme` directly.
   */
  registerTheme?: RegisterThemeFn;
}

/**
 * Structured view of a loaded `UIPackManifest`. Surfaces the most
 * common fields downstream consumers need — the full manifest is
 * still available under `pack` for callers that want fine control.
 */
export interface LoadedUIPack {
  /** The validated pack manifest. */
  readonly pack: UIPackManifest;
  /** Pack id (`pack.id`). */
  readonly id: string;
  /** Pack theme, if any. */
  readonly theme: import("./theme").ThemeManifest | undefined;
  /** Default layout — guaranteed to exist by `UIPackLayoutsSchema`. */
  readonly defaultLayout: import("./layout").UILayoutManifest;
  /** All layouts in the pack, keyed by variant name. */
  readonly layouts: UIPackLayouts;
  /** Cross-widget customization defaults, if any. */
  readonly customization: UIPackCustomizationDefaults | undefined;
  /** Widget catalog entries (subset of registered widgets this pack uses). */
  readonly widgets: ReadonlyArray<UIPackWidgetCatalogEntry>;
}

/** Result of `loadUIPack` — discriminated union mirrors `validateUIPackManifest`. */
export type LoadUIPackResult =
  | { readonly ok: true; readonly loaded: LoadedUIPack }
  | { readonly ok: false; readonly error: import("zod").ZodError };

/**
 * Validate + project a `UIPackManifest` into a `LoadedUIPack`. When
 * `options.registerTheme` is provided and the pack carries a theme,
 * the callback is invoked with the theme exactly once on success.
 *
 * Returns a discriminated union — failure carries the underlying
 * `ZodError` so callers can surface friendly messages without
 * re-validating. Successful loads are pure projections of the
 * manifest plus the side-effect of invoking the theme callback.
 *
 * The runtime intentionally does NOT touch any layout/customization
 * stores — those live in the host (client/ui-framework). Hosts call
 * `loadUIPack(manifest, { registerTheme })` and then drive their own
 * layout-store updates from `result.loaded.defaultLayout` and
 * `result.loaded.layouts`. This keeps the loader testable and
 * dependency-free.
 */
export function loadUIPack(
  input: unknown,
  options: LoadUIPackOptions = {},
): LoadUIPackResult {
  const validation = validateUIPackManifest(input);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const pack = validation.data;

  if (pack.theme && options.registerTheme) {
    options.registerTheme(pack.theme);
  }

  const loaded: LoadedUIPack = {
    pack,
    id: pack.id,
    theme: pack.theme,
    defaultLayout: pack.layouts.default,
    layouts: pack.layouts,
    customization: pack.customization,
    widgets: pack.widgets,
  };
  return { ok: true, loaded };
}
