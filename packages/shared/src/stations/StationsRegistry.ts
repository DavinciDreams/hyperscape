/**
 * Stations registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `stations.ts`.
 * Indexes world station definitions (anvils, furnaces, ranges,
 * banks) by station `type` and resolves footprint dimensions from
 * either authored override or the model-bounds auto-calc pipeline.
 */

import {
  type ModelBoundsEntry,
  type ModelBoundsManifest,
  ModelBoundsManifestSchema,
  type StationFootprintSpec,
  type StationManifestEntry,
  type StationsManifest,
  StationsManifestSchema,
} from "@hyperforge/manifest-schema";

export class StationsNotLoadedError extends Error {
  constructor() {
    super("StationsRegistry used before load()");
    this.name = "StationsNotLoadedError";
  }
}

export class UnknownStationError extends Error {
  readonly stationType: string;
  readonly availableTypes: readonly string[];
  constructor(type: string, availableTypes: readonly string[]) {
    super(
      `station "${type}" not found. Known types: ${
        availableTypes.length > 0 ? availableTypes.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownStationError";
    this.stationType = type;
    this.availableTypes = availableTypes;
  }
}

/** Listener invoked after every successful `loadStations()` / `loadBounds()`. */
export type StationsReloadListener = () => void;

export class StationsRegistry {
  private _stations: StationsManifest | null = null;
  private _bounds: ModelBoundsManifest | null = null;
  private _byType = new Map<string, StationManifestEntry>();
  private _boundsById = new Map<string, ModelBoundsEntry>();
  private _reloadListeners = new Set<StationsReloadListener>();

  constructor(stations?: StationsManifest, bounds?: ModelBoundsManifest) {
    if (stations) this.loadStations(stations);
    if (bounds) this.loadBounds(bounds);
  }

  loadStations(manifest: StationsManifest): void {
    this._stations = manifest;
    this._byType.clear();
    for (const s of manifest.stations) this._byType.set(s.type, s);
    this._emitReloaded();
  }

  loadStationsFromJson(raw: unknown): void {
    this.loadStations(StationsManifestSchema.parse(raw));
  }

  loadBounds(manifest: ModelBoundsManifest): void {
    this._bounds = manifest;
    this._boundsById.clear();
    for (const m of manifest.models) this._boundsById.set(m.id, m);
    this._emitReloaded();
  }

  loadBoundsFromJson(raw: unknown): void {
    this.loadBounds(ModelBoundsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `loadStations()` / `loadBounds()`. Returns an
   * unsubscribe function. Listener throws are caught + logged.
   *
   * Used by PIE / Studio editor session UI consumers that want to
   * re-render when the stations or model-bounds manifests hot-reload.
   * Pattern matches `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: StationsReloadListener): () => void {
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
          "[stationsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get stationsManifest(): StationsManifest {
    if (!this._stations) throw new StationsNotLoadedError();
    return this._stations;
  }

  get modelBoundsManifest(): ModelBoundsManifest | undefined {
    return this._bounds ?? undefined;
  }

  get types(): string[] {
    return Array.from(this._byType.keys());
  }

  has(type: string): boolean {
    return this._byType.has(type);
  }

  get(type: string): StationManifestEntry {
    const s = this._byType.get(type);
    if (!s) throw new UnknownStationError(type, this.types);
    return s;
  }

  boundsFor(id: string): ModelBoundsEntry | undefined {
    return this._boundsById.get(id);
  }

  /**
   * Resolve a station's authored footprint, falling back to the
   * model-bounds entry (scaled by the station's `modelScale` and
   * ceiled to integer tiles). Returns `undefined` when neither a
   * manual override nor a bounds entry is available.
   */
  footprintFor(type: string): StationFootprintSpec | undefined {
    const station = this.get(type);
    if (station.footprint) return station.footprint;
    const bounds = this._boundsById.get(type);
    if (!bounds) return undefined;
    const scale = station.modelScale;
    return {
      width: Math.max(1, Math.ceil(bounds.footprint.width * scale)),
      depth: Math.max(1, Math.ceil(bounds.footprint.depth * scale)),
    };
  }
}
