/**
 * Editor-snap registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `editor-snap.ts`.
 * Pure logic: snap-value application — the core `snap(n, step)` used
 * by the editor's transform gizmo when `snapByDefault` is active or
 * when the user is holding the snap modifier.
 */

import {
  type EditorSnapManifest,
  type GizmoSettings,
  type GridSnap,
  type SurfaceSnap,
  EditorSnapManifestSchema,
} from "@hyperforge/manifest-schema";

export class EditorSnapNotLoadedError extends Error {
  constructor() {
    super("EditorSnapRegistry used before load()");
    this.name = "EditorSnapNotLoadedError";
  }
}

/** Quantize `value` to the nearest multiple of `step`. */
export function snapToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type EditorSnapReloadListener = () => void;

export class EditorSnapRegistry {
  private _manifest: EditorSnapManifest | null = null;
  private _reloadListeners = new Set<EditorSnapReloadListener>();

  constructor(manifest?: EditorSnapManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: EditorSnapManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(EditorSnapManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: EditorSnapReloadListener): () => void {
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
          "[editorSnapRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): EditorSnapManifest {
    if (!this._manifest) throw new EditorSnapNotLoadedError();
    return this._manifest;
  }

  get grid(): GridSnap {
    return this.manifest.grid;
  }

  get surface(): SurfaceSnap {
    return this.manifest.surface;
  }

  get gizmo(): GizmoSettings {
    return this.manifest.gizmo;
  }

  get snapByDefault(): boolean {
    return this.manifest.snapByDefault;
  }

  /**
   * Should snapping be active given the user's current modifier state?
   * - `snapByDefault=true`: active unless the user holds the snap key to disable
   * - `snapByDefault=false`: active only when the user holds the snap key
   */
  isActive(snapKeyDown: boolean): boolean {
    return this.snapByDefault !== snapKeyDown;
  }

  snapTranslation(value: number): number {
    return snapToStep(value, this.grid.translate);
  }

  snapRotationDeg(value: number): number {
    return snapToStep(value, this.grid.rotate);
  }

  snapScale(value: number): number {
    return snapToStep(value, this.grid.scale);
  }
}
