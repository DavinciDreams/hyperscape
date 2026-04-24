/**
 * Loading-screens registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `loading-screens.ts`.
 * Pure logic: slate lookup + weighted selection filtered by zone/trigger.
 */

import {
  type FadeRules,
  type LoadingScreensManifest,
  type LoadingSlate,
  type LoadingTrigger,
  LoadingScreensManifestSchema,
} from "@hyperforge/manifest-schema";

export class LoadingScreensNotLoadedError extends Error {
  constructor() {
    super("LoadingScreensRegistry used before load()");
    this.name = "LoadingScreensNotLoadedError";
  }
}

export class UnknownLoadingSlateError extends Error {
  readonly slateId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `loading slate "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownLoadingSlateError";
    this.slateId = id;
    this.availableIds = availableIds;
  }
}

export interface SlateSelectionContext {
  readonly zoneId?: string;
  readonly trigger?: LoadingTrigger;
}

export class LoadingScreensRegistry {
  private _manifest: LoadingScreensManifest | null = null;
  private _byId = new Map<string, LoadingSlate>();

  constructor(manifest?: LoadingScreensManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: LoadingScreensManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest.slates) this._byId.set(s.id, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(LoadingScreensManifestSchema.parse(raw));
  }

  get manifest(): LoadingScreensManifest {
    if (!this._manifest) throw new LoadingScreensNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get showTips(): boolean {
    return this.manifest.showTips;
  }

  get showProgressBar(): boolean {
    return this.manifest.showProgressBar;
  }

  get fades(): FadeRules {
    return this.manifest.fades;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  slate(id: string): LoadingSlate {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownLoadingSlateError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  /** Slates matching zone+trigger filters (empty arrays on slate = any). */
  candidates(ctx: SlateSelectionContext): LoadingSlate[] {
    return this.manifest.slates.filter((s) => {
      if (ctx.zoneId !== undefined && s.zoneIds.length > 0) {
        if (!s.zoneIds.includes(ctx.zoneId)) return false;
      }
      if (ctx.trigger !== undefined && s.triggers.length > 0) {
        if (!s.triggers.includes(ctx.trigger)) return false;
      }
      return true;
    });
  }

  /**
   * Weighted-random pick among `candidates(ctx)`. Falls back to the
   * default slate id if no candidate matches. Returns `undefined` if
   * neither a candidate nor the default resolves.
   *
   * `rand` is a `() => number` in [0, 1); injectable for determinism.
   */
  pick(
    ctx: SlateSelectionContext,
    rand: () => number = Math.random,
  ): LoadingSlate | undefined {
    const pool = this.candidates(ctx);
    if (pool.length === 0) {
      if (this.manifest.defaultSlateId) {
        return this._byId.get(this.manifest.defaultSlateId);
      }
      return undefined;
    }
    const total = pool.reduce((acc, s) => acc + s.selectionWeight, 0);
    if (total <= 0) {
      // All weights zero → first candidate as stable pick.
      return pool[0];
    }
    const roll = rand() * total;
    let running = 0;
    for (const s of pool) {
      running += s.selectionWeight;
      if (roll < running) return s;
    }
    // Floating-point slack: fall back to last candidate.
    return pool[pool.length - 1];
  }
}
