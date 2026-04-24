/**
 * Pure column-width state for the Plugin Browser list pane. Users
 * drag the column divider to resize columns; this module stores
 * the widths, clamps them to per-column min/max, and exposes the
 * current width for any column id.
 *
 * Separated from {@link PluginBrowserColumnVisibility} because the
 * concerns are orthogonal — you can hide a wide column and
 * unhiding it should restore the user-chosen width, not reset it.
 *
 * Each column defines a *default* + an optional *min* and *max*.
 * Set widths are clamped on the way in. Unknown ids are silently
 * ignored (survives column-set evolution).
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws.
 */

export interface PluginBrowserColumnWidthDefinition {
  readonly id: string;
  /** Default pixel width. Clamped to `[minPx, maxPx]`. */
  readonly defaultPx: number;
  /** Minimum pixel width. Defaults to 40. */
  readonly minPx?: number;
  /** Maximum pixel width. Defaults to 1000. */
  readonly maxPx?: number;
}

export interface PluginBrowserColumnWidthSnapshot {
  readonly id: string;
  readonly widthPx: number;
  readonly isDefault: boolean;
  readonly minPx: number;
  readonly maxPx: number;
}

export interface PluginBrowserColumnWidths {
  /** Count of columns ever declared. */
  size(): number;
  /** True when the column `id` exists. */
  hasColumn(id: string): boolean;
  /**
   * Current width for a column. Returns the default-if-unset, or
   * 0 for an unknown id.
   */
  widthOf(id: string): number;
  /**
   * Set a user-chosen width. Value is clamped to `[minPx, maxPx]`
   * and floored to an integer. Unknown ids are silent no-ops.
   */
  setWidth(id: string, widthPx: number): void;
  /** Reset one column to its default width. Unknown ids no-op. */
  resetColumn(id: string): void;
  /** Reset every column to its default. */
  resetAll(): void;
  /**
   * Snapshot per column, suitable for persistence. Order matches
   * the authored definition order.
   */
  snapshot(): readonly PluginBrowserColumnWidthSnapshot[];
  /** Total pixel width summed across every known column. */
  totalWidthPx(): number;
  /** Total pixel width summed across only the listed column ids. */
  totalWidthForPx(ids: readonly string[]): number;
}

const DEFAULT_MIN_PX = 40;
const DEFAULT_MAX_PX = 1000;

/**
 * Create a caller-owned column-width manager from an authored
 * definition list. Definition order becomes the snapshot order.
 */
export function createPluginBrowserColumnWidths(
  columns: readonly PluginBrowserColumnWidthDefinition[],
): PluginBrowserColumnWidths {
  interface Entry {
    readonly id: string;
    readonly minPx: number;
    readonly maxPx: number;
    readonly defaultPx: number;
    widthPx: number;
  }

  const byId = new Map<string, Entry>();
  const order: string[] = [];

  for (const c of columns) {
    if (byId.has(c.id)) continue; // dedupe — first wins
    const minPx = Math.max(1, Math.floor(c.minPx ?? DEFAULT_MIN_PX));
    const maxPxRaw = Math.floor(c.maxPx ?? DEFAULT_MAX_PX);
    const maxPx = Math.max(minPx, maxPxRaw);
    const defaultPx = clamp(Math.floor(c.defaultPx), minPx, maxPx);
    byId.set(c.id, {
      id: c.id,
      minPx,
      maxPx,
      defaultPx,
      widthPx: defaultPx,
    });
    order.push(c.id);
  }

  return {
    size(): number {
      return order.length;
    },
    hasColumn(id: string): boolean {
      return byId.has(id);
    },
    widthOf(id: string): number {
      return byId.get(id)?.widthPx ?? 0;
    },
    setWidth(id: string, widthPx: number): void {
      const e = byId.get(id);
      if (!e) return;
      if (!Number.isFinite(widthPx)) return;
      e.widthPx = clamp(Math.floor(widthPx), e.minPx, e.maxPx);
    },
    resetColumn(id: string): void {
      const e = byId.get(id);
      if (!e) return;
      e.widthPx = e.defaultPx;
    },
    resetAll(): void {
      for (const id of order) {
        const e = byId.get(id)!;
        e.widthPx = e.defaultPx;
      }
    },
    snapshot(): readonly PluginBrowserColumnWidthSnapshot[] {
      return order.map((id) => {
        const e = byId.get(id)!;
        return {
          id: e.id,
          widthPx: e.widthPx,
          isDefault: e.widthPx === e.defaultPx,
          minPx: e.minPx,
          maxPx: e.maxPx,
        };
      });
    },
    totalWidthPx(): number {
      let sum = 0;
      for (const id of order) sum += byId.get(id)!.widthPx;
      return sum;
    },
    totalWidthForPx(ids: readonly string[]): number {
      let sum = 0;
      for (const id of ids) {
        const e = byId.get(id);
        if (e) sum += e.widthPx;
      }
      return sum;
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
