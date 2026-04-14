/**
 * StandaloneSky - Standalone sky dome system for non-game contexts
 *
 * Extracted from SkySystem.ts to allow the World Studio viewport (and other
 * editors) to use the same sky dome, sun/moon, and clouds without requiring
 * a full ECS World object.
 *
 * Usage:
 *   const sky = new StandaloneSky(scene, renderer, camera);
 *   await sky.init();
 *   sky.start();
 *   // In render loop:
 *   sky.update(dt, worldTime);
 *   sky.lateUpdate(cameraPos);
 *
 * @module StandaloneSky
 */

import * as THREE from "../../../extras/three/three";
import {
  abs,
  add,
  clamp,
  cos,
  distance,
  div,
  dot,
  float,
  Fn,
  length,
  max,
  min,
  MeshBasicNodeMaterial,
  mix,
  mul,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  screenUV,
  sin,
  smoothstep,
  sub,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  type ShaderNode,
} from "../../../extras/three/three";
import { fogRenderTarget } from "./FogConfig";
import { DAY_CYCLE, SUN_LIGHT } from "./LightingConfig";
import { computeDayIntensity } from "./SceneLightingCore";

const SKY_DOME_RADIUS = 5000;

const SKY_RENDER_ORDER = {
  SKY_DOME: -1000,
  CELESTIAL_GLOW_OUTER: -999,
  CELESTIAL_GLOW_INNER: -998,
  CELESTIAL_DISC: -997,
  CLOUDS: -995,
} as const;

// Procedural noise texture
function createNoiseTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(Math.random() * 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = Math.floor(Math.random() * 255);
    data[o + 2] = Math.floor(Math.random() * 255);
    data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Cloud definitions — 28 clouds on a sky-dome ring
type CloudDef = {
  az: number;
  el: number;
  tex: number;
  sprite: number;
  w: number;
  h: number;
  dSpeed: number;
  dRange: number;
};

const CLOUD_DEFS: CloudDef[] = [
  // Texture 3 — 12 low-altitude horizon clouds
  {
    az: 14.4,
    el: 4.1,
    tex: 3,
    sprite: 0,
    w: 300,
    h: 200,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 0,
    el: 4.1,
    tex: 3,
    sprite: 6,
    w: 300,
    h: 200,
    dSpeed: 0.11,
    dRange: 0.05,
  },
  {
    az: 50.4,
    el: 4.1,
    tex: 3,
    sprite: 1,
    w: 300,
    h: 180,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 28.8,
    el: 4.1,
    tex: 3,
    sprite: 6,
    w: 300,
    h: 180,
    dSpeed: 0.1,
    dRange: 0.0,
  },
  {
    az: 100.8,
    el: 4.1,
    tex: 3,
    sprite: 2,
    w: 400,
    h: 200,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 108,
    el: 4.1,
    tex: 3,
    sprite: 6,
    w: 400,
    h: 200,
    dSpeed: 0.12,
    dRange: 0.05,
  },
  {
    az: 162,
    el: 4.1,
    tex: 3,
    sprite: 3,
    w: 400,
    h: 200,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 180,
    el: 4.1,
    tex: 3,
    sprite: 7,
    w: 400,
    h: 200,
    dSpeed: 0.1,
    dRange: 0.1,
  },
  {
    az: 248.4,
    el: 4.1,
    tex: 3,
    sprite: 4,
    w: 350,
    h: 175,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 270,
    el: 4.1,
    tex: 3,
    sprite: 6,
    w: 350,
    h: 175,
    dSpeed: 0.12,
    dRange: 0.0,
  },
  {
    az: 288,
    el: 4.1,
    tex: 3,
    sprite: 5,
    w: 350,
    h: 175,
    dSpeed: 0.12,
    dRange: 0.1,
  },
  {
    az: 306,
    el: 4.1,
    tex: 3,
    sprite: 7,
    w: 500,
    h: 200,
    dSpeed: 0.1,
    dRange: 0.05,
  },
  // Texture 1 — 8 mid/high altitude clouds
  {
    az: 0,
    el: 20.2,
    tex: 1,
    sprite: 0,
    w: 230,
    h: 115,
    dSpeed: 0.1,
    dRange: 0.5,
  },
  {
    az: 54,
    el: 29.9,
    tex: 1,
    sprite: 1,
    w: 180,
    h: 90,
    dSpeed: 0.12,
    dRange: 0.4,
  },
  {
    az: 82.8,
    el: 37.9,
    tex: 1,
    sprite: 2,
    w: 210,
    h: 105,
    dSpeed: 0.13,
    dRange: 0.35,
  },
  {
    az: 122.4,
    el: 7.9,
    tex: 1,
    sprite: 3,
    w: 250,
    h: 125,
    dSpeed: 0.15,
    dRange: 0.4,
  },
  {
    az: 165.6,
    el: 20.7,
    tex: 1,
    sprite: 4,
    w: 230,
    h: 115,
    dSpeed: 0.16,
    dRange: 0.35,
  },
  {
    az: 208.8,
    el: 30.3,
    tex: 1,
    sprite: 5,
    w: 290,
    h: 145,
    dSpeed: 0.12,
    dRange: 0.4,
  },
  {
    az: 270,
    el: 21.2,
    tex: 1,
    sprite: 6,
    w: 150,
    h: 75,
    dSpeed: 0.2,
    dRange: 0.45,
  },
  {
    az: 324,
    el: 20.5,
    tex: 1,
    sprite: 7,
    w: 240,
    h: 120,
    dSpeed: 0.17,
    dRange: 0.5,
  },
  // Texture 4 — 8 mid/high altitude clouds
  {
    az: 216,
    el: 5.8,
    tex: 4,
    sprite: 7,
    w: 300,
    h: 150,
    dSpeed: 0.1,
    dRange: 0.5,
  },
  {
    az: 72,
    el: 5.8,
    tex: 4,
    sprite: 6,
    w: 200,
    h: 100,
    dSpeed: 0.12,
    dRange: 0.4,
  },
  {
    az: 129.6,
    el: 30.4,
    tex: 4,
    sprite: 5,
    w: 250,
    h: 120,
    dSpeed: 0.13,
    dRange: 0.35,
  },
  {
    az: 180,
    el: 36.6,
    tex: 4,
    sprite: 4,
    w: 280,
    h: 170,
    dSpeed: 0.15,
    dRange: 0.4,
  },
  {
    az: 248.4,
    el: 30.3,
    tex: 4,
    sprite: 3,
    w: 350,
    h: 200,
    dSpeed: 0.16,
    dRange: 0.35,
  },
  {
    az: 284.4,
    el: 40.8,
    tex: 4,
    sprite: 2,
    w: 390,
    h: 200,
    dSpeed: 0.12,
    dRange: 0.4,
  },
  {
    az: 306,
    el: 29.3,
    tex: 4,
    sprite: 1,
    w: 380,
    h: 190,
    dSpeed: 0.2,
    dRange: 0.45,
  },
  {
    az: 342,
    el: 38.9,
    tex: 4,
    sprite: 0,
    w: 150,
    h: 100,
    dSpeed: 0.17,
    dRange: 0.5,
  },
];

// TSL uniform reference types
type TSLUniformFloat = { value: number };
type TSLUniformVec3 = { value: THREE.Vector3 };

type SkyMaterialUniforms = {
  uTime: TSLUniformFloat;
  uSunPosition: TSLUniformVec3;
  uDayCycleProgress: TSLUniformFloat;
  uDayIntensity: TSLUniformFloat;
};

type CloudMaterialUniforms = {
  uTime: TSLUniformFloat;
  uSunPosition: TSLUniformVec3;
  uCloudRadius: TSLUniformFloat;
};

type CelestialUniforms = { uOpacity: TSLUniformFloat };

export interface StandaloneSkyOptions {
  /** Base URL for cloud/moon/star/galaxy textures. Default: "/textures/" */
  textureBasePath?: string;
  /** Day cycle duration in seconds (for worldTime → dayPhase). Default: 80 */
  dayCycleDuration?: number;
}

export class StandaloneSky {
  private scene: THREE.Scene;
  private renderer: THREE.WebGPURenderer;
  private camera: THREE.Camera;
  private opts: Required<StandaloneSkyOptions>;

  private group: THREE.Group | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private sun: THREE.Mesh | null = null;
  private sunGlow: THREE.Mesh | null = null;
  private sunInnerGlow: THREE.Mesh | null = null;
  private moon: THREE.Mesh | null = null;
  private moonGlow: THREE.Mesh | null = null;
  private cloudGroup: THREE.Group | null = null;

  // Textures
  private cloud1: THREE.Texture | null = null;
  private cloud2: THREE.Texture | null = null;
  private cloud3: THREE.Texture | null = null;
  private cloud4: THREE.Texture | null = null;
  private galaxyTex: THREE.Texture | null = null;
  private moonTex: THREE.Texture | null = null;
  private noiseA!: THREE.Texture;
  private noiseB!: THREE.Texture;

  // Fog sky scene
  private fogScene: THREE.Scene | null = null;
  private fogCamera: THREE.PerspectiveCamera | null = null;
  private fogSkyMesh: THREE.Mesh | null = null;
  private fogSkyUniforms: SkyMaterialUniforms | null = null;

  // TSL material uniforms
  private sunUniforms: CelestialUniforms | null = null;
  private moonUniforms: CelestialUniforms | null = null;
  private skyTSLUniforms: SkyMaterialUniforms | null = null;
  private cloudMaterialUniforms: CloudMaterialUniforms | null = null;

  private elapsed = 0;
  private _sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
  private _dayPhase = 0.5;
  private _dayIntensity = 1;

  constructor(
    scene: THREE.Scene,
    renderer: THREE.WebGPURenderer,
    camera: THREE.Camera,
    options?: StandaloneSkyOptions,
  ) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.opts = {
      textureBasePath: options?.textureBasePath ?? "/textures/",
      dayCycleDuration: options?.dayCycleDuration ?? DAY_CYCLE.DURATION_SEC,
    };
  }

  // ---- Public getters ----

  get sunDirection(): THREE.Vector3 {
    return this._sunDir;
  }
  get dayPhase(): number {
    return this._dayPhase;
  }
  get dayIntensity(): number {
    return this._dayIntensity;
  }
  get isDay(): boolean {
    return this._dayPhase >= 0.25 && this._dayPhase < 0.75;
  }
  get skyFogTexture(): THREE.Texture | null {
    return fogRenderTarget?.texture ?? null;
  }

  // ---- Lifecycle ----

  async init(): Promise<void> {
    this.noiseA = createNoiseTexture(128);
    this.noiseB = createNoiseTexture(128);

    const loader = new THREE.TextureLoader();
    const base = this.opts.textureBasePath;

    const loadTex = (name: string): Promise<THREE.Texture> =>
      new Promise((resolve, reject) => {
        loader.load(
          base + name,
          (t) => {
            const shouldRepeat = /noise|star|galaxy/.test(name);
            t.wrapS = shouldRepeat
              ? THREE.RepeatWrapping
              : THREE.ClampToEdgeWrapping;
            t.wrapT = shouldRepeat
              ? THREE.RepeatWrapping
              : THREE.ClampToEdgeWrapping;
            t.colorSpace = THREE.SRGBColorSpace;
            resolve(t);
          },
          undefined,
          (e) => reject(e),
        );
      });

    const results = await Promise.allSettled([
      loadTex("cloud1.png"),
      loadTex("cloud2.png"),
      loadTex("cloud3.png"),
      loadTex("cloud4.png"),
      loadTex("galaxy.png"),
      loadTex("moon2.png"),
      loadTex("star3.png"),
      loadTex("noise.png"),
      loadTex("noise2.png"),
    ]);

    const get = (i: number) =>
      results[i].status === "fulfilled"
        ? (results[i] as PromiseFulfilledResult<THREE.Texture>).value
        : null;
    this.cloud1 = get(0);
    this.cloud2 = get(1);
    this.cloud3 = get(2);
    this.cloud4 = get(3);
    this.galaxyTex = get(4);
    this.moonTex = get(5);
    const n1 = get(7);
    const n2 = get(8);
    if (n1) this.noiseA = n1;
    if (n2) this.noiseB = n2;
  }

  start(): void {
    this.group = new THREE.Group();
    this.group.name = "StandaloneSkyGroup";
    this.scene.add(this.group);

    this.createSkyDome();
    this.createFogSky();
    this.createSun();
    this.createMoon();
    this.createClouds();
  }

  /** Update sky state. Call once per frame.
   * @param dt - Delta time in seconds
   * @param worldTime - Total elapsed world time in seconds (drives day/night cycle)
   */
  update(dt: number, worldTime: number): void {
    if (!this.group || !this.skyMesh) return;
    this.elapsed += dt;

    const dayPhase =
      (worldTime % this.opts.dayCycleDuration) / this.opts.dayCycleDuration;
    this._dayPhase = dayPhase;
    const isDay = this.isDay;

    // Day intensity — delegate to shared pure function
    this._dayIntensity = computeDayIntensity(dayPhase);

    // Sun direction arc
    const sunArcAngle = (dayPhase - 0.25) * Math.PI * 2;
    const sunElevation = Math.sin(sunArcAngle);
    const sunAzimuth = Math.cos(sunArcAngle);
    this._sunDir
      .set(
        sunAzimuth * Math.max(0.1, 1 - Math.abs(sunElevation)),
        sunElevation,
        SUN_LIGHT.TILT * sunAzimuth,
      )
      .normalize();

    const radius = SKY_DOME_RADIUS * 0.9;

    // Position sun
    if (this.sun) {
      this.sun.position.set(
        this._sunDir.x * radius,
        this._sunDir.y * radius,
        this._sunDir.z * radius,
      );
      this.sun.visible = isDay;
      this.sun.quaternion.copy(this.camera.quaternion);
      if (this.sunUniforms) this.sunUniforms.uOpacity.value = isDay ? 0.9 : 0.0;
    }
    if (this.sunGlow) {
      this.sunGlow.position.copy(this.sun!.position);
      this.sunGlow.visible = isDay;
      this.sunGlow.quaternion.copy(this.camera.quaternion);
    }
    if (this.sunInnerGlow) {
      this.sunInnerGlow.position.copy(this.sun!.position);
      this.sunInnerGlow.visible = isDay;
      this.sunInnerGlow.quaternion.copy(this.camera.quaternion);
    }

    // Position moon
    if (this.moon) {
      this.moon.position.set(
        -this._sunDir.x * radius,
        -this._sunDir.y * radius,
        -this._sunDir.z * radius,
      );
      this.moon.quaternion.copy(this.camera.quaternion);
      this.moon.visible = true;
      if (this.moonUniforms)
        this.moonUniforms.uOpacity.value = isDay ? 0.0 : 1.0;
    }
    if (this.moonGlow) {
      this.moonGlow.position.copy(this.moon!.position);
      this.moonGlow.visible = !isDay;
      this.moonGlow.quaternion.copy(this.camera.quaternion);
    }

    // Update sky uniforms
    if (this.skyTSLUniforms) {
      this.skyTSLUniforms.uTime.value = this.elapsed;
      this.skyTSLUniforms.uSunPosition.value.copy(this._sunDir);
      this.skyTSLUniforms.uDayCycleProgress.value = dayPhase;
      this.skyTSLUniforms.uDayIntensity.value = this._dayIntensity;
    }

    // Update cloud uniforms
    if (this.cloudMaterialUniforms) {
      this.cloudMaterialUniforms.uTime.value = this.elapsed;
      this.cloudMaterialUniforms.uSunPosition.value.set(
        this._sunDir.x * SKY_DOME_RADIUS,
        this._sunDir.y * SKY_DOME_RADIUS,
        this._sunDir.z * SKY_DOME_RADIUS,
      );
    }
  }

  /** Keep sky centered on camera + render fog RT. Call after update(). */
  lateUpdate(cameraPos: THREE.Vector3): void {
    if (this.group) {
      this.group.position.copy(cameraPos);
    }
    this.renderFogSky();
  }

  dispose(): void {
    const disposeMesh = (m: THREE.Mesh | null) => {
      if (!m) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    };
    disposeMesh(this.skyMesh);
    disposeMesh(this.sun);
    disposeMesh(this.sunGlow);
    disposeMesh(this.sunInnerGlow);
    disposeMesh(this.moon);
    disposeMesh(this.moonGlow);
    disposeMesh(this.fogSkyMesh);

    if (this.cloudGroup) {
      for (const child of this.cloudGroup.children) {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
    }

    if (this.group?.parent) this.group.parent.remove(this.group);
    this.group = null;
    this.skyMesh = null;
    this.sun = null;
    this.sunGlow = null;
    this.sunInnerGlow = null;
    this.moon = null;
    this.moonGlow = null;
    this.cloudGroup = null;
    this.fogSkyMesh = null;
    this.fogScene = null;
    this.fogCamera = null;
    this.sunUniforms = null;
    this.moonUniforms = null;
    this.skyTSLUniforms = null;
    this.cloudMaterialUniforms = null;
    this.fogSkyUniforms = null;
  }

  // ---- Private creation methods ----

  private createSkyDome(): void {
    if (!this.group) return;

    const skyGeom = new THREE.SphereGeometry(SKY_DOME_RADIUS, 128, 64);
    const uTime = uniform(float(0));
    const uSunPosition = uniform(vec3(0, 1, 0));
    const uDayCycleProgress = uniform(float(0));
    const uDayIntensity = uniform(float(0));

    const uGalaxyTex = this.galaxyTex ? texture(this.galaxyTex) : null;

    const skyColorNode = Fn(() => {
      const localPos = normalize(positionLocal);
      const elevation = abs(localPos.y);

      const dayInt = uDayIntensity;
      const nightInt = sub(float(1.0), dayInt);

      // Day sky gradient
      const dayZenith = vec3(0.25, 0.55, 0.95);
      const dayHorizon = vec3(0.7, 0.85, 1.0);
      const dayGradient = pow(sub(float(1.0), elevation), float(1.5));
      const daySkyColor = mix(dayZenith, dayHorizon, dayGradient);

      // Night sky gradient
      const nightZenith = vec3(0.005, 0.008, 0.025);
      const nightHorizon = vec3(0.02, 0.03, 0.06);
      const nightGradient = pow(sub(float(1.0), elevation), float(2.0));
      const nightSkyColor = mix(nightZenith, nightHorizon, nightGradient);

      let skyColor: ShaderNode = mix(nightSkyColor, daySkyColor, dayInt);

      // Sunrise/sunset glow
      const sunY = uSunPosition.y;
      const dawnDuskFactor = smoothstep(float(-0.2), float(0.0), sunY);
      const dawnDuskFade = smoothstep(float(0.4), float(0.15), sunY);
      const sunriseSunsetIntensity = mul(dawnDuskFactor, dawnDuskFade);
      const sunDir = normalize(uSunPosition);
      const angleToSun = dot(localPos, sunDir);
      const sunGlowRaw = clamp(angleToSun, float(0.0), float(1.0));
      const sunGlowAngle = pow(sunGlowRaw, float(4.0));
      const horizonGlow = pow(
        clamp(
          sub(float(1.0), mul(elevation, float(2.0))),
          float(0.0),
          float(1.0),
        ),
        float(2.0),
      );
      const glowIntensity = mul(
        mul(sunGlowAngle, horizonGlow),
        mul(sunriseSunsetIntensity, float(0.6)),
      );
      const dawnOrDusk = smoothstep(float(0.2), float(0.3), uDayCycleProgress);
      const sunriseColor = vec3(1.0, 0.5, 0.2);
      const sunsetPinkColor = vec3(1.0, 0.4, 0.5);
      const glowColor = mix(sunriseColor, sunsetPinkColor, dawnOrDusk);
      skyColor = add(skyColor, mul(glowColor, glowIntensity));

      // Procedural stars (night only)
      const starVisibility = mul(
        pow(nightInt, float(0.5)),
        smoothstep(float(0.05), float(0.3), elevation),
      );
      const sphereUV = uv();
      const starCoord1 = mul(sphereUV, float(120.0));
      const starCoord2 = mul(sphereUV, float(160.0));
      const starCoord3 = mul(sphereUV, float(200.0));

      const starNoise1 = mul(
        mul(
          add(float(1.0), cos(mul(starCoord1.x, float(6.28)))),
          add(float(1.0), cos(mul(starCoord1.y, float(7.35)))),
        ),
        add(float(1.0), cos(mul(add(starCoord1.x, starCoord1.y), float(4.12)))),
      );
      const starNoise2 = mul(
        mul(
          add(float(1.0), cos(mul(starCoord2.x, float(5.89)))),
          add(float(1.0), cos(mul(starCoord2.y, float(8.12)))),
        ),
        add(float(1.0), cos(mul(add(starCoord2.x, starCoord2.y), float(3.78)))),
      );
      const starNoise3 = mul(
        mul(
          add(float(1.0), cos(mul(starCoord3.x, float(7.23)))),
          add(float(1.0), cos(mul(starCoord3.y, float(6.54)))),
        ),
        add(float(1.0), cos(mul(add(starCoord3.x, starCoord3.y), float(5.01)))),
      );

      const starThreshold1 = pow(
        smoothstep(float(7.8), float(8.0), starNoise1),
        float(2.0),
      );
      const starThreshold2 = mul(
        pow(smoothstep(float(7.9), float(8.0), starNoise2), float(2.0)),
        float(0.7),
      );
      const starThreshold3 = mul(
        pow(smoothstep(float(7.95), float(8.0), starNoise3), float(2.0)),
        float(0.4),
      );
      const proceduralStars = clamp(
        add(add(starThreshold1, starThreshold2), starThreshold3),
        float(0.0),
        float(1.0),
      );

      const galaxyUV = mul(sphereUV, float(2.0));
      const galaxySample = uGalaxyTex
        ? texture(this.galaxyTex!, galaxyUV)
        : vec4(0, 0, 0, 0);
      const starIntensity = add(
        mul(proceduralStars, float(1.5)),
        mul(galaxySample.r, float(0.12)),
      );
      const starColorVar = mix(
        vec3(1.0, 0.95, 0.85),
        vec3(0.85, 0.92, 1.0),
        proceduralStars,
      );
      skyColor = add(
        skyColor,
        mul(starColorVar, mul(starIntensity, starVisibility)),
      );

      // Moon glow
      const moonPos = mul(sunDir, float(-1.0));
      const angleToMoon = dot(localPos, moonPos);
      const moonGlowAngle = pow(
        clamp(angleToMoon, float(0.0), float(1.0)),
        float(6.0),
      );
      const moonGlowIntensity = mul(mul(moonGlowAngle, nightInt), float(0.4));
      skyColor = add(skyColor, mul(vec3(0.5, 0.6, 0.8), moonGlowIntensity));

      // Horizon haze
      const hazeStrength = smoothstep(float(0.15), float(0.0), elevation);
      const hazeAmount = mul(
        hazeStrength,
        mul(float(0.3), mul(dayInt, float(0.9))),
      );
      skyColor = mix(skyColor, vec3(0.83, 0.78, 0.72), hazeAmount);

      return vec4(skyColor, float(1.0));
    })();

    const skyMat = new MeshBasicNodeMaterial();
    skyMat.colorNode = skyColorNode;
    skyMat.side = THREE.BackSide;
    skyMat.depthWrite = false;
    skyMat.depthTest = false;
    skyMat.transparent = false;
    skyMat.toneMapped = true;
    skyMat.fog = false;

    this.skyTSLUniforms = {
      uTime,
      uSunPosition: uSunPosition as unknown as TSLUniformVec3,
      uDayCycleProgress,
      uDayIntensity,
    } as SkyMaterialUniforms;

    this.skyMesh = new THREE.Mesh(skyGeom, skyMat);
    this.skyMesh.frustumCulled = false;
    this.skyMesh.renderOrder = SKY_RENDER_ORDER.SKY_DOME;
    this.skyMesh.name = "StandaloneSkyDome";
    this.group!.add(this.skyMesh);
  }

  private createFogSky(): void {
    if (!this.skyTSLUniforms) return;

    this.fogScene = new THREE.Scene();
    this.fogCamera = (this.camera as THREE.PerspectiveCamera).clone();

    const fogSkyGeom = new THREE.SphereGeometry(SKY_DOME_RADIUS, 64, 32);
    const uSunPosition = uniform(vec3(0, 1, 0));
    const uDayCycleProgress = uniform(float(0));
    const uDayIntensity = uniform(float(0));

    this.fogSkyUniforms = {
      uTime: uniform(float(0)),
      uSunPosition: uSunPosition as unknown as TSLUniformVec3,
      uDayCycleProgress,
      uDayIntensity,
    } as SkyMaterialUniforms;

    // Same as main sky but WITHOUT stars/galaxy
    const fogSkyColorNode = Fn(() => {
      const localPos = normalize(positionLocal);
      const elevation = abs(localPos.y);
      const dayInt = uDayIntensity;
      const nightInt = sub(float(1.0), dayInt);

      const dayZenith = vec3(0.25, 0.55, 0.95);
      const dayHorizon = vec3(0.7, 0.85, 1.0);
      const daySkyColor = mix(
        dayZenith,
        dayHorizon,
        pow(sub(float(1.0), elevation), float(1.5)),
      );
      const nightZenith = vec3(0.005, 0.008, 0.025);
      const nightHorizon = vec3(0.02, 0.03, 0.06);
      const nightSkyColor = mix(
        nightZenith,
        nightHorizon,
        pow(sub(float(1.0), elevation), float(2.0)),
      );
      let skyColor: ShaderNode = mix(nightSkyColor, daySkyColor, dayInt);

      // Sunrise/sunset glow
      const sunY = uSunPosition.y;
      const sunriseSunsetIntensity = mul(
        smoothstep(float(-0.2), float(0.0), sunY),
        smoothstep(float(0.4), float(0.15), sunY),
      );
      const sunDir = normalize(uSunPosition);
      const angleToSun = dot(localPos, sunDir);
      const sunGlowAngle = pow(
        clamp(angleToSun, float(0.0), float(1.0)),
        float(4.0),
      );
      const horizGlow = pow(
        clamp(
          sub(float(1.0), mul(elevation, float(2.0))),
          float(0.0),
          float(1.0),
        ),
        float(2.0),
      );
      const glowInt = mul(
        mul(sunGlowAngle, horizGlow),
        mul(sunriseSunsetIntensity, float(0.6)),
      );
      const dawnOrDusk = smoothstep(float(0.2), float(0.3), uDayCycleProgress);
      skyColor = add(
        skyColor,
        mul(mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.4, 0.5), dawnOrDusk), glowInt),
      );

      // Moon glow
      const moonPos = mul(sunDir, float(-1.0));
      const moonGlowAngle = pow(
        clamp(dot(localPos, moonPos), float(0.0), float(1.0)),
        float(6.0),
      );
      skyColor = add(
        skyColor,
        mul(vec3(0.5, 0.6, 0.8), mul(mul(moonGlowAngle, nightInt), float(0.4))),
      );

      // Horizon haze
      const hazeStrength = smoothstep(float(0.15), float(0.0), elevation);
      skyColor = mix(
        skyColor,
        vec3(0.83, 0.78, 0.72),
        mul(hazeStrength, mul(float(0.3), mul(dayInt, float(0.9)))),
      );

      return vec4(skyColor, float(1.0));
    })();

    const fogSkyMat = new MeshBasicNodeMaterial();
    fogSkyMat.colorNode = fogSkyColorNode;
    fogSkyMat.side = THREE.BackSide;
    fogSkyMat.depthWrite = false;
    fogSkyMat.depthTest = false;
    fogSkyMat.fog = false;

    this.fogSkyMesh = new THREE.Mesh(fogSkyGeom, fogSkyMat);
    this.fogSkyMesh.frustumCulled = false;
    this.fogScene.add(this.fogSkyMesh);
  }

  private createSun(): void {
    if (!this.group) return;
    const R = SKY_DOME_RADIUS;
    const uOpacity = uniform(float(1.0));
    this.sunUniforms = { uOpacity };

    // Core sun disc
    const sunGeom = new THREE.CircleGeometry(R * 0.03, 32);
    const sunColorNode = Fn(() => {
      const uvCoord = uv();
      const dist = length(
        sub(vec3(uvCoord.x, uvCoord.y, 0), vec3(0.5, 0.5, 0)),
      );
      const coreFalloff = clamp(
        sub(float(1.0), mul(dist, float(2.0))),
        float(0.0),
        float(1.0),
      );
      const coreStrength = pow(coreFalloff, float(0.3));
      return vec4(
        mul(vec3(3.0, 2.4, 1.8), coreStrength),
        mul(coreStrength, uOpacity),
      );
    })();
    const sunMat = new MeshBasicNodeMaterial();
    sunMat.colorNode = sunColorNode;
    sunMat.blending = THREE.AdditiveBlending;
    sunMat.depthWrite = false;
    sunMat.depthTest = true;
    sunMat.transparent = true;
    sunMat.fog = false;
    this.sun = new THREE.Mesh(sunGeom, sunMat);
    this.sun.frustumCulled = false;
    this.sun.renderOrder = SKY_RENDER_ORDER.CELESTIAL_DISC;
    this.group.add(this.sun);

    // Inner glow
    const innerGeom = new THREE.CircleGeometry(R * 0.1, 32);
    const innerColorNode = Fn(() => {
      const uvCoord = uv();
      const dist = length(
        sub(vec3(uvCoord.x, uvCoord.y, 0), vec3(0.5, 0.5, 0)),
      );
      const falloff = pow(
        clamp(sub(float(1.0), mul(dist, float(2.0))), float(0.0), float(1.0)),
        float(2.5),
      );
      return vec4(mul(vec3(2.0, 1.5, 0.8), falloff), mul(falloff, uOpacity));
    })();
    const innerMat = new MeshBasicNodeMaterial();
    innerMat.colorNode = innerColorNode;
    innerMat.blending = THREE.AdditiveBlending;
    innerMat.depthWrite = false;
    innerMat.depthTest = true;
    innerMat.transparent = true;
    innerMat.side = THREE.DoubleSide;
    innerMat.fog = false;
    this.sunInnerGlow = new THREE.Mesh(innerGeom, innerMat);
    this.sunInnerGlow.frustumCulled = false;
    this.sunInnerGlow.renderOrder = SKY_RENDER_ORDER.CELESTIAL_GLOW_INNER;
    this.group.add(this.sunInnerGlow);

    // Outer glow
    const outerGeom = new THREE.CircleGeometry(R * 0.2, 32);
    const outerColorNode = Fn(() => {
      const uvCoord = uv();
      const dist = length(
        sub(vec3(uvCoord.x, uvCoord.y, 0), vec3(0.5, 0.5, 0)),
      );
      const falloff = pow(
        clamp(sub(float(1.0), mul(dist, float(2.0))), float(0.0), float(1.0)),
        float(1.2),
      );
      return vec4(
        mul(vec3(1.0, 0.7, 0.4), falloff),
        mul(mul(falloff, uOpacity), float(0.6)),
      );
    })();
    const outerMat = new MeshBasicNodeMaterial();
    outerMat.colorNode = outerColorNode;
    outerMat.blending = THREE.AdditiveBlending;
    outerMat.depthWrite = false;
    outerMat.depthTest = true;
    outerMat.transparent = true;
    outerMat.side = THREE.DoubleSide;
    outerMat.fog = false;
    this.sunGlow = new THREE.Mesh(outerGeom, outerMat);
    this.sunGlow.frustumCulled = false;
    this.sunGlow.renderOrder = SKY_RENDER_ORDER.CELESTIAL_GLOW_OUTER;
    this.group.add(this.sunGlow);
  }

  private createMoon(): void {
    if (!this.group) return;
    const R = SKY_DOME_RADIUS;
    const uOpacity = uniform(float(1.0));
    this.moonUniforms = { uOpacity };

    const moonGeom = new THREE.PlaneGeometry(R * 0.07, R * 0.07);
    const moonColorNode = Fn(() => {
      const uvCoord = uv();
      const texColor = this.moonTex
        ? texture(this.moonTex, uvCoord)
        : vec4(0.9, 0.9, 0.95, 1.0);
      return vec4(texColor.rgb, mul(texColor.a, uOpacity));
    })();
    const moonMat = new MeshBasicNodeMaterial();
    moonMat.colorNode = moonColorNode;
    moonMat.blending = THREE.AdditiveBlending;
    moonMat.depthWrite = false;
    moonMat.depthTest = true;
    moonMat.transparent = true;
    moonMat.side = THREE.DoubleSide;
    moonMat.fog = false;
    this.moon = new THREE.Mesh(moonGeom, moonMat);
    this.moon.frustumCulled = false;
    this.moon.renderOrder = SKY_RENDER_ORDER.CELESTIAL_DISC;
    this.group.add(this.moon);

    // Moon glow halo
    const moonGlowGeom = new THREE.CircleGeometry(R * 0.1, 32);
    const moonGlowColorNode = Fn(() => {
      const uvCoord = uv();
      const dist = length(
        sub(vec3(uvCoord.x, uvCoord.y, 0), vec3(0.5, 0.5, 0)),
      );
      const falloff = pow(
        clamp(sub(float(1.0), mul(dist, float(2.0))), float(0.0), float(1.0)),
        float(1.5),
      );
      return vec4(mul(vec3(0.7, 0.8, 1.0), falloff), mul(falloff, uOpacity));
    })();
    const moonGlowMat = new MeshBasicNodeMaterial();
    moonGlowMat.colorNode = moonGlowColorNode;
    moonGlowMat.blending = THREE.AdditiveBlending;
    moonGlowMat.depthWrite = false;
    moonGlowMat.depthTest = true;
    moonGlowMat.transparent = true;
    moonGlowMat.side = THREE.DoubleSide;
    moonGlowMat.fog = false;
    this.moonGlow = new THREE.Mesh(moonGlowGeom, moonGlowMat);
    this.moonGlow.frustumCulled = false;
    this.moonGlow.renderOrder = SKY_RENDER_ORDER.CELESTIAL_GLOW_INNER;
    this.group.add(this.moonGlow);
  }

  private createClouds(): void {
    if (!this.group) return;
    const R = SKY_DOME_RADIUS;

    this.cloudGroup = new THREE.Group();
    this.cloudGroup.name = "CloudGroup";

    const textures = [this.cloud1, this.cloud2, this.cloud3, this.cloud4];
    const noiseTex = this.noiseB;

    const uTime = uniform(float(0));
    const uSunPos = uniform(vec3(0, R, 0));
    const uCloudRadius = uniform(float(R));
    this.cloudMaterialUniforms = {
      uTime,
      uSunPosition: uSunPos,
      uCloudRadius,
    } as CloudMaterialUniforms;

    for (const def of CLOUD_DEFS) {
      const tex = textures[def.tex - 1];
      if (!tex) continue;

      const col = def.sprite % 2;
      const row = Math.floor(def.sprite / 2);
      const uOff = col * 0.5;
      const vOff = 0.75 - row * 0.25;

      const geom = new THREE.PlaneGeometry(1, 1);
      const uvAttr = geom.attributes.uv;
      for (let j = 0; j < uvAttr.count; j++) {
        uvAttr.setXY(
          j,
          uvAttr.getX(j) * 0.5 + uOff,
          uvAttr.getY(j) * 0.25 + vOff,
        );
      }
      uvAttr.needsUpdate = true;

      const azRad = (def.az * Math.PI) / 180;
      const elRad = (def.el * Math.PI) / 180;
      const cx = R * Math.cos(elRad) * Math.sin(azRad);
      const cy = R * Math.sin(elRad);
      const cz = R * Math.cos(elRad) * Math.cos(azRad);

      const uDistSpeed = float(def.dSpeed);
      const uDistRange = float((1 - def.dRange) * 2);
      const uCloudPos = vec3(cx, cy, cz);

      const cloudOutputNode = Fn(() => {
        const uvCoord = uv();
        const noiseUV = vec2(
          add(uvCoord.x, mul(uTime, mul(uDistSpeed, float(0.1)))),
          add(uvCoord.y, mul(uTime, mul(uDistSpeed, float(0.2)))),
        );
        const noiseSample = noiseTex
          ? texture(noiseTex, noiseUV)
          : vec4(0.5, 0.5, 0.5, 1.0);
        const distortedUV = add(
          uvCoord,
          mul(vec2(noiseSample.r, noiseSample.b), float(0.01)),
        );
        const cloud = texture(tex, distortedUV);

        const alphaLerp = mix(
          add(
            mul(sin(mul(uTime, uDistSpeed)), float(0.78)),
            mul(float(0.78), uDistRange),
          ),
          float(1.0),
          float(0.1),
        );
        const cloudStep = sub(float(1.0), alphaLerp);
        const cloudLerp = smoothstep(float(0.95), float(1.0), alphaLerp);
        const alphaBase = smoothstep(
          clamp(sub(cloudStep, float(0.1)), float(0.0), float(1.0)),
          cloudStep,
          cloud.b,
        );
        const cloudAlpha = clamp(
          mix(alphaBase, cloud.a, cloudLerp),
          float(0.0),
          cloud.a,
        );

        const sunNightStep = smoothstep(
          float(-0.3),
          float(0.25),
          div(uSunPos.y, uCloudRadius),
        );
        const brightColor = mix(
          vec3(0.141, 0.607, 0.94),
          vec3(1.0, 1.0, 1.0),
          sunNightStep,
        );
        const darkColor = mix(
          vec3(0.024, 0.32, 0.59),
          vec3(0.22, 0.5, 0.85),
          sunNightStep,
        );

        const sunDist = distance(uCloudPos, uSunPos);
        const brightLerp = smoothstep(float(0.0), uCloudRadius, sunDist);
        const bright = mix(float(2.0), float(1.0), brightLerp);

        const cloudColor = add(
          mul(mix(darkColor, brightColor, cloud.r), bright),
          mul(cloud.g, sub(float(1.0), brightLerp)),
        );

        // Per-fragment horizon fog
        const fogTex = texture(fogRenderTarget.texture, screenUV);
        const worldElev = clamp(
          div(positionWorld.y, float(5000.0)),
          float(0.0),
          float(1.0),
        );
        const fogStr = smoothstep(float(0.6), float(0.0), worldElev);
        const finalColor = mix(cloudColor, fogTex.rgb, fogStr);

        return vec4(finalColor, cloudAlpha);
      })();

      const mat = new MeshBasicNodeMaterial();
      mat.colorNode = cloudOutputNode;
      mat.side = THREE.DoubleSide;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.toneMapped = false;
      mat.fog = false;

      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = SKY_RENDER_ORDER.CLOUDS;
      mesh.position.set(cx, cy, cz);
      mesh.rotation.y = azRad + Math.PI;
      mesh.scale.set(def.w * 10, def.h * 10, 1);
      this.cloudGroup.add(mesh);
    }

    this.group.add(this.cloudGroup);
  }

  private renderFogSky(): void {
    if (!this.fogScene || !this.fogCamera) return;

    // Sync fog camera
    const cam = this.camera as THREE.PerspectiveCamera;
    this.fogCamera.position.set(0, 0, 0);
    this.fogCamera.quaternion.copy(cam.quaternion);
    this.fogCamera.projectionMatrix.copy(cam.projectionMatrix);
    this.fogCamera.projectionMatrixInverse.copy(cam.projectionMatrixInverse);

    const desiredW = Math.max(
      1,
      Math.round(cam.aspect * fogRenderTarget.height),
    );
    if (fogRenderTarget.width !== desiredW) {
      fogRenderTarget.setSize(desiredW, fogRenderTarget.height);
    }

    // Sync fog sky uniforms
    if (this.fogSkyUniforms && this.skyTSLUniforms) {
      this.fogSkyUniforms.uSunPosition.value.copy(
        this.skyTSLUniforms.uSunPosition.value,
      );
      this.fogSkyUniforms.uDayCycleProgress.value =
        this.skyTSLUniforms.uDayCycleProgress.value;
      this.fogSkyUniforms.uDayIntensity.value =
        this.skyTSLUniforms.uDayIntensity.value;
    }

    // Disable tone mapping for linear fog values
    const savedToneMapping = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const currentTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(fogRenderTarget);
    this.renderer.render(this.fogScene, this.fogCamera);
    this.renderer.setRenderTarget(currentTarget);
    this.renderer.toneMapping = savedToneMapping;
  }
}
