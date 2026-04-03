/**
 * ProceduralMaterials — TSL procedural material factories for World Studio viewport
 *
 * Extracted from BridgeSystem.ts and DuelArenaVisualsSystem.ts to allow the
 * World Studio to render bridges and arenas with the same TSL procedural
 * materials as the live game, without depending on ECS system infrastructure.
 *
 * Requires WebGPU renderer (uses three/tsl node materials).
 */

import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  positionWorld,
  normalWorld,
  sin,
  abs,
  fract,
  floor as tslFloor,
  dot,
  mix,
  smoothstep,
  min as tslMin,
  max as tslMax,
  mod,
  vertexColor,
} from "three/tsl";

// ============== SHARED TSL HELPERS ==============

const tslHash = Fn(([p]: [ReturnType<typeof vec2>]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
});

const tslNoise2D = Fn(([p]: [ReturnType<typeof vec2>]) => {
  const i = tslFloor(p);
  const f = fract(p);
  const smoothF = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const a = tslHash(i);
  const b = tslHash(i.add(vec2(1.0, 0.0)));
  const c = tslHash(i.add(vec2(0.0, 1.0)));
  const d = tslHash(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, smoothF.x), mix(c, d, smoothF.x), smoothF.y);
});

// ============== WOOD PATTERN ==============

/** Horizontal plank pattern. Returns vec4(isPlank, plankIndex, 0, bevel). */
const woodPlankPattern = Fn(([uvIn]: [ReturnType<typeof vec2>]) => {
  const plankWidth = float(0.45);
  const gapWidth = float(0.008);

  const plankIndex = tslFloor(uvIn.y.div(plankWidth));
  const localV = fract(uvIn.y.div(plankWidth));
  const gapFrac = gapWidth.div(plankWidth);

  const isPlank = smoothstep(gapFrac, gapFrac.add(float(0.01)), localV).mul(
    smoothstep(gapFrac, gapFrac.add(float(0.01)), float(1.0).sub(localV)),
  );

  const bevel = smoothstep(
    float(0.0),
    float(0.1),
    tslMin(localV, float(1.0).sub(localV)),
  );

  return vec4(isPlank, plankIndex, float(0.0), bevel);
});

/** Orientation-aware UV: XZ for horizontal (deck), XZ+Y for vertical (posts). */
const woodUV = Fn(() => {
  const wp = positionWorld;
  const nw = normalWorld;
  const horiz = abs(nw.y);
  const deckUV = vec2(wp.x, wp.z);
  const vertUV = vec2(wp.x.add(wp.z), wp.y);
  return mix(vertUV, deckUV, horiz);
});

// ============== STONE PATTERN ==============

/** Running-bond stone block. Returns vec4(isStone, blockId.x, blockId.y, bevel). */
const stoneBlockPattern = Fn(([uvIn]: [ReturnType<typeof vec2>]) => {
  const blockWidth = float(0.5);
  const blockHeight = float(0.25);
  const mortarWidth = float(0.012);

  const scaled = uvIn.div(vec2(blockWidth, blockHeight));
  const row = tslFloor(scaled.y);
  const courseVar = tslHash(vec2(row, float(13.0))).mul(0.08);
  const adjustedY = scaled.y.add(courseVar.mul(row));
  const rowForOffset = tslFloor(adjustedY);
  const rowOffset = mod(rowForOffset, float(2.0))
    .mul(0.5)
    .add(tslHash(vec2(rowForOffset, float(7.0))).mul(0.2));
  const offsetUV = vec2(scaled.x.add(rowOffset), adjustedY);

  const blockId = tslFloor(offsetUV);
  const localUV = fract(offsetUV);

  const mortarU = mortarWidth.div(blockWidth);
  const mortarV = mortarWidth.div(blockHeight);
  const edgeDistX = tslMin(localUV.x, float(1.0).sub(localUV.x));
  const edgeDistY = tslMin(localUV.y, float(1.0).sub(localUV.y));
  const bevel = smoothstep(
    float(0.0),
    float(0.05),
    tslMin(edgeDistX, edgeDistY),
  );

  const isStone = smoothstep(mortarU, mortarU.add(float(0.005)), localUV.x)
    .mul(
      smoothstep(mortarU, mortarU.add(float(0.005)), float(1.0).sub(localUV.x)),
    )
    .mul(smoothstep(mortarV, mortarV.add(float(0.005)), localUV.y))
    .mul(
      smoothstep(mortarV, mortarV.add(float(0.005)), float(1.0).sub(localUV.y)),
    );

  return vec4(isStone, blockId.x, blockId.y, bevel);
});

// ============== ARENA PATTERNS ==============

/** Sandstone block pattern (larger blocks, simpler offset). */
const sandstoneBlockPattern = Fn(([uvIn]: [ReturnType<typeof vec2>]) => {
  const blockWidth = float(0.6);
  const blockHeight = float(0.3);
  const mortarWidth = float(0.015);

  const scaled = uvIn.div(vec2(blockWidth, blockHeight));
  const row = tslFloor(scaled.y);
  const rowOffset = mod(row, float(2.0)).mul(0.5);
  const offsetUV = vec2(scaled.x.add(rowOffset), scaled.y);

  const blockId = tslFloor(offsetUV);
  const localUV = fract(offsetUV);

  const mortarU = mortarWidth.div(blockWidth);
  const mortarV = mortarWidth.div(blockHeight);
  const edgeDistX = tslMin(localUV.x, float(1.0).sub(localUV.x));
  const edgeDistY = tslMin(localUV.y, float(1.0).sub(localUV.y));
  const bevel = smoothstep(
    float(0.0),
    float(0.06),
    tslMin(edgeDistX, edgeDistY),
  );

  const isStone = smoothstep(mortarU, mortarU.add(float(0.01)), localUV.x)
    .mul(
      smoothstep(mortarU, mortarU.add(float(0.01)), float(1.0).sub(localUV.x)),
    )
    .mul(smoothstep(mortarV, mortarV.add(float(0.01)), localUV.y))
    .mul(
      smoothstep(mortarV, mortarV.add(float(0.01)), float(1.0).sub(localUV.y)),
    );

  return vec4(isStone, blockId.x, blockId.y, bevel);
});

/** Square floor tile pattern (1.2m tiles). Returns vec4(isStone, tileId.x, tileId.y, bevel). */
const floorTilePattern = Fn(([uvIn]: [ReturnType<typeof vec2>]) => {
  const tileSize = float(1.2);
  const mortarWidth = float(0.02);

  const scaled = uvIn.div(tileSize);
  const tileId = tslFloor(scaled);
  const localUV = fract(scaled);

  const mortarFrac = mortarWidth.div(tileSize);
  const edgeDistX = tslMin(localUV.x, float(1.0).sub(localUV.x));
  const edgeDistY = tslMin(localUV.y, float(1.0).sub(localUV.y));
  const bevel = smoothstep(
    float(0.0),
    float(0.05),
    tslMin(edgeDistX, edgeDistY),
  );

  const isStone = smoothstep(mortarFrac, mortarFrac.add(float(0.01)), localUV.x)
    .mul(
      smoothstep(
        mortarFrac,
        mortarFrac.add(float(0.01)),
        float(1.0).sub(localUV.x),
      ),
    )
    .mul(smoothstep(mortarFrac, mortarFrac.add(float(0.01)), localUV.y))
    .mul(
      smoothstep(
        mortarFrac,
        mortarFrac.add(float(0.01)),
        float(1.0).sub(localUV.y),
      ),
    );

  return vec4(isStone, tileId.x, tileId.y, bevel);
});

// ============== MATERIAL FACTORIES ==============

/** Bridge wood plank material — warm brown with per-plank variation. */
export function createBridgeWoodMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  mat.colorNode = Fn(() => {
    const uvCoord = woodUV();
    const pattern = woodPlankPattern(uvCoord);
    const isPlank = pattern.x;
    const plankIndex = pattern.y;
    const bevel = pattern.w;

    const plankId = vec2(plankIndex, float(0.0));
    const h1 = tslHash(plankId);
    const h2 = tslHash(plankId.add(vec2(3.0, 7.0)));

    const baseR = float(0.42).add(h1.mul(0.08)).sub(0.04);
    const baseG = float(0.28).add(h1.mul(0.06)).sub(0.03);
    const baseB = float(0.14).add(h2.mul(0.04)).sub(0.02);
    const woodColor = vec3(baseR, baseG, baseB);

    const edgeDark = mix(float(0.92), float(1.0), bevel);
    const gapColor = vec3(0.08, 0.05, 0.03);
    return vec4(mix(gapColor, woodColor.mul(edgeDark), isPlank), 1.0);
  })();

  mat.roughnessNode = Fn(() => {
    const uvCoord = woodUV();
    const pattern = woodPlankPattern(uvCoord);
    const isPlank = pattern.x;
    const plankIndex = pattern.y;
    const plankId = vec2(plankIndex, float(0.0));
    const woodRough = float(0.78).add(
      tslHash(plankId.add(vec2(7.0, 3.0))).mul(0.1),
    );
    return mix(float(0.95), woodRough, isPlank);
  })();

  return mat;
}

/** Bridge stone pillar material — gray-brown with moss and water stains. */
export function createBridgeStoneMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalWorld;
    const uvCoord = vec2(wp.x.add(wp.z), wp.y).mul(2.0);

    const pattern = stoneBlockPattern(uvCoord);
    const isStone = pattern.x;
    const blockId = vec2(pattern.y, pattern.z);
    const bevel = pattern.w;

    const hashVal = tslHash(blockId);
    const r = float(0.52).add(hashVal.mul(0.1)).sub(0.05);
    const g = float(0.48).add(hashVal.mul(0.08)).sub(0.04);
    const b = float(0.42).add(hashVal.mul(0.08)).sub(0.04);
    const stoneColor = vec3(r, g, b);

    const grain = tslNoise2D(uvCoord.mul(15.0)).mul(0.06);
    const fineGrain = tslNoise2D(uvCoord.mul(40.0)).mul(0.02);
    const grainedStone = stoneColor.add(
      vec3(grain.add(fineGrain), grain.add(fineGrain), grain.add(fineGrain)),
    );

    const localUV = fract(uvCoord.div(vec2(0.5, 0.25)));
    const topClean = smoothstep(float(0.85), float(0.98), localUV.y).mul(0.04);
    const cleanedStone = grainedStone.add(vec3(topClean, topClean, topClean));

    const mossMask = smoothstep(float(0.4), float(0.85), nw.y)
      .mul(smoothstep(float(14.0), float(10.0), wp.y))
      .mul(tslNoise2D(vec2(wp.x, wp.z).mul(1.5)).mul(0.6).add(0.4));
    const mossColor = vec3(0.14, 0.3, 0.08);
    const mossyStone = mix(cleanedStone, mossColor, mossMask.mul(0.5));

    const waterDist = abs(wp.y.sub(float(9.0)));
    const stainBand = smoothstep(float(1.5), float(0.0), waterDist).mul(0.15);
    const stainedStone = mossyStone.mul(float(1.0).sub(stainBand));

    const erosionNoise = tslNoise2D(uvCoord.mul(30.0)).mul(0.03);
    const edgeDark = float(1.0).sub(float(1.0).sub(bevel)).mul(erosionNoise);

    const mortarColor = vec3(0.25, 0.22, 0.18);
    const baseColor = mix(
      mortarColor,
      stainedStone.mul(bevel).add(vec3(edgeDark, edgeDark, edgeDark)),
      isStone,
    );

    return vec4(baseColor, 1.0);
  })();

  mat.roughnessNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalWorld;
    const uvCoord = vec2(wp.x.add(wp.z), wp.y).mul(2.0);

    const pattern = stoneBlockPattern(uvCoord);
    const isStone = pattern.x;
    const blockId = vec2(pattern.y, pattern.z);

    const stoneRough = float(0.82).add(
      tslHash(blockId.add(vec2(5.0, 3.0))).mul(0.1),
    );
    const mortarRough = float(0.95);

    const mossMask = smoothstep(float(0.4), float(0.85), nw.y)
      .mul(smoothstep(float(14.0), float(10.0), wp.y))
      .mul(tslNoise2D(vec2(wp.x, wp.z).mul(1.5)).mul(0.6).add(0.4));
    const mossRough = float(0.95);
    const surfaceRough = mix(stoneRough, mossRough, mossMask.mul(0.5));

    return mix(mortarRough, surfaceRough, isStone);
  })();

  mat.normalNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalWorld;
    const uvCoord = vec2(wp.x.add(wp.z), wp.y).mul(2.0);

    const pattern = stoneBlockPattern(uvCoord);
    const bevel = pattern.w;

    const eps = float(0.01);
    const bevelDx = stoneBlockPattern(uvCoord.add(vec2(eps, 0.0))).w.sub(bevel);
    const bevelDy = stoneBlockPattern(uvCoord.add(vec2(0.0, eps))).w.sub(bevel);

    const chiselDx = tslNoise2D(uvCoord.mul(20.0).add(vec2(eps, 0.0))).sub(
      tslNoise2D(uvCoord.mul(20.0)),
    );
    const chiselDy = tslNoise2D(uvCoord.mul(20.0).add(vec2(0.0, eps))).sub(
      tslNoise2D(uvCoord.mul(20.0)),
    );

    const bumpStrength = float(0.4);
    const chiselStrength = float(0.15);
    const perturbed = vec3(
      nw.x.sub(bevelDx.mul(bumpStrength)).sub(chiselDx.mul(chiselStrength)),
      nw.y,
      nw.z.sub(bevelDy.mul(bumpStrength)).sub(chiselDy.mul(chiselStrength)),
    ).normalize();

    return perturbed;
  })();

  return mat;
}

/** Arena sandstone fence material — warm sandstone with mortar. */
export function createArenaFenceMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const uvCoord = vec2(wp.x.add(wp.z), wp.y).mul(2.0);

    const pattern = sandstoneBlockPattern(uvCoord);
    const isStone = pattern.x;
    const blockId = vec2(pattern.y, pattern.z);

    const hashVal = tslHash(blockId);
    const r = float(0.62).add(hashVal.mul(0.1)).sub(0.05);
    const g = float(0.52).add(hashVal.mul(0.08)).sub(0.04);
    const b = float(0.38).add(hashVal.mul(0.08)).sub(0.04);
    const stoneColor = vec3(r, g, b);

    const grain = tslNoise2D(uvCoord.mul(15.0)).mul(0.08);
    const grainedStone = stoneColor.add(vec3(grain, grain, grain));

    const mortarColor = vec3(0.35, 0.28, 0.2);
    return vec4(mix(mortarColor, grainedStone, isStone), 1.0);
  })();

  mat.roughnessNode = Fn(() => {
    const wp = positionWorld;
    const uvCoord = vec2(wp.x.add(wp.z), wp.y).mul(2.0);

    const pattern = sandstoneBlockPattern(uvCoord);
    const isStone = pattern.x;
    const blockId = vec2(pattern.y, pattern.z);

    const stoneRough = float(0.72).add(
      tslHash(blockId.add(vec2(5.0, 3.0))).mul(0.1),
    );
    return mix(float(0.92), stoneRough, isStone);
  })();

  return mat;
}

/** Arena floor material — golden-brown flagstone tiles. */
export function createArenaFloorMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const uvCoord = vec2(wp.x, wp.z);

    const pattern = floorTilePattern(uvCoord);
    const isStone = pattern.x;
    const tileId = vec2(pattern.y, pattern.z);

    const hashVal = tslHash(tileId);
    const r = float(0.68).add(hashVal.mul(0.12)).sub(0.06);
    const g = float(0.54).add(hashVal.mul(0.1)).sub(0.05);
    const b = float(0.36).add(hashVal.mul(0.08)).sub(0.04);
    const tileColor = vec3(r, g, b);

    const grain = tslNoise2D(uvCoord.mul(12.0)).mul(0.06);
    const grainedTile = tileColor.add(vec3(grain, grain, grain));

    const groutColor = vec3(0.4, 0.32, 0.22);
    return vec4(mix(groutColor, grainedTile, isStone), 1.0);
  })();

  mat.roughnessNode = Fn(() => {
    const wp = positionWorld;
    const uvCoord = vec2(wp.x, wp.z);

    const pattern = floorTilePattern(uvCoord);
    const isStone = pattern.x;
    const tileId = vec2(pattern.y, pattern.z);

    const stoneRough = float(0.6).add(
      tslHash(tileId.add(vec2(5.0, 3.0))).mul(0.12),
    );
    return mix(float(0.9), stoneRough, isStone);
  })();

  return mat;
}

// ============== ROAD / DIRT PATH MATERIAL ==============

/**
 * Creates a TSL procedural dirt/gravel road material.
 * Uses world-space position for tiling + vertex colors for edge darkening.
 * PBR with proper roughness, normal perturbation for gravel bumpiness.
 */
export function createRoadMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();

  // --- Color ---
  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const uv2 = vec2(wp.x, wp.z);
    const vColor = vertexColor();

    // Multi-octave noise for natural dirt variation
    const n1 = tslNoise2D(uv2.mul(1.2));
    const n2 = tslNoise2D(uv2.mul(3.5)).mul(0.4);
    const n3 = tslNoise2D(uv2.mul(8.0)).mul(0.15);
    const n4 = tslNoise2D(uv2.mul(18.0)).mul(0.08);
    const combined = n1.add(n2).add(n3).add(n4);

    // Base warm dirt tones — two colors that blend via noise
    const dirtLight = vec3(0.58, 0.46, 0.32);
    const dirtDark = vec3(0.38, 0.28, 0.18);
    const baseColor = mix(dirtDark, dirtLight, smoothstep(0.3, 0.7, combined));

    // Gravel speckle — bright pebble highlights on high-frequency peaks
    const gravelNoise = tslNoise2D(uv2.mul(28.0));
    const gravelMask = smoothstep(0.72, 0.82, gravelNoise);
    const gravelColor = vec3(0.65, 0.58, 0.48);
    const withGravel = mix(baseColor, gravelColor, gravelMask.mul(0.5));

    // Dark cracks/ruts from very low frequency
    const crackNoise = tslNoise2D(uv2.mul(0.5));
    const crackMask = smoothstep(0.0, 0.15, crackNoise);
    const cracked = mix(withGravel.mul(0.7), withGravel, crackMask);

    // Integrate vertex color (darker at edges, lighter at center)
    const vRGB = vec3(vColor.x, vColor.y, vColor.z);
    const edgeDarken = vRGB.mul(0.7).add(vec3(0.3, 0.3, 0.3));
    const final = cracked.mul(edgeDarken);

    return vec4(final, 1.0);
  })();

  // --- Roughness ---
  mat.roughnessNode = Fn(() => {
    const wp = positionWorld;
    const uv2 = vec2(wp.x, wp.z);

    const baseRough = float(0.88);
    const variation = tslNoise2D(uv2.mul(6.0)).mul(0.1).sub(0.05);
    const gravelBump = tslNoise2D(uv2.mul(22.0)).mul(0.06);
    return tslMin(
      float(1.0),
      tslMax(float(0.6), baseRough.add(variation).add(gravelBump)),
    );
  })();

  // --- Normal perturbation for gravel/pebble bump detail ---
  mat.normalNode = Fn(() => {
    const wp = positionWorld;
    const uv2 = vec2(wp.x, wp.z);
    const N = normalWorld;

    // Sample noise at slight offsets for finite-difference normal
    const eps = float(0.08);
    const center = tslNoise2D(uv2.mul(16.0));
    const dx = tslNoise2D(uv2.add(vec2(eps, 0.0)).mul(16.0)).sub(center);
    const dz = tslNoise2D(uv2.add(vec2(0.0, eps)).mul(16.0)).sub(center);

    // Perturb normal with gravel-scale bumps
    const bumpStrength = float(0.35);
    const perturbed = N.add(
      vec3(dx.mul(bumpStrength), float(0.0), dz.mul(bumpStrength)),
    ).normalize();

    return perturbed;
  })();

  mat.side = THREE.DoubleSide;
  return mat;
}
