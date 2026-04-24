/**
 * Post-process volume compositor.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `post-process-volumes.ts`. Given a world-space point (usually
 * the active camera), evaluates every enabled volume, computes a
 * per-volume blend weight including fade-in across
 * `blendDistanceMeters`, and returns the stacked override set.
 *
 * Composition model (priority-desc, weight-budgeted):
 *
 *   remaining = 1
 *   for volume in activeVolumesByPriorityDesc:
 *     w = min(volume.weight, remaining)
 *     if w <= 0: break
 *     result = blend(result, volume.overrides, w)
 *     remaining -= w
 *
 * This keeps `unbounded` volumes (priority-lowest by convention)
 * as a global fallback while higher-priority overlapping volumes
 * eat the weight budget first.
 *
 * Scope: pure logic. Returns a partial `PostProcessOverrides`
 * object — the renderer binds non-undefined fields onto the
 * composed render-profile state.
 */

import {
  type PostProcessOverrides,
  type PostProcessVolume,
  type PostProcessVolumeManifest,
  PostProcessVolumeManifestSchema,
} from "@hyperforge/manifest-schema";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ActiveVolume {
  volume: PostProcessVolume;
  /** Proximity-adjusted blend weight [0..1]. */
  weight: number;
}

type ColorRGB = { r: number; g: number; b: number };

const OVERRIDE_FIELDS: readonly (keyof PostProcessOverrides)[] = [
  "exposureBiasStops",
  "bloomThreshold",
  "bloomStrength",
  "fogDensity",
  "fogColor",
  "saturation",
  "contrast",
  "vignette",
  "chromaticAberration",
];

export class PostProcessVolumeCompositor {
  private _volumes: PostProcessVolume[] = [];
  private _loaded = false;

  constructor(manifest?: PostProcessVolumeManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PostProcessVolumeManifest): void {
    // Clone into a mutable array so we can sort without mutating the
    // manifest. Authored order is preserved as the tie-break when
    // two volumes share priority.
    this._volumes = manifest.slice();
    this._loaded = true;
  }

  loadFromJson(raw: unknown): void {
    this.load(PostProcessVolumeManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._loaded;
  }

  get size(): number {
    return this._volumes.length;
  }

  /**
   * Compute the per-volume blend weight at `point` for a single
   * volume. 0 = outside the fade region; 1 = fully inside.
   */
  private _weightFor(v: PostProcessVolume, point: Vec3): number {
    if (!v.enabled) return 0;
    const shape = v.shape;
    let insideDistance = 0;
    if (shape.kind === "unbounded") {
      return v.blendWeight;
    }
    if (shape.kind === "sphere") {
      const dx = point.x - shape.center.x;
      const dy = point.y - shape.center.y;
      const dz = point.z - shape.center.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= shape.radius) return v.blendWeight;
      insideDistance = dist - shape.radius;
    } else {
      // aabb
      const clamped = {
        x: Math.max(shape.min.x, Math.min(shape.max.x, point.x)),
        y: Math.max(shape.min.y, Math.min(shape.max.y, point.y)),
        z: Math.max(shape.min.z, Math.min(shape.max.z, point.z)),
      };
      const dx = point.x - clamped.x;
      const dy = point.y - clamped.y;
      const dz = point.z - clamped.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist === 0) return v.blendWeight;
      insideDistance = dist;
    }
    if (v.blendDistanceMeters <= 0) return 0;
    if (insideDistance >= v.blendDistanceMeters) return 0;
    const t = 1 - insideDistance / v.blendDistanceMeters;
    return v.blendWeight * t;
  }

  /** All volumes contributing at `point`, priority-desc (then manifest order). */
  resolveAt(point: Vec3): readonly ActiveVolume[] {
    const out: ActiveVolume[] = [];
    for (const v of this._volumes) {
      const w = this._weightFor(v, point);
      if (w > 0) out.push({ volume: v, weight: w });
    }
    // Stable sort by priority-desc.
    out.sort((a, b) => b.volume.priority - a.volume.priority);
    return out;
  }

  /**
   * Blend active volume overrides at `point`. Returns a partial
   * overrides object — fields only appear if at least one active
   * volume set them.
   */
  composeOverrides(point: Vec3): PostProcessOverrides {
    const active = this.resolveAt(point);
    const result: PostProcessOverrides = {};
    const coverage: Record<string, number> = Object.create(null);
    let remaining = 1;
    for (const { volume, weight } of active) {
      if (remaining <= 0) break;
      const w = Math.min(weight, remaining);
      if (w <= 0) continue;
      for (const key of OVERRIDE_FIELDS) {
        const incoming = volume.overrides[key];
        if (incoming === undefined) continue;
        const prev = result[key];
        const prevCoverage = coverage[key] ?? 0;
        if (prev === undefined) {
          // First volume to set this field — apply at full `w` weight.
          assignField(result, key, incoming);
          coverage[key] = w;
          continue;
        }
        // Blend: scale w back into the existing coverage so the sum
        // matches priority-descend expectations.
        const totalCov = prevCoverage + w;
        const alpha = w / totalCov;
        if (key === "fogColor") {
          const prevColor = prev as ColorRGB;
          const nextColor = incoming as ColorRGB;
          const blended: ColorRGB = {
            r: lerp(prevColor.r, nextColor.r, alpha),
            g: lerp(prevColor.g, nextColor.g, alpha),
            b: lerp(prevColor.b, nextColor.b, alpha),
          };
          result.fogColor = blended;
        } else {
          const prevNum = prev as number;
          const nextNum = incoming as number;
          assignField(result, key, lerp(prevNum, nextNum, alpha));
        }
        coverage[key] = totalCov;
      }
      remaining -= w;
    }
    return result;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function assignField<K extends keyof PostProcessOverrides>(
  result: PostProcessOverrides,
  key: K,
  value: NonNullable<PostProcessOverrides[K]>,
): void {
  // Re-narrow via an index-signature assignment so the blended union
  // (number | ColorRGB) stays aligned with the field type.
  (result as Record<string, unknown>)[key] = value;
}
