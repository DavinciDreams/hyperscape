/**
 * Grid primitives — snap-to-grid + grid-line enumeration.
 *
 * Two kinds of "grid" coexist in Hyperforge:
 *
 * 1. **Cell grid** (manifest-defined columns × rows) — used by
 *    `GridPosition` widgets that snap to column/row cells. See
 *    `UILayoutGridSchema` in layout.ts.
 * 2. **Pixel grid** (editor viewport overlay) — a visual aid with a
 *    fixed pixel cadence (e.g. every 8px) used for free-form
 *    alignment while dragging `AnchoredPosition` widgets.
 *
 * This module focuses on pixel-grid math shared between the in-game
 * edit overlay (`useGrid.ts`) and the World Studio editor canvas.
 */

/** Major line every Nth minor line. 4 matches the in-game editor. */
export const DEFAULT_MAJOR_MULTIPLIER = 4;

/** Lines to render in a grid overlay. Positions are in pixels. */
export interface GridLines {
  /** X positions of every vertical line (minor). */
  x: number[];
  /** Y positions of every horizontal line (minor). */
  y: number[];
  /** X positions of the major (every Nth) vertical lines. */
  majorX: number[];
  /** Y positions of the major horizontal lines. */
  majorY: number[];
}

/**
 * Snap a scalar to the nearest multiple of `gridSize`. Returns the
 * input unchanged if the grid is disabled or non-positive.
 */
export function snapToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/** Snap both components of a point. */
export function snapPointToGrid(
  point: { x: number; y: number },
  gridSize: number,
): { x: number; y: number } {
  return {
    x: snapToGrid(point.x, gridSize),
    y: snapToGrid(point.y, gridSize),
  };
}

/** Snap a box's origin (top-left) to the grid. Size is preserved. */
export function snapBoxToGrid<
  B extends { x: number; y: number; width: number; height: number },
>(box: B, gridSize: number): B {
  return {
    ...box,
    x: snapToGrid(box.x, gridSize),
    y: snapToGrid(box.y, gridSize),
  };
}

/**
 * Enumerate every pixel grid line intersecting a viewport. The major
 * multiplier determines how often a line is promoted to "major"
 * (rendered thicker/brighter in the UI).
 */
export function computeGridLines(
  viewport: { width: number; height: number },
  gridSize: number,
  majorMultiplier: number = DEFAULT_MAJOR_MULTIPLIER,
): GridLines {
  if (gridSize <= 0) return { x: [], y: [], majorX: [], majorY: [] };
  const majorSize = gridSize * majorMultiplier;

  const x: number[] = [];
  const y: number[] = [];
  const majorX: number[] = [];
  const majorY: number[] = [];

  for (let px = 0; px <= viewport.width; px += gridSize) {
    if (px % majorSize === 0) majorX.push(px);
    else x.push(px);
  }
  for (let py = 0; py <= viewport.height; py += gridSize) {
    if (py % majorSize === 0) majorY.push(py);
    else y.push(py);
  }
  return { x, y, majorX, majorY };
}
