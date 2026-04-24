/**
 * World areas registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `world-areas.ts`.
 * Indexes the hand-authored area catalog by id, exposes bounds-based point
 * containment, and surfaces aggregate accessors (all NPCs, all spawns, all
 * stations) plus category-scoped iteration.
 */

import {
  type WorldArea,
  type WorldAreaMobSpawn,
  type WorldAreaNPC,
  type WorldAreaStation,
  type WorldAreasManifest,
  WorldAreasManifestSchema,
} from "@hyperforge/manifest-schema";

export class WorldAreasNotLoadedError extends Error {
  constructor() {
    super("WorldAreasRegistry used before load()");
    this.name = "WorldAreasNotLoadedError";
  }
}

export class UnknownWorldAreaError extends Error {
  readonly areaId: string;
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `world area "${id}" not found. Known ids (sample): ${
        availableIds.slice(0, 8).join(", ") || "(none)"
      }`,
    );
    this.name = "UnknownWorldAreaError";
    this.areaId = id;
  }
}

export type WorldAreaCategoryKey =
  | "starterTowns"
  | "level1Areas"
  | "level2Areas"
  | "level3Areas"
  | "specialAreas";

const CATEGORY_KEYS: readonly WorldAreaCategoryKey[] = [
  "starterTowns",
  "level1Areas",
  "level2Areas",
  "level3Areas",
  "specialAreas",
];

interface IndexedArea {
  readonly area: WorldArea;
  readonly category: WorldAreaCategoryKey;
}

export class WorldAreasRegistry {
  private _manifest: WorldAreasManifest | null = null;
  private _byId = new Map<string, IndexedArea>();

  constructor(manifest?: WorldAreasManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: WorldAreasManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const category of CATEGORY_KEYS) {
      const record = manifest[category];
      for (const [areaId, area] of Object.entries(record)) {
        if (this._byId.has(areaId)) {
          throw new Error(
            `world area id collision: "${areaId}" appears in multiple categories`,
          );
        }
        this._byId.set(areaId, { area, category });
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(WorldAreasManifestSchema.parse(raw));
  }

  get manifest(): WorldAreasManifest {
    if (!this._manifest) throw new WorldAreasNotLoadedError();
    return this._manifest;
  }

  /**
   * Non-throwing check for consumers that want to prefer the registry
   * when a manifest has been loaded (e.g. PIE editor push) and fall
   * back to a legacy static constant otherwise.
   */
  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state (`isLoaded()` returns
   * `false`, all reads behave as if no manifest was ever loaded).
   *
   * The module-level `worldAreasRegistry` singleton is shared across
   * the test process; integration tests that exercise the
   * registry-or-fallback branch in consumer systems need a way to
   * restore the unloaded baseline between tests. Don't call this from
   * production code — production should always go through `load()`.
   */
  _unloadForTests(): void {
    this._manifest = null;
    this._byId.clear();
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): WorldArea {
    const indexed = this._byId.get(id);
    if (!indexed) throw new UnknownWorldAreaError(id, this.ids);
    return indexed.area;
  }

  categoryOf(id: string): WorldAreaCategoryKey {
    const indexed = this._byId.get(id);
    if (!indexed) throw new UnknownWorldAreaError(id, this.ids);
    return indexed.category;
  }

  byCategory(category: WorldAreaCategoryKey): WorldArea[] {
    return Object.values(this.manifest[category]);
  }

  all(): WorldArea[] {
    return Array.from(this._byId.values()).map((v) => v.area);
  }

  /** AABB point-in-area test in world XZ. */
  contains(areaId: string, x: number, z: number): boolean {
    const { bounds } = this.get(areaId);
    return (
      x >= bounds.minX &&
      x <= bounds.maxX &&
      z >= bounds.minZ &&
      z <= bounds.maxZ
    );
  }

  /** First area (iteration order) whose bounds contain `[x, z]`, or null. */
  areaAt(x: number, z: number): WorldArea | null {
    for (const { area } of this._byId.values()) {
      const b = area.bounds;
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return area;
    }
    return null;
  }

  allNPCs(): WorldAreaNPC[] {
    const out: WorldAreaNPC[] = [];
    for (const { area } of this._byId.values()) {
      if (area.npcs) out.push(...area.npcs);
    }
    return out;
  }

  allMobSpawns(): WorldAreaMobSpawn[] {
    const out: WorldAreaMobSpawn[] = [];
    for (const { area } of this._byId.values()) {
      if (area.mobSpawns) out.push(...area.mobSpawns);
    }
    return out;
  }

  allStations(): WorldAreaStation[] {
    const out: WorldAreaStation[] = [];
    for (const { area } of this._byId.values()) {
      if (area.stations) out.push(...area.stations);
    }
    return out;
  }

  isSafeZone(areaId: string): boolean {
    return this.get(areaId).safeZone;
  }
}
