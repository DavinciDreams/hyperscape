/**
 * useManifestCompiler — React hook wrapper around manifest compilation
 *
 * Thin orchestrator that wraps the pure compilation functions from
 * utils/manifestCompiler.ts in useCallback for React memoisation.
 *
 * Used by the deployment pipeline when pushing to staging.
 */

import { useCallback } from "react";

import type { WorldData } from "../../WorldBuilder/types";
import type {
  ExtendedWorldLayers,
  AudioLayers,
  ManifestData,
  BrushOverlays,
  DeploymentDiff,
} from "../types";

import { compileAllManifests, computeDiff } from "../utils/manifestCompiler";
import type { CompiledManifests } from "../utils/manifestCompiler";

export type { CompiledManifests };

export function useManifestCompiler() {
  /**
   * Compile all world data into deployable manifest files.
   */
  const compile = useCallback(
    (
      world: WorldData,
      extendedLayers: ExtendedWorldLayers,
      audioLayers: AudioLayers,
      manifests: ManifestData,
      brushOverlays: BrushOverlays,
      vegetationTrees?: Array<{
        s: string;
        x: number;
        y: number;
        z: number;
        sc: number;
        r: number;
      }>,
    ): CompiledManifests => {
      return compileAllManifests(
        world,
        extendedLayers,
        audioLayers,
        manifests,
        brushOverlays,
        vegetationTrees,
      );
    },
    [],
  );

  /**
   * Compute diff between compiled state and currently deployed state.
   */
  const diff = useCallback(
    (
      compiled: CompiledManifests,
      deployed: Record<string, unknown>,
    ): DeploymentDiff => {
      return computeDiff(compiled, deployed);
    },
    [],
  );

  return { compile, diff };
}
