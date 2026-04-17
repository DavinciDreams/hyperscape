/**
 * EditorWaterMaterial — Thin wrapper around game's shared water material factory.
 *
 * Uses the exact same TSL shader pipeline as the game (WaterMaterialCore).
 * Differences from game runtime:
 * - No planar reflections (sky color fallback)
 * - No fog render target (skipped until sky system provides one)
 * - No shoreDistance vertex attribute (no vertex wave damping)
 */

import {
  generateWaterNormalMap,
  generateWaterFlowMap,
  generateWaterFoamTexture,
  createWaterMaterial,
  type WaterMaterialUniforms,
} from "@hyperforge/shared";
import type * as THREE from "three/webgpu";

export interface EditorWaterUniforms {
  time: { value: number };
  sunDirection: { value: THREE.Vector3 };
  dayIntensity: { value: number };
  sunIntensity: { value: number };
}

export interface EditorWaterResult {
  material: THREE.Material;
  uniforms: EditorWaterUniforms;
  /** Textures created for the water shader — caller must dispose these on cleanup. */
  textures: {
    normalTex: THREE.DataTexture;
    flowTex: THREE.DataTexture;
    foamTex: THREE.DataTexture;
  };
}

/**
 * Create a TSL-based water material for the World Studio viewport.
 * Same shader as the game, minus reflections and fog.
 *
 * **IMPORTANT**: Caller is responsible for disposing the returned textures
 * via `result.textures.normalTex.dispose()` etc. on cleanup.
 */
export function createEditorWaterMaterial(): EditorWaterResult {
  // Generate textures (same sizes as game: normal=512, flow=256, foam=128)
  const normalTex = generateWaterNormalMap(512, 42);
  const flowTex = generateWaterFlowMap(256);
  const foamTex = generateWaterFoamTexture(128);

  const { material, uniforms } = createWaterMaterial({
    normalTex,
    flowTex,
    foamTex,
    // No reflectionNode — uses sky color fallback
    // No fog — editor handles fog separately
    // No useShoreAttribute — editor water mesh has no shore distance
  });

  return {
    material,
    uniforms: {
      time: uniforms.time,
      sunDirection: uniforms.sunDirection,
      dayIntensity: uniforms.dayIntensity,
      sunIntensity: uniforms.sunIntensity,
    },
    textures: { normalTex, flowTex, foamTex },
  };
}
