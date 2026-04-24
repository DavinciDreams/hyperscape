/**
 * MovableWidgetShell — wraps a manifest widget in an edit-mode drag
 * surface. When edit-mode is locked (the default for all players
 * who haven't opened the HUD customizer), the shell is an inert
 * pass-through. When unlocked and the current `editScope` includes
 * `"manifest"`, a transparent overlay + outline intercepts pointer
 * events and writes a `UIOverride` for this instance on drag-end.
 *
 * The shell stays anchor-agnostic: drag deltas map directly to
 * `offset.x/offset.y` regardless of which of the 9 anchors the
 * widget uses (see the convention comment in `ManifestRenderer`).
 * Width/height overrides are deferred to Phase U4.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type {
  AnchoredPosition,
  WidgetCustomization,
} from "@hyperforge/ui-framework";
import { useEditStore } from "../ui/stores/editStore";
import { useSetInstanceOverride } from "./useUserLayout";

/** Minimum pointer movement before a drag is considered started. */
const DRAG_THRESHOLD_PX = 3;

export interface MovableWidgetShellProps {
  /** Stable instance id — used when writing the override. */
  instanceId: string;
  /** Layout id the override belongs to. */
  layoutId: string;
  /** Manifest revision at time of render (recorded with the override). */
  layoutRevision: number | undefined;
  /** The resolved anchored position currently applied to this widget. */
  position: AnchoredPosition;
  /**
   * The widget's customization policy from the manifest. Shell does
   * nothing for widgets whose `movable !== true` — they render as
   * plain children.
   */
  customization?: WidgetCustomization;
  /** The absolutely-positioned CSS style already computed by the renderer. */
  anchorStyle: CSSProperties;
  /** The widget's rendered output. */
  children: ReactNode;
}

/**
 * Edit-mode status for this shell. Derived from the shared `editStore`.
 */
function useIsManifestEditing(): boolean {
  const mode = useEditStore((s) => s.mode);
  const scope = useEditStore((s) => s.editScope);
  return mode === "unlocked" && (scope === "manifest" || scope === "both");
}

/**
 * Apply a grid snap to a drag delta. Uses the per-widget snap value
 * when provided, otherwise falls back to the store's global grid.
 */
function snapOffset(
  raw: number,
  gridSize: number,
  snapEnabled: boolean,
): number {
  if (!snapEnabled || gridSize <= 0) return raw;
  return Math.round(raw / gridSize) * gridSize;
}

export function MovableWidgetShell({
  instanceId,
  layoutId,
  layoutRevision,
  position,
  customization,
  anchorStyle,
  children,
}: MovableWidgetShellProps) {
  const editing = useIsManifestEditing();
  const storeGrid = useEditStore((s) => s.gridSize);
  const snapEnabled = useEditStore((s) => s.snapEnabled);
  const setDraggingInstanceId = useEditStore((s) => s.setDraggingInstanceId);
  const startInstanceResize = useEditStore((s) => s.startInstanceResize);
  const endInstanceResize = useEditStore((s) => s.endInstanceResize);
  const setOverride = useSetInstanceOverride(layoutId, layoutRevision);

  const gridSize = customization?.snapToGrid ?? storeGrid;

  // DOM ref used to measure the widget's current width/height when a
  // resize begins — authors don't have to declare explicit width/height
  // on the manifest for resize to work; we fall back to the rendered
  // size.
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Live drag state kept in refs so pointer move handlers don't
  // re-bind on every frame; a small piece of React state drives the
  // visual delta so the widget actually moves while dragging.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [liveDelta, setLiveDelta] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Resize state — mirrors the drag-state pattern but tracks starting
  // width/height so pointer-move can compute `newW = startW + dx`.
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    startW: number;
    startH: number;
  } | null>(null);
  const resizePointerIdRef = useRef<number | null>(null);
  const [liveSize, setLiveSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!editing || !customization?.movable) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      pointerIdRef.current = e.pointerId;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDraggingInstanceId(instanceId);
    },
    [editing, customization?.movable, instanceId, setDraggingInstanceId],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragStartRef.current) return;
      if (pointerIdRef.current !== e.pointerId) return;
      const rawDx = e.clientX - dragStartRef.current.x;
      const rawDy = e.clientY - dragStartRef.current.y;
      const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
      if (dist < DRAG_THRESHOLD_PX && !liveDelta) return;
      setLiveDelta({
        x: snapOffset(rawDx, gridSize, snapEnabled),
        y: snapOffset(rawDy, gridSize, snapEnabled),
      });
    },
    [liveDelta, gridSize, snapEnabled],
  );

  const finalizeDrag = useCallback(
    (commit: boolean) => {
      const delta = liveDelta;
      dragStartRef.current = null;
      pointerIdRef.current = null;
      setLiveDelta(null);
      setDraggingInstanceId(null);
      if (!commit || !delta) return;
      if (delta.x === 0 && delta.y === 0) return;
      setOverride(instanceId, {
        position: {
          anchor: position.anchor,
          offsetX: position.offset.x + delta.x,
          offsetY: position.offset.y + delta.y,
        },
      });
    },
    [
      liveDelta,
      setDraggingInstanceId,
      setOverride,
      instanceId,
      position.anchor,
      position.offset.x,
      position.offset.y,
    ],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      finalizeDrag(true);
    },
    [finalizeDrag],
  );

  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current !== e.pointerId) return;
      finalizeDrag(false);
    },
    [finalizeDrag],
  );

  // Keyboard-driven move: arrow keys nudge offset by 1px (or `gridSize`
  // when Shift is held). Commits each step to `setOverride` so there's
  // no separate "liveDelta" state — the keyboard path is coarser on
  // purpose, and screen readers/assistive tech read the updated values
  // on next render.
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!editing || !customization?.movable) return;
      const step = e.shiftKey && gridSize > 0 ? gridSize : 1;
      let dx = 0;
      let dy = 0;
      switch (e.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      setOverride(instanceId, {
        position: {
          anchor: position.anchor,
          offsetX: position.offset.x + dx,
          offsetY: position.offset.y + dy,
        },
      });
    },
    [
      editing,
      customization?.movable,
      gridSize,
      setOverride,
      instanceId,
      position.anchor,
      position.offset.x,
      position.offset.y,
    ],
  );

  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!editing || !customization?.resizable) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Measure the wrapper's rendered box. Fall back to the manifest
      // width/height if the ref isn't mounted yet.
      const rect = wrapperRef.current?.getBoundingClientRect();
      const startW = rect?.width ?? position.width ?? 0;
      const startH = rect?.height ?? position.height ?? 0;

      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startW,
        startH,
      };
      resizePointerIdRef.current = e.pointerId;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startInstanceResize(instanceId);
    },
    [
      editing,
      customization?.resizable,
      instanceId,
      position.width,
      position.height,
      startInstanceResize,
    ],
  );

  const handleResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!resizeStartRef.current) return;
      if (resizePointerIdRef.current !== e.pointerId) return;

      const { x, y, startW, startH } = resizeStartRef.current;
      const rawDx = e.clientX - x;
      const rawDy = e.clientY - y;

      // Compute raw target dims from the bottom-right grip.
      let newW = startW + rawDx;
      let newH = startH + rawDy;

      // Aspect-ratio lock: pick the dominant axis (larger delta) and
      // derive the other. Prevents zig-zag during diagonal drag.
      if (customization?.aspectRatio && customization.aspectRatio > 0) {
        const ratio = customization.aspectRatio;
        if (Math.abs(rawDx) >= Math.abs(rawDy)) {
          newH = newW / ratio;
        } else {
          newW = newH * ratio;
        }
      }

      // Min/max clamps. Treat missing bounds as 1 / Infinity.
      const minW = customization?.minWidth ?? 1;
      const maxW = customization?.maxWidth ?? Number.POSITIVE_INFINITY;
      const minH = customization?.minHeight ?? 1;
      const maxH = customization?.maxHeight ?? Number.POSITIVE_INFINITY;
      newW = Math.min(maxW, Math.max(minW, newW));
      newH = Math.min(maxH, Math.max(minH, newH));

      // Re-apply aspect after clamp (clamping one axis can break the
      // ratio). Pick whichever axis is now more constrained.
      if (customization?.aspectRatio && customization.aspectRatio > 0) {
        const ratio = customization.aspectRatio;
        const aspectFromW = newW / ratio;
        const aspectFromH = newH * ratio;
        if (aspectFromW <= maxH && aspectFromW >= minH) {
          newH = aspectFromW;
        } else if (aspectFromH <= maxW && aspectFromH >= minW) {
          newW = aspectFromH;
        }
        // if neither fits, current clamped values win — degenerate
        // constraint set, shell stops changing.
      }

      // Grid snap. Only snap when the user has snap enabled globally.
      if (snapEnabled && gridSize > 0) {
        newW = Math.max(minW, Math.round(newW / gridSize) * gridSize);
        newH = Math.max(minH, Math.round(newH / gridSize) * gridSize);
      }

      setLiveSize({ width: newW, height: newH });
    },
    [gridSize, snapEnabled, customization],
  );

  const finalizeResize = useCallback(
    (commit: boolean) => {
      const size = liveSize;
      resizeStartRef.current = null;
      resizePointerIdRef.current = null;
      setLiveSize(null);
      endInstanceResize();
      if (!commit || !size) return;

      setOverride(instanceId, {
        position: {
          anchor: position.anchor,
          offsetX: position.offset.x,
          offsetY: position.offset.y,
          width: size.width,
          height: size.height,
        },
      });
    },
    [
      liveSize,
      endInstanceResize,
      setOverride,
      instanceId,
      position.anchor,
      position.offset.x,
      position.offset.y,
    ],
  );

  const handleResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (resizePointerIdRef.current !== e.pointerId) return;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      finalizeResize(true);
    },
    [finalizeResize],
  );

  const handleResizePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (resizePointerIdRef.current !== e.pointerId) return;
      finalizeResize(false);
    },
    [finalizeResize],
  );

  // Keyboard-driven resize: arrow keys grow/shrink the widget. Shift
  // uses `gridSize` as the step. Width is controlled by Left/Right,
  // height by Up/Down. Respects min/max/aspect clamps.
  const handleResizeKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!editing || !customization?.resizable) return;
      const step = e.shiftKey && gridSize > 0 ? gridSize : 1;
      let dw = 0;
      let dh = 0;
      switch (e.key) {
        case "ArrowLeft":
          dw = -step;
          break;
        case "ArrowRight":
          dw = step;
          break;
        case "ArrowUp":
          dh = -step;
          break;
        case "ArrowDown":
          dh = step;
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();

      // Start from the manifest-authored size (or 0 if unauthored).
      const rect = wrapperRef.current?.getBoundingClientRect();
      const startW = rect?.width ?? position.width ?? 0;
      const startH = rect?.height ?? position.height ?? 0;
      let newW = startW + dw;
      let newH = startH + dh;

      if (customization?.aspectRatio && customization.aspectRatio > 0) {
        const ratio = customization.aspectRatio;
        if (Math.abs(dw) >= Math.abs(dh)) {
          newH = newW / ratio;
        } else {
          newW = newH * ratio;
        }
      }

      const minW = customization?.minWidth ?? 1;
      const maxW = customization?.maxWidth ?? Number.POSITIVE_INFINITY;
      const minH = customization?.minHeight ?? 1;
      const maxH = customization?.maxHeight ?? Number.POSITIVE_INFINITY;
      newW = Math.min(maxW, Math.max(minW, newW));
      newH = Math.min(maxH, Math.max(minH, newH));

      setOverride(instanceId, {
        position: {
          anchor: position.anchor,
          offsetX: position.offset.x,
          offsetY: position.offset.y,
          width: newW,
          height: newH,
        },
      });
    },
    [
      editing,
      customization,
      gridSize,
      setOverride,
      instanceId,
      position.anchor,
      position.offset.x,
      position.offset.y,
      position.width,
      position.height,
    ],
  );

  // Safety net: if the component unmounts mid-drag or mid-resize
  // (e.g. the HUD hides because of a context change), clear the
  // dragging/resizing flag so the store doesn't get stuck pointing
  // at a dead instance.
  useEffect(() => {
    return () => {
      if (pointerIdRef.current !== null) {
        setDraggingInstanceId(null);
      }
      if (resizePointerIdRef.current !== null) {
        endInstanceResize();
      }
    };
  }, [setDraggingInstanceId, endInstanceResize]);

  // Translate the wrapper by the live delta so the widget tracks the
  // pointer. We add to any existing transform in anchorStyle (the
  // centered anchors already use transform for translate-50%). When a
  // resize is in flight, also apply the live width/height.
  const liveStyle: CSSProperties = (() => {
    const base: CSSProperties = liveDelta
      ? (() => {
          const existing = anchorStyle.transform ?? "";
          const translate = `translate(${liveDelta.x}px, ${liveDelta.y}px)`;
          return {
            ...anchorStyle,
            transform: existing ? `${existing} ${translate}` : translate,
          };
        })()
      : anchorStyle;

    if (liveSize) {
      return { ...base, width: liveSize.width, height: liveSize.height };
    }
    return base;
  })();

  const showDragAffordance = editing && customization?.movable === true;
  const showResizeAffordance = editing && customization?.resizable === true;

  return (
    <div
      ref={wrapperRef}
      data-instance-id={instanceId}
      style={{
        ...liveStyle,
        // Let the overlays capture events; base wrapper stays
        // transparent so widgets keep their existing hit-testing
        // when the shell is idle.
        pointerEvents:
          showDragAffordance || showResizeAffordance ? "auto" : undefined,
      }}
    >
      {children}
      {showDragAffordance ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Move widget ${instanceId}. Use arrow keys to nudge, hold shift to snap to grid.`}
          aria-grabbed={liveDelta !== null}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
          style={{
            position: "absolute",
            inset: 0,
            cursor: liveDelta ? "grabbing" : "grab",
            outline: "1px dashed rgba(255,255,255,0.6)",
            outlineOffset: 2,
            background: "rgba(0,0,0,0.001)", // hit-testable, effectively invisible
            touchAction: "none",
          }}
        />
      ) : null}
      {showResizeAffordance ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Resize widget ${instanceId}. Use arrow keys: left/right for width, up/down for height. Hold shift to snap to grid.`}
          data-resize-grip="true"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerCancel}
          onKeyDown={handleResizeKeyDown}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            width: 12,
            height: 12,
            cursor: "nwse-resize",
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(0,0,0,0.4)",
            borderRadius: 2,
            touchAction: "none",
          }}
        />
      ) : null}
    </div>
  );
}
