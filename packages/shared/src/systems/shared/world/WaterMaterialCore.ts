/**
 * WaterMaterialCore — Shared water constants, texture generators, and TSL material factory.
 *
 * Single source of truth for water visuals. Used by:
 * - Game's WaterSystem (imports constants; uses its own async texture gen + reflection/fog)
 * - Editor's EditorWaterMaterial (imports factory with textures, no reflection/fog)
 *
 * "One material, two contexts" — same shader pipeline, parameterized for the
 * few things that differ between game runtime and editor preview.
 */

import THREE, {
  MeshStandardNodeMaterial,
  texture,
  positionWorld,
  positionLocal,
  screenUV,
  cameraPosition,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  pow,
  add,
  sub,
  mul,
  div,
  mix,
  dot,
  normalize,
  max,
  smoothstep,
  clamp,
  saturate,
  fract,
  abs,
  Fn,
  output,
  attribute,
  length,
  viewportDepthTexture,
  linearDepth,
  cameraNear,
  cameraFar,
} from "../../../extras/three/three";
import { SUN_SHADE, NIGHT, applySunShade } from "./LightingConfig";

// ============================================================================
// CONSTANTS
// ============================================================================

const GRAVITY = 9.81;
const PI = Math.PI;
const TWO_PI = PI * 2;

/** Water visual tuning — shared between game and editor */
export const WATER = {
  REFLECTION_INTENSITY: 0.4,
  WAVE_DAMP_DISTANCE: 6,
  MAX_DEPTH: 30,

  // Fresnel (Schlick approximation, rf0 = 0.3)
  RF0: 0.3,

  // Phong sun lighting
  SPECULAR_SHININESS: 100,
  SPECULAR_STRENGTH: 5.0,
  DIFFUSE_STRENGTH: 0.5,

  // Depth-based opacity: op = 1 - pow(sat(1 - depth/scale), falloff)
  OP_DEPTH_SCALE: 15,
  OP_DEPTH_FALLOFF: 3,

  // Depth-based colour gradient
  COLOR_DEPTH_SCALE: 50,
  COLOR_DEPTH_FALLOFF: 3,
  COLOR_DIST_FADE: 200,

  // Cosine gradient colour parameters
  COS_PHASES: [0.5, 0.5, 0.5] as const,
  COS_AMPLITUDES: [0.0311, 0.1374, 0.1692] as const,
  COS_FREQUENCIES: [0.5, 0.5, 0.5] as const,
  COS_OFFSETS: [-0.4569, -0.3095, -0.2654] as const,

  // Normal noise strength (xz multiplier for surface normal)
  NORMAL_STRENGTH: 1.5,

  // Foam
  FOAM_SHORE_DISTANCE: 2.5,
  FOAM_CREST_MIN: 0.15,
  FOAM_CREST_MAX: 0.4,
  FOAM_CREST_MULTIPLIER: 0.6,
  FOAM_COLOR: { r: 0.85, g: 0.92, b: 0.96 },
  FOAM_MAX_OPACITY: 0.85,
  FOAM_SCROLL_X: 0.02,
  FOAM_SCROLL_Y: 0.015,
  FOAM_SCALE: 0.1,

  // Flow mapping (two-phase crossfade, ported from cloud-sea FlowUVW)
  FLOW_SPEED: 0.05,
  FLOW_STRENGTH: 1.0,
  FLOW_OFFSET: -0.1,
  FLOW_JUMP: [0.5, -0.25] as const,
  FLOW_UV_SCALE: 0.001,
};

// ============================================================================
// WAVES
// ============================================================================

export type WaveParams = {
  w: number;
  phi: number;
  QADx: number;
  QADz: number;
  wADx: number;
  wADz: number;
  Dx: number;
  Dz: number;
  A: number;
};

/** 5 Gerstner waves — shared between game and editor */
export const WAVES: WaveParams[] = [
  { A: 0.07, wavelength: 20, Q: 0.3, Dx: 0.7, Dz: 0.71 },
  { A: 0.05, wavelength: 14, Q: 0.25, Dx: -0.5, Dz: 0.87 },
  { A: 0.035, wavelength: 8, Q: 0.22, Dx: 0.9, Dz: -0.44 },
  { A: 0.025, wavelength: 5, Q: 0.2, Dx: 0.26, Dz: 0.97 },
  { A: 0.015, wavelength: 2.5, Q: 0.15, Dx: -0.8, Dz: 0.6 },
].map(({ A, wavelength, Q, Dx, Dz }) => {
  const w = TWO_PI / wavelength;
  const phi = Math.sqrt(GRAVITY * w);
  return {
    w,
    phi,
    QADx: Q * A * Dx,
    QADz: Q * A * Dz,
    wADx: w * A * Dx,
    wADz: w * A * Dz,
    Dx,
    Dz,
    A,
  };
});

// ============================================================================
// TEXTURE GENERATORS (synchronous — game can use its own async versions)
// ============================================================================

/** FBM-based seamless normal map via 4D torus embedding */
export function generateWaterNormalMap(
  size: number,
  seed: number,
): THREE.DataTexture {
  const TAU = Math.PI * 2;

  const hash = (x: number, y: number, s: number) => {
    let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h = Math.imul(h ^ (h >>> 16), 2654435769);
    return ((h ^ (h >>> 13)) >>> 0) / 0xffffffff;
  };

  const vnoise = (px: number, py: number, s: number) => {
    const ix = Math.floor(px),
      iy = Math.floor(py);
    const fx = px - ix,
      fy = py - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash(ix, iy, s);
    const b = hash(ix + 1, iy, s);
    const c = hash(ix, iy + 1, s);
    const d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const fbm = (nx: number, ny: number) => {
    const cx = Math.cos(nx * TAU),
      sx = Math.sin(nx * TAU);
    const cy = Math.cos(ny * TAU),
      sy = Math.sin(ny * TAU);
    let val = 0,
      amp = 1,
      freq = 2;
    for (let o = 0; o < 6; o++) {
      const px = cx * freq + sy * freq * 0.618;
      const py = sx * freq + cy * freq * 0.618;
      val += vnoise(px, py, seed + o * 137) * amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    return val;
  };

  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = fbm(x / size, y / size);
    }
  }

  const data = new Uint8Array(size * size * 4);
  const strength = 6.0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xp = (x + 1) % size,
        xm = (x - 1 + size) % size;
      const yp = (y + 1) % size,
        ym = (y - 1 + size) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const idx = (y * size + x) * 4;
      data[idx] = Math.max(0, Math.min(255, ((-dx / len) * 127.5 + 127.5) | 0));
      data[idx + 1] = Math.max(
        0,
        Math.min(255, ((-dy / len) * 127.5 + 127.5) | 0),
      );
      data[idx + 2] = Math.max(0, Math.min(255, ((1 / len) * 255) | 0));
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Procedural flow map — RG = flow direction, A = phase noise */
export function generateWaterFlowMap(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  let s = 77777;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size,
        ny = y / size;
      const r = Math.floor(
        (Math.sin(nx * 6.28 * 2 + ny * 3.7) * 0.5 + 0.5) * 255,
      );
      const g = Math.floor(
        (Math.cos(ny * 6.28 * 3 + nx * 2.3) * 0.5 + 0.5) * 255,
      );
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const a = (s >>> 8) & 0xff;
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = 128;
      data[idx + 3] = a;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Worley noise foam texture — 32 cells */
export function generateWaterFoamTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const cells: { x: number; y: number }[] = [];
  let s = 12345;
  for (let i = 0; i < 32; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const cx = (s % 1000) / 1000;
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    cells.push({ x: cx, y: (s % 1000) / 1000 });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x / size,
        py = y / size;
      let d1 = 999,
        d2 = 999;
      for (const c of cells) {
        let cdx = Math.abs(px - c.x),
          cdy = Math.abs(py - c.y);
        if (cdx > 0.5) cdx = 1 - cdx;
        if (cdy > 0.5) cdy = 1 - cdy;
        const d = Math.sqrt(cdx * cdx + cdy * cdy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const edge = d2 - d1;
      const foam = Math.pow(Math.max(0, 1 - edge * 8), 2);
      const noise =
        0.7 +
        (Math.sin(px * 47 + py * 31) * 0.5 +
          Math.sin(px * 97 + py * 67) * 0.25 +
          Math.sin(px * 157 + py * 113) * 0.25) *
          0.3;
      const v = Math.floor(Math.max(0, Math.min(255, foam * noise * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// MATERIAL FACTORY
// ============================================================================

export interface WaterMaterialUniforms {
  time: { value: number };
  sunDirection: { value: THREE.Vector3 };
  windStrength: { value: number };
  dayIntensity: { value: number };
  sunIntensity: { value: number };
}

export interface WaterMaterialOptions {
  normalTex: THREE.Texture;
  flowTex: THREE.Texture;
  foamTex: THREE.Texture;
  /** TSL reflector node for planar reflections (omit for sky-color fallback) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reflectionNode?: any;
  /** Fog RT — when provided, applies distance-based sky-color fog */
  fog?: { texture: THREE.Texture; nearSq: number; farSq: number };
  /** Use vertex attribute "shoreDistance" for wave damping (default: false) */
  useShoreAttribute?: boolean;
}

/**
 * Create a TSL water material.
 *
 * Game calls this with reflectionNode + fog for full fidelity.
 * Editor calls this without them for the same shader minus reflections/fog.
 */
export function createWaterMaterial(options: WaterMaterialOptions): {
  material: MeshStandardNodeMaterial;
  uniforms: WaterMaterialUniforms;
} {
  const {
    normalTex,
    flowTex,
    foamTex,
    reflectionNode,
    fog,
    useShoreAttribute,
  } = options;
  const hasReflection = !!reflectionNode;

  // ---- Uniforms ----
  const uTime = uniform(float(0));
  const uSunDir = uniform(vec3(0.4, 0.8, 0.4));
  const uWind = uniform(float(1.0));
  const uDayIntensity = uniform(float(1.0));
  const uSunIntensity = uniform(float(1.0));
  const uShadeColor = uniform(
    new THREE.Color(
      SUN_SHADE.TINT_COLOR[0],
      SUN_SHADE.TINT_COLOR[1],
      SUN_SHADE.TINT_COLOR[2],
    ),
  );
  const uReflectionIntensity = uniform(
    float(hasReflection ? WATER.REFLECTION_INTENSITY : 0.0),
  );

  // ---- Material setup ----
  const material = new MeshStandardNodeMaterial();
  material.transparent = true;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  material.roughness = 0.8;
  material.metalness = 0.0;
  material.fog = false; // Fog handled manually in outputNode

  // ---- Reflection UV distortion (if provided) ----
  if (hasReflection) {
    const worldUV0 = vec2(positionWorld.x, positionWorld.z);
    const normalOffset = texture(normalTex, mul(worldUV0, float(0.02))).xy;
    const normalDistortion = sub(mul(normalOffset, float(2)), float(1));
    reflectionNode.uvNode = reflectionNode.uvNode.add(
      mul(normalDistortion, float(0.015)),
    );
  }

  // ---- Fog texture node (if provided) ----
  const fogTexNode = fog ? texture(fog.texture, screenUV) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wavePhase = (wp: any, t: any, _w: any, wave: WaveParams) => {
    const dotDP = add(mul(wp.x, float(wave.Dx)), mul(wp.z, float(wave.Dz)));
    return add(mul(float(wave.w), dotDP), mul(float(wave.phi), t));
  };

  // ---- VERTEX: 5-wave Gerstner Displacement ----
  material.positionNode = Fn(() => {
    const pos = positionLocal.xyz;
    const wp = positionWorld;

    // Shore mask damps waves near shore (game uses vertex attribute)
    const shoreMask = useShoreAttribute
      ? smoothstep(
          float(0),
          float(WATER.WAVE_DAMP_DISTANCE),
          attribute("shoreDistance", "float"),
        )
      : float(1); // No damping when attribute not available

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dx: any = float(0),
      dy: any = float(0),
      dz: any = float(0);
    for (const wave of WAVES) {
      const phase = wavePhase(wp, uTime, uWind, wave);
      const c = cos(phase);
      const s = sin(phase);
      dx = add(dx, mul(float(wave.QADx), c));
      dy = add(dy, mul(mul(float(wave.A), uWind), s));
      dz = add(dz, mul(float(wave.QADz), c));
    }

    return vec3(
      add(pos.x, mul(dx, shoreMask)),
      add(pos.y, mul(dy, shoreMask)),
      add(pos.z, mul(dz, shoreMask)),
    );
  })();

  // ---- Screen-space water depth ----
  const gpuShoreDist = Fn(() => {
    const sceneDepth = linearDepth(viewportDepthTexture());
    const waterDepth = linearDepth();
    const depthDiff = sub(sceneDepth, waterDepth);
    const worldDist = mul(depthDiff, sub(cameraFar, cameraNear));
    return clamp(worldDist, float(0), float(WATER.MAX_DEPTH));
  })();

  const distToCam = length(sub(cameraPosition, positionWorld));
  const waterOpColorLerp = clamp(
    sub(float(1), div(distToCam, float(WATER.COLOR_DIST_FADE))),
    float(0.01),
    float(1.0),
  );

  // ---- OPACITY ----
  material.opacityNode = Fn(() => {
    const shoreDist = gpuShoreDist;
    const opDepth = pow(
      saturate(sub(float(1), div(shoreDist, float(WATER.OP_DEPTH_SCALE)))),
      float(WATER.OP_DEPTH_FALLOFF),
    );
    return sub(float(1), opDepth);
  })();

  // ---- OUTPUT ----
  material.outputNode = Fn(() => {
    const pbrOut = output;
    const wp = positionWorld;
    const shoreDist = gpuShoreDist;
    const wUV = vec2(wp.x, wp.z);

    // ---- Cosine gradient water colour ----
    const colorDepth = pow(
      saturate(sub(float(1), div(shoreDist, float(WATER.COLOR_DEPTH_SCALE)))),
      float(WATER.COLOR_DEPTH_FALLOFF),
    );
    const colorLerp = mul(colorDepth, waterOpColorLerp);

    const TAU = Math.PI * 2;
    const [pR, pG, pB] = WATER.COS_PHASES;
    const [aR, aG, aB] = WATER.COS_AMPLITUDES;
    const [fR, fG, fB] = WATER.COS_FREQUENCIES;
    const [oR, oG, oB] = WATER.COS_OFFSETS;

    const cosR = clamp(
      add(
        float(oR),
        add(
          mul(
            float(aR * 0.5),
            cos(add(mul(colorLerp, float(TAU * fR)), float(TAU * pR))),
          ),
          float(0.5),
        ),
      ),
      float(0),
      float(1),
    );
    const cosG = clamp(
      add(
        float(oG),
        add(
          mul(
            float(aG * 0.5),
            cos(add(mul(colorLerp, float(TAU * fG)), float(TAU * pG))),
          ),
          float(0.5),
        ),
      ),
      float(0),
      float(1),
    );
    const cosB = clamp(
      add(
        float(oB),
        add(
          mul(
            float(aB * 0.5),
            cos(add(mul(colorLerp, float(TAU * fB)), float(TAU * pB))),
          ),
          float(0.5),
        ),
      ),
      float(0),
      float(1),
    );
    const waterColor = vec3(cosR, cosG, cosB);

    // ---- Flow-mapped 4-scroll normal noise (FlowUVW two-phase crossfade) ----
    const flowSampleUV = mul(wUV, float(WATER.FLOW_UV_SCALE));
    const flowSample = texture(flowTex, flowSampleUV);
    const flowVec = mul(
      sub(mul(flowSample.rg, float(2)), float(1)),
      float(WATER.FLOW_STRENGTH),
    );
    const flowTime = add(mul(uTime, float(WATER.FLOW_SPEED)), flowSample.a);

    const progressA = fract(flowTime);
    const progressB = fract(add(flowTime, float(0.5)));
    const weightA = sub(float(1), abs(sub(mul(progressA, float(2)), float(1))));
    const weightB = sub(float(1), abs(sub(mul(progressB, float(2)), float(1))));

    const jumpVec = vec2(float(WATER.FLOW_JUMP[0]), float(WATER.FLOW_JUMP[1]));

    // Phase A: flow-distorted base UV
    const baseA = add(
      mul(
        sub(wUV, mul(flowVec, add(progressA, float(WATER.FLOW_OFFSET)))),
        float(5),
      ),
      mul(sub(flowTime, progressA), jumpVec),
    );
    // Phase B: offset by 0.5
    const baseB = add(
      add(
        mul(
          sub(wUV, mul(flowVec, add(progressB, float(WATER.FLOW_OFFSET)))),
          float(5),
        ),
        float(0.5),
      ),
      mul(sub(flowTime, progressB), jumpVec),
    );

    // Phase A: scroll layers 0 + 2
    const nUV0 = add(
      div(baseA, float(103)),
      vec2(div(uTime, float(17)), div(uTime, float(29))),
    );
    const nUV2 = add(
      vec2(div(baseA.x, float(8907)), div(baseA.y, float(9803))),
      vec2(div(uTime, float(101)), div(uTime, float(97))),
    );
    // Phase B: scroll layers 1 + 3
    const nUV1 = add(
      div(baseB, float(107)),
      vec2(div(uTime, float(19)), mul(div(uTime, float(31)), float(-1))),
    );
    const nUV3 = add(
      vec2(div(baseB.x, float(1091)), div(baseB.y, float(1027))),
      vec2(mul(div(uTime, float(109)), float(-1)), div(uTime, float(113))),
    );

    // Sample + blend
    const noiseSum = mul(
      add(
        mul(add(texture(normalTex, nUV0), texture(normalTex, nUV2)), weightA),
        mul(add(texture(normalTex, nUV1), texture(normalTex, nUV3)), weightB),
      ),
      float(2),
    );
    const noise = sub(mul(noiseSum, float(0.5)), float(1));
    const surfaceNormal = normalize(
      vec3(
        mul(noise.x, float(WATER.NORMAL_STRENGTH)),
        noise.z,
        mul(noise.y, float(WATER.NORMAL_STRENGTH)),
      ),
    );

    // ---- Gerstner wave normals (foam crest detection) ----
    const shoreMask = smoothstep(
      float(0),
      float(WATER.WAVE_DAMP_DISTANCE),
      shoreDist,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nx: any = float(0),
      nz: any = float(0);
    for (const wave of WAVES) {
      const c = cos(wavePhase(wp, uTime, uWind, wave));
      nx = add(nx, mul(float(wave.wADx), c));
      nz = add(nz, mul(float(wave.wADz), c));
    }
    nx = mul(nx, shoreMask);
    nz = mul(nz, shoreMask);

    // ---- Phong sun lighting (classic reflection model) ----
    const V = normalize(sub(cameraPosition, wp));
    const L = normalize(uSunDir);
    const lightColor = vec3(1, 1, 1);
    const negL = mul(L, float(-1));
    const NdotL = dot(surfaceNormal, L);
    const reflectDir = normalize(
      add(negL, mul(surfaceNormal, mul(float(2), NdotL))),
    );
    const specDir = max(dot(V, reflectDir), float(0));
    const specularLight = mul(
      lightColor,
      mul(
        pow(specDir, float(WATER.SPECULAR_SHININESS)),
        float(WATER.SPECULAR_STRENGTH),
      ),
    );
    const diffuseLight = mul(
      lightColor,
      mul(max(NdotL, float(0)), float(WATER.DIFFUSE_STRENGTH)),
    );

    // ---- Fresnel ----
    const theta = max(dot(V, surfaceNormal), float(0));
    const reflectance = add(
      float(WATER.RF0),
      mul(float(1 - WATER.RF0), pow(sub(float(1), theta), float(5))),
    );

    // ---- Scatter ----
    const scatter = mul(waterColor, max(dot(surfaceNormal, V), float(0)));

    // ---- Reflection source ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reflSample: any = hasReflection
      ? reflectionNode.xyz
      : vec3(0.53, 0.81, 0.92);

    // ---- Composite ----
    const diffusePart = add(mul(diffuseLight, float(0.3)), scatter);
    const reflectPart = add(
      add(vec3(0.1, 0.1, 0.1), mul(reflSample, float(0.9))),
      mul(reflSample, specularLight),
    );
    const reflIntensity = hasReflection
      ? uReflectionIntensity
      : float(WATER.REFLECTION_INTENSITY);
    const albedo = mix(
      diffusePart,
      mul(reflectPart, reflIntensity),
      reflectance,
    );
    const colorBase = mix(albedo, waterColor, float(0.8));

    // ---- Foam (shore + crest, Worley texture) ----
    const shoreFoam = smoothstep(
      float(WATER.FOAM_SHORE_DISTANCE),
      float(0),
      shoreDist,
    );
    const crestFoam = smoothstep(
      float(WATER.FOAM_CREST_MIN),
      float(WATER.FOAM_CREST_MAX),
      mul(length(vec2(nx, nz)), shoreMask),
    );
    const foamUV = mul(
      vec2(
        add(wUV.x, mul(uTime, float(WATER.FOAM_SCROLL_X))),
        add(wUV.y, mul(uTime, float(WATER.FOAM_SCROLL_Y))),
      ),
      float(WATER.FOAM_SCALE),
    );
    const foamPattern = texture(foamTex, foamUV).r;
    const foamIntensity = mul(
      max(shoreFoam, mul(crestFoam, float(WATER.FOAM_CREST_MULTIPLIER))),
      foamPattern,
    );
    const foamColor = vec3(
      WATER.FOAM_COLOR.r,
      WATER.FOAM_COLOR.g,
      WATER.FOAM_COLOR.b,
    );
    const colorWithFoam = mix(
      colorBase,
      foamColor,
      clamp(foamIntensity, float(0), float(WATER.FOAM_MAX_OPACITY)),
    );

    // ---- applySunShade ----
    const colorShaded = applySunShade(
      colorWithFoam,
      uDayIntensity,
      vec3(uShadeColor),
    );

    // ---- nightDim ----
    const dayFactor = div(clamp(uSunIntensity, float(0), float(2)), float(2));
    const nightDim = mix(float(NIGHT.BRIGHTNESS), float(1.0), dayFactor);
    const colorLit = mul(colorShaded, nightDim);

    // ---- Fog (optional) ----
    if (fogTexNode && fog) {
      const toCam = sub(cameraPosition, wp);
      const fogDistSq = dot(toCam, toCam);
      const fogFactor = smoothstep(
        float(fog.nearSq),
        float(fog.farSq),
        fogDistSq,
      );
      const foggedColor = mix(colorLit, fogTexNode.rgb, fogFactor);
      const foggedAlpha = mix(pbrOut.a, float(1.0), fogFactor);
      return vec4(foggedColor, foggedAlpha);
    }

    return vec4(colorLit, pbrOut.a);
  })();

  return {
    material,
    uniforms: {
      time: uTime as unknown as { value: number },
      sunDirection: uSunDir as unknown as { value: THREE.Vector3 },
      windStrength: uWind as unknown as { value: number },
      dayIntensity: uDayIntensity as unknown as { value: number },
      sunIntensity: uSunIntensity as unknown as { value: number },
    },
  };
}
