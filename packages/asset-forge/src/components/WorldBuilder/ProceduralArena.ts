/**
 * ProceduralArena — Standalone duel arena geometry builder for World Studio
 *
 * Generates the 6-arena duel complex matching the game's DuelArenaVisualsSystem:
 * sandstone floor tiles, stone fence posts + rails, corner pillars, and lobby area.
 *
 * Uses merged geometries per material type for minimal draw calls.
 */

import * as THREE from "three";
import type { MeshStandardNodeMaterial } from "three/webgpu";

// ============== CONSTANTS (from DuelArenaVisualsSystem.ts) ==============

const ARENA_BASE_X = 60;
const ARENA_BASE_Z = 80;
const ARENA_WIDTH = 20;
const ARENA_LENGTH = 24;
const ARENA_GAP = 4;
const ARENA_COLS = 2;
const ARENA_ROWS = 3;
const FLOOR_THICKNESS = 0.3;
const FLOOR_HEIGHT_OFFSET = 0.27;

const FENCE_HEIGHT = 1.5;
const FENCE_POST_SPACING = 2.0;
const FENCE_POST_SIZE = 0.2;
const FENCE_CAP_OVERHANG = 0.06;
const FENCE_CAP_HEIGHT = 0.06;
const FENCE_RAIL_HEIGHTS = [0.3, 0.75, 1.2];

const PILLAR_BASE_SIZE = 0.5;
const PILLAR_BASE_HEIGHT = 0.1;
const PILLAR_SHAFT_SIZE = 0.35;
const PILLAR_SHAFT_HEIGHT = 2.0;
const PILLAR_CAP_SIZE = 0.45;
const PILLAR_CAP_HEIGHT = 0.12;

const LOBBY_CENTER_X = 105;
const LOBBY_CENTER_Z = 62;

// ============== GEOMETRY HELPER ==============

/** Merge multiple geometries into one (position + normal + index). */
function mergeGeometries(
  geometries: THREE.BufferGeometry[],
): THREE.BufferGeometry | null {
  const allVerts: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let vertexOffset = 0;

  for (const geo of geometries) {
    const posAttr = geo.getAttribute("position");
    if (!posAttr) continue;

    for (let i = 0; i < posAttr.array.length; i++)
      allVerts.push(posAttr.array[i]);

    const normAttr = geo.getAttribute("normal");
    if (normAttr) {
      for (let i = 0; i < normAttr.array.length; i++)
        allNormals.push(normAttr.array[i]);
    } else {
      for (let i = 0; i < posAttr.count; i++) allNormals.push(0, 1, 0);
    }

    const index = geo.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++)
        allIndices.push(index.getX(i) + vertexOffset);
    }
    vertexOffset += posAttr.count;
  }

  if (allVerts.length === 0) return null;

  const merged = new THREE.BufferGeometry();
  merged.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(allVerts, 3),
  );
  merged.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(allNormals, 3),
  );
  merged.setIndex(allIndices);
  return merged;
}

// ============== PUBLIC API ==============

/**
 * Create the full duel arena complex at the game's fixed position.
 *
 * @param worldCenterOffset Offset applied to all positions for world centering
 * @param baseHeight Terrain height at arena base
 * @param fenceMaterial TSL sandstone fence material from ProceduralMaterials
 * @param floorMaterial TSL floor tile material from ProceduralMaterials
 */
export function createProceduralArena(
  worldCenterOffset: number,
  baseHeight: number,
  fenceMaterial: MeshStandardNodeMaterial,
  floorMaterial: MeshStandardNodeMaterial,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "duel_arena";

  const floorGeometries: THREE.BufferGeometry[] = [];
  const fenceGeometries: THREE.BufferGeometry[] = [];

  const baseH = baseHeight;
  const floorY = baseH + FLOOR_HEIGHT_OFFSET;

  // ── Arena floors (6 arenas in 2×3 grid) ──
  for (let col = 0; col < ARENA_COLS; col++) {
    for (let row = 0; row < ARENA_ROWS; row++) {
      const arenaX = ARENA_BASE_X + col * (ARENA_WIDTH + ARENA_GAP);
      const arenaZ = ARENA_BASE_Z + row * (ARENA_LENGTH + ARENA_GAP);
      const cx = arenaX + ARENA_WIDTH / 2 + worldCenterOffset;
      const cz = arenaZ + ARENA_LENGTH / 2 + worldCenterOffset;

      const floorGeo = new THREE.BoxGeometry(
        ARENA_WIDTH,
        FLOOR_THICKNESS,
        ARENA_LENGTH,
      );
      floorGeo.translate(cx, floorY, cz);
      floorGeometries.push(floorGeo);

      // Fence posts along all 4 sides
      buildArenaPosts(
        arenaX,
        arenaZ,
        floorY,
        worldCenterOffset,
        fenceGeometries,
      );

      // Horizontal rails along all 4 sides
      buildArenaRails(
        arenaX,
        arenaZ,
        floorY,
        worldCenterOffset,
        fenceGeometries,
      );

      // Corner pillars (base + shaft + capital)
      buildCornerPillars(
        arenaX,
        arenaZ,
        floorY,
        worldCenterOffset,
        fenceGeometries,
      );
    }
  }

  // ── Lobby floor ──
  const lobbyGeo = new THREE.BoxGeometry(40, FLOOR_THICKNESS, 25);
  lobbyGeo.translate(
    LOBBY_CENTER_X + worldCenterOffset,
    baseH + 0.15,
    LOBBY_CENTER_Z + worldCenterOffset,
  );
  floorGeometries.push(lobbyGeo);

  // ── Merge floor geometry ──
  if (floorGeometries.length > 0) {
    const merged = mergeGeometries(floorGeometries);
    for (const g of floorGeometries) g.dispose();
    if (merged) {
      const floorMesh = new THREE.Mesh(merged, floorMaterial);
      floorMesh.name = "arena_floors";
      floorMesh.receiveShadow = true;
      group.add(floorMesh);
    }
  }

  // ── Merge fence geometry ──
  if (fenceGeometries.length > 0) {
    const merged = mergeGeometries(fenceGeometries);
    for (const g of fenceGeometries) g.dispose();
    if (merged) {
      const fenceMesh = new THREE.Mesh(merged, fenceMaterial);
      fenceMesh.name = "arena_fences";
      fenceMesh.castShadow = true;
      fenceMesh.receiveShadow = true;
      group.add(fenceMesh);
    }
  }

  return group;
}

// ============== INTERNAL BUILDERS ==============

function buildArenaPosts(
  arenaX: number,
  arenaZ: number,
  floorY: number,
  offset: number,
  out: THREE.BufferGeometry[],
) {
  // North/south walls (along X axis)
  for (const zEdge of [0, ARENA_LENGTH]) {
    const postCount = Math.max(
      2,
      Math.ceil(ARENA_WIDTH / FENCE_POST_SPACING) + 1,
    );
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const px = arenaX + t * ARENA_WIDTH + offset;
      const pz = arenaZ + zEdge + offset;

      const postGeo = new THREE.BoxGeometry(
        FENCE_POST_SIZE,
        FENCE_HEIGHT,
        FENCE_POST_SIZE,
      );
      postGeo.translate(px, floorY + FENCE_HEIGHT / 2, pz);
      out.push(postGeo);

      const capSize = FENCE_POST_SIZE + FENCE_CAP_OVERHANG * 2;
      const capGeo = new THREE.BoxGeometry(capSize, FENCE_CAP_HEIGHT, capSize);
      capGeo.translate(px, floorY + FENCE_HEIGHT + FENCE_CAP_HEIGHT / 2, pz);
      out.push(capGeo);
    }
  }

  // East/west walls (along Z axis)
  for (const xEdge of [0, ARENA_WIDTH]) {
    const postCount = Math.max(
      2,
      Math.ceil(ARENA_LENGTH / FENCE_POST_SPACING) + 1,
    );
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const px = arenaX + xEdge + offset;
      const pz = arenaZ + t * ARENA_LENGTH + offset;

      const postGeo = new THREE.BoxGeometry(
        FENCE_POST_SIZE,
        FENCE_HEIGHT,
        FENCE_POST_SIZE,
      );
      postGeo.translate(px, floorY + FENCE_HEIGHT / 2, pz);
      out.push(postGeo);

      const capSize = FENCE_POST_SIZE + FENCE_CAP_OVERHANG * 2;
      const capGeo = new THREE.BoxGeometry(capSize, FENCE_CAP_HEIGHT, capSize);
      capGeo.translate(px, floorY + FENCE_HEIGHT + FENCE_CAP_HEIGHT / 2, pz);
      out.push(capGeo);
    }
  }
}

function buildArenaRails(
  arenaX: number,
  arenaZ: number,
  floorY: number,
  offset: number,
  out: THREE.BufferGeometry[],
) {
  for (const railH of FENCE_RAIL_HEIGHTS) {
    const railY = floorY + railH;

    // North/south rails (full width along X)
    for (const zEdge of [0, ARENA_LENGTH]) {
      const railGeo = new THREE.BoxGeometry(ARENA_WIDTH, 0.08, 0.08);
      railGeo.translate(
        arenaX + ARENA_WIDTH / 2 + offset,
        railY,
        arenaZ + zEdge + offset,
      );
      out.push(railGeo);
    }

    // East/west rails (full length along Z)
    for (const xEdge of [0, ARENA_WIDTH]) {
      const railGeo = new THREE.BoxGeometry(0.08, 0.08, ARENA_LENGTH);
      railGeo.translate(
        arenaX + xEdge + offset,
        railY,
        arenaZ + ARENA_LENGTH / 2 + offset,
      );
      out.push(railGeo);
    }
  }
}

function buildCornerPillars(
  arenaX: number,
  arenaZ: number,
  floorY: number,
  offset: number,
  out: THREE.BufferGeometry[],
) {
  const corners = [
    [arenaX, arenaZ],
    [arenaX + ARENA_WIDTH, arenaZ],
    [arenaX, arenaZ + ARENA_LENGTH],
    [arenaX + ARENA_WIDTH, arenaZ + ARENA_LENGTH],
  ];

  for (const [cx, cz] of corners) {
    const px = cx + offset;
    const pz = cz + offset;

    // Base
    const baseGeo = new THREE.BoxGeometry(
      PILLAR_BASE_SIZE,
      PILLAR_BASE_HEIGHT,
      PILLAR_BASE_SIZE,
    );
    baseGeo.translate(px, floorY + PILLAR_BASE_HEIGHT / 2, pz);
    out.push(baseGeo);

    // Shaft
    const shaftGeo = new THREE.BoxGeometry(
      PILLAR_SHAFT_SIZE,
      PILLAR_SHAFT_HEIGHT,
      PILLAR_SHAFT_SIZE,
    );
    shaftGeo.translate(
      px,
      floorY + PILLAR_BASE_HEIGHT + PILLAR_SHAFT_HEIGHT / 2,
      pz,
    );
    out.push(shaftGeo);

    // Capital
    const capGeo = new THREE.BoxGeometry(
      PILLAR_CAP_SIZE,
      PILLAR_CAP_HEIGHT,
      PILLAR_CAP_SIZE,
    );
    capGeo.translate(
      px,
      floorY + PILLAR_BASE_HEIGHT + PILLAR_SHAFT_HEIGHT + PILLAR_CAP_HEIGHT / 2,
      pz,
    );
    out.push(capGeo);
  }
}
