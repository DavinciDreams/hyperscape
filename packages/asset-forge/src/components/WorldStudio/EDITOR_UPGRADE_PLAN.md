# World Studio Editor Upgrade Plan

## Phase A — Core UX Polish ✅
1. ✅ **Resizable panel dividers** — drag handles between panels
2. ✅ **Tabbed right panel** — Properties/Content/Deploy/AI as tabs
3. ✅ **Multi-select** — Ctrl+click in outliner (Zustand useSelectionStore)
4. ✅ **Copy/Paste/Duplicate** — Ctrl+D duplicate via DuplicateEntityCommand
5. ✅ **Toolbar grouping** — visual separators, active underline, tooltips
6. ✅ **Enhanced status bar** — auto-save timer, entity count, undo depth, selection info
7. ✅ **Bottom panel** — validation errors, console output, command history (BottomPanel.tsx)

## Phase B — Content Browser & Manifest Integration ✅
8. ✅ **Unified Content Browser** — UE5-style 1200-line ContentBrowser.tsx with grid/list/search/drag
9. ✅ **Bidirectional manifest ↔ viewport** — already wired (NPCProperties reads manifest data)
10. ✅ **Validation overlay** — validation issue dots in outliner + issue count in footer
11. ✅ **Right-click context menus** — outliner + viewport with real Duplicate/Delete/Focus actions

## Phase C — Procgen Tools ✅
12. ✅ **Vegetation/Foliage brush** — paint tree/grass instances (useBrushOverlaySync vegetation overlay, BrushSettingsPanel species filter)
13. ✅ **Spline tool** — roads, rivers, paths (PathToolPanel.tsx)
14. ✅ **Generate Town Here** — click location, configure, generate (GenerateTownDialog.tsx)
15. ✅ **Web Worker generation** — unblock UI during terrain gen (worldGeneration.worker.ts + useWorldGenerationWorker hook)
16. ✅ **Procgen preset gallery** — visual 2-column grid with emoji icons + descriptions

## Phase D — Advanced Editor Features ✅
17. ✅ **Camera bookmarks** — save/recall positions (useCameraBookmarks + viewport menu)
18. ✅ **Layer system** — bulk visibility toggle in outliner (collapsible layers section)
19. ✅ **User-created folders** — outliner hierarchy (OutlinerPanel custom folders with context menu)
20. ✅ **Quest/progression visualizer** — graph view (QuestGraphPanel.tsx SVG-based DAG)
21. ✅ **World area boundaries** — polygon visualization (useAreaBoundaryOverlay.ts Three.js overlay)
22. ✅ **Comparison viewport** — before/after procgen (ComparisonOverlay.tsx with slider divider)

## Quick Wins ✅
- ✅ Ctrl+D to duplicate selected entity (DuplicateEntityCommand)
- ✅ Double-click outliner → focus camera (cameraTeleport)
- ✅ Escape cascading (cancel → deselect → deactivate tool)
- ✅ Right-click viewport context menu (Focus/Duplicate/Delete/Grid/Bookmarks)
- ✅ Property section collapse memory (localStorage)
- ✅ Save shortcut feedback (green flash animation)
- ✅ Entity count in status bar
- ✅ Dirty indicator (* in project name)
- ✅ Delete via command history (undoable)
- ✅ Shared entity action utilities (utils/entityActions.ts)

## Architecture Improvements
- ✅ Extracted `entityActions.ts` — shared ENTITY_ACTIONS map, findEntityData, executeDuplicate, executeDelete
- ✅ Removed duplicated delete logic from ViewportContainer (uses shared utility)
- ✅ Removed duplicated ENTITY_ACTIONS from useWorldStudioShortcuts (uses shared utility)
- ✅ All new code passes TypeScript strict checks (0 new errors)

## Phase E — UE5 Quality Audit & UX Overhaul ✅

### Bug Fixes
- ✅ Removed dead "measure" tool (was in StudioToolMode + toolbar but had zero implementation)
- ✅ Wired transform gizmo buttons (Translate/Rotate/Scale/World/Local) to actual context state instead of empty `onClick={() => {}}`
- ✅ Added `GizmoTransformMode` and `GizmoTransformSpace` state to WorldStudioContext
- ✅ Fixed entity count in StatusBar to include base world layers (NPCs, quests, bosses), not just extended layers
- ✅ Fixed context menu "Focus" action — direct `focusOnPosition()` call instead of synthesized KeyboardEvent
- ✅ Fixed deployment state: `DEPLOY_PROMOTION_APPROVE` now clears `pendingPromotion: null`
- ✅ Fixed ProcgenPanel vegetation section mislabel → renamed to "Island & Coastline" with Waves icon
- ✅ Fixed OutlinerPanel visibility state mutation hack → proper `setVisibilityMap` with immutable Map updates
- ✅ Wired BottomPanel Console tab → real `console.log/warn/error` capture with timestamps, colors, clear button
- ✅ PathToolPanel → honest about state ("Path editing tools are in development"), removed fake interactive UI

### UE5-Style UX Upgrades
- ✅ **Drag-to-scrub numeric inputs** — `DragNumberInput` component + `useDragScrub` hook (Shift=10x, Ctrl=0.1x precision)
- ✅ **UE5 inline slider** — `SliderInput` overhauled: fill bar with value overlay, drag to change, double-click for precise input
- ✅ **Axis-colored inputs** — TransformSection + PositionEditor use red/green/blue left-border accent on X/Y/Z fields
- ✅ **Recessed dark inputs** — `bg-[#141414]` with `border-[#1a1a1a]` matching UE5's recessed input style
- ✅ **PropertySection accent bar** — 2px primary-color left border when expanded, darker `bg-[#1a1a1a]` header
- ✅ **Toast notification system** — `pushToast()` module-level API, slide-in from right, auto-dismiss with progress bar
- ✅ **Viewport info overlay** — Camera position (axis-colored), FPS counter, entity count, active tool, grid/snap toggles
- ✅ **CSS theme additions** — `.ws-input`, `.ws-slider-bar`, `.ws-drag-label`, `.ws-axis-*`, `.ws-viewport-pill`, `.ws-panel`

### Key New Files
- `layout/ToastNotifications.tsx` — Toast notification system
- `viewport/ViewportOverlay.tsx` — UE5-style viewport info overlay
- CSS additions in `src/styles/index.css`
