/**
 * VFX registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `vfx.ts`.
 * Pure logic: indexes effects by id, samples lifetime curves, and
 * exposes resolved spawn data (color, scale, duration, blend, sfx).
 * No Three.js / particle system coupling — caller owns rendering.
 */

import {
  type VfxBlendMode,
  type VfxCurve,
  type VfxEffect,
  type VfxKind,
  type VfxManifest,
  VfxManifestSchema,
} from "@hyperforge/manifest-schema";

export class UnknownVfxError extends Error {
  readonly vfxId: string;
  readonly availableIds: readonly string[];
  constructor(vfxId: string, availableIds: readonly string[]) {
    super(
      `vfx "${vfxId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownVfxError";
    this.vfxId = vfxId;
    this.availableIds = availableIds;
  }
}

export interface ResolvedVfxSpawn {
  id: string;
  name: string;
  kind: VfxKind;
  asset: string;
  duration: number;
  color: number;
  glowIntensity: number;
  scale: number;
  sfxId?: string;
  blendMode: VfxBlendMode;
  attachToSource: boolean;
  cullable: boolean;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type VfxReloadListener = () => void;

export class VfxRegistry {
  private _byId = new Map<string, VfxEffect>();
  private _reloadListeners = new Set<VfxReloadListener>();

  constructor(manifest?: VfxManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: VfxManifest): void {
    this._byId.clear();
    for (const e of manifest) this._byId.set(e.id, e);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(VfxManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: VfxReloadListener): () => void {
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
          "[vfxRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get size(): number {
    return this._byId.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a vfx manifest has been loaded and fall back to hardcoded
   * vfx defaults otherwise. Symmetric with
   * `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): VfxEffect {
    const e = this._byId.get(id);
    if (!e) {
      throw new UnknownVfxError(id, Array.from(this._byId.keys()));
    }
    return e;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byKind(kind: VfxKind): VfxEffect[] {
    const out: VfxEffect[] = [];
    for (const e of this._byId.values()) {
      if (e.kind === kind) out.push(e);
    }
    return out;
  }

  resolve(id: string): ResolvedVfxSpawn {
    const e = this.get(id);
    const res: ResolvedVfxSpawn = {
      id: e.id,
      name: e.name,
      kind: e.kind,
      asset: e.asset,
      duration: e.duration,
      color: e.color,
      glowIntensity: e.glowIntensity,
      scale: e.scale,
      blendMode: e.blendMode,
      attachToSource: e.attachToSource,
      cullable: e.cullable,
    };
    if (e.sfxId) res.sfxId = e.sfxId;
    return res;
  }

  /**
   * Sample the alpha-over-life curve at normalized time `t∈[0..1]`.
   * Returns 1 if the effect has no `alphaOverLife` curve.
   */
  sampleAlpha(id: string, t: number): number {
    const curve = this.get(id).alphaOverLife;
    if (!curve) return 1;
    return sampleCurve(curve, t);
  }

  /**
   * Sample the scale-over-life curve at normalized time `t∈[0..1]`.
   * Returns 1 if the effect has no `scaleOverLife` curve.
   */
  sampleScale(id: string, t: number): number {
    const curve = this.get(id).scaleOverLife;
    if (!curve) return 1;
    return sampleCurve(curve, t);
  }
}

/** Linear interpolation between sorted anchors. */
export function sampleCurve(curve: VfxCurve, t: number): number {
  if (!Number.isFinite(t)) {
    throw new TypeError(`t must be finite (got ${String(t)})`);
  }
  const anchors = [...curve.anchors].sort((a, b) => a.t - b.t);
  const tc = Math.min(1, Math.max(0, t));
  if (tc <= anchors[0].t) return anchors[0].value;
  const last = anchors[anchors.length - 1];
  if (tc >= last.t) return last.value;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (tc >= a.t && tc <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return a.value;
      const f = (tc - a.t) / span;
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}
