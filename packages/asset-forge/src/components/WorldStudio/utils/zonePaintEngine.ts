/**
 * zonePaintEngine — Pure Three.js zone painting geometry + overlay logic
 *
 * Extracted from useZonePainting. All terrain-conforming geometry creation,
 * overlay management, cursor updates, and raycast helpers live here. The hook
 * retains only React lifecycle (useEffect, useRef, useCallback) and event
 * wiring; all computational work delegates to these functions.
 */

import * as THREE from "three/webgpu";
import {
  MeshBasicNodeMaterial,
  LineBasicNodeMaterial,
  SpriteNodeMaterial,
} from "three/webgpu";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type { PlacedRegion } from "../types";
import { parseTileKey, ZONE_TILE_SIZE } from "../types";
import {
  queueDisposal,
  stageAddition,
  cancelStagedAdditions,
} from "./deferredGpuDisposal";

// ============== CONSTANTS ==============

export const OVERLAY_Y_OFFSET = 0.35; // above terrain surface — avoids Z-fighting
export const CURSOR_Y_OFFSET = 0.5; // cursor slightly above overlay
export const LABEL_Y_OFFSET = 8; // label height above highest tile
export const MAX_CURSOR_TILES = 2601; // 51x51 for brush size 50
export const TILE_SEGMENTS = 1; // 1m tiles only need 4 corner verts
export const VERTS_PER_TILE = (TILE_SEGMENTS + 1) * (TILE_SEGMENTS + 1);
export const TRIS_PER_TILE = TILE_SEGMENTS * TILE_SEGMENTS * 2;
export const INDICES_PER_TILE = TRIS_PER_TILE * 3;

export const REGION_COLORS = [
  0xff8800, 0x00ccff, 0x88ff00, 0xff44aa, 0xaa44ff, 0xffcc00, 0x00ff88,
  0xff4444, 0x4488ff, 0x44ffcc,
];
export const SELECTED_HIGHLIGHT = 0x00ccff;
export const CURSOR_COLOR = 0xffffff;
export const ERASE_COLOR = 0xff4444;

export const BRUSH_STEPS = [1, 3, 5, 10, 20, 50];

// ============== TYPES ==============

export type HeightFn = (sceneX: number, sceneZ: number) => number;

export interface RegionOverlayEntry {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: MeshBasicNodeMaterial;
  label: THREE.Sprite;
  /** How many tiles this geometry was allocated for */
  allocatedTiles: number;
}

export interface CursorState {
  mesh: THREE.Mesh | null;
  geometry: THREE.BufferGeometry | null;
  outline: THREE.Line | null;
  material: MeshBasicNodeMaterial | null;
  outlineMaterial: LineBasicNodeMaterial | null;
  lastTile: { x: number; z: number } | null;
  lastBrushSize: number;
  lastErase: boolean;
}

export function createInitialCursorState(): CursorState {
  return {
    mesh: null,
    geometry: null,
    outline: null,
    material: null,
    outlineMaterial: null,
    lastTile: null,
    lastBrushSize: 1,
    lastErase: false,
  };
}

// ============== COLOR HELPERS ==============

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

export function getRegionColor(index: number): number {
  return REGION_COLORS[index % REGION_COLORS.length];
}

export function getTierColor(region: PlacedRegion): number {
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

// ============== TILE GEOMETRY ==============

/** Get tile indices under a brush centered at tileX,tileZ */
export function getBrushTiles(
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
 * Each tile is a (TILE_SEGMENTS+1)^2 vertex grid draped onto terrain.
 */
export function writeTileGeometry(
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

// ============== LABEL SPRITES ==============

export function createZoneLabelSprite(
  text: string,
  color: number,
): THREE.Sprite {
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

// ============== TERRAIN RAYCAST ==============

const _ray = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

export function raycastToTerrain(
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

// ============== OVERLAY ENTRY DISPOSAL ==============

export function disposeOverlayEntry(entry: RegionOverlayEntry): void {
  queueDisposal(entry.geometry);
  queueDisposal(entry.material);
  if (entry.label.material.map) queueDisposal(entry.label.material.map);
  queueDisposal(entry.label.material);
}

// ============== BUILD REGION MESH ==============

export function buildRegionMesh(
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
  const label = createZoneLabelSprite(`${region.name} (${tileCount})`, color);
  label.position.set(avgX, maxY + LABEL_Y_OFFSET, avgZ);
  label.name = `zone-label-${region.id}`;

  return { mesh, geometry, material: mat, label, allocatedTiles: allocTiles };
}

// ============== BUILD CONTOUR REGION MESH ==============

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

  // Each cell becomes a terrain-conforming quad (2x2 verts = 4 verts, 2 tris = 6 indices)
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
  const label = createZoneLabelSprite(region.name, color);
  label.position.set(avgX, maxY + LABEL_Y_OFFSET, avgZ);
  label.name = `zone-label-${region.id}`;

  return { mesh, geometry, material: mat, label, allocatedTiles: 0 };
}

// ============== UPDATE REGION MESH ==============

/** Update an existing region's geometry in place (or return false if realloc needed) */
export function updateRegionMesh(
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

// ============== BUILD FULL OVERLAY ==============

/**
 * Build (or rebuild) the complete zone overlay for all regions.
 * Returns the new overlay group and entry map.
 */
export function buildFullOverlay(
  regions: PlacedRegion[],
  selectedRegionId: string | null,
  ts: number,
  refs: TerrainSceneRefs,
  visible: boolean,
): { group: THREE.Group; entries: Map<string, RegionOverlayEntry> } {
  const group = new THREE.Group();
  group.name = "zone-tile-overlay";
  group.renderOrder = 997;
  group.visible = visible;
  refs.scene.add(group);

  const entries = new Map<string, RegionOverlayEntry>();
  const heightFn = refs.getTerrainHeight ?? null;
  const sceneOffset = refs.worldCenterOffset / ts;

  for (let ri = 0; ri < regions.length; ri++) {
    const region = regions[ri];
    const isSelected = region.id === selectedRegionId;
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
    entries.set(region.id, entry);

    // Stage children — GPU buffers created gradually across frames
    stageAddition(entry.mesh, group);
    stageAddition(entry.label, group);
  }

  return { group, entries };
}

/**
 * Tear down an existing overlay group — cancel pending staged additions
 * and dispose all entries.
 */
export function teardownOverlay(
  group: THREE.Group,
  entries: Map<string, RegionOverlayEntry>,
  scene: THREE.Scene,
): void {
  cancelStagedAdditions(group);
  scene.remove(group);
  for (const entry of entries.values()) {
    disposeOverlayEntry(entry);
  }
  entries.clear();
}

// ============== CURSOR ==============

/**
 * Create cursor GPU resources (pre-allocated merged geometry).
 * Returns the mesh, outline, and associated materials/geometries.
 */
export function createCursorResources(scene: THREE.Scene): CursorState {
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
  scene.add(cursorMesh);

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
  scene.add(outline);

  return {
    mesh: cursorMesh,
    geometry: cursorGeo,
    outline,
    material: cursorMat,
    outlineMaterial: outlineMat,
    lastTile: null,
    lastBrushSize: 1,
    lastErase: false,
  };
}

/** Dispose cursor GPU resources and remove from scene */
export function disposeCursorResources(
  cursor: CursorState,
  scene: THREE.Scene,
): void {
  if (cursor.mesh) {
    scene.remove(cursor.mesh);
    if (cursor.geometry) queueDisposal(cursor.geometry);
    if (cursor.material) queueDisposal(cursor.material);
  }
  if (cursor.outline) {
    scene.remove(cursor.outline);
    queueDisposal(cursor.outline.geometry);
    if (cursor.outlineMaterial) queueDisposal(cursor.outlineMaterial);
  }
}

/**
 * Update cursor visuals imperatively (called from mousemove, not React).
 * Returns true if the cursor was actually updated, false if skipped (no change).
 */
export function updateCursorGeometry(
  cursor: CursorState,
  tileX: number,
  tileZ: number,
  brushSize: number,
  isErase: boolean,
  ts: number,
  heightFn: HeightFn | null,
): boolean {
  const geo = cursor.geometry;
  const outline = cursor.outline;
  if (!geo || !outline) return false;

  // Skip update if nothing changed
  const last = cursor.lastTile;
  if (
    last &&
    last.x === tileX &&
    last.z === tileZ &&
    cursor.lastBrushSize === brushSize &&
    cursor.lastErase === isErase
  ) {
    return false;
  }
  cursor.lastTile = { x: tileX, z: tileZ };
  cursor.lastBrushSize = brushSize;
  cursor.lastErase = isErase;

  // Update color if mode changed
  if (cursor.material) {
    cursor.material.color.setHex(isErase ? ERASE_COLOR : CURSOR_COLOR);
  }
  if (cursor.outlineMaterial) {
    cursor.outlineMaterial.color.setHex(isErase ? ERASE_COLOR : CURSOR_COLOR);
  }

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

  return true;
}
