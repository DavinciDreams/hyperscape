/**
 * WaterfallDefinition — detect waterfall positions along a river.
 *
 * A waterfall occurs where the river surfaceY drops significantly
 * over a short distance (steep gradient). These are visual-only
 * features rendered on the client.
 */

import type { RiverDefinition } from "./RiverDefinition";

export interface WaterfallDefinition {
  /** World X at the top of the falls */
  topX: number;
  /** World Z at the top of the falls */
  topZ: number;
  /** World X at the base of the falls */
  bottomX: number;
  /** World Z at the base of the falls */
  bottomZ: number;
  /** Water surface Y at the top */
  topY: number;
  /** Water surface Y at the bottom */
  bottomY: number;
  /** Width of the waterfall (interpolated river half-width × 2) */
  width: number;
  /** Height of the drop */
  height: number;
}

/**
 * Scan a river definition for waterfall locations.
 *
 * Walks along each segment sampling surfaceY at regular intervals.
 * Where the gradient exceeds minDropPerMeter, a waterfall is emitted.
 *
 * @param river       River with surfaceY set on all waypoints
 * @param minDrop     Minimum total elevation drop to qualify (meters)
 * @param sampleStep  Distance between samples along each segment (meters)
 */
export function computeWaterfalls(
  river: RiverDefinition,
  minDrop = 2.0,
  sampleStep = 2.0,
): WaterfallDefinition[] {
  const wps = river.waypoints;
  const results: WaterfallDefinition[] = [];

  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i];
    const b = wps[i + 1];
    if (a.surfaceY == null || b.surfaceY == null) continue;

    const segDx = b.x - a.x;
    const segDz = b.z - a.z;
    const segLen = Math.sqrt(segDx * segDx + segDz * segDz);
    if (segLen < 1) continue;

    const steps = Math.ceil(segLen / sampleStep);
    const dt = 1 / steps;

    // Track start of a steep section
    let fallStartT = -1;
    let fallStartY = 0;

    for (let s = 0; s <= steps; s++) {
      const t = Math.min(1, s * dt);
      const sy = a.surfaceY + (b.surfaceY - a.surfaceY) * t;

      if (fallStartT < 0) {
        // Not in a fall — check if next sample drops enough
        const nextT = Math.min(1, (s + 1) * dt);
        const nextSY = a.surfaceY + (b.surfaceY - a.surfaceY) * nextT;
        const dropRate = (sy - nextSY) / sampleStep;
        if (dropRate > 0.3) {
          // Start of a steep section (>0.3m drop per meter)
          fallStartT = t;
          fallStartY = sy;
        }
      } else {
        // In a fall — check if gradient has eased
        const prevT = Math.max(0, (s - 1) * dt);
        const prevSY = a.surfaceY + (b.surfaceY - a.surfaceY) * prevT;
        const dropRate = (prevSY - sy) / sampleStep;

        if (dropRate < 0.1 || s === steps) {
          // End of steep section
          const totalDrop = fallStartY - sy;
          if (totalDrop >= minDrop) {
            const topX = a.x + segDx * fallStartT;
            const topZ = a.z + segDz * fallStartT;
            const botX = a.x + segDx * t;
            const botZ = a.z + segDz * t;
            const hw =
              a.halfWidth +
              (b.halfWidth - a.halfWidth) * ((fallStartT + t) / 2);

            results.push({
              topX,
              topZ,
              bottomX: botX,
              bottomZ: botZ,
              topY: fallStartY,
              bottomY: sy,
              width: hw * 2,
              height: totalDrop,
            });
          }
          fallStartT = -1;
        }
      }
    }
  }

  return results;
}
