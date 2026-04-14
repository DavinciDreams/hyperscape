/**
 * useBrushInteraction — Viewport interaction for brush tools
 *
 * Handles mouse events for terrain sculpting, biome painting, and
 * vegetation painting. Renders a brush preview circle on the terrain
 * surface and creates stroke records on click/drag.
 *
 * Uses TerrainSceneRefs from TileBasedTerrain for raycasting.
 */

import * as THREE from "three/webgpu";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type {
  BrushSettings,
  TerrainSculptStroke,
  BiomePaintStroke,
  VegetationPaintStroke,
  MaterialPaintStroke,
  FoliagePaintStroke,
} from "../types";
import type { WorldStudioState } from "../WorldStudioContext";

interface BrushInteractionOptions {
  sceneRefs: TerrainSceneRefs | null;
  studioState: WorldStudioState;
  onTerrainSculpt: (stroke: TerrainSculptStroke) => void;
  onBiomePaint: (stroke: BiomePaintStroke) => void;
  onVegetationPaint: (stroke: VegetationPaintStroke) => void;
  onMaterialPaint: (stroke: MaterialPaintStroke) => void;
  onFoliagePaint: (stroke: FoliagePaintStroke) => void;
  onTileCollision: (
    tiles: Array<{ tileX: number; tileZ: number; blocked: boolean }>,
  ) => void;
}

interface BrushState {
  previewMesh: THREE.Mesh | null;
  previewOutline: THREE.Line | null;
  raycaster: THREE.Raycaster;
  mousePos: THREE.Vector2;
  isPainting: boolean;
  lastPaintTime: number;
  disposed: boolean;
}

const PAINT_THROTTLE_MS = 50;
/** Grid resolution for terrain-conforming preview disc */
const PREVIEW_GRID_SIZE = 16;

let strokeCounter = 0;

// Phase 5C: Pre-allocated objects for raycast fallback path (avoids per-move allocations)
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeTarget = new THREE.Vector3();

/**
 * Create a terrain-conforming preview disc mesh.
 * Vertices are positioned in a circular grid pattern;
 * Y values are updated per-frame from the terrain querier.
 */
function createPreviewDisc(radius: number, color: number): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const step = (radius * 2) / PREVIEW_GRID_SIZE;
  const r2 = radius * radius;
  // Index map: [gz][gx] → vertex index (or -1 if outside circle)
  const indexMap: number[][] = [];

  for (let gz = 0; gz <= PREVIEW_GRID_SIZE; gz++) {
    indexMap[gz] = [];
    for (let gx = 0; gx <= PREVIEW_GRID_SIZE; gx++) {
      const lx = -radius + gx * step;
      const lz = -radius + gz * step;
      if (lx * lx + lz * lz <= r2 * 1.1) {
        indexMap[gz][gx] = positions.length / 3;
        positions.push(lx, 0.3, lz);
      } else {
        indexMap[gz][gx] = -1;
      }
    }
  }

  // Build triangles
  for (let gz = 0; gz < PREVIEW_GRID_SIZE; gz++) {
    for (let gx = 0; gx < PREVIEW_GRID_SIZE; gx++) {
      const a = indexMap[gz][gx];
      const b = indexMap[gz][gx + 1];
      const c = indexMap[gz + 1][gx];
      const d = indexMap[gz + 1][gx + 1];
      if (a >= 0 && b >= 0 && c >= 0) indices.push(a, c, b);
      if (b >= 0 && c >= 0 && d >= 0) indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthTest: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "brush-preview-disc";
  mesh.renderOrder = 1000;
  return mesh;
}

/** Create the outline ring (circle) for the brush preview. */
function createPreviewOutline(radius: number, color: number): THREE.Line {
  const segments = 48;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        0.5,
        Math.sin(angle) * radius,
      ),
    );
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });
  const line = new THREE.Line(geo, mat);
  line.name = "brush-preview-outline";
  line.renderOrder = 1001;
  return line;
}

/**
 * Update the preview disc mesh Y positions to conform to terrain.
 * For raise/lower modes, adds a ghost sculpt offset to visualize
 * the post-sculpt terrain shape.
 */
function updatePreviewDiscTerrain(
  mesh: THREE.Mesh,
  centerX: number,
  centerZ: number,
  radius: number,
  getHeight: (x: number, z: number) => number,
  mode: string,
  strength: number,
) {
  const posAttr = mesh.geometry.getAttribute("position");
  if (!posAttr) return;
  const arr = posAttr.array as Float32Array;

  for (let i = 0; i < arr.length; i += 3) {
    const lx = arr[i];
    const lz = arr[i + 2];
    const worldX = centerX + lx;
    const worldZ = centerZ + lz;
    const baseHeight = getHeight(worldX, worldZ);

    // Compute brush influence (smooth falloff)
    const dist = Math.sqrt(lx * lx + lz * lz);
    const t = Math.max(0, 1 - dist / radius);
    const influence = t * t * (3 - 2 * t); // smoothstep

    let ghostOffset = 0;
    if (mode === "raise") ghostOffset = influence * strength * 2;
    else if (mode === "lower") ghostOffset = -influence * strength * 2;
    // flatten: show flat disc at target height (handled by opacity change)

    arr[i + 1] = baseHeight + 0.3 + ghostOffset;
  }

  posAttr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/** Update outline ring Y positions to conform to terrain. */
function updatePreviewOutlineTerrain(
  line: THREE.Line,
  centerX: number,
  centerZ: number,
  radius: number,
  getHeight: (x: number, z: number) => number,
) {
  const posAttr = line.geometry.getAttribute("position");
  if (!posAttr) return;
  const arr = posAttr.array as Float32Array;

  for (let i = 0; i < arr.length; i += 3) {
    const lx = arr[i];
    const lz = arr[i + 2];
    arr[i + 1] = getHeight(centerX + lx, centerZ + lz) + 0.5;
  }
  posAttr.needsUpdate = true;
}

function getBrushColor(settings: BrushSettings): number {
  switch (settings.brushType) {
    case "terrain":
      return settings.terrainMode === "raise"
        ? 0x22c55e
        : settings.terrainMode === "lower"
          ? 0xef4444
          : settings.terrainMode === "flatten"
            ? 0xf59e0b
            : 0x3b82f6;
    case "biome":
      return 0x8b5cf6;
    case "vegetation":
      return settings.vegetationPaintMode === "add" ? 0x22c55e : 0xef4444;
    case "material":
      return 0xd4a373; // earthy brown
    case "foliage":
      return settings.foliagePaintMode === "add" ? 0x4ade80 : 0xfb923c; // green / orange
    case "collision":
      return settings.collisionMode === "block" ? 0xef4444 : 0x22c55e;
    default:
      return 0xffffff;
  }
}

export function useBrushInteraction({
  sceneRefs,
  studioState,
  onTerrainSculpt,
  onBiomePaint,
  onVegetationPaint,
  onMaterialPaint,
  onFoliagePaint,
  onTileCollision,
}: BrushInteractionOptions) {
  const brushRef = useRef<BrushState>({
    previewMesh: null,
    previewOutline: null,
    raycaster: new THREE.Raycaster(),
    mousePos: new THREE.Vector2(),
    isPainting: false,
    lastPaintTime: 0,
    disposed: false,
  });
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  const isBrushActive = studioState.tools.activeTool === "brush";
  const settings = studioState.tools.brushSettings;
  // Phase 3E: Store settings in a ref so mouse handlers read fresh values
  // without the effect needing to depend on the entire settings object.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Create stroke at the given world position
  const createStroke = useCallback(
    (worldX: number, worldZ: number) => {
      const id = `brush-${Date.now()}-${strokeCounter++}`;
      const timestamp = Date.now();

      switch (settings.brushType) {
        case "terrain": {
          const stroke: TerrainSculptStroke = {
            id,
            center: { x: worldX, z: worldZ },
            radius: settings.radius,
            strength: settings.strength,
            falloff: settings.falloff,
            mode: settings.terrainMode,
            timestamp,
          };
          if (
            settings.terrainMode === "flatten" &&
            settings.flattenTarget != null
          ) {
            stroke.flattenTarget = settings.flattenTarget;
          }
          onTerrainSculpt(stroke);
          break;
        }
        case "biome": {
          const stroke: BiomePaintStroke = {
            id,
            center: { x: worldX, z: worldZ },
            radius: settings.radius,
            strength: settings.strength,
            falloff: settings.falloff,
            targetBiome: settings.biomePaintTarget,
            timestamp,
          };
          onBiomePaint(stroke);
          break;
        }
        case "vegetation": {
          const stroke: VegetationPaintStroke = {
            id,
            center: { x: worldX, z: worldZ },
            radius: settings.radius,
            strength: settings.strength,
            falloff: settings.falloff,
            mode: settings.vegetationPaintMode,
            speciesFilter: [...settings.vegetationSpeciesFilter],
            timestamp,
          };
          onVegetationPaint(stroke);
          break;
        }
        case "material": {
          const stroke: MaterialPaintStroke = {
            id,
            center: { x: worldX, z: worldZ },
            radius: settings.radius,
            strength: settings.strength,
            falloff: settings.falloff,
            targetMaterial: settings.materialPaintTarget,
            timestamp,
          };
          onMaterialPaint(stroke);
          break;
        }
        case "foliage": {
          const stroke: FoliagePaintStroke = {
            id,
            center: { x: worldX, z: worldZ },
            radius: settings.radius,
            strength: settings.strength,
            falloff: settings.falloff,
            mode: settings.foliagePaintMode,
            foliageTypes: [...settings.foliageTypeFilter],
            timestamp,
          };
          onFoliagePaint(stroke);
          break;
        }
        case "collision": {
          const blocked = settings.collisionMode === "block";
          const r = Math.ceil(settings.radius);
          const cx = Math.floor(worldX);
          const cz = Math.floor(worldZ);
          const tiles: Array<{
            tileX: number;
            tileZ: number;
            blocked: boolean;
          }> = [];
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (dx * dx + dz * dz <= settings.radius * settings.radius) {
                tiles.push({ tileX: cx + dx, tileZ: cz + dz, blocked });
              }
            }
          }
          if (tiles.length > 0) {
            onTileCollision(tiles);
          }
          break;
        }
      }
    },
    [
      settings,
      onTerrainSculpt,
      onBiomePaint,
      onVegetationPaint,
      onMaterialPaint,
      onFoliagePaint,
      onTileCollision,
    ],
  );

  // Raycast to terrain
  const raycastToTerrain = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const refs = sceneRefsRef.current;
      if (!refs) return null;

      const rect = refs.container.getBoundingClientRect();
      const brush = brushRef.current;
      brush.mousePos.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      brush.mousePos.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      brush.raycaster.setFromCamera(brush.mousePos, refs.camera);

      // Raycast against terrain meshes (children of terrainContainer are tile meshes)
      const intersects = brush.raycaster.intersectObjects(
        refs.terrainContainer.children,
        false,
      );
      if (intersects.length > 0) {
        return intersects[0].point;
      }

      // Fallback: ground plane at y=0 (pre-allocated to avoid per-move allocations)
      if (brush.raycaster.ray.intersectPlane(_groundPlane, _planeTarget)) {
        return _planeTarget.clone();
      }

      return null;
    },
    [],
  );

  // Phase 3E: Only recreate preview mesh when radius or brushType changes.
  // Other settings (strength, mode, color) are read from settingsRef in handlers.
  const brushRadius = settings.radius;
  const brushType = settings.brushType;

  // Main effect: manage preview ring and mouse events
  useEffect(() => {
    if (!sceneRefs || !isBrushActive) return;

    const brush = brushRef.current;
    brush.disposed = false;

    const { scene, container } = sceneRefs;
    const color = getBrushColor(settingsRef.current);

    // Clean up old preview objects
    if (brush.previewMesh) {
      scene.remove(brush.previewMesh);
      brush.previewMesh.geometry.dispose();
      (brush.previewMesh.material as THREE.Material).dispose();
    }
    if (brush.previewOutline) {
      scene.remove(brush.previewOutline);
      brush.previewOutline.geometry.dispose();
      (brush.previewOutline.material as THREE.Material).dispose();
    }

    // Create terrain-conforming preview disc + outline ring
    brush.previewMesh = createPreviewDisc(brushRadius, color);
    brush.previewMesh.visible = false;
    scene.add(brush.previewMesh);

    brush.previewOutline = createPreviewOutline(brushRadius, color);
    brush.previewOutline.visible = false;
    scene.add(brush.previewOutline);

    const onMouseMove = (e: MouseEvent) => {
      if (brush.disposed) return;
      // Read fresh settings from ref (no effect dependency needed)
      const s = settingsRef.current;

      const hit = raycastToTerrain(e.clientX, e.clientY);
      if (hit) {
        // Update preview color in-place when mode changes (no recreation needed)
        const currentColor = getBrushColor(s);
        if (brush.previewMesh) {
          (brush.previewMesh.material as THREE.MeshBasicMaterial).color.setHex(
            currentColor,
          );
        }
        if (brush.previewOutline) {
          (
            brush.previewOutline.material as THREE.LineBasicMaterial
          ).color.setHex(currentColor);
        }

        // Position the preview at the hit point
        if (brush.previewMesh) {
          brush.previewMesh.position.set(hit.x, 0, hit.z);
          brush.previewMesh.visible = true;

          // Conform disc to terrain using analytical height query
          const getH = sceneRefsRef.current?.getTerrainHeight;
          if (getH) {
            updatePreviewDiscTerrain(
              brush.previewMesh,
              hit.x,
              hit.z,
              s.radius,
              (wx, wz) => getH(wx, wz),
              s.terrainMode || "raise",
              s.strength,
            );
          }
        }
        if (brush.previewOutline) {
          brush.previewOutline.position.set(hit.x, 0, hit.z);
          brush.previewOutline.visible = true;

          const getH = sceneRefsRef.current?.getTerrainHeight;
          if (getH) {
            updatePreviewOutlineTerrain(
              brush.previewOutline,
              hit.x,
              hit.z,
              s.radius,
              (wx, wz) => getH(wx, wz),
            );
          }
        }
      } else {
        if (brush.previewMesh) brush.previewMesh.visible = false;
        if (brush.previewOutline) brush.previewOutline.visible = false;
      }

      // Continuous painting while dragging
      if (brush.isPainting && hit) {
        const now = Date.now();
        if (now - brush.lastPaintTime >= PAINT_THROTTLE_MS) {
          createStroke(hit.x, hit.z);
          brush.lastPaintTime = now;
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (brush.disposed || e.button !== 0) return;

      const hit = raycastToTerrain(e.clientX, e.clientY);
      if (hit) {
        brush.isPainting = true;
        brush.lastPaintTime = Date.now();
        createStroke(hit.x, hit.z);
      }
    };

    const onMouseUp = () => {
      brush.isPainting = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (isBrushActive) {
        e.preventDefault();
        brush.isPainting = false;
      }
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mouseup", onMouseUp);
    container.addEventListener("contextmenu", onContextMenu);

    return () => {
      brush.disposed = true;
      brush.isPainting = false;

      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("contextmenu", onContextMenu);

      if (brush.previewMesh) {
        scene.remove(brush.previewMesh);
        brush.previewMesh.geometry.dispose();
        try {
          (brush.previewMesh.material as THREE.Material).dispose();
        } catch {
          /* WebGPU cleanup race */
        }
        brush.previewMesh = null;
      }
      if (brush.previewOutline) {
        scene.remove(brush.previewOutline);
        brush.previewOutline.geometry.dispose();
        try {
          (brush.previewOutline.material as THREE.Material).dispose();
        } catch {
          /* WebGPU cleanup race */
        }
        brush.previewOutline = null;
      }
    };
    // Phase 3E: Only depend on radius and brushType for preview mesh recreation.
    // Other settings (strength, mode, color) are read from settingsRef in handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sceneRefs,
    isBrushActive,
    brushRadius,
    brushType,
    raycastToTerrain,
    createStroke,
  ]);
}
