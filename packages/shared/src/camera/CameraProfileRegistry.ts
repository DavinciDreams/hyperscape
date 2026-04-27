/**
 * Camera profile registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `camera-profiles.ts`. Loads authored rigs (first-person,
 * third-person, top-down, orbit, free-fly), indexes them by id,
 * and exposes a lookup + rig-kind filter. The runtime camera
 * component applies a resolved profile's transforms + collision
 * + lag to the active camera each frame.
 *
 * Scope: pure logic. No deps on Three.js or ECS.
 */

import {
  type CameraProfile,
  type CameraProfilesManifest,
  CameraProfilesManifestSchema,
  type CameraRig,
} from "@hyperforge/manifest-schema";

export class UnknownCameraProfileError extends Error {
  readonly profileId: string;
  readonly availableIds: readonly string[];
  constructor(profileId: string, availableIds: readonly string[]) {
    super(
      `camera profile "${profileId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCameraProfileError";
    this.profileId = profileId;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CameraProfileReloadListener = () => void;

export class CameraProfileRegistry {
  private _byId = new Map<string, CameraProfile>();
  private _byKind = new Map<CameraRig["kind"], CameraProfile[]>();
  private _reloadListeners = new Set<CameraProfileReloadListener>();

  constructor(manifest?: CameraProfilesManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: CameraProfilesManifest): void {
    this._byId.clear();
    this._byKind.clear();
    for (const p of manifest) {
      this._byId.set(p.id, p);
      const arr = this._byKind.get(p.rig.kind) ?? [];
      arr.push(p);
      this._byKind.set(p.rig.kind, arr);
    }
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: CameraProfileReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[cameraProfileRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(CameraProfilesManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  get ids(): readonly string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): CameraProfile {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownCameraProfileError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  /** All profiles using a given rig kind, in manifest order. */
  forKind(kind: CameraRig["kind"]): readonly CameraProfile[] {
    return this._byKind.get(kind) ?? [];
  }

  /** Compute effective FOV given current move speed. */
  effectiveFovDegrees(profile: CameraProfile, moveSpeed: number): number {
    const { baseDegrees, speedWideningDegrees, speedRefForWidening } =
      profile.fov;
    if (speedWideningDegrees <= 0 || speedRefForWidening <= 0) {
      return baseDegrees;
    }
    if (!Number.isFinite(moveSpeed) || moveSpeed < 0) {
      throw new TypeError(
        `moveSpeed must be a non-negative finite number (got ${String(moveSpeed)})`,
      );
    }
    const t = Math.min(moveSpeed / speedRefForWidening, 1);
    return baseDegrees + speedWideningDegrees * t;
  }
}
