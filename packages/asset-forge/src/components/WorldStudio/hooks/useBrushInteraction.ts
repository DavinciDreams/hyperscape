/**
 * useBrushInteraction — Viewport interaction for brush tools
 *
 * Handles mouse events for terrain sculpting, biome painting, and
 * vegetation painting. Renders a brush preview circle on the terrain
 * surface and creates stroke records on click/drag.
 *
 * Uses TerrainSceneRefs from TileBasedTerrain for raycasting.
 */

import * as THREE from "three";
import { useEffect, useRef, useCallback } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import type {
  BrushSettings,
  TerrainSculptStroke,
  BiomePaintStroke,
  VegetationPaintStroke,
} from "../types";
import type { WorldStudioState } from "../WorldStudioContext";

interface BrushInteractionOptions {
  sceneRefs: TerrainSceneRefs | null;
  studioState: WorldStudioState;
  onTerrainSculpt: (stroke: TerrainSculptStroke) => void;
  onBiomePaint: (stroke: BiomePaintStroke) => void;
  onVegetationPaint: (stroke: VegetationPaintStroke) => void;
  onTileCollision: (
    tiles: Array<{ tileX: number; tileZ: number; blocked: boolean }>,
  ) => void;
}

interface BrushState {
  previewRing: THREE.Line | null;
  raycaster: THREE.Raycaster;
  mousePos: THREE.Vector2;
  isPainting: boolean;
  lastPaintTime: number;
  disposed: boolean;
}

const PAINT_THROTTLE_MS = 50;

let strokeCounter = 0;

function createPreviewRing(radius: number, color: number): THREE.Line {
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
  line.name = "brush-preview";
  line.renderOrder = 1000;
  return line;
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
  onTileCollision,
}: BrushInteractionOptions) {
  const brushRef = useRef<BrushState>({
    previewRing: null,
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

      // Fallback: ground plane at y=0
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      if (brush.raycaster.ray.intersectPlane(plane, target)) {
        return target;
      }

      return null;
    },
    [],
  );

  // Main effect: manage preview ring and mouse events
  useEffect(() => {
    if (!sceneRefs || !isBrushActive) return;

    const brush = brushRef.current;
    brush.disposed = false;

    const { scene, container } = sceneRefs;

    // Create/update preview ring
    if (brush.previewRing) {
      scene.remove(brush.previewRing);
      brush.previewRing.geometry.dispose();
      (brush.previewRing.material as THREE.Material).dispose();
    }

    brush.previewRing = createPreviewRing(
      settings.radius,
      getBrushColor(settings),
    );
    brush.previewRing.visible = false;
    scene.add(brush.previewRing);

    const onMouseMove = (e: MouseEvent) => {
      if (brush.disposed) return;

      const hit = raycastToTerrain(e.clientX, e.clientY);
      if (hit && brush.previewRing) {
        brush.previewRing.position.set(hit.x, hit.y, hit.z);
        brush.previewRing.visible = true;
      } else if (brush.previewRing) {
        brush.previewRing.visible = false;
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

      if (brush.previewRing) {
        scene.remove(brush.previewRing);
        brush.previewRing.geometry.dispose();
        try {
          (brush.previewRing.material as THREE.Material).dispose();
        } catch {
          /* WebGPU cleanup race */
        }
        brush.previewRing = null;
      }
    };
  }, [sceneRefs, isBrushActive, settings, raycastToTerrain, createStroke]);
}
