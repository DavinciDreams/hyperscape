/**
 * Pure context-menu target state for the Plugin Browser. Tracks
 * *what* the user right-clicked so the caller-owned menu
 * renderer knows which commands to show.
 *
 * Four surface kinds the user can right-click:
 * - `row`      — a plugin list row (carries `pluginId`).
 * - `header`   — a column header (carries `columnId`).
 * - `blank`    — empty space inside the list pane.
 * - `sidebar`  — a sidebar section (carries `sectionId`).
 *
 * At any moment the menu is either:
 * - closed (no target), or
 * - open at some viewport coordinate with exactly one target.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids, non-finite coordinates, or
 * invalid targets during `open()` leave the menu closed.
 */

export type PluginBrowserContextMenuTarget =
  | { readonly kind: "row"; readonly pluginId: string }
  | { readonly kind: "header"; readonly columnId: string }
  | { readonly kind: "blank" }
  | { readonly kind: "sidebar"; readonly sectionId: string };

export interface PluginBrowserContextMenuPosition {
  readonly xPx: number;
  readonly yPx: number;
}

export interface PluginBrowserContextMenuSnapshot {
  readonly isOpen: boolean;
  readonly target: PluginBrowserContextMenuTarget | undefined;
  readonly position: PluginBrowserContextMenuPosition | undefined;
}

export interface PluginBrowserContextMenu {
  /** True when the menu is open. */
  isOpen(): boolean;
  /** Current target, or `undefined` when closed. */
  target(): PluginBrowserContextMenuTarget | undefined;
  /** Current viewport position, or `undefined` when closed. */
  position(): PluginBrowserContextMenuPosition | undefined;
  /**
   * Open the menu at `position` with the given `target`.
   * Invalid targets / coordinates close the menu (no-op if
   * already closed). Returns true when the menu ends up open.
   */
  open(
    target: PluginBrowserContextMenuTarget,
    position: PluginBrowserContextMenuPosition,
  ): boolean;
  /**
   * Close the menu. Returns true when a change occurred
   * (false when already closed).
   */
  close(): boolean;
  /** Snapshot of the current state. */
  snapshot(): PluginBrowserContextMenuSnapshot;
}

function isValidTarget(
  t: PluginBrowserContextMenuTarget | null | undefined,
): t is PluginBrowserContextMenuTarget {
  if (t === null || t === undefined) return false;
  switch (t.kind) {
    case "row":
      return typeof t.pluginId === "string" && t.pluginId.length > 0;
    case "header":
      return typeof t.columnId === "string" && t.columnId.length > 0;
    case "blank":
      return true;
    case "sidebar":
      return typeof t.sectionId === "string" && t.sectionId.length > 0;
    default:
      return false;
  }
}

function isValidPosition(
  p: PluginBrowserContextMenuPosition | null | undefined,
): p is PluginBrowserContextMenuPosition {
  return (
    p !== null &&
    p !== undefined &&
    typeof p.xPx === "number" &&
    Number.isFinite(p.xPx) &&
    typeof p.yPx === "number" &&
    Number.isFinite(p.yPx)
  );
}

/**
 * Create a caller-owned context-menu state machine.
 */
export function createPluginBrowserContextMenu(): PluginBrowserContextMenu {
  let _target: PluginBrowserContextMenuTarget | undefined;
  let _position: PluginBrowserContextMenuPosition | undefined;

  return {
    isOpen(): boolean {
      return _target !== undefined;
    },
    target(): PluginBrowserContextMenuTarget | undefined {
      return _target;
    },
    position(): PluginBrowserContextMenuPosition | undefined {
      return _position;
    },
    open(
      target: PluginBrowserContextMenuTarget,
      position: PluginBrowserContextMenuPosition,
    ): boolean {
      if (!isValidTarget(target) || !isValidPosition(position)) {
        // Invalid open close-any-open-menu semantics.
        _target = undefined;
        _position = undefined;
        return false;
      }
      _target = target;
      _position = { xPx: position.xPx, yPx: position.yPx };
      return true;
    },
    close(): boolean {
      if (_target === undefined) return false;
      _target = undefined;
      _position = undefined;
      return true;
    },
    snapshot(): PluginBrowserContextMenuSnapshot {
      return {
        isOpen: _target !== undefined,
        target: _target,
        position: _position
          ? { xPx: _position.xPx, yPx: _position.yPx }
          : undefined,
      };
    },
  };
}
