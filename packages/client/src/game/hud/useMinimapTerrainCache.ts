import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { TERRAIN_CONSTANTS } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

const TERRAIN_BASE_SAMPLE_SIZE = 96;
const TERRAIN_CLOSE_SAMPLE_SIZE = 128;
const TERRAIN_OVERSHOOT = Math.SQRT2 * 1.1;

interface BiomeDataLike {
  color?: number;
  colorScheme?: {
    primary?: string;
  };
}

interface CachedBiomeColor {
  r: number;
  g: number;
  b: number;
}

interface TerrainSystemLike {
  getHeightAt: (x: number, z: number) => number;
  getBiomeAtPosition?: (x: number, z: number) => string;
  getBiomeData?: (biomeId: string) => BiomeDataLike | null;
}

interface EnsureTerrainCacheArgs {
  centerX: number;
  centerZ: number;
  currentExtent: number;
  upX: number;
  upZ: number;
}

const DEFAULT_BIOME_COLOR: CachedBiomeColor = {
  r: 86,
  g: 126,
  b: 86,
};
const biomeColorCache = new Map<string, CachedBiomeColor | null>();

export interface MinimapTerrainCacheRefs {
  terrainOffscreenRef: MutableRefObject<OffscreenCanvas | null>;
  terrainCacheCenterRef: MutableRefObject<{ x: number; z: number }>;
  terrainCacheExtentRef: MutableRefObject<number>;
  terrainCacheUpRef: MutableRefObject<{ x: number; z: number }>;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, value | 0));
}

function parseHexColor(color: string): CachedBiomeColor | null {
  const trimmed = color.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (hex.length !== 6) {
    return null;
  }

  const numeric = Number.parseInt(hex, 16);
  if (Number.isNaN(numeric)) {
    return null;
  }

  return {
    r: (numeric >> 16) & 0xff,
    g: (numeric >> 8) & 0xff,
    b: numeric & 0xff,
  };
}

function numberToColor(value: number): CachedBiomeColor {
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function getBiomeBaseColor(
  terrainSystem: TerrainSystemLike,
  worldX: number,
  worldZ: number,
): CachedBiomeColor {
  const biomeId = terrainSystem.getBiomeAtPosition?.(worldX, worldZ);
  if (!biomeId) {
    return DEFAULT_BIOME_COLOR;
  }

  const cachedBiome = biomeColorCache.get(biomeId);
  if (cachedBiome !== undefined) {
    return cachedBiome ?? DEFAULT_BIOME_COLOR;
  }

  const biomeData = biomeId ? terrainSystem.getBiomeData?.(biomeId) : null;
  let biomeColor: CachedBiomeColor | null = null;

  if (biomeData?.colorScheme?.primary) {
    const parsed = parseHexColor(biomeData.colorScheme.primary);
    if (parsed) {
      biomeColor = parsed;
    }
  }

  if (typeof biomeData?.color === "number") {
    biomeColor = numberToColor(biomeData.color);
  }

  if (!biomeColor) {
    biomeColor = DEFAULT_BIOME_COLOR;
  }

  biomeColorCache.set(biomeId, biomeColor);
  return biomeColor;
}

async function generateTerrainChunked(
  terrainSystem: TerrainSystemLike,
  centerX: number,
  centerZ: number,
  extent: number,
  upX: number,
  upZ: number,
  isCancelled: () => boolean,
): Promise<OffscreenCanvas | null> {
  const sampleSize =
    extent <= 140 ? TERRAIN_CLOSE_SAMPLE_SIZE : TERRAIN_BASE_SAMPLE_SIZE;
  const offscreen = new OffscreenCanvas(sampleSize, sampleSize);
  const context = offscreen.getContext("2d");
  if (!context) return null;

  const imageData = context.createImageData(sampleSize, sampleSize);
  const data = imageData.data;
  const rightX = -upZ;
  const rightZ = upX;
  const sampleStep = (extent * 2) / sampleSize;

  for (let sy = 0; sy < sampleSize; sy += 1) {
    if (isCancelled()) return null;

    for (let sx = 0; sx < sampleSize; sx += 1) {
      const px = (sx + 0.5) / sampleSize;
      const py = (sy + 0.5) / sampleSize;
      const ndcX = px * 2 - 1;
      const ndcY = py * 2 - 1;
      const worldX = centerX + ndcX * rightX * extent - ndcY * upX * extent;
      const worldZ = centerZ + ndcX * rightZ * extent - ndcY * upZ * extent;
      const height = terrainSystem.getHeightAt(worldX, worldZ);
      const eastHeight = terrainSystem.getHeightAt(worldX + sampleStep, worldZ);
      const northHeight = terrainSystem.getHeightAt(
        worldX,
        worldZ - sampleStep,
      );
      const slope =
        Math.min(
          1,
          Math.hypot(eastHeight - height, northHeight - height) /
            Math.max(1, sampleStep * 0.8),
        ) || 0;

      let r = 30;
      let g = 60;
      let b = 130;

      if (height > TERRAIN_CONSTANTS.WATER_THRESHOLD) {
        const biomeColor = getBiomeBaseColor(terrainSystem, worldX, worldZ);
        const lift =
          Math.min(
            30,
            ((height - TERRAIN_CONSTANTS.WATER_THRESHOLD) / 36) * 30,
          ) | 0;
        const slopeShade = Math.max(-18, Math.min(14, 8 - slope * 24)) | 0;
        const warmth = Math.max(-6, Math.min(10, (height - 18) * 0.18)) | 0;
        r = clampColorChannel(biomeColor.r + lift + slopeShade + warmth);
        g = clampColorChannel(biomeColor.g + lift + slopeShade);
        b = clampColorChannel(biomeColor.b + lift + slopeShade - (warmth >> 1));
      } else {
        const waterDepth =
          Math.min(
            1,
            (TERRAIN_CONSTANTS.WATER_THRESHOLD - height) /
              Math.max(1, TERRAIN_CONSTANTS.WATER_THRESHOLD + 8),
          ) || 0;
        r = clampColorChannel(24 - waterDepth * 8);
        g = clampColorChannel(58 + waterDepth * 10);
        b = clampColorChannel(118 + waterDepth * 28);
      }

      const pixelIndex = (sy * sampleSize + sx) * 4;
      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = 255;
    }

    if (sy % 16 === 15) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (isCancelled()) return null;
    }
  }

  context.putImageData(imageData, 0, 0);
  return offscreen;
}

export function useMinimapTerrainCache(
  world: ClientWorld,
): MinimapTerrainCacheRefs & {
  invalidateTerrainCache: () => void;
  clearTerrainCache: () => void;
  ensureTerrainCache: (args: EnsureTerrainCacheArgs) => void;
} {
  const terrainOffscreenRef = useRef<OffscreenCanvas | null>(null);
  const terrainCacheCenterRef = useRef<{ x: number; z: number }>({
    x: Infinity,
    z: Infinity,
  });
  const terrainCacheExtentRef = useRef<number>(0);
  const terrainCacheUpRef = useRef<{ x: number; z: number }>({ x: 0, z: -1 });
  const terrainGenVersionRef = useRef(0);
  const terrainIsGeneratingRef = useRef(false);

  const invalidateTerrainCache = useCallback(() => {
    terrainOffscreenRef.current = null;
  }, []);

  const clearTerrainCache = useCallback(() => {
    terrainGenVersionRef.current += 1;
    terrainIsGeneratingRef.current = false;
    terrainOffscreenRef.current = null;
    terrainCacheCenterRef.current.x = Infinity;
    terrainCacheCenterRef.current.z = Infinity;
    terrainCacheExtentRef.current = 0;
    terrainCacheUpRef.current.x = 0;
    terrainCacheUpRef.current.z = -1;
  }, []);

  const ensureTerrainCache = useCallback(
    ({ centerX, centerZ, currentExtent, upX, upZ }: EnsureTerrainCacheArgs) => {
      const cachedCenter = terrainCacheCenterRef.current;
      const deltaX = centerX - cachedCenter.x;
      const deltaZ = centerZ - cachedCenter.z;
      const moved = deltaX * deltaX + deltaZ * deltaZ > 400;
      const extentChanged = terrainCacheExtentRef.current !== currentExtent;
      const needsRegen = !terrainOffscreenRef.current || moved || extentChanged;

      if (!needsRegen || terrainIsGeneratingRef.current) {
        return;
      }

      const terrainSystem = world.getSystem("terrain") as
        | TerrainSystemLike
        | null
        | undefined;
      if (!terrainSystem?.getHeightAt) {
        return;
      }

      const version = ++terrainGenVersionRef.current;
      terrainIsGeneratingRef.current = true;
      const snapshotExtent = currentExtent * TERRAIN_OVERSHOOT;

      void generateTerrainChunked(
        terrainSystem,
        centerX,
        centerZ,
        snapshotExtent,
        upX,
        upZ,
        () => terrainGenVersionRef.current !== version,
      ).then((offscreen) => {
        terrainIsGeneratingRef.current = false;
        if (terrainGenVersionRef.current !== version || !offscreen) return;

        terrainOffscreenRef.current = offscreen;
        terrainCacheCenterRef.current.x = centerX;
        terrainCacheCenterRef.current.z = centerZ;
        terrainCacheExtentRef.current = currentExtent;
        terrainCacheUpRef.current.x = upX;
        terrainCacheUpRef.current.z = upZ;
      });
    },
    [world],
  );

  useEffect(() => {
    return () => {
      clearTerrainCache();
    };
  }, [clearTerrainCache]);

  return {
    terrainOffscreenRef,
    terrainCacheCenterRef,
    terrainCacheExtentRef,
    terrainCacheUpRef,
    invalidateTerrainCache,
    clearTerrainCache,
    ensureTerrainCache,
  };
}
