/**
 * Pure active-tab state for the Plugin Browser details pane
 * (the right-hand panel that shows the currently-focused plugin).
 *
 * Drives which sub-view is rendered: Overview / Contributions /
 * Health / Changelog / etc. The list of available tabs is
 * caller-supplied so plugin authors can contribute additional
 * tabs without hard-coding a union here.
 *
 * Orthogonal to:
 * - {@link PluginBrowserViewMode}        — list-pane layout shape.
 * - {@link PluginBrowserDetailsViewModel} — per-plugin data.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are silent no-ops. Invalid initial
 * ids fall back to the first authored tab.
 */

export interface PluginBrowserDetailsTabDefinition {
  /** Stable tab id — appears in persisted state + URL deep-links. */
  readonly id: string;
}

export interface PluginBrowserDetailsTabOptions {
  /**
   * Authored tabs, in preferred left-to-right order. Must be
   * non-empty; duplicates silently deduped (first wins); empty
   * ids dropped.
   *
   * Throws if, after filtering, no tabs remain.
   */
  readonly tabs: readonly PluginBrowserDetailsTabDefinition[];
  /**
   * Initial active tab. Unknown values fall back to the first
   * authored tab.
   */
  readonly initialActiveId?: string;
}

export interface PluginBrowserDetailsTab {
  /** Known tab ids in authored order. */
  tabIds(): readonly string[];
  /** Number of authored tabs. */
  tabCount(): number;
  /** Current active tab id. */
  activeId(): string;
  /** Current active tab index. */
  activeIndex(): number;
  /**
   * Switch to `id`. Unknown / empty values are silent no-ops.
   * Returns true when the active tab changed.
   */
  setActive(id: string): boolean;
  /** Cycle one slot forward (wraps past the end). */
  next(): void;
  /** Cycle one slot backward (wraps past the start). */
  previous(): void;
  /** Reset to the first authored tab. */
  reset(): void;
  /** True when `id` is a known tab. */
  isKnown(id: string): boolean;
}

function dedupeTabs(
  tabs: readonly PluginBrowserDetailsTabDefinition[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tabs) {
    if (typeof t.id !== "string" || t.id.length === 0 || seen.has(t.id)) {
      continue;
    }
    seen.add(t.id);
    out.push(t.id);
  }
  return out;
}

/**
 * Raised when `options.tabs` filters down to an empty list — a
 * details pane with zero tabs is not a valid state.
 */
export class NoPluginBrowserDetailsTabsError extends Error {
  constructor() {
    super("createPluginBrowserDetailsTab: at least one valid tab is required");
    this.name = "NoPluginBrowserDetailsTabsError";
  }
}

/**
 * Create a caller-owned details-tab state machine.
 */
export function createPluginBrowserDetailsTab(
  options: PluginBrowserDetailsTabOptions,
): PluginBrowserDetailsTab {
  const tabs = dedupeTabs(options.tabs);
  if (tabs.length === 0) {
    throw new NoPluginBrowserDetailsTabsError();
  }
  const defaultId = tabs[0]!;
  let current: string =
    options.initialActiveId !== undefined &&
    typeof options.initialActiveId === "string" &&
    options.initialActiveId.length > 0 &&
    tabs.includes(options.initialActiveId)
      ? options.initialActiveId
      : defaultId;

  function indexOfCurrent(): number {
    return tabs.indexOf(current);
  }

  return {
    tabIds(): readonly string[] {
      return [...tabs];
    },
    tabCount(): number {
      return tabs.length;
    },
    activeId(): string {
      return current;
    },
    activeIndex(): number {
      return indexOfCurrent();
    },
    setActive(id: string): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      if (!tabs.includes(id)) return false;
      if (id === current) return false;
      current = id;
      return true;
    },
    next(): void {
      const i = indexOfCurrent();
      current = tabs[(i + 1) % tabs.length]!;
    },
    previous(): void {
      const i = indexOfCurrent();
      current = tabs[(i - 1 + tabs.length) % tabs.length]!;
    },
    reset(): void {
      current = defaultId;
    },
    isKnown(id: string): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      return tabs.includes(id);
    },
  };
}
