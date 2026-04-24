/**
 * WidgetContributionPlugin (I4 reference).
 *
 * Fourth reference plugin over `PluginContributionRegistry<TItem>`,
 * covering the HUD widget surface. Together with Palette, Toolbar,
 * and Commands, this closes the "four quadrants" argument: the
 * generic substrate handles every editor/runtime contribution surface
 * with identical lifecycle code.
 *
 * Widgets differ from the other surfaces in one way: they carry
 * layout metadata (HUD anchor + z-order) that the renderer needs
 * independent of registration. We keep validation light — checking
 * anchor enum and non-negative z-order — to reinforce that substrate
 * policy belongs in the plugin, not the registry.
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

export type HudAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface HudWidget {
  readonly id: string;
  readonly label: string;
  readonly anchor: HudAnchor;
  /** Rendering order within the anchor bucket. Higher = on top. */
  readonly zOrder: number;
}

export interface WidgetContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly widgets: PluginContributionRegistry<HudWidget>;
}

const VALID_ANCHORS: ReadonlySet<HudAnchor> = new Set<HudAnchor>([
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export class InvalidWidgetAnchorError extends Error {
  readonly widgetId: string;
  readonly anchor: string;

  constructor(widgetId: string, anchor: string) {
    super(
      `Widget "${widgetId}" has invalid anchor "${anchor}" (allowed: ${[...VALID_ANCHORS].join(", ")})`,
    );
    this.name = "InvalidWidgetAnchorError";
    this.widgetId = widgetId;
    this.anchor = anchor;
  }
}

export class InvalidWidgetZOrderError extends Error {
  readonly widgetId: string;
  readonly zOrder: number;

  constructor(widgetId: string, zOrder: number) {
    super(
      `Widget "${widgetId}" has invalid zOrder ${zOrder} (must be a finite non-negative number)`,
    );
    this.name = "InvalidWidgetZOrderError";
    this.widgetId = widgetId;
    this.zOrder = zOrder;
  }
}

function validateWidget(w: HudWidget): void {
  if (!VALID_ANCHORS.has(w.anchor)) {
    throw new InvalidWidgetAnchorError(w.id, w.anchor);
  }
  if (!Number.isFinite(w.zOrder) || w.zOrder < 0) {
    throw new InvalidWidgetZOrderError(w.id, w.zOrder);
  }
}

export function widgetContributionPlugin(
  widgets: readonly HudWidget[],
): HyperforgePlugin<WidgetContributionContext> {
  return {
    onEnable(ctx) {
      for (const w of widgets) validateWidget(w);
      ctx.widgets.registerAll(ctx.pluginId, widgets);
      ctx.scope.register(() =>
        ctx.widgets.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
