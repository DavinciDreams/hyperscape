/**
 * Arena layout registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `arena-layout.ts`. Singleton holding the duel arena complex's
 * geometry: arena grid, lobby, hospital, lobby spawn point. Also
 * derives per-arena spawn positions and axis-aligned zone bounds.
 */

import {
  type ArenaBuilding,
  type ArenaGrid,
  type ArenaLayoutManifest,
  type ArenaLobbySpawn,
  ArenaLayoutManifestSchema,
} from "@hyperforge/manifest-schema";

export class ArenaLayoutNotLoadedError extends Error {
  constructor() {
    super("ArenaLayoutRegistry used before load()");
    this.name = "ArenaLayoutNotLoadedError";
  }
}

export class ArenaIndexOutOfRangeError extends Error {
  readonly arenaIndex: number;
  readonly count: number;
  constructor(arenaIndex: number, count: number) {
    super(`arena index ${arenaIndex} out of range (0..${count - 1})`);
    this.name = "ArenaIndexOutOfRangeError";
    this.arenaIndex = arenaIndex;
    this.count = count;
  }
}

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ArenaLayoutReloadListener = () => void;

export class ArenaLayoutRegistry {
  private _manifest: ArenaLayoutManifest | null = null;
  private _reloadListeners = new Set<ArenaLayoutReloadListener>();

  constructor(manifest?: ArenaLayoutManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ArenaLayoutManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(ArenaLayoutManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ArenaLayoutReloadListener): () => void {
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
          "[arenaLayoutRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ArenaLayoutManifest {
    if (!this._manifest) throw new ArenaLayoutNotLoadedError();
    return this._manifest;
  }

  get arenaGrid(): ArenaGrid {
    return this.manifest.arenaGrid;
  }

  get lobby(): ArenaBuilding {
    return this.manifest.lobby;
  }

  get hospital(): ArenaBuilding {
    return this.manifest.hospital;
  }

  get lobbySpawn(): ArenaLobbySpawn {
    return this.manifest.lobbySpawn;
  }

  get arenaCount(): number {
    return this.arenaGrid.count;
  }

  /** Center of arena tile `i` in world space. */
  arenaCenter(i: number): { x: number; y: number; z: number } {
    const g = this.arenaGrid;
    if (i < 0 || i >= g.count) {
      throw new ArenaIndexOutOfRangeError(i, g.count);
    }
    const col = i % g.columns;
    const row = Math.floor(i / g.columns);
    const stepX = g.width + g.gap;
    const stepZ = g.length + g.gap;
    return {
      x: g.baseX + col * stepX + g.width / 2,
      y: g.baseY,
      z: g.baseZ + row * stepZ + g.length / 2,
    };
  }

  /** Axis-aligned bounds for arena tile `i`. */
  arenaBounds(i: number): ZoneBounds {
    const g = this.arenaGrid;
    const center = this.arenaCenter(i);
    return {
      minX: center.x - g.width / 2,
      maxX: center.x + g.width / 2,
      minZ: center.z - g.length / 2,
      maxZ: center.z + g.length / 2,
    };
  }

  buildingBounds(b: ArenaBuilding): ZoneBounds {
    return {
      minX: b.centerX - b.width / 2,
      maxX: b.centerX + b.width / 2,
      minZ: b.centerZ - b.length / 2,
      maxZ: b.centerZ + b.length / 2,
    };
  }

  lobbyBounds(): ZoneBounds {
    return this.buildingBounds(this.lobby);
  }

  hospitalBounds(): ZoneBounds {
    return this.buildingBounds(this.hospital);
  }
}
