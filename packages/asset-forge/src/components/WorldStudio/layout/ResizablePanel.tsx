/**
 * ResizablePanel — Resizable panel layout system for editor shells.
 *
 * Provides three components:
 * - `ResizablePanelGroup`: Flex container that manages panel sizing.
 * - `ResizablePanel`: A panel whose size can be constrained with min/max.
 * - `ResizableDivider`: Draggable divider between two panels.
 *
 * Supports both horizontal (left/right) and vertical (top/bottom)
 * orientations. Panel sizes persist to localStorage keyed by `id`.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Direction = "horizontal" | "vertical";

interface PanelGroupContextValue {
  direction: Direction;
  registerPanel: (index: number, config: PanelConfig) => void;
  unregisterPanel: (index: number) => void;
  getPanelSize: (index: number) => number;
  startResize: (
    dividerIndex: number,
    pointerX: number,
    pointerY: number,
  ) => void;
}

interface PanelConfig {
  defaultSize: number;
  minSize: number;
  maxSize: number;
}

interface PanelEntry extends PanelConfig {
  currentSize: number;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PanelGroupContext = createContext<PanelGroupContextValue | null>(null);

function usePanelGroup(): PanelGroupContextValue {
  const ctx = useContext(PanelGroupContext);
  if (!ctx) {
    throw new Error(
      "ResizablePanel/ResizableDivider must be used inside a ResizablePanelGroup",
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "resizable-panel:";

function loadSizes(id: string): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
      return parsed as number[];
    }
    return null;
  } catch {
    return null;
  }
}

function saveSizes(id: string, sizes: number[]): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(sizes));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// ResizablePanelGroup
// ---------------------------------------------------------------------------

interface ResizablePanelGroupProps {
  /** Unique identifier used as the localStorage key for persisted sizes. */
  id: string;
  /** Layout direction. "horizontal" = side-by-side, "vertical" = stacked. */
  direction: Direction;
  /** Additional CSS class names for the outer wrapper. */
  className?: string;
  children: React.ReactNode;
}

export function ResizablePanelGroup({
  id,
  direction,
  className = "",
  children,
}: ResizablePanelGroupProps) {
  // Panel registry keyed by child index.
  const panelsRef = useRef<Map<number, PanelEntry>>(new Map());
  // Force re-render counter — bumped when panel sizes change.
  const [, setRenderTick] = useState(0);
  const tick = useCallback(() => setRenderTick((n) => n + 1), []);

  // Track whether we have already restored from localStorage.
  const restoredRef = useRef(false);

  // ---- Registration ----

  const registerPanel = useCallback(
    (index: number, config: PanelConfig) => {
      const existing = panelsRef.current.get(index);
      if (existing) {
        // Update config but keep current size if already set.
        existing.defaultSize = config.defaultSize;
        existing.minSize = config.minSize;
        existing.maxSize = config.maxSize;
        return;
      }
      panelsRef.current.set(index, {
        ...config,
        currentSize: config.defaultSize,
      });

      // Attempt to restore from localStorage once all panels are registered.
      // We defer this to a microtask so that all synchronous registrations
      // have completed before we try to apply saved sizes.
      if (!restoredRef.current) {
        queueMicrotask(() => {
          if (restoredRef.current) return;
          restoredRef.current = true;
          const saved = loadSizes(id);
          if (!saved) return;
          const panels = panelsRef.current;
          const sortedKeys = Array.from(panels.keys()).sort((a, b) => a - b);
          if (saved.length !== sortedKeys.length) return;
          sortedKeys.forEach((key, i) => {
            const entry = panels.get(key);
            if (!entry) return;
            entry.currentSize = clamp(saved[i], entry.minSize, entry.maxSize);
          });
          tick();
        });
      }
    },
    [id, tick],
  );

  const unregisterPanel = useCallback((index: number) => {
    panelsRef.current.delete(index);
  }, []);

  const getPanelSize = useCallback((index: number): number => {
    return panelsRef.current.get(index)?.currentSize ?? 0;
  }, []);

  // ---- Resize logic ----

  const activeResizeRef = useRef<{
    dividerIndex: number;
    startPos: number;
    panelAKey: number;
    panelBKey: number;
    startSizeA: number;
    startSizeB: number;
  } | null>(null);

  const startResize = useCallback(
    (dividerIndex: number, pointerX: number, pointerY: number) => {
      const sortedKeys = Array.from(panelsRef.current.keys()).sort(
        (a, b) => a - b,
      );
      const panelAKey = sortedKeys[dividerIndex];
      const panelBKey = sortedKeys[dividerIndex + 1];
      if (panelAKey === undefined || panelBKey === undefined) return;

      const panelA = panelsRef.current.get(panelAKey);
      const panelB = panelsRef.current.get(panelBKey);
      if (!panelA || !panelB) return;

      activeResizeRef.current = {
        dividerIndex,
        startPos: direction === "horizontal" ? pointerX : pointerY,
        panelAKey,
        panelBKey,
        startSizeA: panelA.currentSize,
        startSizeB: panelB.currentSize,
      };
    },
    [direction],
  );

  // Pointer move / up handlers attached to window during drag.
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const info = activeResizeRef.current;
      if (!info) return;

      const pos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = pos - info.startPos;

      const panelA = panelsRef.current.get(info.panelAKey);
      const panelB = panelsRef.current.get(info.panelBKey);
      if (!panelA || !panelB) return;

      const totalSize = info.startSizeA + info.startSizeB;

      let newSizeA = info.startSizeA + delta;
      let newSizeB = info.startSizeB - delta;

      // Enforce minimums first.
      if (newSizeA < panelA.minSize) {
        newSizeA = panelA.minSize;
        newSizeB = totalSize - newSizeA;
      }
      if (newSizeB < panelB.minSize) {
        newSizeB = panelB.minSize;
        newSizeA = totalSize - newSizeB;
      }

      // Enforce maximums.
      if (newSizeA > panelA.maxSize) {
        newSizeA = panelA.maxSize;
        newSizeB = totalSize - newSizeA;
      }
      if (newSizeB > panelB.maxSize) {
        newSizeB = panelB.maxSize;
        newSizeA = totalSize - newSizeB;
      }

      // Final clamp to be safe.
      newSizeA = clamp(newSizeA, panelA.minSize, panelA.maxSize);
      newSizeB = clamp(newSizeB, panelB.minSize, panelB.maxSize);

      panelA.currentSize = newSizeA;
      panelB.currentSize = newSizeB;

      tick();
    }

    function onPointerUp() {
      if (!activeResizeRef.current) return;
      activeResizeRef.current = null;

      // Persist to localStorage.
      const sortedKeys = Array.from(panelsRef.current.keys()).sort(
        (a, b) => a - b,
      );
      const sizes = sortedKeys.map(
        (k) => panelsRef.current.get(k)?.currentSize ?? 0,
      );
      saveSizes(id, sizes);

      tick();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [direction, id, tick]);

  const contextValue = useMemo<PanelGroupContextValue>(
    () => ({
      direction,
      registerPanel,
      unregisterPanel,
      getPanelSize,
      startResize,
    }),
    [direction, registerPanel, unregisterPanel, getPanelSize, startResize],
  );

  const isHorizontal = direction === "horizontal";

  return (
    <PanelGroupContext.Provider value={contextValue}>
      <div
        className={`flex ${isHorizontal ? "flex-row" : "flex-col"} overflow-hidden ${className}`}
        style={{ height: "100%", width: "100%" }}
      >
        {children}
      </div>
    </PanelGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ResizablePanel
// ---------------------------------------------------------------------------

interface ResizablePanelProps {
  /**
   * The ordinal index of this panel within the group. Panels are ordered
   * by this value, and each divider sits between panel `i` and `i+1`.
   */
  index: number;
  /** Default size in pixels when no persisted value exists. */
  defaultSize: number;
  /** Minimum allowed size in pixels. Defaults to 0. */
  minSize?: number;
  /** Maximum allowed size in pixels. Defaults to Infinity. */
  maxSize?: number;
  /**
   * When true, the panel stretches to fill remaining space instead of
   * using a fixed pixel size. Exactly one panel in a group should be
   * flex so that the layout fills its container.
   */
  flex?: boolean;
  /** Additional CSS class names. */
  className?: string;
  children: React.ReactNode;
}

export function ResizablePanel({
  index,
  defaultSize,
  minSize = 0,
  maxSize = Infinity,
  flex = false,
  className = "",
  children,
}: ResizablePanelProps) {
  const { direction, registerPanel, unregisterPanel, getPanelSize } =
    usePanelGroup();

  // Register on mount, unregister on unmount.
  useLayoutEffect(() => {
    registerPanel(index, { defaultSize, minSize, maxSize });
    return () => unregisterPanel(index);
    // Only re-register when identity props change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, defaultSize, minSize, maxSize]);

  const size = getPanelSize(index);
  const isHorizontal = direction === "horizontal";

  const style: React.CSSProperties = flex
    ? { flex: "1 1 0%", minWidth: 0, minHeight: 0, overflow: "hidden" }
    : {
        flexShrink: 0,
        flexGrow: 0,
        overflow: "hidden",
        ...(isHorizontal ? { width: size } : { height: size }),
      };

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResizableDivider
// ---------------------------------------------------------------------------

interface ResizableDividerProps {
  /**
   * The index of the divider. Divider `i` sits between panels at sorted
   * positions `i` and `i+1`.
   */
  index: number;
  /** Additional CSS class names. */
  className?: string;
}

export function ResizableDivider({
  index,
  className = "",
}: ResizableDividerProps) {
  const { direction, startResize } = usePanelGroup();
  const [dragging, setDragging] = useState(false);
  const [hovering, setHovering] = useState(false);

  const isHorizontal = direction === "horizontal";

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      // Capture the pointer so we get move/up even if cursor leaves the divider.
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      startResize(index, e.clientX, e.clientY);
    },
    [index, startResize],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(false);
  }, []);

  // Pick highlight color: during drag or hover use bg-primary (brand indigo),
  // otherwise use bg-border-primary (subtle border color).
  const active = dragging || hovering;
  const bgClass = active ? "bg-primary" : "bg-border-primary";
  const cursorClass = isHorizontal ? "cursor-col-resize" : "cursor-row-resize";

  // Dimensions: 4px thick along the split axis, full extent along the other.
  const sizeStyle: React.CSSProperties = isHorizontal
    ? { width: 4, height: "100%" }
    : { height: 4, width: "100%" };

  return (
    <div
      role="separator"
      aria-orientation={isHorizontal ? "vertical" : "horizontal"}
      className={`flex-shrink-0 ${bgClass} ${cursorClass} transition-colors duration-150 select-none ${className}`}
      style={{ ...sizeStyle, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => {
        setHovering(false);
        // If pointer leaves without pointerup (e.g. fast drag), dragging
        // state is cleaned up by the window-level pointerup in the group.
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
