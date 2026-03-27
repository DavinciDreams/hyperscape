/**
 * Shared dissolve animation state machine used by both GLBTreeInstancer
 * and GLBTreeBatchedInstancer. Keeps the tick logic, constants, and
 * cleanup in one place so the two instancers stay in sync.
 */

import { GPU_VEG_CONFIG } from "./GPUMaterials";

const DISSOLVE_DURATION = GPU_VEG_CONFIG.DISSOLVE_DURATION;
const DISSOLVE_MAX = GPU_VEG_CONFIG.DISSOLVE_MAX;

export interface DissolveAnim {
  /** 1 = dissolving out, -1 = appearing in */
  direction: 1 | -1;
  progress: number;
}

/** Reused across ticks to avoid per-frame allocation */
const _completed: string[] = [];

/**
 * Start or instantly apply a dissolve.
 *
 * @param anims   The animation map to manage
 * @param applyFn Callback that writes the dissolve value to the rendering backend
 */
export function startDissolve(
  anims: Map<string, DissolveAnim>,
  entityId: string,
  direction: 1 | -1,
  instant: boolean,
  applyFn: (entityId: string, value: number) => void,
): void {
  if (instant) {
    const target = direction > 0 ? DISSOLVE_MAX : 0.0;
    applyFn(entityId, target);
    anims.delete(entityId);
    return;
  }
  const current = direction > 0 ? 0.0 : DISSOLVE_MAX;
  applyFn(entityId, current);
  anims.set(entityId, { direction, progress: current });
}

/**
 * Advance all active dissolve animations by deltaTime and apply values.
 * Completed animations are removed from the map.
 */
export function tickDissolveAnims(
  anims: Map<string, DissolveAnim>,
  deltaTime: number,
  applyFn: (entityId: string, value: number) => void,
): void {
  _completed.length = 0;
  for (const [entityId, anim] of anims) {
    anim.progress += (anim.direction * deltaTime) / DISSOLVE_DURATION;
    anim.progress = Math.max(0, Math.min(DISSOLVE_MAX, anim.progress));
    applyFn(entityId, anim.progress);
    if (
      (anim.direction > 0 && anim.progress >= DISSOLVE_MAX) ||
      (anim.direction < 0 && anim.progress <= 0)
    ) {
      _completed.push(entityId);
    }
  }
  for (const id of _completed) anims.delete(id);
}
