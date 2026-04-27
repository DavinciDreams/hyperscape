/**
 * Cinematic / sequencer registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `cinematic.ts`.
 * Indexes cinematics by id, indexes tracks by id within each
 * cinematic, and provides kind-filtered track accessors so the
 * runtime sequencer can pull all `event` tracks, all `camera`
 * tracks, etc. without a linear scan.
 *
 * Schema-level refinements guarantee:
 *   - unique cinematic ids across the manifest
 *   - unique track ids within each cinematic
 *   - track keyframes/events/clips are time-ordered
 *   - every track's last time is <= its cinematic's `durationSec`
 */

import {
  type Cinematic,
  type CinematicManifest,
  CinematicManifestSchema,
  type CinematicTrack,
} from "@hyperforge/manifest-schema";

export class CinematicNotLoadedError extends Error {
  constructor() {
    super("CinematicRegistry used before load()");
    this.name = "CinematicNotLoadedError";
  }
}

export class UnknownCinematicError extends Error {
  readonly cinematicId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `cinematic "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownCinematicError";
    this.cinematicId = id;
  }
}

export class UnknownCinematicTrackError extends Error {
  readonly cinematicId: string;
  readonly trackId: string;
  constructor(
    cinematicId: string,
    trackId: string,
    available: readonly string[],
  ) {
    super(
      `cinematic "${cinematicId}" has no track "${trackId}". Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownCinematicTrackError";
    this.cinematicId = cinematicId;
    this.trackId = trackId;
  }
}

export type CinematicTrackKind = CinematicTrack["kind"];

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CinematicReloadListener = () => void;

export class CinematicRegistry {
  private _manifest: CinematicManifest | null = null;
  private _byId = new Map<string, Cinematic>();
  private _tracksByCinematic = new Map<string, Map<string, CinematicTrack>>();
  private _reloadListeners = new Set<CinematicReloadListener>();

  constructor(manifest?: CinematicManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: CinematicManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    this._tracksByCinematic.clear();
    for (const c of manifest) {
      this._byId.set(c.id, c);
      const tracks = new Map<string, CinematicTrack>();
      for (const t of c.tracks) tracks.set(t.id, t);
      this._tracksByCinematic.set(c.id, tracks);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(CinematicManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: CinematicReloadListener): () => void {
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
          "[cinematicRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): CinematicManifest {
    if (!this._manifest) throw new CinematicNotLoadedError();
    return this._manifest;
  }

  get all(): readonly Cinematic[] {
    return this.manifest;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Cinematic {
    const c = this._byId.get(id);
    if (!c) {
      throw new UnknownCinematicError(id, Array.from(this._byId.keys()));
    }
    return c;
  }

  /** Track by id within a cinematic. Throws if either id is unknown. */
  track(cinematicId: string, trackId: string): CinematicTrack {
    const cin = this.get(cinematicId);
    const tracks = this._tracksByCinematic.get(cinematicId);
    const t = tracks?.get(trackId);
    if (!t) {
      throw new UnknownCinematicTrackError(
        cinematicId,
        trackId,
        cin.tracks.map((x) => x.id),
      );
    }
    return t;
  }

  /** All tracks of a given kind within a cinematic. */
  tracksOfKind<K extends CinematicTrackKind>(
    cinematicId: string,
    kind: K,
  ): Extract<CinematicTrack, { kind: K }>[] {
    return this.get(cinematicId).tracks.filter(
      (t): t is Extract<CinematicTrack, { kind: K }> => t.kind === kind,
    );
  }

  /** Total duration of a cinematic in seconds. */
  durationOf(cinematicId: string): number {
    return this.get(cinematicId).durationSec;
  }
}
