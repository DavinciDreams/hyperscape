/**
 * ManifestRenderer — renders a UILayoutManifest using the bound
 * `uiRegistry`, resolving each widget's props through the
 * runtime-bindings layer before handing them to the React component.
 *
 * Positioning:
 *   - `anchored` instances are absolutely positioned within a
 *     full-viewport overlay, anchored to one of the 9 documented
 *     corners/edges with a pixel offset (matches the editor preview).
 *   - `grid` / `flex` positions are not rendered yet — the editor
 *     preview demonstrates their intended behavior, but the live HUD
 *     only needs `anchored` for the current builtin set.
 *
 * The overlay itself is pointer-events: none so widgets don't block
 * game input; individual widget adapters opt back in via their own
 * styles when they need interaction (inventory, chat, tooltip).
 */

import { memo, useMemo, type CSSProperties, type ReactElement } from "react";
import {
  isWidgetVisible,
  resolveWidgetProps,
  themeToCssVars,
  type DataContext,
  type PropResolutionIssue,
  type ThemeManifest,
  type UILayoutManifest,
  type WidgetInstance,
} from "@hyperforge/ui-framework";
import { uiRegistry } from "./bindings";
import { MovableWidgetShell } from "./MovableWidgetShell";

export interface ManifestRendererProps {
  /** Layout manifest to render. */
  layout: UILayoutManifest;
  /** Runtime context consulted when resolving `bindings` on each instance. */
  dataContext: DataContext;
  /**
   * Optional theme resolver — called once per render when the layout
   * declares `themeId` (but no inline `theme`). Returning `null`
   * falls back to the host's default styles. Inline `layout.theme`
   * always wins over this lookup.
   */
  resolveTheme?: (themeId: string) => ThemeManifest | null;
  /**
   * Current game-mode context string. Matched against each instance's
   * `visibility.contexts` / `visibility.hiddenIn`. Pass `null` when no
   * context is modelled — expression-only visibility rules still work.
   * Common values: `"world"`, `"combat"`, `"menu"`, `"cutscene"`,
   * `"loading"`.
   */
  gameContext?: string | null;
  /**
   * Optional sink for non-fatal resolution issues (binding-failed,
   * invalid-expression, props-validation-failed). Fires once per
   * render per instance that has any issues. Defaults to a no-op so
   * production renders are silent; the editor passes a collector.
   */
  onIssues?: (instanceId: string, issues: PropResolutionIssue[]) => void;
}

/**
 * Map an anchor name + pixel offset to a `CSSProperties` fragment
 * that pins the widget to the correct viewport edge.
 *
 * Anchors use the same axis convention as the editor preview:
 *   - positive X is always "further from the anchored side"
 *   - positive Y is always "further from the anchored side"
 *
 * So `{ anchor: "bottom-left", offset: { x: 24, y: -24 } }` reads as
 * "24px right of the left edge, 24px up from the bottom". Negative
 * offsets mirror the editor's screen-space semantics.
 */
function anchorStyle(
  anchor:
    | "top-left"
    | "top-center"
    | "top-right"
    | "middle-left"
    | "center"
    | "middle-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right",
  offset: { x: number; y: number },
): CSSProperties {
  const style: CSSProperties = { position: "absolute" };
  const { x, y } = offset;

  // Vertical
  if (anchor.startsWith("top")) {
    style.top = y;
  } else if (anchor.startsWith("bottom")) {
    style.bottom = -y;
  } else {
    style.top = "50%";
    style.transform = "translateY(-50%)";
  }

  // Horizontal
  if (anchor.endsWith("left")) {
    style.left = x;
  } else if (anchor.endsWith("right")) {
    style.right = -x;
  } else {
    style.left = "50%";
    const existing = style.transform;
    style.transform = existing
      ? `${existing} translateX(-50%)`
      : "translateX(-50%)";
  }

  return style;
}

interface InstanceViewProps {
  instance: WidgetInstance;
  dataContext: DataContext;
  layoutId: string;
  layoutRevision: number | undefined;
  onIssues?: (instanceId: string, issues: PropResolutionIssue[]) => void;
}

function InstanceView({
  instance,
  dataContext,
  layoutId,
  layoutRevision,
  onIssues,
}: InstanceViewProps): ReactElement | null {
  const widget = uiRegistry.getWidget(instance.widgetId);
  if (!widget) {
    // Validation should have caught this upstream; rendering nothing
    // here rather than throwing keeps the HUD resilient to late
    // manifest changes.
    return null;
  }

  const Component = uiRegistry.getComponent(instance.widgetId);
  const resolved = resolveWidgetProps(
    instance.props,
    instance.bindings,
    widget.propsSchema,
    dataContext,
  );

  if (resolved.issues.length > 0 && onIssues) {
    onIssues(instance.instanceId, resolved.issues);
  }

  if (!resolved.ok) {
    // Drop the instance if the merged props don't satisfy the schema
    // — surfacing it via onIssues is enough.
    return null;
  }

  // Only `anchored` positions are rendered in the live HUD so far.
  // Grid and flex come when the editor's layout canvas is flipped to
  // match (tracked in the D6 exit criterion).
  if (instance.position.kind !== "anchored") return null;

  const style = anchorStyle(instance.position.anchor, instance.position.offset);

  return (
    <MovableWidgetShell
      instanceId={instance.instanceId}
      layoutId={layoutId}
      layoutRevision={layoutRevision}
      position={instance.position}
      customization={instance.customization}
      anchorStyle={style}
    >
      <div data-widget-id={instance.widgetId} style={{ pointerEvents: "auto" }}>
        <Component {...resolved.props} />
      </div>
    </MovableWidgetShell>
  );
}

/**
 * Top-level renderer: wraps all instances in a fixed-position
 * overlay. The overlay is pointer-events:none so the manifest layer
 * is non-blocking; individual widgets opt back into pointer events
 * via their own styles.
 */
export const ManifestRenderer = memo(function ManifestRenderer({
  layout,
  dataContext,
  gameContext = null,
  resolveTheme,
  onIssues,
}: ManifestRendererProps) {
  const visibleInstances = useMemo(
    () =>
      layout.instances.filter((inst) =>
        isWidgetVisible({
          instance: inst,
          gameContext,
          data: dataContext,
        }),
      ),
    [layout, gameContext, dataContext],
  );

  // Resolve the scoped theme: inline wins, then themeId lookup, then
  // nothing (inherit host defaults). `themeToCssVars` returns a flat
  // `{ --var: value }` map that spreads directly onto the overlay's
  // inline style, scoping the tokens to the HUD subtree instead of
  // polluting :root.
  const themeVars = useMemo<Record<string, string>>(() => {
    const inline = layout.theme;
    if (inline) return themeToCssVars(inline);
    const id = layout.themeId;
    if (id && resolveTheme) {
      const resolved = resolveTheme(id);
      if (resolved) return themeToCssVars(resolved);
    }
    return {};
  }, [layout.theme, layout.themeId, resolveTheme]);

  return (
    <div
      data-layout-id={layout.id}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10,
        ...(themeVars as CSSProperties),
      }}
    >
      {visibleInstances.map((instance) => (
        <InstanceView
          key={instance.instanceId}
          instance={instance}
          dataContext={dataContext}
          layoutId={layout.id}
          layoutRevision={layout.revision}
          onIssues={onIssues}
        />
      ))}
    </div>
  );
});
