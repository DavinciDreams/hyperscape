/**
 * World config registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `world-config.ts`.
 * Surfaces world-generation parameters (terrain sizing, town counts/sizes,
 * road smoothing, POI quotas, difficulty-tier heatmap, default spawn,
 * death settings, teleport network) behind typed accessors.
 */

import {
  type TownSize,
  type WorldConfigManifest,
  WorldConfigManifestSchema,
  type ZoneTier,
} from "@hyperforge/manifest-schema";

export class WorldConfigNotLoadedError extends Error {
  constructor() {
    super("WorldConfigRegistry used before load()");
    this.name = "WorldConfigNotLoadedError";
  }
}

export class UnknownTownSizeError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(`unknown town size "${key}" — expected hamlet|village|town|city`);
    this.name = "UnknownTownSizeError";
    this.key = key;
  }
}

export type TownSizeKey = "hamlet" | "village" | "town" | "city";

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type WorldConfigReloadListener = () => void;

export class WorldConfigRegistry {
  private _manifest: WorldConfigManifest | null = null;
  private _reloadListeners = new Set<WorldConfigReloadListener>();

  constructor(manifest?: WorldConfigManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WorldConfigManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(WorldConfigManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: WorldConfigReloadListener): () => void {
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
          "[worldConfigRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): WorldConfigManifest {
    if (!this._manifest) throw new WorldConfigNotLoadedError();
    return this._manifest;
  }

  get terrain() {
    return this.manifest.terrain;
  }

  get towns() {
    return this.manifest.towns;
  }

  get roads() {
    return this.manifest.roads;
  }

  get pois() {
    return this.manifest.pois;
  }

  get zoneGeneration() {
    return this.manifest.zoneGeneration;
  }

  get defaultSpawn() {
    return this.manifest.defaultSpawn;
  }

  get deathSettings() {
    return this.manifest.deathSettings;
  }

  get boundaryMarkers() {
    return this.manifest.boundaryMarkers;
  }

  get docks() {
    return this.manifest.docks;
  }

  get teleportNetwork() {
    return this.manifest.teleportNetwork;
  }

  townSize(key: TownSizeKey): TownSize {
    const sizes = this.towns.sizes;
    const s = sizes[key];
    if (!s) throw new UnknownTownSizeError(key);
    return s;
  }

  /** Number of POIs to spawn of a given category; 0 if unconfigured. */
  poiCount(category: string): number {
    return this.pois.counts[category] ?? 0;
  }

  /**
   * Resolves a difficulty-tier for a 0..1 heatmap scalar by linear scan.
   * Returns the first tier whose `scalarRange` contains the value, or `null`
   * if none match (caller decides fallback).
   */
  tierForScalar(scalar: number): ZoneTier | null {
    for (const tier of this.zoneGeneration.tiers) {
      const [lo, hi] = tier.scalarRange;
      if (scalar >= lo && scalar <= hi) return tier;
    }
    return null;
  }
}
