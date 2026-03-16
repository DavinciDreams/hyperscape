/**
 * Shared position normalization utility for streaming duel managers.
 *
 * Extracted to avoid duplication between DuelOrchestrator and CameraDirector.
 */

/**
 * Normalize a position value (array or object) into a [x, y, z] tuple.
 * Returns null if the value cannot be parsed into valid finite coordinates.
 */
export function normalizePosition(
  position: unknown,
): [number, number, number] | null {
  if (Array.isArray(position) && position.length >= 3) {
    const x = Number(position[0]);
    const y = Number(position[1]);
    const z = Number(position[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      return [x, Number.isFinite(y) ? y : 0, z];
    }
    return null;
  }

  if (position && typeof position === "object") {
    const pos = position as { x?: number; y?: number; z?: number };
    if (Number.isFinite(pos.x) && Number.isFinite(pos.z)) {
      return [pos.x as number, Number(pos.y ?? 0), pos.z as number];
    }
  }

  return null;
}
