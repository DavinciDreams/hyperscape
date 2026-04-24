/**
 * ui-framework bindings — thin facade over `@hyperforge/ui-widgets`.
 *
 * The widget implementations live in the shared `@hyperforge/ui-widgets`
 * package so the World Studio UI Layout Editor preview can render the
 * exact same components the live game HUD uses. This module wires up
 * the client's single process-wide registry and an `ItemIcon` adapter
 * backed by the client's production `ItemIcon` component.
 */

import {
  ItemIconProvider,
  bindAllWidgets as bindAllWidgetsImpl,
  createUIWidgetRegistry,
  type ItemIconRenderProps,
  type ItemIconRenderer,
  type UIWidgetComponent,
} from "@hyperforge/ui-widgets";
import { useMemo, type ReactNode } from "react";

import { ItemIcon as ClientItemIcon } from "@/ui/components/ItemIcon";

export type { UIWidgetComponent };

/**
 * The single, process-wide registry the client uses to render
 * manifest-driven UI. Preloaded with every builtin widget schema.
 * Components are bound in `bindAllWidgets()`.
 */
export const uiRegistry = createUIWidgetRegistry();

/**
 * Bind every widget id we can currently render. Call once during
 * client bootstrap *before* any manifest-driven UI mounts.
 *
 * Unbound widgets will throw on first render, which is intentional —
 * that's how we keep the migration honest rather than silently
 * degrading.
 */
export function bindAllWidgets(): void {
  bindAllWidgetsImpl(uiRegistry);
}

/** Has a component been bound for every builtin widget? */
export function allBuiltinsBound(): boolean {
  // `bindAllWidgetsImpl` is idempotent so we can always rebind; check
  // one known id as a representative sentinel.
  return uiRegistry.hasComponent("hyperforge.hud.hp-bar");
}

/**
 * Concrete ItemIcon adapter that proxies to the client's production
 * icon component. The adapter keeps the widget package independent of
 * `@hyperforge/shared`'s item manifest lookup.
 */
const ClientItemIconAdapter: ItemIconRenderer = function ClientItemIconAdapter(
  props: ItemIconRenderProps,
) {
  return <ClientItemIcon {...props} />;
};

/**
 * Wraps `children` in the ItemIcon provider so every inventory /
 * equipment / bank widget rendered inside it draws real iconPath-based
 * images instead of the default text-chip fallback.
 */
export function ClientUIWidgetProvider({ children }: { children: ReactNode }) {
  const render = useMemo(() => ClientItemIconAdapter, []);
  return <ItemIconProvider render={render}>{children}</ItemIconProvider>;
}
