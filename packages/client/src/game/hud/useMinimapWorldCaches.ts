import { useEffect, type MutableRefObject } from "react";
import type { ClientWorld } from "../../types";

export type MinimapRoad = {
  path: Array<{ x: number; z: number }>;
  width: number;
};

export type MinimapRoadWithAABB = MinimapRoad & {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type MinimapTown = {
  buildings: Array<{
    position: { x: number; z: number };
    size: { width: number; depth: number };
    rotation: number;
  }>;
};

function buildRoadsWithAABB(roads: MinimapRoad[]): MinimapRoadWithAABB[] {
  return roads.map((road) => {
    if (!road.path.length) {
      return { ...road, minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    }

    let minX = road.path[0].x;
    let maxX = road.path[0].x;
    let minZ = road.path[0].z;
    let maxZ = road.path[0].z;

    for (let index = 1; index < road.path.length; index += 1) {
      const point = road.path[index];
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    }

    return { ...road, minX, maxX, minZ, maxZ };
  });
}

interface UseMinimapWorldCachesOptions {
  world: ClientWorld;
  roadsCacheRef: MutableRefObject<MinimapRoad[] | null>;
  roadsWithAABBRef: MutableRefObject<MinimapRoadWithAABB[] | null>;
  townsCacheRef: MutableRefObject<MinimapTown[] | null>;
}

export function useMinimapWorldCaches({
  world,
  roadsCacheRef,
  roadsWithAABBRef,
  townsCacheRef,
}: UseMinimapWorldCachesOptions): void {
  useEffect(() => {
    if (!roadsCacheRef.current) {
      const roadSystem = world.getSystem("roads") as {
        getRoads?: () => MinimapRoad[];
      } | null;
      const roads = roadSystem?.getRoads?.();
      if (roads?.length) {
        roadsCacheRef.current = roads;
        roadsWithAABBRef.current = buildRoadsWithAABB(roads);
      }
    }

    if (!townsCacheRef.current) {
      const townSystem = world.getSystem("towns") as {
        getTowns?: () => MinimapTown[];
      } | null;
      const towns = townSystem?.getTowns?.();
      if (towns?.length) {
        townsCacheRef.current = towns;
      }
    }
  }, [roadsCacheRef, roadsWithAABBRef, townsCacheRef, world]);
}
