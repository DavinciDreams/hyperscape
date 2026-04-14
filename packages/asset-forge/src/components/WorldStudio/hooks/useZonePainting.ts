/**
 * useZonePainting — Tile-based zone painting + persistent region tile overlay
 *
 * PERFORMANCE ARCHITECTURE:
 * - Overlay: One merged BufferGeometry per region. Each tile is a subdivided
 *   grid (4x4 segments = 25 verts) with per-vertex terrain height sampling.
 *   Rebuilt on structural changes; vertex positions updated on tile changes.
 *
 * - Cursor: Pre-allocated merged BufferGeometry (max 400 tiles x 25 verts).
 *   Updated in-place from mousemove handler — never disposed/recreated.
 *   Completely decoupled from React state.
 *
 * - Height: Terrain-conforming via analytical getTerrainHeight (no raycasts).
 *   Single raycast for mouse->tile mapping only. Per-vertex height queries O(1).
 *
 * - Events: Cursor position lives in a ref, NOT in React state.
 *   Only PAINT_ZONE_TILES is dispatched (for persistence). Overlay refresh
 *   coalesced via requestAnimationFrame.
 *
 * All geometry creation, overlay management, and cursor updates live in
 * utils/zonePaintEngine.ts. This hook is a thin React lifecycle wrapper.
 */

import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { tileKey, ZONE_TILE_SIZE } from "../types";
import { useWorldStudio } from "../WorldStudioContext";

import {
  type RegionOverlayEntry,
  type CursorState,
  createInitialCursorState,
  raycastToTerrain,
  getBrushTiles,
  updateCursorGeometry,
  createCursorResources,
  disposeCursorResources,
  buildFullOverlay,
  teardownOverlay,
  updateRegionMesh,
  disposeOverlayEntry,
  BRUSH_STEPS,
} from "../utils/zonePaintEngine";

import type { PlacedRegion } from "../types";
import type { Group } from "three/webgpu";

// ============== HOOK ==============

interface ZonePaintingOptions {
  sceneRefs: TerrainSceneRefs | null;
}

export function useZonePainting({ sceneRefs }: ZonePaintingOptions) {
  const { state, actions } = useWorldStudio();
  const zonePaint = state.tools.zonePaint;
  const isPainting = state.tools.activeTool === "zonePaint" && !!zonePaint;
  const regions = state.extendedLayers.regions;
  const selection = state.builder.editing.selection;
  const selectedRegionId = selection?.type === "region" ? selection.id : null;
  const zoneOverlayVisible = state.overlays.zoneOverlay;

  const ts = ZONE_TILE_SIZE;

  // Stable refs for event handlers
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const zonePaintRef = useRef(zonePaint);
  zonePaintRef.current = zonePaint;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const isMouseDownRef = useRef(false);
  const zoneOverlayVisibleRef = useRef(zoneOverlayVisible);
  zoneOverlayVisibleRef.current = zoneOverlayVisible;

  // Overlay state (imperative, not React-driven during painting)
  const overlayGroupRef = useRef<Group | null>(null);
  const overlayEntriesRef = useRef<Map<string, RegionOverlayEntry>>(new Map());
  const rebuildTimerRef = useRef<number | null>(null);

  // Cursor state (fully imperative)
  const cursorRef = useRef<CursorState>(createInitialCursorState());

  // ==================================================================
  // OVERLAY: Build/rebuild region tile meshes
  // ==================================================================

  const buildOverlay = useCallback(() => {
    const refs = sceneRefsRef.current;
    if (!refs) return;

    // Tear down existing overlay
    if (overlayGroupRef.current) {
      teardownOverlay(
        overlayGroupRef.current,
        overlayEntriesRef.current,
        refs.scene,
      );
      overlayGroupRef.current = null;
    }

    const currentRegions = regionsRef.current;
    if (currentRegions.length === 0) return;

    const selId = selection?.type === "region" ? selection.id : null;
    const { group, entries } = buildFullOverlay(
      currentRegions,
      selId,
      ts,
      refs,
      zoneOverlayVisibleRef.current,
    );

    overlayGroupRef.current = group;
    overlayEntriesRef.current = entries;
  }, [selection, ts]);

  // Toggle overlay visibility without rebuilding geometry
  useEffect(() => {
    if (overlayGroupRef.current) {
      overlayGroupRef.current.visible = zoneOverlayVisible;
    }
  }, [zoneOverlayVisible]);

  // Rebuild overlay on structural changes only
  const regionStructureKey = regions.map((r: PlacedRegion) => r.id).join(",");

  useEffect(() => {
    buildOverlay();
  }, [sceneRefs, regionStructureKey, selectedRegionId, buildOverlay]);

  // Incremental overlay update when tiles change (immediate via rAF)
  const scheduleOverlayRefresh = useCallback(() => {
    if (rebuildTimerRef.current) cancelAnimationFrame(rebuildTimerRef.current);
    rebuildTimerRef.current = requestAnimationFrame(() => {
      rebuildTimerRef.current = null;
      const refs = sceneRefsRef.current;
      const heightFn = refs?.getTerrainHeight ?? null;
      const sceneOffset = (refs?.worldCenterOffset ?? 0) / ts;
      const currentRegions = regionsRef.current;
      for (const region of currentRegions) {
        const entry = overlayEntriesRef.current.get(region.id);
        if (!entry) continue;
        const ok = updateRegionMesh(entry, region, ts, heightFn, sceneOffset);
        if (!ok) {
          // Buffer too small — need full rebuild
          buildOverlay();
          return;
        }
      }
    });
  }, [buildOverlay, ts]);

  // Watch for tile changes (regions array ref changes on paint)
  const prevRegionsRef = useRef(regions);
  useEffect(() => {
    if (prevRegionsRef.current !== regions) {
      prevRegionsRef.current = regions;
      scheduleOverlayRefresh();
    }
  }, [regions, scheduleOverlayRefresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current)
        cancelAnimationFrame(rebuildTimerRef.current);
      const refs = sceneRefsRef.current;
      const group = overlayGroupRef.current;
      if (refs && group) {
        refs.scene.remove(group);
      }
      for (const entry of overlayEntriesRef.current.values()) {
        disposeOverlayEntry(entry);
      }
      overlayEntriesRef.current.clear();
    };
  }, []);

  // ==================================================================
  // CURSOR: Pre-allocated merged geometry
  // ==================================================================

  useEffect(() => {
    if (!isPainting || !sceneRefs) return;

    const cursor = createCursorResources(sceneRefs.scene);
    cursorRef.current = cursor;

    return () => {
      disposeCursorResources(cursor, sceneRefs.scene);
      cursorRef.current = createInitialCursorState();
    };
  }, [isPainting, sceneRefs]);

  /** Update cursor visuals imperatively (called from mousemove, not React) */
  const updateCursor = useCallback(
    (tileX: number, tileZ: number) => {
      const zp = zonePaintRef.current;
      const refs = sceneRefsRef.current;
      if (!zp) return;

      const heightFn = refs?.getTerrainHeight ?? null;
      updateCursorGeometry(
        cursorRef.current,
        tileX,
        tileZ,
        zp.brushSize,
        zp.mode === "erase",
        ts,
        heightFn,
      );
    },
    [ts],
  );

  // ==================================================================
  // EVENT LISTENERS (painting interaction)
  // ==================================================================

  useEffect(() => {
    if (!isPainting || !sceneRefs) return;

    const el = sceneRefs.container;

    const paintAtMouse = (e: MouseEvent) => {
      const zp = zonePaintRef.current;
      const refs = sceneRefsRef.current;
      if (!zp || !refs) return;
      const hit = raycastToTerrain(e.clientX, e.clientY, refs, ts);
      if (!hit) return;

      // Raycast returns scene-space tiles; convert to game-space for storage
      const tileOffset = Math.floor(refs.worldCenterOffset / ts);
      const brushTiles = getBrushTiles(hit.tileX, hit.tileZ, zp.brushSize);
      const keys = brushTiles.map((t) =>
        tileKey(t.x - tileOffset, t.z - tileOffset),
      );
      const erase = zp.mode === "erase" || e.button === 2;
      actionsRef.current.paintZoneTiles(zp.regionId, keys, erase);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const refs = sceneRefsRef.current;
      if (!refs) return;

      const hit = raycastToTerrain(e.clientX, e.clientY, refs, ts);
      if (hit) {
        updateCursor(hit.tileX, hit.tileZ);
      }

      if (isMouseDownRef.current) {
        paintAtMouse(e);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.stopPropagation();
      e.preventDefault();
      isMouseDownRef.current = true;
      paintAtMouse(e);
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        actionsRef.current.stopZonePaint();
        return;
      }
      if (e.key === "[" || e.key === "]") {
        const zp = zonePaintRef.current;
        if (!zp) return;
        const idx = BRUSH_STEPS.indexOf(zp.brushSize);
        if (e.key === "[" && idx > 0) {
          actionsRef.current.setZoneBrushSize(BRUSH_STEPS[idx - 1]);
        } else if (e.key === "]" && idx < BRUSH_STEPS.length - 1) {
          actionsRef.current.setZoneBrushSize(BRUSH_STEPS[idx + 1]);
        }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        const zp = zonePaintRef.current;
        if (zp) {
          actionsRef.current.setZonePaintMode(
            zp.mode === "paint" ? "erase" : "paint",
          );
        }
      }
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mousedown", handleMouseDown, true);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mousedown", handleMouseDown, true);
      el.removeEventListener("mouseup", handleMouseUp);
      el.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      isMouseDownRef.current = false;
    };
  }, [isPainting, sceneRefs, ts, updateCursor]);
}
