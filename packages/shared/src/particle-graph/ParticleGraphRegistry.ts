/**
 * Particle-graph registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `particle-graph.ts`. Indexes particle systems by id and provides
 * discriminant-filtered accessors so the runtime compiler can pull,
 * e.g., all `color-over-life` updaters from a system's update list
 * without repeatedly walking the array.
 *
 * Schema refinements guarantee:
 *   - unique system ids
 *   - every system has at least one velocity initializer
 *   - every emitter produces particles (rate > 0 or burstCount > 0)
 */

import {
  type ParticleGraphManifest,
  ParticleGraphManifestSchema,
  type ParticleInitializer,
  type ParticleRenderer,
  type ParticleSystem,
  type ParticleUpdater,
} from "@hyperforge/manifest-schema";

export class ParticleGraphNotLoadedError extends Error {
  constructor() {
    super("ParticleGraphRegistry used before load()");
    this.name = "ParticleGraphNotLoadedError";
  }
}

export class UnknownParticleSystemError extends Error {
  readonly systemId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `particle system "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownParticleSystemError";
    this.systemId = id;
  }
}

export type ParticleInitializerKind = ParticleInitializer["kind"];
export type ParticleUpdaterKind = ParticleUpdater["kind"];
export type ParticleRendererKind = ParticleRenderer["kind"];

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ParticleGraphReloadListener = () => void;

export class ParticleGraphRegistry {
  private _manifest: ParticleGraphManifest | null = null;
  private _byId = new Map<string, ParticleSystem>();
  private _reloadListeners = new Set<ParticleGraphReloadListener>();

  constructor(manifest?: ParticleGraphManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ParticleGraphManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest) this._byId.set(s.id, s);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ParticleGraphReloadListener): () => void {
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
          "[particleGraphRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(ParticleGraphManifestSchema.parse(raw));
  }

  get manifest(): ParticleGraphManifest {
    if (!this._manifest) throw new ParticleGraphNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get all(): readonly ParticleSystem[] {
    return this.manifest;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): ParticleSystem {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownParticleSystemError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  rendererKindOf(id: string): ParticleRendererKind {
    return this.get(id).renderer.kind;
  }

  initializersOfKind<K extends ParticleInitializerKind>(
    id: string,
    kind: K,
  ): Extract<ParticleInitializer, { kind: K }>[] {
    return this.get(id).initializers.filter(
      (i): i is Extract<ParticleInitializer, { kind: K }> => i.kind === kind,
    );
  }

  updatersOfKind<K extends ParticleUpdaterKind>(
    id: string,
    kind: K,
  ): Extract<ParticleUpdater, { kind: K }>[] {
    return this.get(id).updaters.filter(
      (u): u is Extract<ParticleUpdater, { kind: K }> => u.kind === kind,
    );
  }

  /**
   * True if the system can emit indefinitely — either `systemLifetimeSec`
   * is 0 (no limit) or `loop` is true (loops within its limit). Runtime
   * uses this to decide whether to pool or one-shot.
   */
  isContinuous(id: string): boolean {
    const e = this.get(id).emitter;
    return e.systemLifetimeSec === 0 || e.loop;
  }
}
