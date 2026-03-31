/**
 * useAreaBoundaryOverlay — Renders boundary visualizations in the 3D viewport
 * for difficulty zones, town areas, and biome regions.
 *
 * Item D-21: "World area boundaries — polygon visualization"
 *
 * Overlays are toggled via WorldStudioState.overlays:
 * - difficultyOverlay  → rectangular zone outlines colored by difficulty level
 * - biomeOverlay       → circle outlines + semi-transparent fill per biome
 * - Town boundaries are always rendered when any overlay is active
 *
 * Pattern follows useBrushOverlaySync.ts: a single THREE.Group attached to
 * sceneRefs.scene, rebuilt when relevant state changes.
 */

import * as THREE from "three";
import { useEffect, useRef } from "react";

import type { TerrainSceneRefs } from "../../WorldBuilder/TileBasedTerrain";
import { useWorldStudio } from "../WorldStudioContext";

// ============== CONSTANTS ==============

/** Difficulty zone colors indexed by difficulty level (0–4). */
const DIFFICULTY_COLORS = [
  0x22c55e, // 0 - safe (green)
  0x3b82f6, // 1 - novice (blue)
  0xf59e0b, // 2 - intermediate (amber)
  0xef4444, // 3 - advanced (red)
  0xa855f7, // 4 - expert (purple)
];

/** Town boundary color — warm yellow. */
const TOWN_BOUNDARY_COLOR = 0xfbbf24;

/** Town radius defaults by size category (meters). */
const TOWN_RADIUS_DEFAULTS: Record<string, number> = {
  hamlet: 50,
  village: 100,
  town: 150,
};

/** Height offset so lines sit slightly above the terrain surface. */
const LINE_Y = 0.5;

// ============== GEOMETRY HELPERS ==============

function createCircleGeometry(
  radius: number,
  segments: number = 64,
): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(
      new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createRectGeometry(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): THREE.BufferGeometry {
  const points = [
    new THREE.Vector3(minX, 0, minZ),
    new THREE.Vector3(maxX, 0, minZ),
    new THREE.Vector3(maxX, 0, maxZ),
    new THREE.Vector3(minX, 0, maxZ),
    new THREE.Vector3(minX, 0, minZ), // close loop
  ];
  return new THREE.BufferGeometry().setFromPoints(points);
}

// ============== LABEL SPRITE ==============

/**
 * Creates a small text sprite used as a zone label.
 * Renders the text into an offscreen canvas and maps it onto a SpriteMaterial.
 */
function createLabelSprite(text: string, color: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = 256;
  canvas.height = 64;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background pill
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  const pad = 8;
  ctx.beginPath();
  ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 8);
  ctx.fill();

  // Text
  const hexStr = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = hexStr;
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(12, 3, 1);
  sprite.renderOrder = 998;

  return sprite;
}

// ============== BUILD FUNCTIONS ==============

function buildDifficultyOverlay(
  group: THREE.Group,
  difficultyZones: ReadonlyArray<{
    id: string;
    name: string;
    difficultyLevel: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  }>,
): void {
  for (const zone of difficultyZones) {
    const color =
      DIFFICULTY_COLORS[
        Math.min(zone.difficultyLevel, DIFFICULTY_COLORS.length - 1)
      ] ?? DIFFICULTY_COLORS[0];

    // Rectangle outline
    const geo = createRectGeometry(
      zone.bounds.minX,
      zone.bounds.maxX,
      zone.bounds.minZ,
      zone.bounds.maxZ,
    );
    const mat = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geo, mat);
    line.position.y = LINE_Y;
    line.renderOrder = 998;
    line.name = `difficulty-zone-${zone.id}`;
    group.add(line);

    // Label sprite at center
    const cx = (zone.bounds.minX + zone.bounds.maxX) / 2;
    const cz = (zone.bounds.minZ + zone.bounds.maxZ) / 2;
    const label = createLabelSprite(zone.name, color);
    label.position.set(cx, LINE_Y + 5, cz);
    label.name = `difficulty-label-${zone.id}`;
    group.add(label);
  }
}

function buildTownBoundaryOverlay(
  group: THREE.Group,
  towns: ReadonlyArray<{
    id: string;
    name: string;
    size: string;
    position: { x: number; y: number; z: number };
    buildingIds: string[];
  }>,
  buildings: ReadonlyArray<{
    id: string;
    position: { x: number; y: number; z: number };
  }>,
): void {
  // Index buildings by id for quick lookup
  const buildingMap = new Map<string, { x: number; y: number; z: number }>();
  for (const b of buildings) {
    buildingMap.set(b.id, b.position);
  }

  for (const town of towns) {
    // Compute radius from building spread, fallback to size-based default
    let radius = TOWN_RADIUS_DEFAULTS[town.size] ?? 75;

    if (town.buildingIds.length > 0) {
      let maxDist = 0;
      for (const bid of town.buildingIds) {
        const bpos = buildingMap.get(bid);
        if (!bpos) continue;
        const dx = bpos.x - town.position.x;
        const dz = bpos.z - town.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > maxDist) maxDist = dist;
      }
      // Add padding beyond furthest building
      if (maxDist > 0) {
        radius = maxDist + 15;
      }
    }

    // Dashed circle outline
    const circleGeo = createCircleGeometry(radius);
    const dashMat = new THREE.LineDashedMaterial({
      color: TOWN_BOUNDARY_COLOR,
      dashSize: 4,
      gapSize: 2,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity: 0.8,
    });
    const circle = new THREE.Line(circleGeo, dashMat);
    circle.computeLineDistances(); // required for dashed material
    circle.position.set(town.position.x, LINE_Y, town.position.z);
    circle.renderOrder = 998;
    circle.name = `town-boundary-${town.id}`;
    group.add(circle);

    // Label
    const label = createLabelSprite(town.name, TOWN_BOUNDARY_COLOR);
    label.position.set(town.position.x, LINE_Y + 5, town.position.z);
    label.name = `town-label-${town.id}`;
    group.add(label);
  }
}

function buildBiomeOverlay(
  group: THREE.Group,
  biomes: ReadonlyArray<{
    id: string;
    type: string;
    center: { x: number; y: number; z: number };
    influenceRadius: number;
    color: number;
  }>,
): void {
  for (const biome of biomes) {
    const biomeColor = biome.color;

    // Semi-transparent filled circle
    const fillGeo = new THREE.CircleGeometry(biome.influenceRadius, 64);
    fillGeo.rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color: biomeColor,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.set(biome.center.x, LINE_Y, biome.center.z);
    fillMesh.renderOrder = 998;
    fillMesh.name = `biome-fill-${biome.id}`;
    group.add(fillMesh);

    // Wire outline ring
    const ringGeo = createCircleGeometry(biome.influenceRadius);
    const ringMat = new THREE.LineBasicMaterial({
      color: biomeColor,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Line(ringGeo, ringMat);
    ring.position.set(biome.center.x, LINE_Y, biome.center.z);
    ring.renderOrder = 998;
    ring.name = `biome-ring-${biome.id}`;
    group.add(ring);
  }
}

// ============== DISPOSAL ==============

function disposeGroup(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
  group.clear();
}

// ============== HOOK ==============

export function useAreaBoundaryOverlay(
  sceneRefs: TerrainSceneRefs | null,
): void {
  const { state } = useWorldStudio();
  const overlayGroup = useRef<THREE.Group | null>(null);
  const sceneRefsRef = useRef(sceneRefs);
  sceneRefsRef.current = sceneRefs;

  // Derive data from state
  const world = state.builder.editing.world;
  const difficultyOverlay = state.overlays.difficultyOverlay;
  const biomeOverlay = state.overlays.biomeOverlay;

  // Any overlay active means we also show town boundaries
  const anyOverlayActive = difficultyOverlay || biomeOverlay;

  const difficultyZones = world?.layers.difficultyZones;
  const towns = world?.foundation.towns;
  const buildings = world?.foundation.buildings;
  const biomes = world?.foundation.biomes;

  useEffect(() => {
    if (!sceneRefs) return;

    // Tear down previous group
    if (overlayGroup.current) {
      sceneRefs.scene.remove(overlayGroup.current);
      disposeGroup(overlayGroup.current);
      overlayGroup.current = null;
    }

    // Nothing to render if no overlay is active or no world data
    if (!anyOverlayActive || !world) return;

    const group = new THREE.Group();
    group.name = "area-boundary-overlay";
    group.renderOrder = 998;

    // Difficulty zones
    if (difficultyOverlay && difficultyZones && difficultyZones.length > 0) {
      buildDifficultyOverlay(group, difficultyZones);
    }

    // Town boundaries (always shown when any overlay is active)
    if (towns && towns.length > 0) {
      buildTownBoundaryOverlay(group, towns, buildings ?? []);
    }

    // Biome regions
    if (biomeOverlay && biomes && biomes.length > 0) {
      buildBiomeOverlay(group, biomes);
    }

    sceneRefs.scene.add(group);
    overlayGroup.current = group;
  }, [
    sceneRefs,
    anyOverlayActive,
    difficultyOverlay,
    biomeOverlay,
    difficultyZones,
    towns,
    buildings,
    biomes,
    world,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const refs = sceneRefsRef.current;
      const group = overlayGroup.current;
      if (refs && group) {
        refs.scene.remove(group);
        disposeGroup(group);
      }
    };
  }, []);
}
