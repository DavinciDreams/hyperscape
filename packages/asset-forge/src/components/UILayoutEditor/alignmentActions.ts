/**
 * alignmentActions — pure helpers for "Align to viewport" operations.
 *
 * Given an anchored widget position and the active viewport
 * dimensions, produce a new AnchoredPosition whose rendered box is
 * flush against the requested viewport edge (or centered on the
 * requested axis). The widget's declared anchor is **preserved** —
 * only the offset is rewritten. This matches Figma/UE UMG behaviour
 * where alignment commands don't change the authoring-intent anchor,
 * they just snap the box to the target edge in the current frame.
 *
 * Alignments are only defined for anchored positions. Grid/flex
 * positions are ignored by the caller because their layout semantics
 * are driven by the container, not absolute placement.
 */

import type { AnchoredPosition } from "@hyperforge/ui-framework";

/** Six standard alignment edges, matching every vector editor. */
export type AlignEdge =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom";

export interface ViewportDims {
  width: number;
  height: number;
}

/**
 * Compute the base (anchor-origin) pixel offset of an anchored
 * position's bounding box, given the viewport size and the box's
 * rendered width/height. Mirrors `computeLogicalBox`'s anchor logic
 * so alignment + resize + drag all agree.
 */
function anchorBase(
  anchor: AnchoredPosition["anchor"],
  width: number,
  height: number,
  viewport: ViewportDims,
): { x: number; y: number } {
  let x = 0;
  let y = 0;
  if (anchor.endsWith("right")) x = viewport.width - width;
  else if (anchor.endsWith("center")) x = (viewport.width - width) / 2;
  if (anchor.startsWith("bottom")) y = viewport.height - height;
  else if (anchor.startsWith("middle")) y = (viewport.height - height) / 2;
  if (anchor === "center") {
    x = (viewport.width - width) / 2;
    y = (viewport.height - height) / 2;
  }
  return { x, y };
}

/**
 * Align an anchored position's box to a viewport edge.
 *
 * @param pos      Current anchored position (anchor preserved).
 * @param size     The box's rendered size in logical pixels. Caller
 *                 passes the per-instance width/height (from
 *                 `pos.width/height` or the manifest's defaultSize).
 * @param edge     Which edge (or axis center) to align against.
 * @param viewport Active viewport width/height in logical pixels.
 *
 * Returns a new AnchoredPosition with the same anchor + size but a
 * rewritten `offset` that places the box flush against `edge`. Values
 * are rounded to integer pixels to keep saved manifests tidy.
 */
export function alignAnchoredToViewport(
  pos: AnchoredPosition,
  size: { width: number; height: number },
  edge: AlignEdge,
  viewport: ViewportDims,
): AnchoredPosition {
  const base = anchorBase(pos.anchor, size.width, size.height, viewport);

  // Decide target (left, top) in viewport space. For horizontal
  // edges we only rewrite x; for vertical edges we only rewrite y.
  // This matches Figma "Align Left" etc. which don't touch the
  // orthogonal axis.
  let targetX = base.x + pos.offset.x;
  let targetY = base.y + pos.offset.y;

  switch (edge) {
    case "left":
      targetX = 0;
      break;
    case "center-h":
      targetX = (viewport.width - size.width) / 2;
      break;
    case "right":
      targetX = viewport.width - size.width;
      break;
    case "top":
      targetY = 0;
      break;
    case "center-v":
      targetY = (viewport.height - size.height) / 2;
      break;
    case "bottom":
      targetY = viewport.height - size.height;
      break;
  }

  return {
    ...pos,
    offset: {
      x: Math.round(targetX - base.x),
      y: Math.round(targetY - base.y),
    },
  };
}

// ---------- Align-to-selection (across sibling widgets) ----------

/**
 * Describes a single anchored member of the alignment batch. Caller
 * must resolve the rendered `size` (from `pos.width/height` or the
 * widget manifest's defaultSize) so the helper can stay pure.
 */
export interface SelectionMember {
  id: string;
  pos: AnchoredPosition;
  size: { width: number; height: number };
}

/**
 * Axis = horizontal corresponds to "left / right / center-h"; axis
 * vertical corresponds to "top / bottom / center-v". Used to decide
 * which component of each widget's current box participates in the
 * bbox extent computation.
 */
function edgeAxis(edge: AlignEdge): "h" | "v" {
  if (edge === "top" || edge === "center-v" || edge === "bottom") return "v";
  return "h";
}

/**
 * Resolve the rendered x/y of a member's bounding box on the current
 * viewport. Mirrors `computeLogicalBox` so the alignment math stays
 * visually consistent.
 */
function renderedBox(
  m: SelectionMember,
  viewport: ViewportDims,
): { x: number; y: number; width: number; height: number } {
  const base = anchorBase(m.pos.anchor, m.size.width, m.size.height, viewport);
  return {
    x: base.x + m.pos.offset.x,
    y: base.y + m.pos.offset.y,
    width: m.size.width,
    height: m.size.height,
  };
}

/**
 * Align every member's chosen edge to the matching edge of the
 * selection bounding box.
 *
 *   - `left`   → each box's left edge snaps to min(left)
 *   - `right`  → each box's right edge snaps to max(right)
 *   - `center-h` → each box's x-center snaps to (min(left)+max(right))/2
 *   - `top / bottom / center-v` mirror those vertically
 *
 * Each returned position preserves its widget's anchor — only the
 * offset is rewritten. Members are expected to be anchored; callers
 * are responsible for filtering flex/grid ids out beforehand.
 *
 * Returns a map id → new AnchoredPosition for every member. Returns
 * an empty map if fewer than 2 members are supplied (alignment of
 * 1 against itself is a no-op, and the caller should skip dispatch).
 */
export function alignAnchoredToSelection(
  members: SelectionMember[],
  edge: AlignEdge,
  viewport: ViewportDims,
): Map<string, AnchoredPosition> {
  const out = new Map<string, AnchoredPosition>();
  if (members.length < 2) return out;

  const boxes = members.map((m) => renderedBox(m, viewport));
  const axis = edgeAxis(edge);

  // Selection bbox extents on the relevant axis.
  let min = Infinity;
  let max = -Infinity;
  for (const b of boxes) {
    if (axis === "h") {
      if (b.x < min) min = b.x;
      if (b.x + b.width > max) max = b.x + b.width;
    } else {
      if (b.y < min) min = b.y;
      if (b.y + b.height > max) max = b.y + b.height;
    }
  }
  const center = (min + max) / 2;

  members.forEach((m, i) => {
    const b = boxes[i];
    const base = anchorBase(
      m.pos.anchor,
      m.size.width,
      m.size.height,
      viewport,
    );
    let targetX = b.x;
    let targetY = b.y;
    switch (edge) {
      case "left":
        targetX = min;
        break;
      case "right":
        targetX = max - m.size.width;
        break;
      case "center-h":
        targetX = center - m.size.width / 2;
        break;
      case "top":
        targetY = min;
        break;
      case "bottom":
        targetY = max - m.size.height;
        break;
      case "center-v":
        targetY = center - m.size.height / 2;
        break;
    }
    out.set(m.id, {
      ...m.pos,
      offset: {
        x: Math.round(targetX - base.x),
        y: Math.round(targetY - base.y),
      },
    });
  });

  return out;
}

// ---------- Distribute spacing ----------

export type DistributeAxis = "h" | "v";

/**
 * Distribute widgets so their centers are evenly spaced between
 * the leftmost/rightmost (horizontal) or topmost/bottommost
 * (vertical) members. The two extreme widgets stay put; every
 * middle widget moves onto an evenly-spaced grid line.
 *
 * No-op when fewer than 3 members are supplied (with 2 members
 * there are no gaps to distribute).
 */
export function distributeAnchored(
  members: SelectionMember[],
  axis: DistributeAxis,
  viewport: ViewportDims,
): Map<string, AnchoredPosition> {
  const out = new Map<string, AnchoredPosition>();
  if (members.length < 3) return out;

  const boxes = members.map((m) => ({
    member: m,
    box: renderedBox(m, viewport),
  }));

  // Sort by center along the chosen axis so first/last correspond
  // to the outermost widgets on that axis.
  const centerOf = (b: ReturnType<typeof renderedBox>) =>
    axis === "h" ? b.x + b.width / 2 : b.y + b.height / 2;
  const sorted = boxes
    .slice()
    .sort((a, b) => centerOf(a.box) - centerOf(b.box));

  const firstCenter = centerOf(sorted[0].box);
  const lastCenter = centerOf(sorted[sorted.length - 1].box);
  const step = (lastCenter - firstCenter) / (sorted.length - 1);

  sorted.forEach((entry, i) => {
    if (i === 0 || i === sorted.length - 1) return; // extremes stay put
    const m = entry.member;
    const base = anchorBase(
      m.pos.anchor,
      m.size.width,
      m.size.height,
      viewport,
    );
    const targetCenter = firstCenter + step * i;
    const b = entry.box;
    let targetX = b.x;
    let targetY = b.y;
    if (axis === "h") {
      targetX = targetCenter - m.size.width / 2;
    } else {
      targetY = targetCenter - m.size.height / 2;
    }
    out.set(m.id, {
      ...m.pos,
      offset: {
        x: Math.round(targetX - base.x),
        y: Math.round(targetY - base.y),
      },
    });
  });

  return out;
}
