/**
 * useWaterBodyEditor — Interactive polygon/waypoint editor for water bodies
 *
 * When a water body of type "lake" or "pond" is selected, provides click-to-place
 * polygon boundary points. For rivers, click-to-place waypoints along path.
 *
 * Visual feedback:
 * - Polygon/path rendered as colored lines in viewport
 * - Flow direction arrows along river paths
 * - Water surface mesh preview at surfaceY height
 *
 * Phase 8.1 of WORLD_STUDIO_MASTER_PLAN
 */

import * as THREE from "three/webgpu";
import { MeshStandardNodeMaterial, LineBasicNodeMaterial } from "three/webgpu";
import { useRef, useEffect, useCallback } from "react";

import type { PlacedWaterBody, RiverWaypoint } from "../types";
import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";

// ============== CONSTANTS ==============

const WATER_PREVIEW_COLOR = 0x2a85cc;
const WATER_PREVIEW_OPACITY = 0.4;
const POLYGON_LINE_COLOR = 0x38bdf8; // sky-400
const RIVER_LINE_COLOR = 0x06b6d4; // cyan-500
const FLOW_ARROW_COLOR = 0x22d3ee; // cyan-400
const VERTEX_POINT_COLOR = 0xfbbf24; // amber-400

/** Reusable math objects */
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeTarget = new THREE.Vector3();

// ============== TYPES ==============

interface WaterBodyEditorOptions {
  sceneRefs: TerrainSceneRefs | null;
  selectedWaterBody: PlacedWaterBody | null;
  onUpdateWaterBody: (id: string, updates: Partial<PlacedWaterBody>) => void;
  /** Whether the editor is in "add vertex" mode */
  isAddingVertices: boolean;
}

interface EditorState {
  /** 3D group holding all editor visuals */
  group: THREE.Group | null;
  /** Water surface preview mesh */
  surfaceMesh: THREE.Mesh | null;
  /** Polygon/path line */
  pathLine: THREE.Line | null;
  /** Vertex point markers */
  vertexMarkers: THREE.Points | null;
  /** Flow direction arrows (rivers only) */
  flowArrows: THREE.Group | null;
  /** Cleanup refs */
  disposed: boolean;
}

// ============== GEOMETRY HELPERS ==============

/** Create a polygon outline from 2D points at a given Y height */
function createPolygonLine(
  polygon: Array<{ x: number; z: number }>,
  y: number,
  closed: boolean,
): THREE.BufferGeometry {
  const points: number[] = [];
  for (const pt of polygon) {
    points.push(pt.x, y + 0.1, pt.z); // Slight offset above water
  }
  // Close the loop for lakes/ponds
  if (closed && polygon.length > 2) {
    points.push(polygon[0].x, y + 0.1, polygon[0].z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geom;
}

/** Create vertex marker positions for polygon/waypoints */
function createVertexPositions(
  points: Array<{ x: number; z: number }>,
  y: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const pt of points) {
    positions.push(pt.x, y + 0.3, pt.z); // Above water surface
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geom;
}

/** Create flow direction arrows along a river path */
function createFlowArrows(waypoints: RiverWaypoint[], y: number): THREE.Group {
  const group = new THREE.Group();
  if (waypoints.length < 2) return group;

  const arrowMat = new MeshStandardNodeMaterial({
    color: FLOW_ARROW_COLOR,
    emissive: new THREE.Color(FLOW_ARROW_COLOR),
    emissiveIntensity: 0.5,
  });

  // Place an arrow every ~30m along the path
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segLen = Math.sqrt(dx * dx + dz * dz);
    if (segLen < 5) continue;

    const numArrows = Math.max(1, Math.floor(segLen / 30));
    const angle = Math.atan2(dz, dx);

    for (let j = 0; j < numArrows; j++) {
      const t = (j + 0.5) / numArrows;
      const x = a.x + dx * t;
      const z = a.z + dz * t;

      // Cone arrow pointing along flow direction
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 4), arrowMat);
      cone.position.set(x, y + 1.5, z);
      cone.rotation.set(0, 0, -Math.PI / 2); // Cone points along +X
      cone.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -angle); // Rotate to flow direction
      group.add(cone);
    }
  }

  return group;
}

/** Create a water surface preview mesh from a polygon */
function createPolygonSurfaceMesh(
  polygon: Array<{ x: number; z: number }>,
  y: number,
): THREE.Mesh | null {
  if (polygon.length < 3) return null;

  // Use Shape + ExtrudeGeometry (flat) to create the polygon mesh
  const shape = new THREE.Shape();
  shape.moveTo(polygon[0].x, polygon[0].z);
  for (let i = 1; i < polygon.length; i++) {
    shape.lineTo(polygon[i].x, polygon[i].z);
  }
  shape.closePath();

  const geom = new THREE.ShapeGeometry(shape);
  // ShapeGeometry creates in XY plane — rotate to XZ
  geom.rotateX(-Math.PI / 2);
  // Set Y position
  geom.translate(0, y, 0);

  const mat = new MeshStandardNodeMaterial({
    color: WATER_PREVIEW_COLOR,
    transparent: true,
    opacity: WATER_PREVIEW_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geom, mat);
}

/** Create a river surface preview mesh from waypoints */
function createRiverSurfaceMesh(
  waypoints: RiverWaypoint[],
  y: number,
): THREE.Mesh | null {
  if (waypoints.length < 2) return null;

  const positions: number[] = [];
  const indices: number[] = [];

  // Create a ribbon mesh along the river path
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const surfaceY = wp.surfaceY ?? y;
    const halfW = wp.halfWidth || 5;

    // Get perpendicular direction
    let perpX = 0;
    let perpZ = 1;
    if (i < waypoints.length - 1) {
      const next = waypoints[i + 1];
      const dx = next.x - wp.x;
      const dz = next.z - wp.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      perpX = -dz / len;
      perpZ = dx / len;
    } else if (i > 0) {
      const prev = waypoints[i - 1];
      const dx = wp.x - prev.x;
      const dz = wp.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      perpX = -dz / len;
      perpZ = dx / len;
    }

    // Left and right vertices
    positions.push(wp.x + perpX * halfW, surfaceY, wp.z + perpZ * halfW);
    positions.push(wp.x - perpX * halfW, surfaceY, wp.z - perpZ * halfW);

    // Triangle strip indices
    if (i < waypoints.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const mat = new MeshStandardNodeMaterial({
    color: WATER_PREVIEW_COLOR,
    transparent: true,
    opacity: WATER_PREVIEW_OPACITY,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geom, mat);
}

// ============== HOOK ==============

export function useWaterBodyEditor({
  sceneRefs,
  selectedWaterBody,
  onUpdateWaterBody,
  isAddingVertices,
}: WaterBodyEditorOptions) {
  const stateRef = useRef<EditorState>({
    group: null,
    surfaceMesh: null,
    pathLine: null,
    vertexMarkers: null,
    flowArrows: null,
    disposed: false,
  });

  const selectedRef = useRef(selectedWaterBody);
  selectedRef.current = selectedWaterBody;

  const isAddingRef = useRef(isAddingVertices);
  isAddingRef.current = isAddingVertices;

  // Rebuild visuals when the selected water body changes
  useEffect(() => {
    const state = stateRef.current;
    if (!sceneRefs) return;

    // Cleanup previous visuals
    if (state.group) {
      sceneRefs.scene.remove(state.group);
      state.group.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Line ||
          child instanceof THREE.Points
        ) {
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      state.group = null;
      state.surfaceMesh = null;
      state.pathLine = null;
      state.vertexMarkers = null;
      state.flowArrows = null;
    }

    if (!selectedWaterBody) return;

    const group = new THREE.Group();
    group.name = "water-body-editor";
    state.group = group;

    const y = selectedWaterBody.surfaceY ?? 0;

    // Create path/polygon line
    if (selectedWaterBody.bodyType === "river" && selectedWaterBody.waypoints) {
      const points = selectedWaterBody.waypoints.map((wp) => ({
        x: wp.x,
        z: wp.z,
      }));
      if (points.length > 1) {
        const lineGeom = createPolygonLine(points, y, false);
        const lineMat = new LineBasicNodeMaterial({ color: RIVER_LINE_COLOR });
        const line = new THREE.Line(lineGeom, lineMat);
        group.add(line);
        state.pathLine = line;
      }

      // Flow arrows
      const arrows = createFlowArrows(selectedWaterBody.waypoints, y);
      group.add(arrows);
      state.flowArrows = arrows;

      // River surface mesh
      const surface = createRiverSurfaceMesh(selectedWaterBody.waypoints, y);
      if (surface) {
        group.add(surface);
        state.surfaceMesh = surface;
      }

      // Vertex markers
      if (selectedWaterBody.waypoints.length > 0) {
        const markerGeom = createVertexPositions(
          selectedWaterBody.waypoints.map((wp) => ({ x: wp.x, z: wp.z })),
          y,
        );
        const markerMat = new THREE.PointsMaterial({
          color: VERTEX_POINT_COLOR,
          size: 8,
          sizeAttenuation: false,
        });
        const markers = new THREE.Points(markerGeom, markerMat);
        group.add(markers);
        state.vertexMarkers = markers;
      }
    } else if (
      (selectedWaterBody.bodyType === "lake" ||
        selectedWaterBody.bodyType === "pond") &&
      selectedWaterBody.polygon
    ) {
      if (selectedWaterBody.polygon.length > 1) {
        const lineGeom = createPolygonLine(selectedWaterBody.polygon, y, true);
        const lineMat = new LineBasicNodeMaterial({
          color: POLYGON_LINE_COLOR,
        });
        const line = new THREE.Line(lineGeom, lineMat);
        group.add(line);
        state.pathLine = line;
      }

      // Surface mesh
      const surface = createPolygonSurfaceMesh(selectedWaterBody.polygon, y);
      if (surface) {
        group.add(surface);
        state.surfaceMesh = surface;
      }

      // Vertex markers
      if (selectedWaterBody.polygon.length > 0) {
        const markerGeom = createVertexPositions(selectedWaterBody.polygon, y);
        const markerMat = new THREE.PointsMaterial({
          color: VERTEX_POINT_COLOR,
          size: 8,
          sizeAttenuation: false,
        });
        const markers = new THREE.Points(markerGeom, markerMat);
        group.add(markers);
        state.vertexMarkers = markers;
      }
    }

    sceneRefs.scene.add(group);

    return () => {
      if (state.group) {
        sceneRefs.scene.remove(state.group);
        state.group.traverse((child) => {
          if (
            child instanceof THREE.Mesh ||
            child instanceof THREE.Line ||
            child instanceof THREE.Points
          ) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        state.group = null;
      }
    };
  }, [sceneRefs, selectedWaterBody]);

  // Click handler for adding vertices
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!isAddingRef.current || !selectedRef.current || !sceneRefs) return;

      const container = sceneRefs.container;
      const camera = sceneRefs.camera;
      const rect = container.getBoundingClientRect();

      _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_mouse, camera);

      // Try terrain intersection first
      const terrainContainer = sceneRefs.terrainContainer;
      let hitPoint: THREE.Vector3 | null = null;

      if (terrainContainer) {
        const hits = _raycaster.intersectObjects(
          terrainContainer.children,
          false,
        );
        if (hits.length > 0) {
          hitPoint = hits[0].point;
        }
      }

      // Fallback to ground plane at surfaceY
      if (!hitPoint) {
        const surfaceY = selectedRef.current.surfaceY ?? 0;
        _groundPlane.constant = -surfaceY;
        if (_raycaster.ray.intersectPlane(_groundPlane, _planeTarget)) {
          hitPoint = _planeTarget;
        }
      }

      if (!hitPoint) return;

      const wb = selectedRef.current;
      const worldX = hitPoint.x;
      const worldZ = hitPoint.z;

      if (wb.bodyType === "river") {
        // Add waypoint
        const newWaypoint: RiverWaypoint = {
          x: Math.round(worldX),
          z: Math.round(worldZ),
          halfWidth: 5,
          depth: 3,
          surfaceY: wb.surfaceY ?? hitPoint.y,
        };
        const waypoints = [...(wb.waypoints || []), newWaypoint];
        onUpdateWaterBody(wb.id, { waypoints });
      } else {
        // Add polygon vertex
        const newVertex = {
          x: Math.round(worldX),
          z: Math.round(worldZ),
        };
        const polygon = [...(wb.polygon || []), newVertex];
        onUpdateWaterBody(wb.id, { polygon });
      }
    },
    [sceneRefs, onUpdateWaterBody],
  );

  // Attach/detach click handler
  useEffect(() => {
    if (!sceneRefs || !isAddingVertices) return;

    const container = sceneRefs.container;
    container.addEventListener("click", handleClick);

    return () => {
      container.removeEventListener("click", handleClick);
    };
  }, [sceneRefs, isAddingVertices, handleClick]);
}
