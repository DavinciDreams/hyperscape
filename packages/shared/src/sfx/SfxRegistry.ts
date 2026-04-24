/**
 * SFX registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `sfx.ts`. Pure
 * logic: indexes sound effects by id, exposes resolution + cullable
 * budgeting + pitch-variance sampling. No audio node creation — the
 * caller decides what to do with the resolved cue.
 */

import {
  type SoundCategory,
  type SoundEffect,
  type SoundEffectManifest,
  SoundEffectManifestSchema,
} from "@hyperforge/manifest-schema";

export interface ResolveOptions {
  /** Multiplier applied on top of the cue's authored volume. */
  volumeScale?: number;
  /** Deterministic sampler for pitch variance — defaults to Math.random. */
  rng?: () => number;
}

export interface ResolvedSound {
  id: string;
  name: string;
  category: SoundCategory;
  path: string;
  /** Final gain to send to the mixer, in [0..1]. */
  volume: number;
  /** Final pitch multiplier — 1.0 = no change. */
  pitch: number;
  duration: number;
  cullable: boolean;
}

export class UnknownSoundError extends Error {
  readonly soundId: string;
  readonly availableIds: readonly string[];
  constructor(soundId: string, availableIds: readonly string[]) {
    super(
      `sfx "${soundId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownSoundError";
    this.soundId = soundId;
    this.availableIds = availableIds;
  }
}

export class SfxRegistry {
  private _byId = new Map<string, SoundEffect>();

  constructor(manifest?: SoundEffectManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SoundEffectManifest): void {
    this._byId.clear();
    for (const s of manifest) this._byId.set(s.id, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(SoundEffectManifestSchema.parse(raw));
  }

  get size(): number {
    return this._byId.size;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a sfx manifest has been loaded and fall back to hardcoded
   * audio defaults otherwise. Symmetric with
   * `WorldAreasRegistry.isLoaded()`.
   */
  isLoaded(): boolean {
    return this._byId.size > 0;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): SoundEffect {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownSoundError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  byCategory(category: SoundCategory): SoundEffect[] {
    const out: SoundEffect[] = [];
    for (const s of this._byId.values()) {
      if (s.category === category) out.push(s);
    }
    return out;
  }

  /**
   * Resolve a playable cue — combines authored volume, optional scale,
   * and a pitch drawn from the cue's variance band.
   */
  resolve(id: string, opts: ResolveOptions = {}): ResolvedSound {
    const cue = this.get(id);
    const scale = opts.volumeScale ?? 1;
    if (scale < 0 || !Number.isFinite(scale)) {
      throw new TypeError(
        `volumeScale must be a non-negative finite number (got ${String(scale)})`,
      );
    }
    const rng = opts.rng ?? Math.random;
    // pitchVariance is specified in ± "semitones" (0..1 fraction). Map
    // into a pitch multiplier: 1 semitone ≈ 2^(1/12) ≈ 1.0595. A
    // variance of `v` draws a symmetric offset in [-v..+v] semitones.
    const offsetSemi = (rng() * 2 - 1) * cue.pitchVariance;
    const pitch = Math.pow(2, offsetSemi / 12);
    return {
      id: cue.id,
      name: cue.name,
      category: cue.category,
      path: cue.path,
      volume: Math.min(1, Math.max(0, cue.volume * scale)),
      pitch,
      duration: cue.duration,
      cullable: cue.cullable,
    };
  }
}
