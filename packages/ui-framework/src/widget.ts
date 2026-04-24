/**
 * Widget contract for the Hyperforge UI framework.
 *
 * A Widget is the atomic unit of a game HUD/UI — an HP bar, a chat panel,
 * an inventory grid, etc. Each widget declares:
 *
 *   - A `WidgetManifest` describing identity + authoring-time metadata
 *     (id, display name, category, icon, default size).
 *   - A Zod `propsSchema` describing every bindable prop. The schema is
 *     the single source of truth for props validation AND for the
 *     UI-editor property panel (same pattern as `EntityTypeSchema` in
 *     the World Studio GameModule system).
 *
 * Rendering is framework-agnostic at this layer. Consumers (the client
 * package, the UI editor preview) plug their own `ComponentType` at
 * registration time via {@link WidgetRegistration}. This keeps the
 * contract package free of React so it can be used by server-side
 * layout validation, codemods, and tests.
 */

import { z } from "zod";

// ======================================================================
// Widget categories — used by the editor palette to group widgets.
// ======================================================================

export const WIDGET_CATEGORIES = [
  "hud",
  "panel",
  "overlay",
  "modal",
  "menu",
  "debug",
] as const;

export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number];

// ======================================================================
// Widget size — authoring-time hints for initial placement in the
// layout canvas. Widgets are free to resize at runtime based on their
// own content.
// ======================================================================

export const WidgetDefaultSizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

export type WidgetDefaultSize = z.infer<typeof WidgetDefaultSizeSchema>;

// ======================================================================
// WidgetManifest — authoring metadata for a widget kind. One manifest
// per widget *type* (e.g. `"hyperforge.hud.hp-bar"`), not per instance.
// Instances live in the UILayoutManifest (Phase D3).
// ======================================================================

export const WidgetManifestSchema = z.object({
  /**
   * Globally-unique widget type id. Convention:
   * `<namespace>.<category>.<name>` e.g. `"hyperforge.hud.hp-bar"`.
   */
  id: z.string().min(1),

  /** Human-readable display name for the widget palette. */
  name: z.string().min(1),

  /** Optional longer description shown in the widget inspector. */
  description: z.string().optional(),

  /** Category for palette grouping. */
  category: z.enum(WIDGET_CATEGORIES),

  /**
   * Optional lucide icon name for the palette entry (matches the
   * convention used elsewhere in World Studio, e.g.
   * `gameModules/utils/lucideIconMap.ts`).
   */
  icon: z.string().optional(),

  /**
   * Initial placement size in layout-grid units. Consumers translate
   * grid units to pixels/percent according to their layout engine.
   */
  defaultSize: WidgetDefaultSizeSchema,

  /**
   * Optional author tag — useful when games package third-party
   * widgets via the plugin architecture (Phase I).
   */
  author: z.string().optional(),

  /** Optional semver string. Defaults to undefined (version-less). */
  version: z.string().optional(),
});

export type WidgetManifest = z.infer<typeof WidgetManifestSchema>;

// ======================================================================
// Widget<P> — the contract a widget implementation must satisfy.
//
// NOTE: No `Component` field here. The concrete renderer is provided at
// registration time (see WidgetRegistration below) so this package stays
// framework-agnostic.
// ======================================================================

export interface Widget<
  P extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Authoring metadata. */
  manifest: WidgetManifest;

  /**
   * Zod schema for the widget's props. Used for:
   *   1. Runtime validation of layout-manifest prop bindings.
   *   2. Auto-generating the property inspector in the UI editor
   *      (same pattern as `SchemaPropertyEditor`).
   *   3. Codemod-safe discovery of all bindable widget props.
   */
  propsSchema: z.ZodType<P>;

  /**
   * Default props applied when a widget is first placed on the canvas.
   * Must satisfy `propsSchema`.
   */
  defaultProps: P;
}

// ======================================================================
// WidgetRegistration<P> — bridges Widget<P> to a consumer-specific
// Component type. The generic `C` is intentionally unconstrained so
// React, Solid, or a custom renderer can all plug in.
// ======================================================================

export interface WidgetRegistration<
  P extends Record<string, unknown> = Record<string, unknown>,
  C = unknown,
> {
  widget: Widget<P>;
  Component: C;
}

// ======================================================================
// Helpers for defining widgets with inferred prop types.
// ======================================================================

/**
 * Define a widget with a strongly-typed prop schema. Props type is
 * inferred from the passed Zod schema, so callers never have to
 * restate their prop shape.
 *
 * ```ts
 * const hpBarPropsSchema = z.object({
 *   orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
 *   showNumeric: z.boolean().default(true),
 * });
 *
 * export const hpBarWidget = defineWidget({
 *   manifest: { id: "hyperforge.hud.hp-bar", name: "HP Bar", category: "hud", defaultSize: { width: 4, height: 1 } },
 *   propsSchema: hpBarPropsSchema,
 *   defaultProps: { orientation: "horizontal", showNumeric: true },
 * });
 * ```
 */
export function defineWidget<
  S extends z.ZodType<Record<string, unknown>>,
>(args: {
  manifest: WidgetManifest;
  propsSchema: S;
  defaultProps: z.infer<S>;
}): Widget<z.infer<S>> {
  // Validate manifest eagerly so malformed authoring surfaces at import time.
  WidgetManifestSchema.parse(args.manifest);
  // Validate default props against the schema.
  args.propsSchema.parse(args.defaultProps);

  return {
    manifest: args.manifest,
    // Cast: `S extends z.ZodType<Record<string, unknown>>` does not
    // structurally narrow to `z.ZodType<z.infer<S>>` for TS, even though
    // it is true by Zod's own inference. Route through `unknown` so
    // consumers see the inferred prop type on the returned Widget.
    propsSchema: args.propsSchema as unknown as z.ZodType<z.infer<S>>,
    defaultProps: args.defaultProps,
  };
}

/**
 * Bind a widget to its concrete renderer. Use in consumer packages
 * (e.g. the client package) where the Component type is known.
 *
 * ```ts
 * import type { ComponentType } from "react";
 * import { registerWidget } from "@hyperforge/ui-framework";
 *
 * const reactHpBar = registerWidget<ComponentType<HPBarProps>>(hpBarWidget, HPBarComponent);
 * ```
 */
export function registerWidget<C>(
  widget: Widget<Record<string, unknown>>,
  Component: C,
): WidgetRegistration<Record<string, unknown>, C> {
  return { widget, Component };
}
