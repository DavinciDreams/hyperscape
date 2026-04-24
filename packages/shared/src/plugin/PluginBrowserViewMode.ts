/**
 * Pure view-mode toggle for the Plugin Browser list pane.
 * Switches the layout *shape* between list rows, an icon
 * grid, and richer content cards. Orthogonal to
 * {@link PluginBrowserRowDensity}, which tunes vertical
 * spacing *within* a chosen mode.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 *
 * Metrics are the minimal numbers the view layer needs to
 * decide grid-template / item-width without recomputing them
 * per frame. The React layer reads metrics for inline styles.
 */

export type PluginBrowserViewModeId = "list" | "grid" | "cards";

export interface PluginBrowserViewModeMetrics {
  /**
   * Height of a single item row in the list view, or of a
   * grid/card cell in the grid/card views.
   */
  readonly itemHeightPx: number;
  /**
   * Preferred item width. `"fill"` means the item spans
   * the container's content width (list mode).
   */
  readonly itemWidthPx: number | "fill";
  /**
   * Preferred minimum count of items per wrapped row. For
   * the list mode this is always 1.
   */
  readonly minItemsPerRow: number;
  /** Pixel gap between items in a wrapped row. */
  readonly gapPx: number;
  /**
   * Whether each item renders rich metadata (cards) or
   * just the identity column (list/grid).
   */
  readonly showRichMetadata: boolean;
}

export const PLUGIN_BROWSER_VIEW_MODE_METRICS: Readonly<
  Record<PluginBrowserViewModeId, PluginBrowserViewModeMetrics>
> = Object.freeze({
  list: Object.freeze({
    itemHeightPx: 32,
    itemWidthPx: "fill" as const,
    minItemsPerRow: 1,
    gapPx: 0,
    showRichMetadata: false,
  }),
  grid: Object.freeze({
    itemHeightPx: 96,
    itemWidthPx: 96,
    minItemsPerRow: 4,
    gapPx: 8,
    showRichMetadata: false,
  }),
  cards: Object.freeze({
    itemHeightPx: 160,
    itemWidthPx: 240,
    minItemsPerRow: 2,
    gapPx: 12,
    showRichMetadata: true,
  }),
});

export const DEFAULT_PLUGIN_BROWSER_VIEW_MODE: PluginBrowserViewModeId = "list";

const ORDERED_MODES: readonly PluginBrowserViewModeId[] = [
  "list",
  "grid",
  "cards",
];

function isViewMode(v: unknown): v is PluginBrowserViewModeId {
  return v === "list" || v === "grid" || v === "cards";
}

export interface PluginBrowserViewModeOptions {
  /**
   * Initial mode. Unknown values fall back to the canonical
   * default.
   */
  readonly initialMode?: PluginBrowserViewModeId;
}

export interface PluginBrowserViewMode {
  /** Current mode. */
  mode(): PluginBrowserViewModeId;
  /** Canonical metrics for the current mode. */
  metrics(): PluginBrowserViewModeMetrics;
  /**
   * Switch mode. Unknown values are silent no-ops (so stale
   * persisted state survives gracefully).
   */
  setMode(mode: PluginBrowserViewModeId): void;
  /** Cycle list → grid → cards → list. */
  cycle(): void;
  /** Reset to the canonical default. */
  reset(): void;
}

/**
 * Create a caller-owned view-mode toggle.
 */
export function createPluginBrowserViewMode(
  options: PluginBrowserViewModeOptions = {},
): PluginBrowserViewMode {
  let current: PluginBrowserViewModeId = isViewMode(options.initialMode)
    ? options.initialMode
    : DEFAULT_PLUGIN_BROWSER_VIEW_MODE;

  return {
    mode(): PluginBrowserViewModeId {
      return current;
    },
    metrics(): PluginBrowserViewModeMetrics {
      return PLUGIN_BROWSER_VIEW_MODE_METRICS[current];
    },
    setMode(mode: PluginBrowserViewModeId): void {
      if (!isViewMode(mode)) return;
      current = mode;
    },
    cycle(): void {
      const i = ORDERED_MODES.indexOf(current);
      const next = ORDERED_MODES[(i + 1) % ORDERED_MODES.length];
      current = next;
    },
    reset(): void {
      current = DEFAULT_PLUGIN_BROWSER_VIEW_MODE;
    },
  };
}
