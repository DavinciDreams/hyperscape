/**
 * RiverUtils — pure math utilities for river distance/projection queries.
 *
 * All functions are stateless and allocation-free on the hot path.
 * Used by both TerrainHeightParams (height carving) and WaterBodyRegistry
 * (water surface lookups).
 */

import type { RiverDefinition } from "./RiverDefinition";

/** Result of projecting a point onto the nearest river segment. */
export interface RiverProjection {
  /** Index of the nearest segment (waypoint[segIdx] → waypoint[segIdx+1]) */
  segIdx: number;
  /** Parameter along the segment [0,1] */
  t: number;
  /** Perpendicular distance from the point to the segment centerline */
  dist: number;
  /** Interpolated half-width at the projection point */
  halfWidth: number;
  /** Interpolated depth at the projection point */
  depth: number;
  /** Interpolated surfaceY at the projection point (NaN if not computed) */
  surfaceY: number;
}

/**
 * Pre-computed AABB per river segment for fast early rejection.
 * Includes padding for valley width + bermWidth.
 */
export interface RiverSegmentAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Compute AABB bounds for each river segment (with padding).
 * Call once at init, reuse for all queries.
 */
export function computeRiverSegmentAABBs(
  river: RiverDefinition,
): RiverSegmentAABB[] {
  const wps = river.waypoints;
  const aabbs: RiverSegmentAABB[] = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    // Pad by valley width (halfWidth * valleyMultiplier) + bermWidth
    const pad =
      Math.max(a.halfWidth, b.halfWidth) * river.valleyMultiplier +
      river.bermWidth;
    aabbs.push({
      minX: Math.min(a.x, b.x) - pad,
      maxX: Math.max(a.x, b.x) + pad,
      minZ: Math.min(a.z, b.z) - pad,
      maxZ: Math.max(a.z, b.z) + pad,
    });
  }
  return aabbs;
}

/**
 * Project a world point onto the closest river segment.
 * Returns null if the point is outside all segment AABBs (fast rejection).
 */
export function projectOntoRiver(
  worldX: number,
  worldZ: number,
  river: RiverDefinition,
  aabbs: RiverSegmentAABB[],
): RiverProjection | null {
  const wps = river.waypoints;
  let bestDist = Infinity;
  let bestSeg = -1;
  let bestT = 0;

  for (let i = 0; i < wps.length - 1; i++) {
    // AABB early rejection
    const bb = aabbs[i];
    if (
      worldX < bb.minX ||
      worldX > bb.maxX ||
      worldZ < bb.minZ ||
      worldZ > bb.maxZ
    ) {
      continue;
    }

    const ax = wps[i].x;
    const az = wps[i].z;
    const bx = wps[i + 1].x;
    const bz = wps[i + 1].z;

    // Project onto segment [A,B]: t = dot(P-A, B-A) / |B-A|^2, clamped to [0,1]
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq < 1e-6) continue; // degenerate segment

    let t = ((worldX - ax) * abx + (worldZ - az) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * abx;
    const projZ = az + t * abz;
    const dx = worldX - projX;
    const dz = worldZ - projZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < bestDist) {
      bestDist = dist;
      bestSeg = i;
      bestT = t;
    }
  }

  if (bestSeg < 0) return null;

  const a = wps[bestSeg];
  const b = wps[bestSeg + 1];

  return {
    segIdx: bestSeg,
    t: bestT,
    dist: bestDist,
    halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * bestT,
    depth: a.depth + (b.depth - a.depth) * bestT,
    surfaceY:
      a.surfaceY != null && b.surfaceY != null
        ? a.surfaceY + (b.surfaceY - a.surfaceY) * bestT
        : NaN,
  };
}

/**
 * Apply river channel carving to a terrain height value.
 *
 * Designed for natural, AAA-quality rivers. The channel is carved gently
 * into the landscape. Banks smoothly transition from channel floor back
 * to natural terrain with NO zone-boundary discontinuities.
 *
 * Two zones (from centerline outward):
 *   1. Channel (d < halfWidth): carved floor = surfaceY - depth
 *   2. Smoothed bank (halfWidth ≤ d < halfWidth + bankWidth + bermWidth):
 *      terrain forced to deterministic bank level near water (both raises
 *      low + lowers high terrain), smoothstep blend to natural terrain.
 *      Bank + berm merged into one continuous zone for consistency.
 *      surfaceY init samples bank terrain perpendicular to flow, so
 *      no hard raise cap is needed.
 */
export function applyRiverCarvingPure(
  height: number,
  worldX: number,
  worldZ: number,
  river: RiverDefinition,
  aabbs: RiverSegmentAABB[],
  maxHeight: number,
): number {
  const proj = projectOntoRiver(worldX, worldZ, river, aabbs);
  if (!proj) return height;

  const { dist, halfWidth, depth, surfaceY } = proj;
  if (isNaN(surfaceY)) return height;

  const bankWidth = halfWidth * (river.valleyMultiplier - 1); // bank extends this far beyond channel
  const totalWidth = halfWidth + bankWidth; // total influence radius
  const bermWidth = river.bermWidth;

  // Outside all influence
  if (dist > totalWidth + bermWidth) return height;

  const surfaceN = surfaceY / maxHeight;
  const depthN = depth / maxHeight;

  // --- Zone 1: Channel (underwater floor) ---
  if (dist < halfWidth) {
    // Cross-section profile: flat bottom (60%), smoothstep ramp on sides
    const flatZone = halfWidth * 0.6;
    let profile: number;
    if (dist <= flatZone) {
      profile = 1;
    } else {
      const t = (dist - flatZone) / (halfWidth - flatZone);
      profile = 1 - t * t * (3 - 2 * t); // smoothstep 1→0
    }
    // Floor = surfaceY - depth * profile. At center: full depth. At edge: surfaceY.
    const floorN = surfaceN - depthN * profile;
    // Only carve down, never raise
    if (floorN < height) {
      return floorN;
    }
    return height;
  }

  // --- Zone 2: Smoothed bank (bank + berm merged into single continuous zone) ---
  // Forces terrain to a deterministic bank level near the water edge (both
  // raises low terrain AND lowers high terrain), then smoothstep-blends back
  // to natural terrain at the outer edge. The full zone width (bankWidth +
  // bermWidth) provides wider, gentler transitions than separate zones.
  //
  // No hard raise cap — surfaceY init now samples bank terrain (perpendicular
  // to flow) so surfaceY already tracks the lowest cross-section height.
  // This eliminates shelves/plateaus from the old 2m cap.
  //
  // C0-continuous with Zone 1 at dist=halfWidth (both give surfaceN).
  const fullZoneWidth = bankWidth + bermWidth;
  const bankT = (dist - halfWidth) / fullZoneWidth; // 0 at water edge → 1 at outer
  const smooth = bankT * bankT * (3 - 2 * bankT); // smoothstep 0→1

  // Reference: gentle ramp from surfaceN upward (deterministic, no noise)
  const marginN = 0.5 / maxHeight; // 0.5m above water at outer edge
  const bankRef = surfaceN + marginN * bankT;

  // Blend: forced bank level (near water) → natural terrain (far from water)
  return bankRef + (height - bankRef) * smooth;
}

/**
 * Find the river center Z and halfWidth at a given world X coordinate.
 * Walks the waypoint list to find the segment containing x, interpolates.
 * Returns null if x is outside the river's X range.
 */
export function findRiverCenterAtX(
  x: number,
  river: RiverDefinition,
): { z: number; halfWidth: number } | null {
  const wps = river.waypoints;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    // Check if x falls within this segment's X range (works for both directions)
    if ((a.x <= x && x <= b.x) || (b.x <= x && x <= a.x)) {
      const dx = b.x - a.x;
      if (Math.abs(dx) < 1e-6) continue;
      const t = (x - a.x) / dx;
      return {
        z: a.z + (b.z - a.z) * t,
        halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * t,
      };
    }
  }
  return null;
}

/**
 * Build JS worker mirror of applyRiverCarvingPure().
 *
 * Injected into worker scope alongside applyLandscapeFeatures().
 * Depends on: riverFeatures (array), riverAABBs (array) in worker scope.
 */
export function buildApplyRiverCarvingJS(
  maxHeight: number,
  valleyMultiplier: number = 2.5,
  bermWidth: number = 4,
): string {
  return `
  function projectOntoRiverJS(worldX, worldZ) {
    if (!riverFeatures || riverFeatures.length === 0) return null;
    var wps = riverFeatures;
    var bestDist = Infinity;
    var bestSeg = -1;
    var bestT = 0;
    for (var i = 0; i < wps.length - 1; i++) {
      var bb = riverAABBs[i];
      if (worldX < bb.minX || worldX > bb.maxX || worldZ < bb.minZ || worldZ > bb.maxZ) continue;
      var ax = wps[i].x, az = wps[i].z;
      var bx = wps[i+1].x, bz = wps[i+1].z;
      var abx = bx - ax, abz = bz - az;
      var lenSq = abx * abx + abz * abz;
      if (lenSq < 1e-6) continue;
      var t = ((worldX - ax) * abx + (worldZ - az) * abz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      var projX = ax + t * abx, projZ = az + t * abz;
      var dx = worldX - projX, dz = worldZ - projZ;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; bestSeg = i; bestT = t; }
    }
    if (bestSeg < 0) return null;
    var a = wps[bestSeg], b = wps[bestSeg + 1];
    return {
      dist: bestDist,
      halfWidth: a.halfWidth + (b.halfWidth - a.halfWidth) * bestT,
      depth: a.depth + (b.depth - a.depth) * bestT,
      surfaceY: (a.surfaceY != null && b.surfaceY != null)
        ? a.surfaceY + (b.surfaceY - a.surfaceY) * bestT
        : NaN
    };
  }

  function applyRiverCarving(height, worldX, worldZ) {
    var proj = projectOntoRiverJS(worldX, worldZ);
    if (!proj) return height;
    var dist = proj.dist, halfWidth = proj.halfWidth, depth = proj.depth;
    var surfaceY = proj.surfaceY;
    if (surfaceY !== surfaceY) return height; // NaN check

    var valleyMul = ${valleyMultiplier};
    var bermW = ${bermWidth};
    var bankWidth = halfWidth * (valleyMul - 1);
    var totalWidth = halfWidth + bankWidth;
    if (dist > totalWidth + bermW) return height;

    var surfaceN = surfaceY / ${maxHeight};
    var depthN = depth / ${maxHeight};

    // Zone 1: Channel
    if (dist < halfWidth) {
      var flatZone = halfWidth * 0.6;
      var profile;
      if (dist <= flatZone) { profile = 1; }
      else {
        var t = (dist - flatZone) / (halfWidth - flatZone);
        profile = 1 - t * t * (3 - 2 * t);
      }
      var floorN = surfaceN - depthN * profile;
      if (floorN < height) return floorN;
      return height;
    }

    // Zone 2: Smoothed bank (merged bank + berm)
    var fullZoneWidth = bankWidth + bermW;
    var bankT = (dist - halfWidth) / fullZoneWidth;
    var smooth = bankT * bankT * (3 - 2 * bankT);
    var marginN = 0.5 / ${maxHeight};
    var bankRef = surfaceN + marginN * bankT;
    return bankRef + (height - bankRef) * smooth;
  }`;
}
