/**
 * Row-density preference for the Plugin Browser list pane.
 * Mirrors the common three-mode toggle seen in IDE file trees,
 * database clients, and Outlook ("Comfortable | Cozy | Compact").
 *
 * This module owns only the **preference value + the layout
 * numbers it implies**. It does not render anything and it does
 * not persist anything — callers decide when to serialize and
 * where to serialize to (local storage, editor settings file,
 * cloud profile).
 *
 * Why separate numbers from the preference: unit tests can assert
 * the exact pixel values the mode implies without reaching into
 * CSS; the React pane just reads `metrics.rowHeightPx` and
 * `metrics.fontSizePx` to set inline styles.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 */

export type PluginBrowserRowDensityMode = "compact" | "cozy" | "comfortable";

/** Pixel + font measurements a given density implies. */
export interface PluginBrowserRowDensityMetrics {
  readonly rowHeightPx: number;
  readonly rowPaddingYPx: number;
  readonly fontSizePx: number;
  readonly iconSizePx: number;
  readonly cellPaddingXPx: number;
}

export interface PluginBrowserRowDensity {
  /** Current mode. */
  mode(): PluginBrowserRowDensityMode;
  /** Numbers implied by the current mode. */
  metrics(): PluginBrowserRowDensityMetrics;
  /** Set a mode. Unknown values are silently ignored. */
  setMode(mode: PluginBrowserRowDensityMode): void;
  /** Cycle through modes in order: compact → cozy → comfortable → compact. */
  cycle(): void;
  /** Reset to the default (cozy). */
  reset(): void;
}

/** Default when no preference has been set. */
export const DEFAULT_PLUGIN_BROWSER_DENSITY: PluginBrowserRowDensityMode =
  "cozy";

/** Canonical metrics per mode. Exported so tests + theme tokens can reference. */
export const PLUGIN_BROWSER_DENSITY_METRICS: Readonly<
  Record<PluginBrowserRowDensityMode, PluginBrowserRowDensityMetrics>
> = Object.freeze({
  compact: Object.freeze({
    rowHeightPx: 22,
    rowPaddingYPx: 2,
    fontSizePx: 11,
    iconSizePx: 12,
    cellPaddingXPx: 6,
  }),
  cozy: Object.freeze({
    rowHeightPx: 28,
    rowPaddingYPx: 4,
    fontSizePx: 13,
    iconSizePx: 14,
    cellPaddingXPx: 8,
  }),
  comfortable: Object.freeze({
    rowHeightPx: 36,
    rowPaddingYPx: 8,
    fontSizePx: 14,
    iconSizePx: 16,
    cellPaddingXPx: 12,
  }),
});

const VALID_MODES: ReadonlySet<PluginBrowserRowDensityMode> = new Set([
  "compact",
  "cozy",
  "comfortable",
]);

const CYCLE_ORDER: readonly PluginBrowserRowDensityMode[] = Object.freeze([
  "compact",
  "cozy",
  "comfortable",
]);

export interface CreatePluginBrowserRowDensityOptions {
  readonly initialMode?: PluginBrowserRowDensityMode;
}

/**
 * Create a caller-owned density manager. `initialMode` defaults to
 * `DEFAULT_PLUGIN_BROWSER_DENSITY`. Unknown `initialMode` values
 * are silently replaced by the default so persisted state from an
 * older schema doesn't break the editor.
 */
export function createPluginBrowserRowDensity(
  options: CreatePluginBrowserRowDensityOptions = {},
): PluginBrowserRowDensity {
  const initial =
    options.initialMode !== undefined && VALID_MODES.has(options.initialMode)
      ? options.initialMode
      : DEFAULT_PLUGIN_BROWSER_DENSITY;

  let current: PluginBrowserRowDensityMode = initial;

  return {
    mode(): PluginBrowserRowDensityMode {
      return current;
    },
    metrics(): PluginBrowserRowDensityMetrics {
      return PLUGIN_BROWSER_DENSITY_METRICS[current];
    },
    setMode(mode: PluginBrowserRowDensityMode): void {
      if (!VALID_MODES.has(mode)) return;
      current = mode;
    },
    cycle(): void {
      const idx = CYCLE_ORDER.indexOf(current);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      current = next;
    },
    reset(): void {
      current = DEFAULT_PLUGIN_BROWSER_DENSITY;
    },
  };
}
