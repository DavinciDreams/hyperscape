/**
 * ToolbarToolContributionPlugin (I4 reference).
 *
 * Second reference plugin over `PluginContributionRegistry<TItem>`.
 * Mirrors the shape of `PaletteContributionPlugin` to prove the
 * generic substrate is surface-agnostic — palette categories and
 * toolbar tools end up with identical lifecycle code, only the
 * item type and registry instance differ.
 *
 * Intentionally trivial — the goal is to demonstrate the registration
 * + LIFO-disposer teardown pattern for any editor-contribution
 * surface (toolbar, widgets, palette, commands, etc.). Real plugins
 * using this pattern just swap in their own `TItem`.
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

/**
 * Minimal toolbar-tool descriptor. Real editor toolbars bind these
 * to click handlers + keyboard shortcuts; the reference plugin only
 * cares about registration bookkeeping.
 */
export interface ToolbarTool {
  readonly id: string;
  readonly label: string;
  /** Icon identifier (lookup key into the icon set, not a URL). */
  readonly iconId: string;
  /** Grouping bucket within the toolbar, e.g. "edit", "view". */
  readonly group: string;
}

export interface ToolbarToolContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly toolbarTools: PluginContributionRegistry<ToolbarTool>;
}

export function toolbarToolContributionPlugin(
  tools: readonly ToolbarTool[],
): HyperforgePlugin<ToolbarToolContributionContext> {
  return {
    onEnable(ctx) {
      ctx.toolbarTools.registerAll(ctx.pluginId, tools);
      ctx.scope.register(() =>
        ctx.toolbarTools.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
