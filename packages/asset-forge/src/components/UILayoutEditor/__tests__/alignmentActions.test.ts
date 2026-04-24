/**
 * Unit tests for the "Align to viewport" pure helper.
 *
 * The forward/inverse anchor math is the tricky part — for each of
 * the 9 anchor values we must produce an offset that places the box's
 * left/right/top/bottom/center edge at the desired viewport
 * coordinate.
 */

import type { AnchoredPosition } from "@hyperforge/ui-framework";
import { describe, expect, it } from "vitest";
import {
  alignAnchoredToSelection,
  alignAnchoredToViewport,
  distributeAnchored,
  type AlignEdge,
  type SelectionMember,
} from "../alignmentActions";

const VIEWPORT = { width: 1280, height: 720 };
const SIZE = { width: 200, height: 100 };

function pos(
  anchor: AnchoredPosition["anchor"],
  x: number,
  y: number,
): AnchoredPosition {
  return {
    kind: "anchored",
    anchor,
    offset: { x, y },
    width: SIZE.width,
    height: SIZE.height,
  };
}

/**
 * Apply the helper, then compute the resulting box's *actual* x/y
 * in viewport space (reversing the anchor base math). We assert
 * against this because the offset values differ per anchor but the
 * final box position is what the user sees.
 */
function resolveLeftTop(result: AnchoredPosition): { x: number; y: number } {
  const a = result.anchor;
  let baseX = 0;
  let baseY = 0;
  if (a.endsWith("right")) baseX = VIEWPORT.width - SIZE.width;
  else if (a.endsWith("center")) baseX = (VIEWPORT.width - SIZE.width) / 2;
  if (a.startsWith("bottom")) baseY = VIEWPORT.height - SIZE.height;
  else if (a.startsWith("middle")) baseY = (VIEWPORT.height - SIZE.height) / 2;
  if (a === "center") {
    baseX = (VIEWPORT.width - SIZE.width) / 2;
    baseY = (VIEWPORT.height - SIZE.height) / 2;
  }
  return { x: baseX + result.offset.x, y: baseY + result.offset.y };
}

describe("alignAnchoredToViewport — horizontal edges", () => {
  it("align-left places the box's left edge at x=0 for every anchor", () => {
    const anchors: Array<AnchoredPosition["anchor"]> = [
      "top-left",
      "top-center",
      "top-right",
      "middle-left",
      "center",
      "middle-right",
      "bottom-left",
      "bottom-center",
      "bottom-right",
    ];
    for (const anchor of anchors) {
      const r = alignAnchoredToViewport(
        pos(anchor, 500, 200),
        SIZE,
        "left",
        VIEWPORT,
      );
      expect(resolveLeftTop(r).x).toBe(0);
      expect(r.anchor).toBe(anchor); // anchor preserved
    }
  });

  it("align-right places the box's right edge at viewport.width", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 50, 50),
      SIZE,
      "right",
      VIEWPORT,
    );
    const left = resolveLeftTop(r).x;
    expect(left + SIZE.width).toBe(VIEWPORT.width);
  });

  it("align-center-h centers the box horizontally", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 50, 50),
      SIZE,
      "center-h",
      VIEWPORT,
    );
    const left = resolveLeftTop(r).x;
    expect(left).toBe((VIEWPORT.width - SIZE.width) / 2);
  });

  it("align-left does not touch the y axis", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 500, 200),
      SIZE,
      "left",
      VIEWPORT,
    );
    expect(resolveLeftTop(r).y).toBe(200);
  });
});

describe("alignAnchoredToViewport — vertical edges", () => {
  it("align-top places the box's top edge at y=0", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 50, 400),
      SIZE,
      "top",
      VIEWPORT,
    );
    expect(resolveLeftTop(r).y).toBe(0);
  });

  it("align-bottom places the box's bottom edge at viewport.height", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 50, 50),
      SIZE,
      "bottom",
      VIEWPORT,
    );
    const top = resolveLeftTop(r).y;
    expect(top + SIZE.height).toBe(VIEWPORT.height);
  });

  it("align-center-v centers the box vertically", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 50, 50),
      SIZE,
      "center-v",
      VIEWPORT,
    );
    const top = resolveLeftTop(r).y;
    expect(top).toBe((VIEWPORT.height - SIZE.height) / 2);
  });

  it("align-top does not touch the x axis", () => {
    const r = alignAnchoredToViewport(
      pos("bottom-right", -40, -80),
      SIZE,
      "top",
      VIEWPORT,
    );
    // x-offset for "bottom-right" = width - (viewport.w - 40) = boxLeft - base;
    // using resolveLeftTop to verify the x-coordinate didn't move:
    const original = resolveLeftTop(pos("bottom-right", -40, -80));
    expect(resolveLeftTop(r).x).toBe(original.x);
  });
});

describe("alignAnchoredToViewport — output invariants", () => {
  it("preserves the anchor field", () => {
    const r = alignAnchoredToViewport(
      pos("middle-right", 10, 20),
      SIZE,
      "left",
      VIEWPORT,
    );
    expect(r.anchor).toBe("middle-right");
  });

  it("preserves width/height from the caller (the helper never resizes)", () => {
    const r = alignAnchoredToViewport(
      pos("top-left", 10, 20),
      SIZE,
      "center-h",
      VIEWPORT,
    );
    expect(r.width).toBe(SIZE.width);
    expect(r.height).toBe(SIZE.height);
  });

  it("returns integer offsets (no sub-pixel bleed)", () => {
    const oddSize = { width: 201, height: 101 };
    const edges: AlignEdge[] = [
      "left",
      "center-h",
      "right",
      "top",
      "center-v",
      "bottom",
    ];
    for (const edge of edges) {
      const r = alignAnchoredToViewport(
        {
          kind: "anchored",
          anchor: "center",
          offset: { x: 7, y: 13 },
          width: oddSize.width,
          height: oddSize.height,
        },
        oddSize,
        edge,
        VIEWPORT,
      );
      expect(Number.isInteger(r.offset.x)).toBe(true);
      expect(Number.isInteger(r.offset.y)).toBe(true);
    }
  });

  it("is idempotent — aligning to an edge twice yields the same result", () => {
    const once = alignAnchoredToViewport(
      pos("top-left", 50, 50),
      SIZE,
      "center-h",
      VIEWPORT,
    );
    const twice = alignAnchoredToViewport(once, SIZE, "center-h", VIEWPORT);
    expect(twice).toEqual(once);
  });
});

// ---------- Align to selection ----------

/**
 * Helper — builds a top-left anchored member with the given offset.
 * Using top-left uniformly makes the selection-alignment math easy
 * to read (offset == rendered left/top).
 */
function tlMember(
  id: string,
  offsetX: number,
  offsetY: number,
  size = SIZE,
): SelectionMember {
  return {
    id,
    pos: {
      kind: "anchored",
      anchor: "top-left",
      offset: { x: offsetX, y: offsetY },
      width: size.width,
      height: size.height,
    },
    size,
  };
}

/** Reverse base-offset math for top-left anchor = 0, so rendered
 *  left/top == offset. Used to assert against. */
function renderedX(pos: AnchoredPosition): number {
  return pos.offset.x;
}
function renderedY(pos: AnchoredPosition): number {
  return pos.offset.y;
}

describe("alignAnchoredToSelection — horizontal", () => {
  it("aligns every member's left edge to min(left)", () => {
    const members = [
      tlMember("a", 100, 10),
      tlMember("b", 300, 10),
      tlMember("c", 50, 10), // leftmost
    ];
    const result = alignAnchoredToSelection(members, "left", VIEWPORT);
    expect(renderedX(result.get("a")!)).toBe(50);
    expect(renderedX(result.get("b")!)).toBe(50);
    expect(renderedX(result.get("c")!)).toBe(50);
  });

  it("aligns every member's right edge to max(right)", () => {
    const members = [
      tlMember("a", 100, 10),
      tlMember("b", 300, 10), // rightmost → right edge at 500
      tlMember("c", 50, 10),
    ];
    const result = alignAnchoredToSelection(members, "right", VIEWPORT);
    // box width is 200 so right edge at 500 → left at 300
    expect(renderedX(result.get("a")!)).toBe(300);
    expect(renderedX(result.get("b")!)).toBe(300);
    expect(renderedX(result.get("c")!)).toBe(300);
  });

  it("aligns every member's center to the bbox center", () => {
    const members = [tlMember("a", 100, 10), tlMember("b", 500, 10)];
    // min=100, max=500+200=700 → center=400, box center targets 400, left=300
    const result = alignAnchoredToSelection(members, "center-h", VIEWPORT);
    expect(renderedX(result.get("a")!)).toBe(300);
    expect(renderedX(result.get("b")!)).toBe(300);
  });
});

describe("alignAnchoredToSelection — vertical", () => {
  it("aligns every member's top to min(top)", () => {
    const members = [
      tlMember("a", 10, 100),
      tlMember("b", 10, 50), // topmost
      tlMember("c", 10, 300),
    ];
    const result = alignAnchoredToSelection(members, "top", VIEWPORT);
    expect(renderedY(result.get("a")!)).toBe(50);
    expect(renderedY(result.get("b")!)).toBe(50);
    expect(renderedY(result.get("c")!)).toBe(50);
  });

  it("aligns every member's bottom to max(bottom)", () => {
    const members = [
      tlMember("a", 10, 100),
      tlMember("b", 10, 500), // bottommost → bottom edge at 600
    ];
    const result = alignAnchoredToSelection(members, "bottom", VIEWPORT);
    // size height is 100 so bottom at 600 → top at 500
    expect(renderedY(result.get("a")!)).toBe(500);
    expect(renderedY(result.get("b")!)).toBe(500);
  });
});

describe("alignAnchoredToSelection — invariants", () => {
  it("returns an empty map for 0 or 1 members (no meaningful alignment)", () => {
    expect(alignAnchoredToSelection([], "left", VIEWPORT).size).toBe(0);
    expect(
      alignAnchoredToSelection([tlMember("a", 0, 0)], "left", VIEWPORT).size,
    ).toBe(0);
  });

  it("preserves each member's anchor (offset-only rewrite)", () => {
    const mixed: SelectionMember[] = [
      {
        id: "a",
        pos: {
          kind: "anchored",
          anchor: "bottom-right",
          offset: { x: -100, y: -50 },
          width: 200,
          height: 100,
        },
        size: SIZE,
      },
      tlMember("b", 50, 50),
    ];
    const result = alignAnchoredToSelection(mixed, "left", VIEWPORT);
    expect(result.get("a")!.anchor).toBe("bottom-right");
    expect(result.get("b")!.anchor).toBe("top-left");
  });

  it("produces integer offsets", () => {
    const result = alignAnchoredToSelection(
      [tlMember("a", 33, 77), tlMember("b", 133, 88)],
      "center-h",
      VIEWPORT,
    );
    for (const p of result.values()) {
      expect(Number.isInteger(p.offset.x)).toBe(true);
      expect(Number.isInteger(p.offset.y)).toBe(true);
    }
  });
});

// ---------- Distribute ----------

describe("distributeAnchored", () => {
  it("is a no-op with fewer than 3 members", () => {
    expect(distributeAnchored([], "h", VIEWPORT).size).toBe(0);
    expect(distributeAnchored([tlMember("a", 0, 0)], "h", VIEWPORT).size).toBe(
      0,
    );
    expect(
      distributeAnchored(
        [tlMember("a", 0, 0), tlMember("b", 500, 0)],
        "h",
        VIEWPORT,
      ).size,
    ).toBe(0);
  });

  it("keeps the extremes and evenly spaces centers on horizontal distribute", () => {
    // Three 200-wide boxes. First center at 100+100=200, last at
    // 600+100=700 → step=250. Middle target center 450 → left 350.
    const members = [
      tlMember("a", 100, 10),
      tlMember("b", 120, 10), // to be repositioned
      tlMember("c", 600, 10),
    ];
    const result = distributeAnchored(members, "h", VIEWPORT);
    // Extremes aren't in the result map (they stay put).
    expect(result.has("a")).toBe(false);
    expect(result.has("c")).toBe(false);
    expect(renderedX(result.get("b")!)).toBe(350);
  });

  it("evenly spaces centers on vertical distribute", () => {
    // Three 100-tall boxes. First center at 50+50=100, last at
    // 500+50=550 → step=225. Middle target 325 → top 275.
    const members = [
      tlMember("a", 10, 50),
      tlMember("b", 10, 180), // to be repositioned
      tlMember("c", 10, 500),
    ];
    const result = distributeAnchored(members, "v", VIEWPORT);
    expect(renderedY(result.get("b")!)).toBe(275);
  });

  it("sorts by center so the input order doesn't matter", () => {
    // Same physical layout as above but passed out-of-order.
    const members = [
      tlMember("c", 600, 10),
      tlMember("b", 120, 10),
      tlMember("a", 100, 10),
    ];
    const result = distributeAnchored(members, "h", VIEWPORT);
    expect(renderedX(result.get("b")!)).toBe(350);
  });
});
