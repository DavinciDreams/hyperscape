/**
 * ProceduralBridge — Standalone bridge geometry builder for World Studio
 *
 * Generates bridge meshes matching the game's BridgeSystem output:
 * arched deck, fence posts + caps, horizontal rails, side stringers,
 * cross joists, x-bracing, and stone support pillars.
 *
 * All wood components merged into a single draw call.
 * All stone components merged into a single draw call.
 */

import * as THREE from "three/webgpu";
import type { MeshStandardNodeMaterial } from "three/webgpu";

// ============== CONSTANTS (from BridgeSystem.ts) ==============

const FENCE_POST_SPACING = 2.0;
const FENCE_POST_SIZE = 0.2;
const FENCE_HEIGHT = 1.5;
const FENCE_CAP_OVERHANG = 0.06;
const FENCE_CAP_HEIGHT = 0.06;
const FENCE_RAIL_HEIGHTS = [0.3, 0.75, 1.2];
const FENCE_RAIL_HEIGHT = 0.08;
const FENCE_RAIL_DEPTH = 0.08;
const PILLAR_SPACING = 4.5;
const PILLAR_SIZE = 0.45;
const PILLAR_BASE_SIZE = 0.6;
const PILLAR_BASE_HEIGHT = 0.15;
const PILLAR_CAP_SIZE = 0.55;
const PILLAR_CAP_HEIGHT = 0.1;
const STRINGER_WIDTH = 0.18;
const STRINGER_HEIGHT = 0.22;
const JOIST_SPACING = 1.0;
const JOIST_WIDTH = 0.12;
const JOIST_HEIGHT = 0.16;
const XBRACE_SIZE = 0.05;

// ============== TYPES ==============

export interface BridgeDef {
  id: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  width: number;
  railingHeight: number;
  archHeight: number;
}

export const ISLAND_BRIDGES: BridgeDef[] = [
  {
    id: "bridge_west",
    startX: -330,
    startZ: -100,
    endX: -330,
    endZ: -60,
    width: 4,
    railingHeight: 1.2,
    archHeight: 1.0,
  },
  {
    id: "bridge_central",
    startX: -60,
    startZ: -150,
    endX: -60,
    endZ: -110,
    width: 4.5,
    railingHeight: 1.2,
    archHeight: 1.2,
  },
  {
    id: "bridge_east",
    startX: 230,
    startZ: -150,
    endX: 230,
    endZ: -110,
    width: 4,
    railingHeight: 1.2,
    archHeight: 1.0,
  },
  {
    id: "bridge_coastal",
    startX: 440,
    startZ: -70,
    endX: 440,
    endZ: -20,
    width: 4,
    railingHeight: 1.2,
    archHeight: 0.8,
  },
];

// ============== GEOMETRY HELPERS ==============

/** Build an oriented rail/beam box between two 3D endpoints. */
function buildOrientedRail(
  x0: number,
  z0: number,
  y0: number,
  x1: number,
  z1: number,
  y1: number,
  width: number,
  height: number,
  perpX: number,
  perpZ: number,
): THREE.BufferGeometry {
  const hw = width / 2;
  const hh = height / 2;

  const verts = new Float32Array([
    x0 + perpX * hw,
    y0 - hh,
    z0 + perpZ * hw,
    x0 - perpX * hw,
    y0 - hh,
    z0 - perpZ * hw,
    x0 + perpX * hw,
    y0 + hh,
    z0 + perpZ * hw,
    x0 - perpX * hw,
    y0 + hh,
    z0 - perpZ * hw,
    x1 + perpX * hw,
    y1 - hh,
    z1 + perpZ * hw,
    x1 - perpX * hw,
    y1 - hh,
    z1 - perpZ * hw,
    x1 + perpX * hw,
    y1 + hh,
    z1 + perpZ * hw,
    x1 - perpX * hw,
    y1 + hh,
    z1 - perpZ * hw,
  ]);

  // prettier-ignore
  const indices = new Uint16Array([
    2,6,3, 3,6,7,  // top
    0,1,4, 1,5,4,  // bottom
    0,4,2, 2,4,6,  // left
    1,3,5, 3,7,5,  // right
    0,2,1, 1,2,3,  // near
    4,5,6, 5,7,6,  // far
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/** Build tessellated deck with parabolic arch. Top surface only. */
function buildDeckGeometry(
  def: BridgeDef,
  bridgeLen: number,
  dirX: number,
  dirZ: number,
  perpX: number,
  perpZ: number,
  startY: number,
  endY: number,
  halfWidth: number,
): THREE.BufferGeometry {
  const lengthSteps = Math.max(8, Math.ceil(bridgeLen / 0.5));
  const widthSteps = Math.max(4, Math.ceil(def.width));
  const stride = widthSteps + 1;

  const vertices: number[] = [];
  const norms: number[] = [];
  const indices: number[] = [];

  const deckYAt = (t: number) =>
    startY + (endY - startY) * t + 4 * def.archHeight * t * (1 - t);

  for (let s = 0; s <= lengthSteps; s++) {
    const t = s / lengthSteps;
    const cx = def.startX + dirX * t;
    const cz = def.startZ + dirZ * t;
    const y = deckYAt(t);
    for (let w = 0; w <= widthSteps; w++) {
      const wt = (w / widthSteps - 0.5) * def.width;
      vertices.push(cx + perpX * wt, y, cz + perpZ * wt);
      norms.push(0, 1, 0);
    }
  }
  for (let s = 0; s < lengthSteps; s++) {
    for (let w = 0; w < widthSteps; w++) {
      const a = s * stride + w;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(norms, 3));
  geometry.setIndex(indices);
  return geometry;
}

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

    const posArray = posAttr.array;
    for (let i = 0; i < posArray.length; i++) allVerts.push(posArray[i]);

    const normAttr = geo.getAttribute("normal");
    if (normAttr) {
      const normArray = normAttr.array;
      for (let i = 0; i < normArray.length; i++) allNormals.push(normArray[i]);
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
 * Create a single bridge group with proper arched geometry and merged draw calls.
 *
 * @param def Bridge definition
 * @param startY Terrain height at start point
 * @param endY Terrain height at end point
 * @param waterY Water surface Y level (pillar base)
 * @param woodMaterial TSL wood material from ProceduralMaterials
 * @param stoneMaterial TSL stone material from ProceduralMaterials
 */
export function createProceduralBridge(
  def: BridgeDef,
  startY: number,
  endY: number,
  waterY: number,
  woodMaterial: MeshStandardNodeMaterial,
  stoneMaterial: MeshStandardNodeMaterial,
): THREE.Group | null {
  const dirX = def.endX - def.startX;
  const dirZ = def.endZ - def.startZ;
  const bridgeLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (bridgeLen < 1) return null;

  const perpX = -(dirZ / bridgeLen);
  const perpZ = dirX / bridgeLen;
  const halfWidth = def.width / 2;

  const woodGeometries: THREE.BufferGeometry[] = [];
  const stoneGeometries: THREE.BufferGeometry[] = [];

  // ── 1. Arched deck slab ──
  const deckGeo = buildDeckGeometry(
    def,
    bridgeLen,
    dirX,
    dirZ,
    perpX,
    perpZ,
    startY,
    endY,
    halfWidth,
  );
  woodGeometries.push(deckGeo);

  // ── 2. Fence posts + caps (both sides) ──
  const postCount = Math.max(2, Math.floor(bridgeLen / FENCE_POST_SPACING) + 1);

  for (let p = 0; p < postCount; p++) {
    const t = p / (postCount - 1);
    const cx = def.startX + dirX * t;
    const cz = def.startZ + dirZ * t;
    const arch = 4 * def.archHeight * t * (1 - t);
    const deckY = startY + (endY - startY) * t + arch;

    for (const side of [-1, 1]) {
      const px = cx + perpX * halfWidth * side;
      const pz = cz + perpZ * halfWidth * side;

      const postGeo = new THREE.BoxGeometry(
        FENCE_POST_SIZE,
        FENCE_HEIGHT,
        FENCE_POST_SIZE,
      );
      postGeo.translate(px, deckY + FENCE_HEIGHT / 2, pz);
      woodGeometries.push(postGeo);

      const capSize = FENCE_POST_SIZE + FENCE_CAP_OVERHANG * 2;
      const capGeo = new THREE.BoxGeometry(capSize, FENCE_CAP_HEIGHT, capSize);
      capGeo.translate(px, deckY + FENCE_HEIGHT + FENCE_CAP_HEIGHT / 2, pz);
      woodGeometries.push(capGeo);
    }
  }

  // ── 3. Horizontal rails (both sides, three heights) ──
  for (let p = 0; p < postCount - 1; p++) {
    const t0 = p / (postCount - 1);
    const t1 = (p + 1) / (postCount - 1);
    const cx0 = def.startX + dirX * t0;
    const cz0 = def.startZ + dirZ * t0;
    const cx1 = def.startX + dirX * t1;
    const cz1 = def.startZ + dirZ * t1;
    const arch0 = 4 * def.archHeight * t0 * (1 - t0);
    const arch1 = 4 * def.archHeight * t1 * (1 - t1);
    const deckY0 = startY + (endY - startY) * t0 + arch0;
    const deckY1 = startY + (endY - startY) * t1 + arch1;

    for (const side of [-1, 1]) {
      for (const railH of FENCE_RAIL_HEIGHTS) {
        const rg = buildOrientedRail(
          cx0 + perpX * halfWidth * side,
          cz0 + perpZ * halfWidth * side,
          deckY0 + railH,
          cx1 + perpX * halfWidth * side,
          cz1 + perpZ * halfWidth * side,
          deckY1 + railH,
          FENCE_RAIL_DEPTH,
          FENCE_RAIL_HEIGHT,
          perpX,
          perpZ,
        );
        woodGeometries.push(rg);
      }
    }
  }

  // ── 4. Side stringers ──
  for (let p = 0; p < postCount - 1; p++) {
    const t0 = p / (postCount - 1);
    const t1 = (p + 1) / (postCount - 1);
    const cx0 = def.startX + dirX * t0;
    const cz0 = def.startZ + dirZ * t0;
    const cx1 = def.startX + dirX * t1;
    const cz1 = def.startZ + dirZ * t1;
    const arch0 = 4 * def.archHeight * t0 * (1 - t0);
    const arch1 = 4 * def.archHeight * t1 * (1 - t1);
    const deckY0 = startY + (endY - startY) * t0 + arch0;
    const deckY1 = startY + (endY - startY) * t1 + arch1;

    for (const side of [-1, 1]) {
      const sg = buildOrientedRail(
        cx0 + perpX * halfWidth * side,
        cz0 + perpZ * halfWidth * side,
        deckY0 - STRINGER_HEIGHT / 2 - 0.03,
        cx1 + perpX * halfWidth * side,
        cz1 + perpZ * halfWidth * side,
        deckY1 - STRINGER_HEIGHT / 2 - 0.03,
        STRINGER_WIDTH,
        STRINGER_HEIGHT,
        perpX,
        perpZ,
      );
      woodGeometries.push(sg);
    }
  }

  // ── 5. Cross joists ──
  const joistCount = Math.max(2, Math.floor(bridgeLen / JOIST_SPACING) + 1);
  for (let j = 0; j < joistCount; j++) {
    const t = j / (joistCount - 1);
    const cx = def.startX + dirX * t;
    const cz = def.startZ + dirZ * t;
    const arch = 4 * def.archHeight * t * (1 - t);
    const deckY = startY + (endY - startY) * t + arch;
    const joistY = deckY - JOIST_HEIGHT / 2 - 0.03;

    const inset = STRINGER_WIDTH / 2;
    const jg = buildOrientedRail(
      cx + perpX * (halfWidth - inset),
      cz + perpZ * (halfWidth - inset),
      joistY,
      cx - perpX * (halfWidth - inset),
      cz - perpZ * (halfWidth - inset),
      joistY,
      JOIST_WIDTH,
      JOIST_HEIGHT,
      dirX / bridgeLen,
      dirZ / bridgeLen,
    );
    woodGeometries.push(jg);
  }

  // ── 6. X-bracing ──
  for (let p = 0; p < postCount - 1; p++) {
    const t0 = p / (postCount - 1);
    const t1 = (p + 1) / (postCount - 1);
    const cx0 = def.startX + dirX * t0;
    const cz0 = def.startZ + dirZ * t0;
    const cx1 = def.startX + dirX * t1;
    const cz1 = def.startZ + dirZ * t1;
    const arch0 = 4 * def.archHeight * t0 * (1 - t0);
    const arch1 = 4 * def.archHeight * t1 * (1 - t1);
    const deckY0 = startY + (endY - startY) * t0 + arch0;
    const deckY1 = startY + (endY - startY) * t1 + arch1;

    for (const side of [-1, 1]) {
      const px0 = cx0 + perpX * halfWidth * side;
      const pz0 = cz0 + perpZ * halfWidth * side;
      const px1 = cx1 + perpX * halfWidth * side;
      const pz1 = cz1 + perpZ * halfWidth * side;

      woodGeometries.push(
        buildOrientedRail(
          px0,
          pz0,
          deckY0 + FENCE_RAIL_HEIGHTS[0],
          px1,
          pz1,
          deckY1 + FENCE_RAIL_HEIGHTS[2],
          XBRACE_SIZE,
          XBRACE_SIZE,
          perpX,
          perpZ,
        ),
      );
      woodGeometries.push(
        buildOrientedRail(
          px0,
          pz0,
          deckY0 + FENCE_RAIL_HEIGHTS[2],
          px1,
          pz1,
          deckY1 + FENCE_RAIL_HEIGHTS[0],
          XBRACE_SIZE,
          XBRACE_SIZE,
          perpX,
          perpZ,
        ),
      );
    }
  }

  // ── 7. Stone support pillars (base + shaft + capital) ──
  const pillarCount = Math.max(2, Math.floor(bridgeLen / PILLAR_SPACING) + 1);
  for (let p = 0; p < pillarCount; p++) {
    const t = p / (pillarCount - 1);
    const tClamped = 0.1 + t * 0.8;
    const cx = def.startX + dirX * tClamped;
    const cz = def.startZ + dirZ * tClamped;
    const arch = 4 * def.archHeight * tClamped * (1 - tClamped);
    const deckY = startY + (endY - startY) * tClamped + arch;

    const pillarTop = deckY - STRINGER_HEIGHT;
    const pillarBottom = waterY - 1.5;
    const pillarHeight = pillarTop - pillarBottom;
    if (pillarHeight < 0.5) continue;

    const baseGeo = new THREE.BoxGeometry(
      PILLAR_BASE_SIZE,
      PILLAR_BASE_HEIGHT,
      PILLAR_BASE_SIZE,
    );
    baseGeo.translate(cx, pillarBottom + PILLAR_BASE_HEIGHT / 2, cz);
    stoneGeometries.push(baseGeo);

    const shaftHeight = pillarHeight - PILLAR_BASE_HEIGHT - PILLAR_CAP_HEIGHT;
    const shaftGeo = new THREE.BoxGeometry(
      PILLAR_SIZE,
      shaftHeight,
      PILLAR_SIZE,
    );
    shaftGeo.translate(
      cx,
      pillarBottom + PILLAR_BASE_HEIGHT + shaftHeight / 2,
      cz,
    );
    stoneGeometries.push(shaftGeo);

    const capGeo = new THREE.BoxGeometry(
      PILLAR_CAP_SIZE,
      PILLAR_CAP_HEIGHT,
      PILLAR_CAP_SIZE,
    );
    capGeo.translate(cx, pillarTop - PILLAR_CAP_HEIGHT / 2, cz);
    stoneGeometries.push(capGeo);
  }

  // ── Merge and build group ──
  const group = new THREE.Group();
  group.name = `${def.id}_group`;
  group.userData = {
    selectableId: def.id,
    selectableType: "bridge",
    selectable: true,
  };

  if (woodGeometries.length > 0) {
    const mergedWood = mergeGeometries(woodGeometries);
    for (const g of woodGeometries) g.dispose();
    if (mergedWood) {
      const woodMesh = new THREE.Mesh(mergedWood, woodMaterial);
      woodMesh.name = `${def.id}_wood`;
      woodMesh.castShadow = true;
      woodMesh.receiveShadow = true;
      group.add(woodMesh);
    }
  }

  if (stoneGeometries.length > 0) {
    const mergedStone = mergeGeometries(stoneGeometries);
    for (const g of stoneGeometries) g.dispose();
    if (mergedStone) {
      const stoneMesh = new THREE.Mesh(mergedStone, stoneMaterial);
      stoneMesh.name = `${def.id}_stone`;
      stoneMesh.castShadow = true;
      stoneMesh.receiveShadow = true;
      group.add(stoneMesh);
    }
  }

  return group.children.length > 0 ? group : null;
}
