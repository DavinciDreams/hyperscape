/**
 * useZonePainting — Tile-based zone painting + persistent region tile overlay
 *
 * PERFORMANCE ARCHITECTURE:
 * - Overlay: One merged BufferGeometry per region. Each tile is a subdivided
 *   grid (4×4 segments = 25 verts) with per-vertex terrain height sampling.
 *   Rebuilt on structural changes; vertex positions updated on tile changes.
 *
 * - Cursor: Pre-allocated merged BufferGeometry (max 400 tiles × 25 verts).
 *   Updated in-place from mousemove handler — never disposed/recreated.
 *   Completely decoupled from React state.
 *
 * - Height: Terrain-conforming via analytical getTerrainHeight (no raycasts).
 *   Single raycast for mouse→tile mapping only. Per-vertex height queries O(1).
 *
 * - Events: Cursor position lives in a ref, NOT in React state.
 *   Only PAINT_ZONE_TILES is dispatched (for persistence). Overlay refresh
 *   coalesced via requestAnimationFrame.
 */

import * as THREE from "three";
import {
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
  SpriteNodeMaterial,
} from "three/webgpu";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { PlacedRegion } from "../types";
import { tileKey, parseTileKey, ZONE_TILE_SIZE } from "../types";
import { useWorldStudio } from "../WorldStudioContext";
import {
  queueDisposal,
  stageAddition,
  cancelStagedAdditions,
} from "../utils/deferredGpuDisposal";

// ============== CONSTANTS ==============

const OVERLAY_Y_OFFSET = 0.35; // above terrain surface — avoids Z-fighting
const CURSOR_Y_OFFSET = 0.5; // cursor slightly above overlay
const LABEL_Y_OFFSET = 8; // label height above highest tile
const MAX_CURSOR_TILES = 2601; // 51×51 for brush size 50
const TILE_SEGMENTS = 1; // 1m tiles only need 4 corner verts
const VERTS_PER_TILE = (TILE_SEGMENTS + 1) * (TILE_SEGMENTS + 1); // 25
const TRIS_PER_TILE = TILE_SEGMENTS * TILE_SEGMENTS * 2; // 32
const INDICES_PER_TILE = TRIS_PER_TILE * 3; // 96

const REGION_COLORS = [
  0xff8800, 0x00ccff, 0x88ff00, 0xff44aa, 0xaa44ff, 0xffcc00, 0x00ff88,
  0xff4444, 0x4488ff, 0x44ffcc,
];
const SELECTED_HIGHLIGHT = 0x00ccff;
const CURSOR_COLOR = 0xffffff;
const ERASE_COLOR = 0xff4444;

// ============== HELPERS ==============

type HeightFn = (sceneX: number, sceneZ: number) => number;

function getRegionColor(index: number): number {
  return REGION_COLORS[index % REGION_COLORS.length];
}

/** Map tier difficulty color strings to hex for auto-generated zones.
 *  Colors chosen for maximum contrast at overlay opacity (~0.30). */
const TIER_COLOR_MAP: Record<string, number> = {
  safe: 0x2e7d32, // dark green — clearly safe
  beginner: 0x66bb6a, // medium green — slightly more intense
  low: 0xfdd835, // bright yellow — distinct from greens
  mid: 0xff9800, // orange
  dangerous: 0xd32f2f, // red
  high: 0xd32f2f, // red (alias)
  extreme: 0x6a1b9a, // deep purple — unmistakable from red
};

function getTierColor(region: PlacedRegion): number {
  // Look for a tier tag on the region (set during auto-gen apply)
  const tierTag = region.tags?.find((t) => TIER_COLOR_MAP[t] !== undefined);
  if (tierTag) return TIER_COLOR_MAP[tierTag];
  // Fallback: parse the color from autoGenBounds difficulty range
  const dr = region.autoGenBounds?.difficultyRange;
  if (dr) {
    const mid = (dr[0] + dr[1]) / 2;
    if (mid < 0.05) return 0x2e7d32; // safe — dark green
    if (mid < 0.15) return 0x66bb6a; // beginner — medium green
    if (mid < 0.3) return 0xfdd835; // low — bright yellow
    if (mid < 0.5) return 0xff9800; // mid — orange
    if (mid < 0.75) return 0xd32f2f; // high — red
    return 0x6a1b9a; // extreme — deep purple
  }
  return 0x888888;
}

/** Get tile indices under a brush centered at tileX,tileZ */
function getBrushTiles(
  centerX: number,
  centerZ: number,
  brushSize: number,
): Array<{ x: number; z: number }> {
  const tiles: Array<{ x: number; z: number }> = [];
  const radius = Math.floor(brushSize / 2);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      tiles.push({ x: centerX + dx, z: centerZ + dz });
    }
  }
  return tiles;
}

/**
 * Write a single subdivided tile's vertices + indices into pre-allocated buffers.
 * Each tile is a (TILE_SEGMENTS+1)² vertex grid draped onto terrain.
 */
function writeTileGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  tileIndex: number,
  tileOriginX: number, // world X of tile's left edge
  tileOriginZ: number, // world Z of tile's top edge
  ts: number,
  yOffset: number,
  heightFn: HeightFn | null,
): number {
  const segs = TILE_SEGMENTS;
  const step = ts / segs;
  const rowVerts = segs + 1;
  const baseVert = tileIndex * VERTS_PER_TILE;
  let posIdx = baseVert * 3;
  let maxY = -Infinity;

  // Write vertex positions
  for (let iz = 0; iz <= segs; iz++) {
    for (let ix = 0; ix <= segs; ix++) {
      const wx = tileOriginX + ix * step;
      const wz = tileOriginZ + iz * step;
      const wy = (heightFn ? heightFn(wx, wz) : 0) + yOffset;
      positions[posIdx++] = wx;
      positions[posIdx++] = wy;
      positions[posIdx++] = wz;
      if (wy > maxY) maxY = wy;
    }
  }

  // Write triangle indices
  let idxIdx = tileIndex * INDICES_PER_TILE;
  for (let iz = 0; iz < segs; iz++) {
    for (let ix = 0; ix < segs; ix++) {
      const a = baseVert + iz * rowVerts + ix;
      const b = a + 1;
      const c = a + rowVerts;
      const d = c + 1;
      indices[idxIdx++] = a;
      indices[idxIdx++] = c;
      indices[idxIdx++] = b;
      indices[idxIdx++] = b;
      indices[idxIdx++] = c;
      indices[idxIdx++] = d;
    }
  }

  return maxY;
}

function createLabelSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 64;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 48, 8);
  ctx.fill();
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new SpriteNodeMaterial();
  mat.map = texture;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.depthTest = false;
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(14, 3.5, 1);
  sprite.renderOrder = 1001;
  return sprite;
}

// ============== TERRAIN RAYCAST (mouse→tile mapping only) ==============

const _ray = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

function raycastToTerrain(
  clientX: number,
  clientY: number,
  refs: TerrainSceneRefs,
  tileSize: number,
): { tileX: number; tileZ: number } | null {
  const rect = refs.container.getBoundingClientRect();
  _mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _ray.setFromCamera(_mouse, refs.camera);

  const meshes = refs.terrainContainer.children;
  if (meshes.length > 0) {
    const intersects = _ray.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      const p = intersects[0].point;
      return {
        tileX: Math.floor(p.x / tileSize),
        tileZ: Math.floor(p.z / tileSize),
      };
    }
  }

  // Fallback: ground plane
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (_ray.ray.intersectPlane(plane, hit)) {
    return {
      tileX: Math.floor(hit.x / tileSize),
      tileZ: Math.floor(hit.z / tileSize),
    };
  }
  return null;
}

// ============== OVERLAY MANAGEMENT ==============

interface RegionOverlayEntry {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: MeshBasicNodeMaterial;
  label: THREE.Sprite;
  /** How many tiles this geometry was allocated for */
  allocatedTiles: number;
}

function disposeOverlayEntry(entry: RegionOverlayEntry): void {
  queueDisposal(entry.geometry);
  queueDisposal(entry.material);
  if (entry.label.material.map) queueDisposal(entry.label.material.map);
  queueDisposal(entry.label.material);
}

function buildRegionMesh(
  region: PlacedRegion,
  color: number,
  opacity: number,
  ts: number,
  heightFn: HeightFn | null,
  sceneOffset: number,
  worldCenterOffset: number,
): RegionOverlayEntry {
  // Contour-based auto-generated zones use bounding box instead of tile keys
  if (region.autoGenBounds && region.tileKeys.length === 0) {
    return buildContourRegionMesh(
      region,
      color,
      opacity,
      heightFn,
      worldCenterOffset,
    );
  }

  const tileCount = region.tileKeys.length;
  const allocTiles = Math.max(16, Math.ceil(tileCount * 1.5));

  const positions = new Float32Array(allocTiles * VERTS_PER_TILE * 3);
  const indices = new Uint32Array(allocTiles * INDICES_PER_TILE);

  let sumX = 0,
    sumZ = 0,
    maxY = 0;
  for (let i = 0; i < tileCount; i++) {
    const { x: tx, z: tz } = parseTileKey(region.tileKeys[i]);
    // tileKeys are in game-space — convert to scene-space for rendering
    const ox = (tx + sceneOffset) * ts;
    const oz = (tz + sceneOffset) * ts;
    const tileMaxY = writeTileGeometry(
      positions,
      indices,
      i,
      ox,
      oz,
      ts,
      OVERLAY_Y_OFFSET,
      heightFn,
    );
    sumX += ox + ts / 2;
    sumZ += oz + ts / 2;
    if (tileMaxY > maxY) maxY = tileMaxY;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, tileCount * INDICES_PER_TILE);

  const mat = new MeshBasicNodeMaterial();
  mat.color = new THREE.Color(color);
  mat.transparent = true;
  mat.opacity = opacity;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.renderOrder = 997;
  mesh.frustumCulled = false;
  mesh.name = `zone-tiles-${region.id}`;

  const avgX = tileCount > 0 ? sumX / tileCount : 0;
  const avgZ = tileCount > 0 ? sumZ / tileCount : 0;
  const label = createLabelSprite(`${region.name} (${tileCount})`, color);
  label.position.set(avgX, maxY + LABEL_Y_OFFSET, avgZ);
  label.name = `zone-label-${region.id}`;

  return { mesh, geometry, material: mat, label, allocatedTiles: allocTiles };
}

/**
 * Build an overlay mesh for a contour-based auto-generated zone.
 * Renders a terrain-conforming quad for each grid cell that belongs to the zone.
 * Cell positions are in game-space; scene-space = gameX + worldCenterOffset.
 */
function buildContourRegionMesh(
  region: PlacedRegion,
  color: number,
  opacity: number,
  heightFn: HeightFn | null,
  worldCenterOffset: number,
): RegionOverlayEntry {
  const agb = region.autoGenBounds!;
  const cells = agb.cellPositions;
  const res = agb.gridResolution;
  const cellCount = cells.length;

  // Each cell becomes a terrain-conforming quad (2×2 verts = 4 verts, 2 tris = 6 indices)
  const VERTS_PER_CELL = 4;
  const INDICES_PER_CELL = 6;
  const positions = new Float32Array(cellCount * VERTS_PER_CELL * 3);
  const indices = new Uint32Array(cellCount * INDICES_PER_CELL);

  let maxY = -Infinity;
  let sumX = 0,
    sumZ = 0;

  for (let i = 0; i < cellCount; i++) {
    const cell = cells[i];
    // Convert game-space cell center to scene-space corners
    const halfRes = res / 2;
    const scX = cell.x + worldCenterOffset - halfRes;
    const scZ = cell.z + worldCenterOffset - halfRes;

    const baseVert = i * VERTS_PER_CELL;
    const baseIdx = i * INDICES_PER_CELL;

    // 4 corners of the cell quad
    const corners = [
      [scX, scZ],
      [scX + res, scZ],
      [scX, scZ + res],
      [scX + res, scZ + res],
    ];

    for (let c = 0; c < 4; c++) {
      const cx = corners[c][0];
      const cz = corners[c][1];
      const cy = (heightFn ? heightFn(cx, cz) : 0) + OVERLAY_Y_OFFSET;
      const vi = (baseVert + c) * 3;
      positions[vi] = cx;
      positions[vi + 1] = cy;
      positions[vi + 2] = cz;
      if (cy > maxY) maxY = cy;
    }

    sumX += scX + halfRes;
    sumZ += scZ + halfRes;

    // Two triangles: (0,2,1) and (1,2,3)
    indices[baseIdx] = baseVert;
    indices[baseIdx + 1] = baseVert + 2;
    indices[baseIdx + 2] = baseVert + 1;
    indices[baseIdx + 3] = baseVert + 1;
    indices[baseIdx + 4] = baseVert + 2;
    indices[baseIdx + 5] = baseVert + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const mat = new MeshBasicNodeMaterial();
  mat.color = new THREE.Color(color);
  mat.transparent = true;
  mat.opacity = opacity;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.side = THREE.DoubleSide;

  const mesh = new THREE.Mesh(geometry, mat);
  mesh.renderOrder = 997;
  mesh.frustumCulled = false;
  mesh.name = `zone-contour-${region.id}`;

  const avgX = cellCount > 0 ? sumX / cellCount : 0;
  const avgZ = cellCount > 0 ? sumZ / cellCount : 0;
  const label = createLabelSprite(region.name, color);
  label.position.set(avgX, maxY + LABEL_Y_OFFSET, avgZ);
  label.name = `zone-label-${region.id}`;

  return { mesh, geometry, material: mat, label, allocatedTiles: 0 };
}

/** Update an existing region's geometry in place (or return false if realloc needed) */
function updateRegionMesh(
  entry: RegionOverlayEntry,
  region: PlacedRegion,
  ts: number,
  heightFn: HeightFn | null,
  sceneOffset: number,
): boolean {
  // Contour-based zones are static — no tile-level updates needed
  if (region.autoGenBounds && region.tileKeys.length === 0) return true;

  const tileCount = region.tileKeys.length;
  if (tileCount > entry.allocatedTiles) return false; // need realloc

  const posAttr = entry.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const idxAttr = entry.geometry.getIndex()!;
  const indices = idxAttr.array as Uint32Array;

  let sumX = 0,
    sumZ = 0,
    maxY = 0;
  for (let i = 0; i < tileCount; i++) {
    const { x: tx, z: tz } = parseTileKey(region.tileKeys[i]);
    // tileKeys are in game-space — convert to scene-space for rendering
    const ox = (tx + sceneOffset) * ts;
    const oz = (tz + sceneOffset) * ts;
    const tileMaxY = writeTileGeometry(
      positions,
      indices,
      i,
      ox,
      oz,
      ts,
      OVERLAY_Y_OFFSET,
      heightFn,
    );
    sumX += ox + ts / 2;
    sumZ += oz + ts / 2;
    if (tileMaxY > maxY) maxY = tileMaxY;
  }

  posAttr.needsUpdate = true;
  idxAttr.needsUpdate = true;
  entry.geometry.setDrawRange(0, tileCount * INDICES_PER_TILE);

  // Update label
  if (tileCount > 0) {
    entry.label.position.set(
      sumX / tileCount,
      maxY + LABEL_Y_OFFSET,
      sumZ / tileCount,
    );
    entry.label.visible = true;
  } else {
    entry.label.visible = false;
  }

  // Rebuild label text (tile count changed)
  const canvas = (entry.label.material as THREE.SpriteMaterial).map?.image as
    | HTMLCanvasElement
    | undefined;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 8);
      ctx.fill();
      const colorHex = `#${entry.material.color.getHexString()}`;
      ctx.fillStyle = colorHex;
      ctx.font = "bold 22px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${region.name} (${tileCount})`, 128, 32);
      (
        (entry.label.material as THREE.SpriteMaterial)
          .map as THREE.CanvasTexture
      ).needsUpdate = true;
    }
  }

  return true;
}

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
  const overlayGroupRef = useRef<THREE.Group | null>(null);
  const overlayEntriesRef = useRef<Map<string, RegionOverlayEntry>>(new Map());
  const rebuildTimerRef = useRef<number | null>(null);

  // Cursor state (fully imperative)
  const cursorMeshRef = useRef<THREE.Mesh | null>(null);
  const cursorGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const cursorOutlineRef = useRef<THREE.Line | null>(null);
  const cursorMaterialRef = useRef<MeshBasicNodeMaterial | null>(null);
  const cursorOutlineMaterialRef = useRef<LineBasicNodeMaterial | null>(null);
  const lastCursorTileRef = useRef<{ x: number; z: number } | null>(null);
  const lastBrushSizeRef = useRef<number>(1);
  const lastCursorEraseRef = useRef<boolean>(false);

  // ==================================================================
  // OVERLAY: Build/rebuild region tile meshes
  // ==================================================================

  const buildOverlay = useCallback(() => {
    const refs = sceneRefsRef.current;
    if (!refs) return;

    // Tear down — cancel pending staged additions first
    if (overlayGroupRef.current) {
      cancelStagedAdditions(overlayGroupRef.current);
      refs.scene.remove(overlayGroupRef.current);
      for (const entry of overlayEntriesRef.current.values()) {
        disposeOverlayEntry(entry);
      }
      overlayEntriesRef.current.clear();
      overlayGroupRef.current = null;
    }

    const currentRegions = regionsRef.current;
    if (currentRegions.length === 0) return;

    // Add empty group to scene — children will be staged in batches
    const group = new THREE.Group();
    group.name = "zone-tile-overlay";
    group.renderOrder = 997;
    group.visible = zoneOverlayVisibleRef.current;
    refs.scene.add(group);
    overlayGroupRef.current = group;

    const selId = selection?.type === "region" ? selection.id : null;
    const heightFn = refs.getTerrainHeight ?? null;
    const sceneOffset = refs.worldCenterOffset / ts;

    for (let ri = 0; ri < currentRegions.length; ri++) {
      const region = currentRegions[ri];
      const isSelected = region.id === selId;
      // Use tier color for auto-generated zones, palette color for hand-painted
      const color = isSelected
        ? SELECTED_HIGHLIGHT
        : region.autoGenBounds
          ? getTierColor(region)
          : getRegionColor(ri);
      const opacity = isSelected ? 0.35 : 0.3;

      const entry = buildRegionMesh(
        region,
        color,
        opacity,
        ts,
        heightFn,
        sceneOffset,
        refs.worldCenterOffset,
      );
      overlayEntriesRef.current.set(region.id, entry);

      // Stage children — GPU buffers created gradually across frames
      stageAddition(entry.mesh, group);
      stageAddition(entry.label, group);
    }
  }, [selection, ts]);

  // Toggle overlay visibility without rebuilding geometry
  useEffect(() => {
    if (overlayGroupRef.current) {
      overlayGroupRef.current.visible = zoneOverlayVisible;
    }
  }, [zoneOverlayVisible]);

  // Rebuild overlay on structural changes only
  const regionStructureKey = regions.map((r) => r.id).join(",");

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

    // Pre-allocate buffers for max cursor tiles
    const maxVerts = MAX_CURSOR_TILES * VERTS_PER_TILE;
    const maxIndices = MAX_CURSOR_TILES * INDICES_PER_TILE;
    const positions = new Float32Array(maxVerts * 3);
    const indices = new Uint32Array(maxIndices);

    const cursorGeo = new THREE.BufferGeometry();
    cursorGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    cursorGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    cursorGeo.setDrawRange(0, 0); // hidden initially

    const cursorMat = new MeshBasicNodeMaterial();
    cursorMat.color = new THREE.Color(CURSOR_COLOR);
    cursorMat.transparent = true;
    cursorMat.opacity = 0.25;
    cursorMat.depthWrite = false;
    cursorMat.depthTest = false;
    cursorMat.side = THREE.DoubleSide;

    const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.renderOrder = 1000;
    cursorMesh.frustumCulled = false;
    cursorMesh.name = "zone-cursor-fill";
    sceneRefs.scene.add(cursorMesh);
    cursorMeshRef.current = cursorMesh;
    cursorGeoRef.current = cursorGeo;
    cursorMaterialRef.current = cursorMat;

    // Cursor outline (single Line for brush border)
    const outlineMat = new LineBasicNodeMaterial();
    outlineMat.color = new THREE.Color(CURSOR_COLOR);
    outlineMat.depthTest = false;
    outlineMat.transparent = true;
    outlineMat.opacity = 0.8;
    const outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(5 * 3), 3),
    );
    const outline = new THREE.Line(outlineGeo, outlineMat);
    outline.renderOrder = 1001;
    outline.frustumCulled = false;
    outline.name = "zone-cursor-outline";
    sceneRefs.scene.add(outline);
    cursorOutlineRef.current = outline;
    cursorOutlineMaterialRef.current = outlineMat;

    lastCursorTileRef.current = null;

    return () => {
      sceneRefs.scene.remove(cursorMesh);
      queueDisposal(cursorGeo);
      queueDisposal(cursorMat);
      sceneRefs.scene.remove(outline);
      queueDisposal(outlineGeo);
      queueDisposal(outlineMat);
      cursorMeshRef.current = null;
      cursorGeoRef.current = null;
      cursorOutlineRef.current = null;
      cursorMaterialRef.current = null;
      cursorOutlineMaterialRef.current = null;
    };
  }, [isPainting, sceneRefs]);

  /** Update cursor visuals imperatively (called from mousemove, not React) */
  const updateCursor = useCallback(
    (tileX: number, tileZ: number) => {
      const zp = zonePaintRef.current;
      const geo = cursorGeoRef.current;
      const outline = cursorOutlineRef.current;
      const refs = sceneRefsRef.current;
      if (!zp || !geo || !outline) return;

      const brushSize = zp.brushSize;
      const isErase = zp.mode === "erase";

      // Skip update if nothing changed
      const last = lastCursorTileRef.current;
      if (
        last &&
        last.x === tileX &&
        last.z === tileZ &&
        lastBrushSizeRef.current === brushSize &&
        lastCursorEraseRef.current === isErase
      ) {
        return;
      }
      lastCursorTileRef.current = { x: tileX, z: tileZ };
      lastBrushSizeRef.current = brushSize;
      lastCursorEraseRef.current = isErase;

      // Update color if mode changed
      const cursorMat = cursorMaterialRef.current;
      const outlineMat = cursorOutlineMaterialRef.current;
      if (cursorMat) {
        cursorMat.color.setHex(isErase ? ERASE_COLOR : CURSOR_COLOR);
      }
      if (outlineMat) {
        outlineMat.color.setHex(isErase ? ERASE_COLOR : CURSOR_COLOR);
      }

      const heightFn = refs?.getTerrainHeight ?? null;

      // Fill tile geometry — each tile gets terrain-conforming subdivided mesh
      const brushTiles = getBrushTiles(tileX, tileZ, brushSize);
      const count = Math.min(brushTiles.length, MAX_CURSOR_TILES);

      const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;
      const idxAttr = geo.getIndex()!;
      const indices = idxAttr.array as Uint32Array;

      let maxCy = 0;
      for (let i = 0; i < count; i++) {
        const t = brushTiles[i];
        const tileMaxY = writeTileGeometry(
          positions,
          indices,
          i,
          t.x * ts,
          t.z * ts,
          ts,
          CURSOR_Y_OFFSET,
          heightFn,
        );
        if (tileMaxY > maxCy) maxCy = tileMaxY;
      }

      posAttr.needsUpdate = true;
      idxAttr.needsUpdate = true;
      geo.setDrawRange(0, count * INDICES_PER_TILE);

      // Outline — single rectangle around the brush footprint
      const radius = Math.floor(brushSize / 2);
      const minX = (tileX - radius) * ts;
      const maxX = (tileX + radius + 1) * ts;
      const minZ = (tileZ - radius) * ts;
      const maxZ = (tileZ + radius + 1) * ts;
      const oy = maxCy + 0.2;

      const outlinePosAttr = outline.geometry.getAttribute(
        "position",
      ) as THREE.Float32BufferAttribute;
      outlinePosAttr.setXYZ(0, minX, oy, minZ);
      outlinePosAttr.setXYZ(1, maxX, oy, minZ);
      outlinePosAttr.setXYZ(2, maxX, oy, maxZ);
      outlinePosAttr.setXYZ(3, minX, oy, maxZ);
      outlinePosAttr.setXYZ(4, minX, oy, minZ);
      outlinePosAttr.needsUpdate = true;
      outline.geometry.setDrawRange(0, 5);
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

    const BRUSH_STEPS = [1, 3, 5, 10, 20, 50];

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
