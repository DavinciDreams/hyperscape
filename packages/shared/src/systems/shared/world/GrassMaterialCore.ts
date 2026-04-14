// @ts-nocheck -- TSL type definitions are incomplete for Fn() callbacks and .sample() methods
/**
 * GrassMaterialCore — Shared LOD0 grass rendering core
 *
 * Extracted from ProceduralGrass.ts so both the game (ProceduralGrassSystem)
 * and the editor (StandaloneGrass) use the SAME shader code.
 *
 * Follows the WaterMaterialCore / SceneLightingCore pattern:
 * one rendering core, two contexts.
 *
 * @module GrassMaterialCore
 */

import THREE, {
  uniform,
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  atan,
  mix,
  hash,
  smoothstep,
  max,
  step,
  texture,
  time,
  mod,
  length,
  positionLocal,
  attribute,
  MeshBasicNodeMaterial,
} from "../../../extras/three/three";
import { varying } from "three/tsl";
import { TERRAIN_CONSTANTS } from "../../../constants/GameConstants";

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface GrassLod0Config {
  tileSize: number;
  bladesPerSide: number;
  bladeWidth: number;
  bladeHeight: number;
}

export const GRASS_LOD0_DEFAULTS: GrassLod0Config = {
  tileSize: 60,
  bladesPerSide: 350,
  bladeWidth: 0.12,
  bladeHeight: 0.6,
};

// ============================================================================
// UNIFORMS FACTORY
// ============================================================================

/**
 * Creates a full set of LOD0 grass uniforms with game-accurate defaults.
 * Both ProceduralGrass and StandaloneGrass use these.
 */
export function createGrassLod0Uniforms(cfg?: Partial<GrassLod0Config>) {
  const c = { ...GRASS_LOD0_DEFAULTS, ...cfg };
  return {
    playerCenter: uniform(new THREE.Vector2(0, 0)),
    cameraPosition: uniform(new THREE.Vector3(0, 0, 0)),
    fieldSize: uniform(c.tileSize),
    bladeWidth: uniform(c.bladeWidth),
    bladeHeight: uniform(c.bladeHeight),
    // Colors — Zelda style: deep emerald base → bright lime tip
    baseColor: uniform(new THREE.Color().setRGB(0.15, 0.45, 0.15)),
    tipColor: uniform(new THREE.Color().setRGB(0.55, 0.85, 0.25)),
    colorMixFactor: uniform(0.9),
    // Day/night tint
    dayColor: uniform(new THREE.Color().setRGB(0.859, 0.82, 0.82)),
    nightColor: uniform(new THREE.Color().setRGB(0.188, 0.231, 0.271)),
    dayNightMix: uniform(1.0),
    lightIntensity: uniform(1.0),
    // Wind
    windStrength: uniform(0.8),
    windSpeed: uniform(0.7),
    // Distance fade (from player center, not camera)
    fadeStart: uniform(25),
    fadeEnd: uniform(28),
    // Heightmap
    heightmapCenterX: uniform(0),
    heightmapCenterZ: uniform(0),
    heightmapWorldSize: uniform(c.tileSize),
    heightmapMax: uniform(120),
    // Water culling
    waterHardCutoff: uniform(TERRAIN_CONSTANTS.WATER_THRESHOLD + 1.0),
  };
}

export type GrassLod0Uniforms = ReturnType<typeof createGrassLod0Uniforms>;

// ============================================================================
// GEOMETRY
// ============================================================================

/**
 * Build a non-indexed triangle mesh: one triangle per blade, bladesPerSide² blades.
 * Attributes:
 *   position      (vec3)  — blade vertex offsets (-1,0,0), (0,1,0), (+1,0,0)
 *   center        (vec2)  — grid center XZ (same for all 3 verts of a blade)
 *   aHeightRandom (float) — per-blade random 0.6–1.0
 *
 * Tipness (0=base, 1=tip) is derived from position.y in the positionNode
 * and passed to colorNode via a TSL varying. No separate attribute needed.
 */
export function createGrassLod0Geometry(
  cfg?: Partial<GrassLod0Config>,
): THREE.BufferGeometry {
  const c = { ...GRASS_LOD0_DEFAULTS, ...cfg };
  const gridSize = c.bladesPerSide;
  const fieldSize = c.tileSize;
  const bladeCount = gridSize * gridSize;
  const vertexCount = bladeCount * 3;
  const cellSize = fieldSize / gridSize;

  const positions = new Float32Array(vertexCount * 3);
  const centers = new Float32Array(vertexCount * 2);
  const heightRandoms = new Float32Array(vertexCount);

  let seed = 12345;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const halfField = fieldSize * 0.5;
  let vi = 0;
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cx =
        (col + 0.5) * cellSize - halfField + (rng() - 0.5) * cellSize * 0.8;
      const cz =
        (row + 0.5) * cellSize - halfField + (rng() - 0.5) * cellSize * 0.8;
      const hRand = 0.6 + rng() * 0.4;

      // Vertex 0: base-left (-1, 0, 0)
      positions[vi * 3] = -1;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = 0;
      centers[vi * 2] = cx;
      centers[vi * 2 + 1] = cz;
      heightRandoms[vi] = hRand;
      vi++;

      // Vertex 1: tip (0, 1, 0)
      positions[vi * 3] = 0;
      positions[vi * 3 + 1] = 1;
      positions[vi * 3 + 2] = 0;
      centers[vi * 2] = cx;
      centers[vi * 2 + 1] = cz;
      heightRandoms[vi] = hRand;
      vi++;

      // Vertex 2: base-right (+1, 0, 0)
      positions[vi * 3] = 1;
      positions[vi * 3 + 1] = 0;
      positions[vi * 3 + 2] = 0;
      centers[vi * 2] = cx;
      centers[vi * 2 + 1] = cz;
      heightRandoms[vi] = hRand;
      vi++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("center", new THREE.BufferAttribute(centers, 2));
  geometry.setAttribute(
    "aHeightRandom",
    new THREE.BufferAttribute(heightRandoms, 1),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    fieldSize * 2,
  );
  return geometry;
}

// ============================================================================
// EXCLUSION OPTIONS (game provides these; editor omits them)
// ============================================================================

export interface GrassExclusionOptions {
  road: {
    textureNode: ReturnType<typeof texture>;
    centerX: ReturnType<typeof uniform>;
    centerZ: ReturnType<typeof uniform>;
    worldSize: ReturnType<typeof uniform>;
    threshold: ReturnType<typeof uniform>;
  };
  building: {
    textureNode: ReturnType<typeof texture>;
    centerX: ReturnType<typeof uniform>;
    centerZ: ReturnType<typeof uniform>;
    worldSize: ReturnType<typeof uniform>;
  };
  grid?: {
    textureNode: ReturnType<typeof texture>;
    centerX: ReturnType<typeof uniform>;
    centerZ: ReturnType<typeof uniform>;
    worldSize: ReturnType<typeof uniform>;
  };
}

// ============================================================================
// MATERIAL
// ============================================================================

export interface GrassLod0MaterialParams {
  /** Uniform nodes for the shader */
  uniforms: GrassLod0Uniforms;
  /** Heightmap DataTexture (R=height, G=grassWeight if grassWeightCulling) */
  heightmapTexture: THREE.DataTexture | null;
  /** Noise DataTexture for wind animation */
  noiseTexture: THREE.DataTexture | null;
  /** Use heightmap G channel for stochastic grass density culling (editor mode) */
  grassWeightCulling?: boolean;
  /** Road/building/grid exclusion textures (game mode) */
  exclusion?: GrassExclusionOptions | null;
}

/**
 * Compute UV for exclusion texture sampling.
 * Shared between road, building, and grid exclusion.
 */
function computeExclusionUV(
  worldX: any,
  worldZ: any,
  centerX: any,
  centerZ: any,
  worldSize: any,
) {
  const safeWorldSize = max(worldSize, float(0.001));
  const halfWorld = safeWorldSize.mul(0.5);
  const uvX = worldX.sub(centerX).add(halfWorld).div(safeWorldSize);
  const uvZ = worldZ.sub(centerZ).add(halfWorld).div(safeWorldSize);
  return vec2(uvX.clamp(0.001, 0.999), uvZ.clamp(0.001, 0.999));
}

/**
 * Creates the LOD0 grass material — identical shader for game and editor.
 *
 * MeshBasicNodeMaterial with TSL positionNode + colorNode:
 * - positionNode: toroidal wrap, heightmap, billboard, wind, fade, water/exclusion culling
 * - colorNode: base→tip gradient, per-blade variation, day/night tint
 */
export function createGrassLod0Material(
  params: GrassLod0MaterialParams,
): MeshBasicNodeMaterial {
  const { uniforms: u, exclusion, grassWeightCulling } = params;

  const heightmapTextureNode = params.heightmapTexture
    ? texture(params.heightmapTexture)
    : null;
  const noiseTextureNode = params.noiseTexture
    ? texture(params.noiseTexture)
    : null;

  const material = new MeshBasicNodeMaterial();
  material.side = THREE.DoubleSide;
  material.transparent = false;
  material.depthWrite = true;
  material.fog = false;

  // Varying to pass tipness (0=base, 1=tip) from vertex → fragment stage.
  // attribute() only works in the colorNode if the same attribute is also
  // referenced in positionNode (which creates the varying). Using an explicit
  // varying avoids this pitfall entirely.
  const vTipness = varying(float(0), "vTipness");

  // --- positionNode ---
  material.positionNode = Fn(() => {
    const localVert = positionLocal.toVar("localVert"); // (-1|0|+1, 0|1, 0)
    const centerAttr = attribute("center", "vec2");
    const hRand = attribute("aHeightRandom", "float");

    const tipness = localVert.y; // 0 for base, 1 for tip
    vTipness.assign(tipness); // Pass to colorNode via varying

    // 1) Toroidal wrapping around player
    const half = u.fieldSize.mul(0.5);
    const rel = centerAttr.sub(u.playerCenter).toVar("rel");
    rel.x.assign(mod(rel.x.add(half), u.fieldSize).sub(half));
    rel.y.assign(mod(rel.y.add(half), u.fieldSize).sub(half));

    const worldX = rel.x.add(u.playerCenter.x).toVar("worldX");
    const worldZ = rel.y.add(u.playerCenter.y).toVar("worldZ");

    // 2) Heightmap terrain Y
    const hmWorldSize = max(u.heightmapWorldSize, float(0.001));
    const hmHalf = hmWorldSize.mul(0.5);
    const hmU = worldX
      .sub(u.heightmapCenterX)
      .add(hmHalf)
      .div(hmWorldSize)
      .clamp(0.001, 0.999);
    const hmV = worldZ
      .sub(u.heightmapCenterZ)
      .add(hmHalf)
      .div(hmWorldSize)
      .clamp(0.001, 0.999);
    const hmUV = vec2(hmU, hmV);

    const hmSample = heightmapTextureNode
      ? heightmapTextureNode.sample(hmUV)
      : vec4(0);
    const hmLoaded = step(float(0.001), hmSample.r);
    const rawTerrainY = hmSample.r.mul(u.heightmapMax);
    const terrainY = mix(u.cameraPosition.y, rawTerrainY, hmLoaded).toVar(
      "terrainY",
    );

    // 3) Build blade vertex
    const bladeH = u.bladeHeight.mul(hRand);
    const bladeHW = u.bladeWidth.mul(0.5);
    const vertexOffset = vec3(
      localVert.x.mul(bladeHW),
      localVert.y.mul(bladeH),
      float(0),
    ).toVar("vertexOffset");

    // 4) Billboard: rotate blade to face camera
    const dx = worldX.sub(u.cameraPosition.x);
    const dz = worldZ.sub(u.cameraPosition.z);
    const angleToCamera = atan(dx, dz);
    const cosA = cos(angleToCamera);
    const sinA = sin(angleToCamera);
    const rotX = vertexOffset.x.mul(cosA).add(vertexOffset.z.mul(sinA));
    const rotZ = vertexOffset.z.mul(cosA).sub(vertexOffset.x.mul(sinA));
    vertexOffset.x.assign(rotX);
    vertexOffset.z.assign(rotZ);

    // 5) World position
    const worldPos = vec3(worldX, terrainY, worldZ)
      .add(vertexOffset)
      .toVar("worldPos");

    // 6) Wind (displace tips only)
    const windTime = time.mul(u.windSpeed);
    const windUV = vec2(
      worldX.mul(0.02).add(windTime.mul(0.05)),
      worldZ.mul(0.02).add(windTime.mul(0.03)),
    );
    const windSample = noiseTextureNode
      ? noiseTextureNode.sample(windUV)
      : vec4(0.5);
    worldPos.x.addAssign(
      windSample.x.sub(0.5).mul(tipness).mul(u.windStrength),
    );
    worldPos.z.addAssign(
      windSample.y.sub(0.5).mul(tipness).mul(u.windStrength),
    );

    // 7) Distance fade: collapse toward center point
    const distToPlayer = length(
      vec2(worldX.sub(u.playerCenter.x), worldZ.sub(u.playerCenter.y)),
    );
    const distScale = smoothstep(u.fadeEnd, u.fadeStart, distToPlayer);
    const centerPt = vec3(worldX, terrainY, worldZ);
    worldPos.assign(mix(centerPt, worldPos, distScale));

    // 8) Water culling: collapse blades below water
    const waterFade = smoothstep(
      u.waterHardCutoff.sub(1.0),
      u.waterHardCutoff,
      rawTerrainY,
    );
    const waterScale = max(waterFade, float(1).sub(hmLoaded));
    worldPos.assign(mix(centerPt, worldPos, waterScale));

    // 9) GrassWeight culling (editor mode): use heightmap G channel
    if (grassWeightCulling) {
      const gW = hmSample.g;
      const bH = hash(centerAttr.x.add(centerAttr.y.mul(7919.0)));
      const gC = step(bH, gW).mul(hmLoaded).add(float(1).sub(hmLoaded));
      worldPos.assign(mix(centerPt, worldPos, gC));
    }

    // 10) Exclusion culling (game mode): road, building, grid textures
    if (exclusion) {
      const nearPlayer = smoothstep(float(16.0), float(14.0), distToPlayer);

      // Road exclusion
      const roadUV = computeExclusionUV(
        worldX,
        worldZ,
        exclusion.road.centerX,
        exclusion.road.centerZ,
        exclusion.road.worldSize,
      );
      const roadSample = exclusion.road.textureNode.sample(roadUV).r;
      const roadRaw = smoothstep(
        exclusion.road.threshold.add(0.05),
        exclusion.road.threshold,
        roadSample,
      );
      const roadVisible = mix(float(1.0), roadRaw, nearPlayer);
      worldPos.assign(mix(centerPt, worldPos, roadVisible));

      // Building exclusion
      const exclUV = computeExclusionUV(
        worldX,
        worldZ,
        exclusion.building.centerX,
        exclusion.building.centerZ,
        exclusion.building.worldSize,
      );
      const exclSample = exclusion.building.textureNode.sample(exclUV).r;
      const exclRaw = smoothstep(float(0.5), float(0.3), exclSample);
      const exclVisible = mix(float(1.0), exclRaw, nearPlayer);
      worldPos.assign(mix(centerPt, worldPos, exclVisible));

      // Grid exclusion (optional)
      if (exclusion.grid) {
        const gridUV = computeExclusionUV(
          worldX,
          worldZ,
          exclusion.grid.centerX,
          exclusion.grid.centerZ,
          exclusion.grid.worldSize,
        );
        const gridSample = exclusion.grid.textureNode.sample(gridUV).r;
        const gridRaw = smoothstep(float(0.5), float(0.3), gridSample);
        const gridVisible = mix(float(1.0), gridRaw, nearPlayer);
        worldPos.assign(mix(centerPt, worldPos, gridVisible));
      }
    }

    return worldPos;
  })();

  // --- colorNode ---
  // Reads tipness from the varying set in positionNode (vertex → fragment).
  material.colorNode = Fn(() => {
    const tipness = vTipness;
    const centerAttr = attribute("center", "vec2");

    const grassColor = mix(
      u.baseColor,
      u.tipColor,
      tipness.mul(u.colorMixFactor),
    ).toVar("grassColor");

    // Per-blade variation using hash of center position
    const variation = hash(centerAttr.x.add(centerAttr.y.mul(1234.5)))
      .mul(0.15)
      .sub(0.075);
    grassColor.r.addAssign(variation);
    grassColor.g.addAssign(variation.mul(0.5));

    // Day/night tinting
    const timeTint = mix(u.nightColor, u.dayColor, u.dayNightMix);
    grassColor.assign(grassColor.mul(timeTint));

    // Light intensity
    grassColor.assign(grassColor.mul(u.lightIntensity));

    return grassColor;
  })();

  return material;
}
