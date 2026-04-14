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
} from "@hyperscape/shared";
import type * as THREE from "three/webgpu";

export interface EditorWaterUniforms {
  time: { value: number };
  sunDirection: { value: THREE.Vector3 };
  dayIntensity: { value: number };
  sunIntensity: { value: number };
}

/**
 * Create a TSL-based water material for the World Studio viewport.
 * Same shader as the game, minus reflections and fog.
 */
export function createEditorWaterMaterial(): {
  material: THREE.Material;
  uniforms: EditorWaterUniforms;
} {
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
  };
}
