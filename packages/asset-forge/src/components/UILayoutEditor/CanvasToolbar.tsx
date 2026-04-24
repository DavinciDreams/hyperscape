/**
 * CanvasToolbar — controls strip pinned above the UI Layout canvas.
 *
 * Exposes the view-state actions from `canvasViewStore`:
 *   - Device preset picker (desktop/tablet/mobile)
 *   - Zoom in / out / reset / exact %
 *   - Overlay toggles: rulers, grid, guides, checkerboard
 *
 * None of these controls mutate the manifest — they only affect how
 * the author sees the canvas. Keeping them adjacent to the canvas
 * (rather than in the global page header) keeps authoring ergonomics
 * tight: the controls the author reaches for while placing widgets
 * live next to the canvas they're affecting.
 */

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Eye,
  EyeOff,
  Grid3x3,
  Maximize2,
  Redo2,
  Ruler,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { AlignEdge, DistributeAxis } from "./alignmentActions";
import {
  DEVICE_PRESETS,
  getPreset,
  useCanvasViewStore,
} from "./canvasViewStore";
import { useUILayoutStore } from "./store";
import { ViewportSwitcher } from "./ViewportSwitcher";

export function CanvasToolbar() {
  const zoom = useCanvasViewStore((s) => s.zoom);
  const presetId = useCanvasViewStore((s) => s.presetId);
  const showRulers = useCanvasViewStore((s) => s.showRulers);
  const showGrid = useCanvasViewStore((s) => s.showGrid);
  const showGuides = useCanvasViewStore((s) => s.showGuides);
  const showCheckerboard = useCanvasViewStore((s) => s.showCheckerboard);
  const zoomIn = useCanvasViewStore((s) => s.zoomIn);
  const zoomOut = useCanvasViewStore((s) => s.zoomOut);
  const resetView = useCanvasViewStore((s) => s.resetView);
  const setPreset = useCanvasViewStore((s) => s.setPreset);
  const toggleRulers = useCanvasViewStore((s) => s.toggleRulers);
  const toggleGrid = useCanvasViewStore((s) => s.toggleGrid);
  const toggleGuides = useCanvasViewStore((s) => s.toggleGuides);
  const toggleCheckerboard = useCanvasViewStore((s) => s.toggleCheckerboard);

  // Subscribe to history-stack sizes so the undo/redo buttons
  // correctly enable/disable across mutations.
  const canUndo = useUILayoutStore((s) => s.past.length > 0);
  const canRedo = useUILayoutStore((s) => s.future.length > 0);
  const undo = useUILayoutStore((s) => s.undo);
  const redo = useUILayoutStore((s) => s.redo);

  // Align-to-viewport is only meaningful when there's at least one
  // anchored instance in the current selection. We gate the button
  // enabled-state on that so the toolbar doesn't offer no-op actions.
  // When multiple are selected, every anchored member is aligned
  // under a single history entry via `alignInstancesToViewport`.
  const selectedId = useUILayoutStore((s) => s.selectedInstanceId);
  const additionalSelectionIds = useUILayoutStore(
    (s) => s.additionalSelectionIds,
  );
  const anchoredSelectedCount = useUILayoutStore((s) => {
    if (!s.selectedInstanceId) return 0;
    const ids = new Set([s.selectedInstanceId, ...s.additionalSelectionIds]);
    let n = 0;
    for (const i of s.layout.instances) {
      if (ids.has(i.instanceId) && i.position.kind === "anchored") n++;
    }
    return n;
  });
  const alignToViewport = useUILayoutStore((s) => s.alignInstanceToViewport);
  const alignManyToViewport = useUILayoutStore(
    (s) => s.alignInstancesToViewport,
  );
  const alignToSelection = useUILayoutStore((s) => s.alignInstancesToSelection);
  const distributeInstances = useUILayoutStore((s) => s.distributeInstances);
  // Figma/UE parity:
  //   - 1 anchored selected → align-to-viewport
  //   - 2+ anchored selected → align-to-selection (bbox of selection)
  //   - 3+ anchored selected → distribute H/V available
  const canAlign = anchoredSelectedCount >= 1;
  const canDistribute = anchoredSelectedCount >= 3;
  const alignModeLabel =
    anchoredSelectedCount >= 2 ? "to selection" : "to viewport";
  const runAlign = (edge: AlignEdge) => {
    if (!selectedId || !canAlign) return;
    const preset = getPreset(presetId);
    const viewport = { width: preset.width, height: preset.height };
    const allSelected = [selectedId, ...additionalSelectionIds];
    if (anchoredSelectedCount >= 2) {
      alignToSelection(allSelected, edge, viewport);
    } else if (allSelected.length > 1) {
      // Mixed selection (some non-anchored) but only 1 anchored —
      // fall back to per-member viewport align for the anchored one.
      alignManyToViewport(allSelected, edge, viewport);
    } else {
      alignToViewport(selectedId, edge, viewport);
    }
  };
  const runDistribute = (axis: DistributeAxis) => {
    if (!selectedId || !canDistribute) return;
    const preset = getPreset(presetId);
    const viewport = { width: preset.width, height: preset.height };
    const allSelected = [selectedId, ...additionalSelectionIds];
    distributeInstances(allSelected, axis, viewport);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 gap-y-1 border-b border-bg-tertiary bg-bg-secondary px-3 py-1.5 text-xs">
      {/* Device preset */}
      <label className="flex items-center gap-1.5 text-text-secondary">
        <span>Preset</span>
        <select
          value={presetId}
          onChange={(e) => setPreset(e.target.value)}
          className="rounded border border-bg-tertiary bg-bg-primary px-2 py-0.5 text-xs text-text-primary outline-none focus:border-primary"
          title="Canvas device preset"
        >
          {DEVICE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <Divider />

      {/* Variant selector — picks which authored variant
          (base/mobile/tablet/desktop) the editor is targeting. */}
      <ViewportSwitcher />

      <Divider />

      {/* Undo / redo */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          onClick={undo}
          title="Undo (Ctrl/Cmd+Z)"
          disabled={!canUndo}
        >
          <Undo2 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={redo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          disabled={!canRedo}
        >
          <Redo2 size={14} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <ToolbarButton onClick={zoomOut} title="Zoom out (Ctrl/Cmd+wheel)">
          <ZoomOut size={14} />
        </ToolbarButton>
        <span
          className="min-w-[44px] select-none text-center font-mono text-text-secondary"
          title="Current zoom"
        >
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarButton onClick={zoomIn} title="Zoom in (Ctrl/Cmd+wheel)">
          <ZoomIn size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={resetView}
          title="Reset zoom & pan (double-click canvas)"
        >
          <Maximize2 size={14} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Align to viewport. Disabled when no anchored widget is
          selected — grid/flex positions have no canvas coordinates
          to align against. */}
      <div
        className="flex items-center gap-1"
        title={
          canAlign
            ? `Align selected widget(s) ${alignModeLabel}`
            : "Select an anchored widget to enable alignment"
        }
      >
        <ToolbarButton
          onClick={() => runAlign("left")}
          title={`Align left (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignStartVertical size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAlign("center-h")}
          title={`Align center horizontally (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignCenterVertical size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAlign("right")}
          title={`Align right (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignEndVertical size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAlign("top")}
          title={`Align top (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignStartHorizontal size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAlign("center-v")}
          title={`Align center vertically (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignCenterHorizontal size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runAlign("bottom")}
          title={`Align bottom (${alignModeLabel})`}
          disabled={!canAlign}
        >
          <AlignEndHorizontal size={14} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Distribute: evenly space centers along an axis. Only
          enabled with 3+ anchored widgets selected (2 widgets
          have no middle gaps to distribute). */}
      <div
        className="flex items-center gap-1"
        title={
          canDistribute
            ? "Distribute selected widgets evenly"
            : "Select 3+ anchored widgets to enable distribute"
        }
      >
        <ToolbarButton
          onClick={() => runDistribute("h")}
          title="Distribute horizontally (evenly space centers)"
          disabled={!canDistribute}
        >
          <AlignHorizontalDistributeCenter size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => runDistribute("v")}
          title="Distribute vertically (evenly space centers)"
          disabled={!canDistribute}
        >
          <AlignVerticalDistributeCenter size={14} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Overlay toggles */}
      <div className="flex items-center gap-1">
        <ToggleButton
          active={showRulers}
          onClick={toggleRulers}
          title="Toggle rulers"
        >
          <Ruler size={14} />
        </ToggleButton>
        <ToggleButton
          active={showGrid}
          onClick={toggleGrid}
          title="Toggle grid overlay"
        >
          <Grid3x3 size={14} />
        </ToggleButton>
        <ToggleButton
          active={showGuides}
          onClick={toggleGuides}
          title="Toggle alignment guides while dragging"
        >
          {showGuides ? <Eye size={14} /> : <EyeOff size={14} />}
        </ToggleButton>
        <ToggleButton
          active={showCheckerboard}
          onClick={toggleCheckerboard}
          title="Toggle canvas checker background"
        >
          <span className="text-[10px] font-bold">▦</span>
        </ToggleButton>
      </div>

      {/* Keyboard hints — truncated on narrow toolbars.
          The full reference lives in the `title` attribute of each
          control (hover any button). This strip is cosmetic and
          intentionally hides early so the alignment/distribute
          controls always stay visible. */}
      <div
        className="ml-auto hidden min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] text-text-tertiary xl:flex"
        title="Space+drag=pan • Ctrl+wheel=zoom • Shift=axis-lock • Alt=no snap • Ctrl+D=dup • Ctrl+A=all • Ctrl+Z=undo"
      >
        <kbd className="rounded bg-bg-primary px-1 py-0.5 font-mono">Space</kbd>
        <span>pan</span>
        <span className="text-text-tertiary/40">·</span>
        <kbd className="rounded bg-bg-primary px-1 py-0.5 font-mono">
          Ctrl+A
        </kbd>
        <span>all</span>
        <span className="text-text-tertiary/40">·</span>
        <kbd className="rounded bg-bg-primary px-1 py-0.5 font-mono">
          Ctrl+D
        </kbd>
        <span>dup</span>
        <span className="text-text-tertiary/40">·</span>
        <kbd className="rounded bg-bg-primary px-1 py-0.5 font-mono">
          Ctrl+Z
        </kbd>
        <span>undo</span>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-4 w-px bg-bg-tertiary" aria-hidden />;
}

interface ButtonProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}

function ToolbarButton({ onClick, title, children, disabled }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        "flex h-6 w-6 items-center justify-center rounded " +
        (disabled
          ? "text-text-tertiary/40 cursor-not-allowed"
          : "text-text-secondary hover:bg-bg-primary hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  children,
}: ButtonProps & { active: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "flex h-6 w-6 items-center justify-center rounded " +
        (active
          ? "bg-primary/20 text-primary"
          : "text-text-tertiary hover:bg-bg-primary hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}
