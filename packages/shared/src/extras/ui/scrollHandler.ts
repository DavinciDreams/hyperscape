/**
 * scrollHandler.ts - Scroll Behavior for UIView Nodes
 *
 * Utility that wires wheel events on a root UI node to scroll
 * a child UIView with overflow: "scroll". Handles clamping,
 * speed scaling, and horizontal scroll via shift+wheel.
 */

import Yoga from "yoga-layout";
import type { UI } from "../../nodes/UI";
import type { UIView } from "../../nodes/UIView";
import type { UIWheelEvent } from "../../types/rendering/nodes";

interface ScrollHandlerOptions {
  /** Pixels scrolled per wheel delta unit (default: 1) */
  scrollSpeed?: number;
  /** Allow horizontal scrolling via shift+wheel (default: false) */
  horizontal?: boolean;
}

/**
 * Attach scroll behavior to a UIView with overflow: "scroll".
 *
 * Listens to the root UI node's onWheel event and updates the
 * scrollable view's scrollY (or scrollX if shift is held and
 * horizontal is enabled).
 *
 * @param rootUI - The root UI panel node that receives wheel events
 * @param scrollView - The UIView child with overflow: "scroll"
 * @param options - Optional scroll speed and horizontal toggle
 *
 * @example
 * ```ts
 * const root = createNode("ui", { width: 200, height: 300 });
 * const list = createNode("uiview", { overflow: "scroll", height: 200 });
 * // ... add children to list
 * root.add(list);
 * attachScrollHandler(root, list, { scrollSpeed: 1.5 });
 * ```
 */
export function attachScrollHandler(
  rootUI: UI,
  scrollView: UIView,
  options?: ScrollHandlerOptions,
): () => void {
  const speed = options?.scrollSpeed ?? 1;
  const allowHorizontal = options?.horizontal ?? false;

  // Accumulate deltas and flush once per animation frame to avoid
  // redundant redraws from high-frequency trackpad/wheel events.
  let pendingDeltaX = 0;
  let pendingDeltaY = 0;
  let lastShiftKey = false;
  let rafId = 0;

  const flushScroll = () => {
    rafId = 0;
    if (!scrollView.box || !scrollView.yogaNode) return;

    const viewportHeight = scrollView.yogaNode.getComputedHeight();
    const viewportWidth = scrollView.yogaNode.getComputedWidth();

    let contentHeight = 0;
    let contentWidth = 0;
    const childCount = scrollView.yogaNode.getChildCount();
    for (let i = 0; i < childCount; i++) {
      const child = scrollView.yogaNode.getChild(i);
      contentHeight +=
        child.getComputedHeight() +
        child.getComputedMargin(Yoga.EDGE_TOP) +
        child.getComputedMargin(Yoga.EDGE_BOTTOM);
      contentWidth +=
        child.getComputedWidth() +
        child.getComputedMargin(Yoga.EDGE_LEFT) +
        child.getComputedMargin(Yoga.EDGE_RIGHT);
    }

    const res = rootUI.res ?? 2;

    if (allowHorizontal && lastShiftKey) {
      const maxScrollX = Math.max(0, (contentWidth - viewportWidth) / res);
      scrollView.scrollX = Math.max(
        0,
        Math.min(maxScrollX, scrollView.scrollX + pendingDeltaX * speed),
      );
    } else {
      const maxScrollY = Math.max(0, (contentHeight - viewportHeight) / res);
      scrollView.scrollY = Math.max(
        0,
        Math.min(maxScrollY, scrollView.scrollY + pendingDeltaY * speed),
      );
    }

    pendingDeltaX = 0;
    pendingDeltaY = 0;
  };

  const handler = (event: UIWheelEvent) => {
    if (!scrollView.box || !scrollView.yogaNode) return;

    // Check if pointer is within the scrollable view's bounds
    const { left, top, width, height } = scrollView.box;
    const pointerX = event.coords?.x ?? 0;
    const pointerY = event.coords?.y ?? 0;

    if (
      pointerX < left ||
      pointerX > left + width ||
      pointerY < top ||
      pointerY > top + height
    ) {
      return;
    }

    // Accumulate deltas; flush on next animation frame
    pendingDeltaX += event.deltaX;
    pendingDeltaY += event.deltaY;
    lastShiftKey = event.shiftKey ?? false;
    if (!rafId) {
      rafId = requestAnimationFrame(flushScroll);
    }
  };

  // Attach to root UI's onWheel
  const prevHandler = rootUI.onWheel;
  rootUI.onWheel = (event: UIWheelEvent) => {
    prevHandler?.(event);
    handler(event);
  };

  // Return cleanup function
  return () => {
    rootUI.onWheel = prevHandler;
    if (rafId) cancelAnimationFrame(rafId);
  };
}
