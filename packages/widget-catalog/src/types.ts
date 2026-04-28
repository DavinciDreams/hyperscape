/**
 * Public types for `@hyperforge/widget-catalog`.
 *
 * The catalog service walks a `WidgetRegistry` and produces
 * `WidgetCatalogEntry` records that describe each registered widget
 * in a form suitable for:
 *   - AI agents that need to discover what widgets exist before
 *     authoring a UI pack.
 *   - Build-time tooling that emits a static `catalog.json`.
 *   - Editor preview palettes.
 *
 * The shape is intentionally a flat, JSON-serializable record. Live
 * Zod schemas + React components stay on the registry side; the
 * catalog entry surfaces a *summary* of each widget that's safe to
 * pass over a wire, embed in a prompt, or persist to disk.
 */

import type {
  WidgetCategory,
  WidgetDefaultSize,
} from "@hyperforge/ui-framework";

/**
 * A single prop's summary. Derived from the widget's Zod schema —
 * one entry per top-level field of the `propsSchema` object.
 *
 * `optional` is true when the schema field is `.optional()` OR has a
 * `.default(...)`. This matches what an authoring tool / AI cares
 * about: "do I have to set this?". It does NOT distinguish between
 * truly optional and defaulted — both mean "you can omit it".
 */
export interface WidgetPropSummary {
  /** Field name as it appears in the widget's `props` object. */
  readonly name: string;
  /**
   * Best-effort type label. One of: `"string"`, `"number"`,
   * `"boolean"`, `"enum"`, `"array"`, `"object"`, `"union"`,
   * `"unknown"`. Enum values are surfaced separately on
   * `enumValues`. This is a hint, not a full type — for the full
   * type, callers query the schema directly.
   */
  readonly type:
    | "string"
    | "number"
    | "boolean"
    | "enum"
    | "array"
    | "object"
    | "union"
    | "unknown";
  /** When `type === "enum"`, the allowed string values. */
  readonly enumValues?: ReadonlyArray<string>;
  /** True when the field is optional or has a default. */
  readonly optional: boolean;
  /**
   * Optional `.describe(...)` doc string from the Zod schema. Empty
   * string when none was attached.
   */
  readonly description: string;
}

/**
 * A single widget's entry in the catalog. One per registered widget
 * id. Stable, JSON-serializable.
 */
export interface WidgetCatalogEntry {
  /** Stable manifest id — matches `Widget.manifest.id`. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Optional one-line description from the widget manifest. */
  readonly description: string;
  /** Palette category. */
  readonly category: WidgetCategory;
  /** Authoring-time size hint. */
  readonly defaultSize: WidgetDefaultSize;
  /** Optional lucide icon name for palettes. */
  readonly icon: string;
  /**
   * Schema-derived prop summary. One entry per top-level field of
   * the widget's `propsSchema` (if it's a `z.object`). Empty when
   * the schema can't be introspected (non-object root).
   */
  readonly props: ReadonlyArray<WidgetPropSummary>;
  /**
   * Default values for every required prop, taken from the widget's
   * `defaultProps`. Stored as a JSON-able record so the entry can
   * be serialized.
   */
  readonly defaultProps: Readonly<Record<string, unknown>>;
}

/**
 * Filter options for `listWidgets`. All fields are optional; an
 * empty filter matches every widget.
 */
export interface CatalogFilter {
  /** Restrict to a single category. */
  readonly category?: WidgetCategory;
  /**
   * Case-insensitive substring match. Compared against `id`,
   * `name`, and `description` of each entry; an entry matches if
   * any of the three contains the query.
   */
  readonly search?: string;
}

/**
 * Aggregate stats for the catalog. Useful for AI prompt context
 * ("there are N widgets across M categories") and for surfacing
 * "is the catalog populated yet?" on bootstrap.
 */
export interface CatalogStats {
  /** Total registered widgets. */
  readonly total: number;
  /** Per-category counts (only categories with ≥ 1 widget appear). */
  readonly byCategory: Readonly<Partial<Record<WidgetCategory, number>>>;
}
