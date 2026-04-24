import { describe, expect, it } from "vitest";
import {
  boxEdges,
  computeAlignmentSnap,
  snapBoxToViewport,
  type Box,
} from "./alignment";

const box = (x: number, y: number, w: number, h: number): Box => ({
  x,
  y,
  width: w,
  height: h,
});

describe("boxEdges", () => {
  it("computes every edge + center", () => {
    expect(boxEdges(box(10, 20, 100, 50))).toEqual({
      left: 10,
      right: 110,
      top: 20,
      bottom: 70,
      centerX: 60,
      centerY: 45,
    });
  });
});

describe("computeAlignmentSnap", () => {
  it("snaps left-to-left when within threshold", () => {
    const dragged = box(103, 40, 50, 50);
    const other = box(100, 200, 50, 50);
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    expect(r.snappedBox.x).toBe(100);
    expect(r.guides.some((g) => g.axis === "x" && g.position === 100)).toBe(
      true,
    );
  });

  it("does not snap when beyond threshold", () => {
    // Use boxes far enough apart that no edge/center combination
    // (left↔left, left↔right, right↔left, right↔right, center↔center)
    // falls within the 8px threshold on either axis.
    const dragged = box(300, 40, 50, 50); // left=300, right=350, cx=325
    const other = box(100, 200, 50, 50); //   left=100, right=150, cx=125
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    expect(r.snappedBox.x).toBe(300);
    expect(r.snappedBox.y).toBe(40);
    expect(r.guides).toHaveLength(0);
  });

  it("snaps on both axes simultaneously", () => {
    const dragged = box(103, 203, 50, 50);
    const other = box(100, 200, 50, 50);
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    expect(r.snappedBox.x).toBe(100);
    expect(r.snappedBox.y).toBe(200);
    expect(r.guides).toHaveLength(2);
  });

  it("snaps right-edge to left-edge (adjacent boxes)", () => {
    const dragged = box(192, 40, 50, 50); // right at 242
    const other = box(240, 40, 50, 50); // left at 240
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    // right(242) → left(240) is within 8, so dx = -2
    expect(r.snappedBox.x).toBe(190);
  });

  it("snaps centers (center-to-center)", () => {
    const dragged = box(100, 40, 40, 40); // centerX = 120
    const other = box(110, 200, 20, 20); // centerX = 120
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    expect(r.snappedBox.x).toBe(100);
    expect(r.guides.some((g) => g.type === "center")).toBe(true);
  });

  it("respects axisLock='x'", () => {
    const dragged = box(103, 203, 50, 50);
    const other = box(100, 200, 50, 50);
    const r = computeAlignmentSnap(dragged, [other], {
      threshold: 8,
      axisLock: "x",
    });
    expect(r.snappedBox.x).toBe(100);
    expect(r.snappedBox.y).toBe(203); // unchanged
    expect(r.guides.every((g) => g.axis === "x")).toBe(true);
  });

  it("keeps only the closest guide per axis", () => {
    const dragged = box(103, 40, 50, 50);
    // Two candidates offering competing x-edges.
    const a = box(100, 100, 50, 50); // dx = -3
    const b = box(102, 200, 50, 50); // dx = -1  <- closer
    const r = computeAlignmentSnap(dragged, [a, b], { threshold: 8 });
    expect(r.snappedBox.x).toBe(102);
    const xGuides = r.guides.filter((g) => g.axis === "x");
    expect(xGuides).toHaveLength(1);
  });

  it("reports guides without snapping when snap=false", () => {
    const dragged = box(103, 40, 50, 50);
    const other = box(100, 200, 50, 50);
    const r = computeAlignmentSnap(dragged, [other], {
      threshold: 8,
      snap: false,
    });
    expect(r.snappedBox.x).toBe(103); // unchanged
    expect(r.guides.length).toBeGreaterThan(0);
  });

  it("propagates sourceId from candidate", () => {
    const dragged = box(103, 40, 50, 50);
    const other = { ...box(100, 200, 50, 50), id: "hp-bar" };
    const r = computeAlignmentSnap(dragged, [other], { threshold: 8 });
    expect(r.guides[0]?.sourceId).toBe("hp-bar");
  });
});

describe("snapBoxToViewport", () => {
  it("snaps box left-edge to viewport left", () => {
    const b = box(4, 300, 200, 100);
    const r = snapBoxToViewport(b, { width: 1280, height: 720 });
    expect(r.snappedBox.x).toBe(0);
  });

  it("snaps box right-edge to viewport right", () => {
    const b = box(1073, 300, 200, 100); // right at 1273
    const r = snapBoxToViewport(b, { width: 1280, height: 720 });
    expect(r.snappedBox.x).toBe(1080); // right = 1280
  });

  it("snaps box centerX to viewport centerX", () => {
    const b = box(540, 300, 200, 100); // centerX = 640 = viewport 640
    const r = snapBoxToViewport(b, { width: 1280, height: 720 });
    expect(r.snappedBox.x).toBe(540);
  });
});
