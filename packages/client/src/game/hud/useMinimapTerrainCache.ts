import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import { TERRAIN_CONSTANTS } from "@hyperscape/shared";
import type { ClientWorld } from "../../types";

const TERRAIN_SAMPLE_SIZE = 50;
const TERRAIN_OVERSHOOT = Math.SQRT2 * 1.1;

interface BiomeDataLike {
  color?: number;
  colorScheme?: {
    primary?: string;
  };
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

export interface MinimapTerrainCacheRefs {
  terrainOffscreenRef: MutableRefObject<OffscreenCanvas | null>;
  terrainCacheCenterRef: MutableRefObject<{ x: number; z: number }>;
  terrainCacheExtentRef: MutableRefObject<number>;
  terrainCacheUpRef: MutableRefObject<{ x: number; z: number }>;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, value | 0));
}

function parseHexColor(
  color: string,
): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function numberToColor(value: number): { r: number; g: number; b: number } {
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
): { r: number; g: number; b: number } {
  const biomeId = terrainSystem.getBiomeAtPosition?.(worldX, worldZ);
  const biomeData = biomeId ? terrainSystem.getBiomeData?.(biomeId) : null;

  if (biomeData?.colorScheme?.primary) {
    const parsed = parseHexColor(biomeData.colorScheme.primary);
    if (parsed) {
      return parsed;
    }
  }

  if (typeof biomeData?.color === "number") {
    return numberToColor(biomeData.color);
  }

  return { r: 86, g: 126, b: 86 };
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
  const offscreen = new OffscreenCanvas(
    TERRAIN_SAMPLE_SIZE,
    TERRAIN_SAMPLE_SIZE,
  );
  const context = offscreen.getContext("2d");
  if (!context) return null;

  const imageData = context.createImageData(
    TERRAIN_SAMPLE_SIZE,
    TERRAIN_SAMPLE_SIZE,
  );
  const data = imageData.data;
  const rightX = -upZ;
  const rightZ = upX;

  for (let sy = 0; sy < TERRAIN_SAMPLE_SIZE; sy += 1) {
    if (isCancelled()) return null;

    for (let sx = 0; sx < TERRAIN_SAMPLE_SIZE; sx += 1) {
      const px = (sx + 0.5) / TERRAIN_SAMPLE_SIZE;
      const py = (sy + 0.5) / TERRAIN_SAMPLE_SIZE;
      const ndcX = px * 2 - 1;
      const ndcY = py * 2 - 1;
      const worldX = centerX + ndcX * rightX * extent - ndcY * upX * extent;
      const worldZ = centerZ + ndcX * rightZ * extent - ndcY * upZ * extent;
      const height = terrainSystem.getHeightAt(worldX, worldZ);

      let r = 30;
      let g = 60;
      let b = 130;

      if (height > TERRAIN_CONSTANTS.WATER_THRESHOLD) {
        const biomeColor = getBiomeBaseColor(terrainSystem, worldX, worldZ);
        const lift =
          Math.min(
            26,
            ((height - TERRAIN_CONSTANTS.WATER_THRESHOLD) / 40) * 26,
          ) | 0;
        r = clampColorChannel(biomeColor.r + lift);
        g = clampColorChannel(biomeColor.g + lift);
        b = clampColorChannel(biomeColor.b + lift);
      }

      const pixelIndex = (sy * TERRAIN_SAMPLE_SIZE + sx) * 4;
      data[pixelIndex] = r;
      data[pixelIndex + 1] = g;
      data[pixelIndex + 2] = b;
      data[pixelIndex + 3] = 255;
    }

    if (sy % 10 === 9) {
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
