/**
 * Pure per-column pin-side state for the Plugin Browser list
 * pane. Columns can be pinned to the `left` or `right` edge of
 * the viewport (sticky during horizontal scroll) or left
 * `none` (flows with the grid).
 *
 * Orthogonal to {@link PluginBrowserColumnVisibility} and
 * {@link PluginBrowserColumnWidths} — pinning a hidden column
 * is still recorded (unhiding restores pinned placement).
 *
 * The authored column order is preserved *within* each pin
 * group. Overall render order is always:
 *   [left-pinned in authored order] +
 *   [unpinned in authored order] +
 *   [right-pinned in authored order]
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown ids are silent no-ops — persisted pin state
 * survives column-set evolution.
 */

export type PluginBrowserColumnPinSide = "left" | "right" | "none";

export interface PluginBrowserColumnPinDefinition {
  readonly id: string;
  /** Initial pin side. Defaults to `"none"`. */
  readonly defaultPin?: PluginBrowserColumnPinSide;
}

export interface PluginBrowserColumnPinSnapshot {
  readonly id: string;
  readonly side: PluginBrowserColumnPinSide;
  readonly isDefault: boolean;
}

export interface PluginBrowserColumnPinning {
  /** Count of columns ever declared. */
  size(): number;
  /** True when the column `id` exists. */
  hasColumn(id: string): boolean;
  /** Pin side for a column, or `"none"` for an unknown id. */
  pinOf(id: string): PluginBrowserColumnPinSide;
  /**
   * Set the pin side for a column. Unknown ids are silent
   * no-ops.
   */
  setPin(id: string, side: PluginBrowserColumnPinSide): void;
  /** Shorthand for `setPin(id, "none")`. */
  unpin(id: string): void;
  /**
   * If the column is already pinned to `side`, unpin it;
   * otherwise pin it to `side`. Passing `"none"` is a no-op.
   */
  togglePin(id: string, side: "left" | "right"): void;
  /** Reset one column to its default pin. Unknown ids no-op. */
  resetColumn(id: string): void;
  /** Reset every column to its default pin. */
  resetAll(): void;
  /** Column ids pinned to the left, in authored order. */
  pinnedLeft(): readonly string[];
  /** Column ids pinned to the right, in authored order. */
  pinnedRight(): readonly string[];
  /** Column ids with `side === "none"`, in authored order. */
  unpinned(): readonly string[];
  /**
   * Final render order: left-pinned + unpinned + right-pinned,
   * preserving authored order within each group.
   */
  orderedIds(): readonly string[];
  /**
   * Snapshot per column, suitable for persistence. Order
   * matches the authored definition order (NOT the render
   * order — use {@link orderedIds} for that).
   */
  snapshot(): readonly PluginBrowserColumnPinSnapshot[];
}

function isPinSide(v: unknown): v is PluginBrowserColumnPinSide {
  return v === "left" || v === "right" || v === "none";
}

/**
 * Create a caller-owned pin manager from an authored column
 * list. Authored order is preserved inside each pin group.
 */
export function createPluginBrowserColumnPinning(
  columns: readonly PluginBrowserColumnPinDefinition[],
): PluginBrowserColumnPinning {
  interface Entry {
    readonly id: string;
    readonly defaultSide: PluginBrowserColumnPinSide;
    side: PluginBrowserColumnPinSide;
  }

  const byId = new Map<string, Entry>();
  const order: string[] = [];

  for (const c of columns) {
    if (byId.has(c.id)) continue; // dedupe — first wins
    const defaultSide: PluginBrowserColumnPinSide = isPinSide(c.defaultPin)
      ? c.defaultPin
      : "none";
    byId.set(c.id, { id: c.id, defaultSide, side: defaultSide });
    order.push(c.id);
  }

  function idsForSide(side: PluginBrowserColumnPinSide): readonly string[] {
    const out: string[] = [];
    for (const id of order) {
      if (byId.get(id)!.side === side) out.push(id);
    }
    return out;
  }

  return {
    size(): number {
      return order.length;
    },
    hasColumn(id: string): boolean {
      return byId.has(id);
    },
    pinOf(id: string): PluginBrowserColumnPinSide {
      return byId.get(id)?.side ?? "none";
    },
    setPin(id: string, side: PluginBrowserColumnPinSide): void {
      const e = byId.get(id);
      if (!e) return;
      if (!isPinSide(side)) return;
      e.side = side;
    },
    unpin(id: string): void {
      const e = byId.get(id);
      if (!e) return;
      e.side = "none";
    },
    togglePin(id: string, side: "left" | "right"): void {
      const e = byId.get(id);
      if (!e) return;
      if (side !== "left" && side !== "right") return;
      e.side = e.side === side ? "none" : side;
    },
    resetColumn(id: string): void {
      const e = byId.get(id);
      if (!e) return;
      e.side = e.defaultSide;
    },
    resetAll(): void {
      for (const id of order) {
        const e = byId.get(id)!;
        e.side = e.defaultSide;
      }
    },
    pinnedLeft(): readonly string[] {
      return idsForSide("left");
    },
    pinnedRight(): readonly string[] {
      return idsForSide("right");
    },
    unpinned(): readonly string[] {
      return idsForSide("none");
    },
    orderedIds(): readonly string[] {
      return [
        ...idsForSide("left"),
        ...idsForSide("none"),
        ...idsForSide("right"),
      ];
    },
    snapshot(): readonly PluginBrowserColumnPinSnapshot[] {
      return order.map((id) => {
        const e = byId.get(id)!;
        return {
          id: e.id,
          side: e.side,
          isDefault: e.side === e.defaultSide,
        };
      });
    },
  };
}
