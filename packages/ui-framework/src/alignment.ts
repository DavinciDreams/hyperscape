/**
 * Box-based alignment + snap primitives.
 *
 * Layout-model-agnostic: operates purely on `{ x, y, width, height }`
 * boxes in whatever coordinate space the caller chooses (logical
 * pixels, screen pixels, grid cells — doesn't matter). Both the
 * in-game edit-mode overlay and the World Studio UI Layout editor
 * canvas consume these primitives so selection chrome and snap
 * behaviour stay identical across surfaces.
 *
 * Port of the interaction design from
 * `packages/client/src/ui/core/edit/useAlignmentGuides.ts`, stripped
 * of its dependency on `WindowState` and restated as pure functions
 * over `Box`.
 */

/** Axis-aligned rect. Coordinate space is caller-defined. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Edge/center positions derived from a box. */
export interface BoxEdges {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * One alignment guide. Rendered as a full-viewport line at `position`
 * on the given `axis`. `sourceId` points at the candidate box that
 * produced the guide (so the UI can highlight it if desired).
 */
export interface AlignmentGuide {
  axis: "x" | "y";
  /** Pixel position along the perpendicular axis. */
  position: number;
  /** Which feature of the source box this guide aligns to. */
  type: "edge" | "center";
  /** Optional stable id of the candidate box the guide came from. */
  sourceId?: string;
}

/** Result of snapping a dragged box against candidates. */
export interface AlignmentSnapResult {
  /** Box with position adjusted to align to any matched guides. */
  snappedBox: Box;
  /** Every guide that matched the snap threshold. */
  guides: AlignmentGuide[];
}

/** Options controlling the snap computation. */
export interface AlignmentSnapOptions {
  /**
   * Pixel distance at which two lines are considered "aligned" and
   * snap kicks in. 8px matches the in-game editor.
   */
  threshold?: number;
  /** When false, the input box is returned unchanged but guides are
   *  still reported so the caller can render them without snapping. */
  snap?: boolean;
  /**
   * Restrict snap targets to this axis. Useful when the user holds
   * Shift to axis-lock a drag — pass "x" to only snap horizontally.
   */
  axisLock?: "x" | "y" | null;
}

const DEFAULT_THRESHOLD = 8;

/**
 * Compute every interesting edge/center position for a box.
 */
export function boxEdges(b: Box): BoxEdges {
  return {
    left: b.x,
    right: b.x + b.width,
    top: b.y,
    bottom: b.y + b.height,
    centerX: b.x + b.width / 2,
    centerY: b.y + b.height / 2,
  };
}

/**
 * Compute the alignment guides between a *dragged* box and a set of
 * *candidate* boxes. When `snap` is enabled and a candidate is within
 * `threshold` pixels, the returned `snappedBox` is nudged to align
 * exactly. Supports edge-to-edge, edge-to-center, and center-to-center
 * alignment in both axes.
 *
 * Matches the in-game snap model:
 *   - left↔left, right↔right, left↔right, right↔left   (x-edges)
 *   - top↔top, bottom↔bottom, top↔bottom, bottom↔top   (y-edges)
 *   - centerX↔centerX, centerY↔centerY                  (centers)
 */
export function computeAlignmentSnap(
  dragged: Box,
  candidates: ReadonlyArray<Box & { id?: string }>,
  options: AlignmentSnapOptions = {},
): AlignmentSnapResult {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const snap = options.snap ?? true;
  const axisLock = options.axisLock ?? null;

  const dE = boxEdges(dragged);
  let dx = 0;
  let dy = 0;
  const guides: AlignmentGuide[] = [];

  // Track the best (smallest distance) snap per axis so we don't
  // "fight" over a near-tie — keep the closest guide only.
  let bestX: { delta: number; guide: AlignmentGuide } | null = null;
  let bestY: { delta: number; guide: AlignmentGuide } | null = null;

  for (const c of candidates) {
    const cE = boxEdges(c);
    const id = c.id;

    // --- X axis ---
    if (axisLock !== "y") {
      const xChecks: Array<{
        from: number;
        to: number;
        guidePos: number;
        kind: AlignmentGuide["type"];
      }> = [
        { from: dE.left, to: cE.left, guidePos: cE.left, kind: "edge" },
        { from: dE.right, to: cE.right, guidePos: cE.right, kind: "edge" },
        { from: dE.left, to: cE.right, guidePos: cE.right, kind: "edge" },
        { from: dE.right, to: cE.left, guidePos: cE.left, kind: "edge" },
        {
          from: dE.centerX,
          to: cE.centerX,
          guidePos: cE.centerX,
          kind: "center",
        },
      ];
      for (const chk of xChecks) {
        const delta = chk.to - chk.from;
        if (Math.abs(delta) <= threshold) {
          if (bestX === null || Math.abs(delta) < Math.abs(bestX.delta)) {
            bestX = {
              delta,
              guide: {
                axis: "x",
                position: chk.guidePos,
                type: chk.kind,
                sourceId: id,
              },
            };
          }
        }
      }
    }

    // --- Y axis ---
    if (axisLock !== "x") {
      const yChecks: Array<{
        from: number;
        to: number;
        guidePos: number;
        kind: AlignmentGuide["type"];
      }> = [
        { from: dE.top, to: cE.top, guidePos: cE.top, kind: "edge" },
        { from: dE.bottom, to: cE.bottom, guidePos: cE.bottom, kind: "edge" },
        { from: dE.top, to: cE.bottom, guidePos: cE.bottom, kind: "edge" },
        { from: dE.bottom, to: cE.top, guidePos: cE.top, kind: "edge" },
        {
          from: dE.centerY,
          to: cE.centerY,
          guidePos: cE.centerY,
          kind: "center",
        },
      ];
      for (const chk of yChecks) {
        const delta = chk.to - chk.from;
        if (Math.abs(delta) <= threshold) {
          if (bestY === null || Math.abs(delta) < Math.abs(bestY.delta)) {
            bestY = {
              delta,
              guide: {
                axis: "y",
                position: chk.guidePos,
                type: chk.kind,
                sourceId: id,
              },
            };
          }
        }
      }
    }
  }

  if (bestX) {
    guides.push(bestX.guide);
    if (snap) dx = bestX.delta;
  }
  if (bestY) {
    guides.push(bestY.guide);
    if (snap) dy = bestY.delta;
  }

  return {
    snappedBox: { ...dragged, x: dragged.x + dx, y: dragged.y + dy },
    guides,
  };
}

/**
 * Snap a box to the edges/center of a viewport. Produces guides for
 * any axis where alignment is within threshold. Commonly stacked
 * after `computeAlignmentSnap` so widgets can align to both sibling
 * widgets and the canvas edges.
 */
export function snapBoxToViewport(
  box: Box,
  viewport: { width: number; height: number },
  options: AlignmentSnapOptions = {},
): AlignmentSnapResult {
  const viewBox: Box & { id: string } = {
    id: "__viewport__",
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height,
  };
  return computeAlignmentSnap(box, [viewBox], options);
}
