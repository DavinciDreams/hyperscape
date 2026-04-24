/**
 * UILayoutManifest — a game's concrete HUD composition.
 *
 * Where `Widget` describes what a widget *is* (its manifest + props
 * schema), `UILayoutManifest` describes which widgets are actually on
 * screen, where they sit, and what props their game binds to each one.
 *
 * Positioning supports three mutually exclusive modes on a per-instance
 * basis:
 *
 *   - `anchored`  — corner/edge anchor with a pixel offset. Good for
 *                   HUD elements pinned to viewport corners.
 *   - `grid`      — column/row cell inside the manifest's grid. Good
 *                   for regular dashboard layouts.
 *   - `flex`      — named flex container + order. Good for toolbars
 *                   or action-bar rows that should reflow.
 *
 * Validation (`validateLayout`) checks three invariants:
 *
 *   1. Every referenced `widgetId` exists in the registry.
 *   2. Every `instanceId` is unique within the manifest.
 *   3. Every `props` object satisfies the referenced widget's
 *      `propsSchema`.
 *
 * Consumers that want runtime-bound props (expressions resolved at
 * render time) should leave the bound key out of `props` — an upcoming
 * `bindings` map will describe expressions separately.
 */

import { z } from "zod";
import { BindingExpressionSchema, parseBindingExpression } from "./bindings";
import type { WidgetRegistry } from "./registry";
import { ThemeManifestSchema } from "./theme";

// ----------------------------------------------------------------------
// Positions
// ----------------------------------------------------------------------

export const LAYOUT_ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type LayoutAnchor = (typeof LAYOUT_ANCHORS)[number];

export const AnchoredPositionSchema = z.object({
  kind: z.literal("anchored"),
  anchor: z.enum(LAYOUT_ANCHORS),
  offset: z.object({
    x: z.number(),
    y: z.number(),
  }),
  /**
   * Optional explicit pixel width for the widget's outer box. When
   * unset, the widget renders at its intrinsic size. Surfaced so the
   * runtime resize handle and author-time constraints have a place to
   * persist dimensions for `anchored` widgets.
   */
  width: z.number().positive().optional(),
  /** Optional explicit pixel height — see `width`. */
  height: z.number().positive().optional(),
});

export type AnchoredPosition = z.infer<typeof AnchoredPositionSchema>;

export const GridPositionSchema = z.object({
  kind: z.literal("grid"),
  column: z.number().int().nonnegative(),
  row: z.number().int().nonnegative(),
  columnSpan: z.number().int().positive().default(1),
  rowSpan: z.number().int().positive().default(1),
});

export type GridPosition = z.infer<typeof GridPositionSchema>;

export const FlexPositionSchema = z.object({
  kind: z.literal("flex"),
  container: z.string().min(1),
  order: z.number().int(),
});

export type FlexPosition = z.infer<typeof FlexPositionSchema>;

export const WidgetPositionSchema = z.discriminatedUnion("kind", [
  AnchoredPositionSchema,
  GridPositionSchema,
  FlexPositionSchema,
]);

export type WidgetPosition = z.infer<typeof WidgetPositionSchema>;

// ----------------------------------------------------------------------
// Customization policy — authored by the designer, enforced at runtime.
// ----------------------------------------------------------------------

/**
 * Per-instance policy that controls whether and how the player can
 * reposition/resize this widget while in HUD edit-mode. All fields are
 * optional; an absent `customization` block is equivalent to
 * `{ movable: false, resizable: false }` (fully locked).
 *
 * The runtime `ManifestRenderer` reads this policy to decide which
 * widgets to wrap in drag/resize affordances; the World Studio UI
 * Layout Editor surfaces it in the inspector panel so designers can
 * author "players can move the HP bar but not the chat frame".
 */
export const WidgetCustomizationSchema = z.object({
  /** Player can drag the widget to a new anchored offset. */
  movable: z.boolean().optional(),
  /**
   * Player can resize the widget via handles. Only meaningful for
   * `anchored` widgets today — grid/flex resize comes later.
   */
  resizable: z.boolean().optional(),
  /**
   * If true, edit-mode exposes an individual lock toggle for this
   * widget (so the player can protect a carefully-placed widget while
   * still rearranging others). Defaults to true whenever `movable` or
   * `resizable` is true.
   */
  lockable: z.boolean().optional(),
  /**
   * Per-widget grid snap override, in pixels. When unset the runtime
   * uses the global `editStore.gridSize`.
   */
  snapToGrid: z.number().positive().optional(),
  /**
   * Min/max bounds for resize. Ignored unless `resizable` is true.
   * Width/height refer to the widget's outer box in pixels.
   */
  minWidth: z.number().positive().optional(),
  maxWidth: z.number().positive().optional(),
  minHeight: z.number().positive().optional(),
  maxHeight: z.number().positive().optional(),
  /**
   * If set, resize enforces a fixed width-to-height ratio.
   * Width / height = aspectRatio.
   */
  aspectRatio: z.number().positive().optional(),
});

export type WidgetCustomization = z.infer<typeof WidgetCustomizationSchema>;

// ----------------------------------------------------------------------
// Visibility rule (U8) — context-aware gating of widget instances.
// ----------------------------------------------------------------------

/**
 * Declarative visibility policy applied on every render. All three
 * fields are optional and combined with AND semantics — the widget
 * renders only when every declared condition is satisfied. An empty
 * object is equivalent to "no rule" (defer to the `visible` flag).
 *
 *   - `contexts`: widget is visible only when the current game
 *     context is a member of this set (e.g. `["combat", "menu"]`).
 *   - `hiddenIn`: inverse — widget is hidden when the current
 *     context is in this set.
 *   - `expression`: a binding-language predicate (`$player.inCombat`)
 *     evaluated against the runtime `DataContext`. Truthy → visible.
 *     A malformed expression fails closed (hidden).
 */
export const WidgetVisibilityRuleSchema = z.object({
  contexts: z.array(z.string().min(1)).optional(),
  hiddenIn: z.array(z.string().min(1)).optional(),
  expression: BindingExpressionSchema.optional(),
});

export type WidgetVisibilityRule = z.infer<typeof WidgetVisibilityRuleSchema>;

// ----------------------------------------------------------------------
// Widget instance — a concrete placement of a widget in a layout.
// ----------------------------------------------------------------------

export const WidgetInstanceSchema = z.object({
  /** Stable, unique within the layout manifest. */
  instanceId: z.string().min(1),
  /** Must match a widget registered via `WidgetRegistry.defineWidget`. */
  widgetId: z.string().min(1),
  position: WidgetPositionSchema,
  /**
   * Literal props passed to the widget. Validated against the
   * referenced widget's `propsSchema` by {@link validateLayout}. Keys
   * can be omitted when they will be runtime-bound via the bindings
   * map (future Phase D3.5).
   */
  props: z.record(z.string(), z.unknown()).default({}),
  /**
   * Optional runtime binding expressions, keyed by prop name. Each
   * expression is resolved against a `DataContext` at render time and
   * merged on top of `props` before Zod validation. Static validation
   * here only checks that every expression parses cleanly — resolution
   * success is inherently a runtime concern.
   */
  bindings: z.record(z.string(), BindingExpressionSchema).optional(),
  /** Optional human-readable label — shown in the editor outliner. */
  label: z.string().optional(),
  /** If false, the widget is defined in the layout but not rendered. */
  visible: z.boolean().default(true),
  /**
   * Author-side runtime-customization policy for this instance.
   * Omitted → widget is fully locked at runtime. See
   * {@link WidgetCustomizationSchema}.
   */
  customization: WidgetCustomizationSchema.optional(),
  /**
   * Context-aware visibility policy (U8). All fields are optional and
   * combined with AND semantics — the widget renders only when every
   * declared condition is satisfied.
   *
   *   - `contexts`: widget is visible only when the current game
   *     context is a member of this set (e.g. `["combat", "menu"]`).
   *     Matched against the caller-supplied `gameContext` string.
   *   - `hiddenIn`: inverse — widget is hidden when the current
   *     context is in this set. Useful for "hide action bar in
   *     cutscenes" without enumerating every positive case.
   *   - `expression`: a binding-language predicate (`$player.inCombat`,
   *     `$ui.menuOpen`, etc.) evaluated against the runtime
   *     `DataContext`. Truthy result → visible.
   *
   * When `visibility` is omitted the existing `visible` flag is the
   * only gate (authored on/off).
   */
  visibility: WidgetVisibilityRuleSchema.optional(),
});

export type WidgetInstance = z.infer<typeof WidgetInstanceSchema>;

// ----------------------------------------------------------------------
// Override position shape — reused by runtime (per-player) and
// author-time (per-viewport variant) overrides.
// ----------------------------------------------------------------------

/**
 * Partial position override. Only the fields the caller actually
 * changed are written; everything else falls back to the base
 * position. Today only `anchored` widgets are supported — grid/flex
 * runtime customization comes later and will extend this shape.
 */
export const UIOverridePositionSchema = z.object({
  anchor: z.enum(LAYOUT_ANCHORS).optional(),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export type UIOverridePosition = z.infer<typeof UIOverridePositionSchema>;

// ----------------------------------------------------------------------
// Per-viewport variants (U9).
// ----------------------------------------------------------------------

/**
 * One author-authored override targeting a single widget instance
 * under a specific viewport variant (mobile/tablet/desktop).
 *
 * Mirrors `UIOverrideSchema` (runtime, per-player) but is authored
 * statically by the designer in World Studio. Sparse by design —
 * unspecified fields fall through to the base manifest.
 *
 * A `hidden: true` flag removes the instance entirely for this
 * viewport, distinct from `visible: false` which can be toggled by
 * visibility rules at runtime.
 */
export const LayoutVariantOverrideSchema = z.object({
  instanceId: z.string().min(1),
  position: UIOverridePositionSchema.optional(),
  visible: z.boolean().optional(),
  /**
   * Drop this instance entirely for this viewport. Overrides with
   * `hidden: true` cause `resolveLayout` to remove the instance from
   * the resolved list (not just mark it invisible).
   */
  hidden: z.boolean().optional(),
});

export type LayoutVariantOverride = z.infer<typeof LayoutVariantOverrideSchema>;

/**
 * A viewport-specific variant. `overrides` is a sparse list — only
 * instances the designer actually wants to tweak for this form factor
 * appear here. `grid`/`theme`/`themeId` override the base's counterparts
 * when set.
 */
export const LayoutVariantSchema = z.object({
  overrides: z.array(LayoutVariantOverrideSchema).default([]),
  grid: z
    .object({
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
    })
    .optional(),
  theme: ThemeManifestSchema.optional(),
  themeId: z.string().min(1).optional(),
});

export type LayoutVariant = z.infer<typeof LayoutVariantSchema>;

// ----------------------------------------------------------------------
// The layout manifest itself.
// ----------------------------------------------------------------------

export const UILayoutManifestSchema = z.object({
  /** Stable id used by layout-swap / theme-swap APIs. */
  id: z.string().min(1),
  /** Display name shown in the editor. */
  name: z.string().min(1),
  /** Optional human-facing semver string (e.g. "1.2.3"). */
  version: z.string().optional(),
  /**
   * Monotonic integer incremented on every authored save. Clients use
   * it to detect override drift — if the manifest revision changes,
   * surviving overrides are still applied, but overrides that target
   * removed instance ids are pruned. Optional for backward
   * compatibility with pre-revision manifests.
   */
  revision: z.number().int().nonnegative().optional(),
  /** Optional longer description. */
  description: z.string().optional(),
  /** Grid geometry for `grid`-positioned instances. */
  grid: z
    .object({
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
    })
    .optional(),
  /**
   * Optional theme companion (U7).
   *
   *   - `theme`:   inline `ThemeManifest`. Self-contained — the HUD
   *                renders against these tokens directly, no lookup
   *                required. Wins over `themeId` when both are set.
   *   - `themeId`: reference to a named theme resolved by the runtime
   *                (e.g. asset-pack theme registry). A renderer that
   *                can't resolve the id falls back to its built-in
   *                theme — a missing theme never blocks render.
   *
   * Leaving both unset = "inherit the host's default theme". In
   * Hyperscape that means the dark asset-forge palette already
   * applied at the document root.
   */
  theme: ThemeManifestSchema.optional(),
  themeId: z.string().min(1).optional(),
  /** All widget instances on screen. */
  instances: z.array(WidgetInstanceSchema),
  /**
   * Optional per-viewport overrides (U9). Each variant holds a sparse
   * list of per-instance deltas (same shape as runtime user overrides)
   * plus optional grid/theme tweaks. At runtime the client detects
   * viewport size, picks the matching variant, and `resolveLayout`-s
   * the base manifest against it. Instances missing from a variant
   * inherit from the base.
   *
   * A variant whose `hidden: true` flag is set on an instance override
   * removes that instance entirely for that viewport — handy for
   * "hide the action-bar on mobile, show a swipe gesture instead".
   */
  variants: z
    .object({
      mobile: LayoutVariantSchema.optional(),
      tablet: LayoutVariantSchema.optional(),
      desktop: LayoutVariantSchema.optional(),
    })
    .optional(),
});

export type UILayoutManifest = z.infer<typeof UILayoutManifestSchema>;

// ----------------------------------------------------------------------
// Validation against a registry.
// ----------------------------------------------------------------------

export interface LayoutValidationIssue {
  /** The instance id the issue applies to, or `undefined` for
   *  manifest-level issues. */
  instanceId?: string;
  /** Short machine-readable code. */
  code:
    | "duplicate-instance-id"
    | "unknown-widget-id"
    | "invalid-props"
    | "invalid-binding-expression"
    | "grid-cell-out-of-bounds"
    | "schema-error";
  message: string;
}

export interface LayoutValidationResult {
  ok: boolean;
  issues: LayoutValidationIssue[];
}

/**
 * Validate a layout manifest against a populated registry.
 *
 * Returns `{ ok, issues }` so callers (editor panel, CI checks) can
 * surface every problem at once rather than failing fast on the first.
 *
 * The manifest is parsed through `UILayoutManifestSchema` first; if
 * that fails, the Zod issues are promoted to `schema-error` entries
 * and no per-instance checks run.
 */
export function validateLayout(
  manifest: unknown,
  registry: WidgetRegistry<unknown>,
): LayoutValidationResult {
  const parsed = UILayoutManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "schema-error",
        message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      })),
    };
  }

  const layout = parsed.data;
  const issues: LayoutValidationIssue[] = [];
  const seen = new Set<string>();

  for (const inst of layout.instances) {
    if (seen.has(inst.instanceId)) {
      issues.push({
        instanceId: inst.instanceId,
        code: "duplicate-instance-id",
        message: `Instance id "${inst.instanceId}" appears more than once.`,
      });
    } else {
      seen.add(inst.instanceId);
    }

    const widget = registry.getWidget(inst.widgetId);
    if (!widget) {
      issues.push({
        instanceId: inst.instanceId,
        code: "unknown-widget-id",
        message: `Instance "${inst.instanceId}" references unknown widget id "${inst.widgetId}".`,
      });
      continue;
    }

    const propsResult = widget.propsSchema.safeParse(inst.props);
    if (!propsResult.success) {
      for (const issue of propsResult.error.issues) {
        issues.push({
          instanceId: inst.instanceId,
          code: "invalid-props",
          message: `props.${issue.path.join(".") || "(root)"}: ${issue.message}`,
        });
      }
    }

    if (inst.bindings) {
      for (const [key, expression] of Object.entries(inst.bindings)) {
        try {
          parseBindingExpression(expression);
        } catch (err) {
          issues.push({
            instanceId: inst.instanceId,
            code: "invalid-binding-expression",
            message: `bindings.${key}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    if (inst.position.kind === "grid" && layout.grid) {
      const { column, row, columnSpan, rowSpan } = inst.position;
      if (column + columnSpan > layout.grid.columns) {
        issues.push({
          instanceId: inst.instanceId,
          code: "grid-cell-out-of-bounds",
          message: `Grid instance "${inst.instanceId}" extends past column ${layout.grid.columns} (column=${column}, span=${columnSpan}).`,
        });
      }
      if (row + rowSpan > layout.grid.rows) {
        issues.push({
          instanceId: inst.instanceId,
          code: "grid-cell-out-of-bounds",
          message: `Grid instance "${inst.instanceId}" extends past row ${layout.grid.rows} (row=${row}, span=${rowSpan}).`,
        });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// ----------------------------------------------------------------------
// Per-player overrides — deltas authored at runtime by the player, stored
// locally, and merged on top of the designer's manifest by `resolveLayout`.
// `UIOverridePositionSchema` is defined earlier so it can be reused by
// author-time variants.
// ----------------------------------------------------------------------

/**
 * One instance's delta. `instanceId` must match a `WidgetInstance.instanceId`
 * in the referenced manifest — overrides that target removed ids are
 * pruned by `resolveLayout`.
 */
export const UIOverrideSchema = z.object({
  instanceId: z.string().min(1),
  position: UIOverridePositionSchema.optional(),
  visible: z.boolean().optional(),
  /**
   * Per-widget transparency override, 0 (invisible) to 1 (opaque).
   * Only meaningful when the renderer honors it; reserved for U5+.
   */
  transparency: z.number().min(0).max(1).optional(),
});

export type UIOverride = z.infer<typeof UIOverrideSchema>;

/**
 * The full per-player override document for a single authored layout.
 * Persisted to localStorage keyed by `layoutId`. `schemaVersion` is a
 * monotonic integer the client uses for its own storage-format
 * migrations — *not* related to the manifest's `revision`, which
 * tracks server-side authoring drift.
 */
export const UIUserLayoutSchema = z.object({
  schemaVersion: z.literal(1),
  /** Which authored manifest these overrides target. */
  layoutId: z.string().min(1),
  /**
   * Manifest `revision` observed when this override document was last
   * written. Useful for observability ("your overrides were authored
   * against v3, the current layout is v5"). Absence is fine — older
   * overrides just look like "revision unknown".
   */
  layoutRevision: z.number().int().nonnegative().optional(),
  /** Epoch ms of last save. */
  updatedAt: z.number().int().nonnegative(),
  /** Array of per-instance deltas. */
  overrides: z.array(UIOverrideSchema),
});

export type UIUserLayout = z.infer<typeof UIUserLayoutSchema>;
