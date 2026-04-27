/**
 * Prefab registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `prefab.ts`.
 * Indexes prefabs + instances, resolves per-entity override property
 * maps, and walks the nested-prefab DAG. Schema refinements guarantee
 * DAG-acyclicity and valid id references at load time.
 */

import {
  type Prefab,
  type PrefabEntity,
  type PrefabInstance,
  type PrefabManifest,
  PrefabManifestSchema,
  type PrefabPropertyValue,
} from "@hyperforge/manifest-schema";

export class PrefabNotLoadedError extends Error {
  constructor() {
    super("PrefabRegistry used before load()");
    this.name = "PrefabNotLoadedError";
  }
}

export class UnknownPrefabError extends Error {
  readonly prefabId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `prefab "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownPrefabError";
    this.prefabId = id;
  }
}

export class UnknownPrefabInstanceError extends Error {
  readonly instanceId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `prefab instance "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownPrefabInstanceError";
    this.instanceId = id;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PrefabReloadListener = () => void;

export class PrefabRegistry {
  private _manifest: PrefabManifest | null = null;
  private _prefabsById = new Map<string, Prefab>();
  private _instancesById = new Map<string, PrefabInstance>();
  private _reloadListeners = new Set<PrefabReloadListener>();

  constructor(manifest?: PrefabManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PrefabManifest): void {
    this._manifest = manifest;
    this._prefabsById.clear();
    this._instancesById.clear();
    for (const p of manifest.prefabs) this._prefabsById.set(p.id, p);
    for (const i of manifest.instances) this._instancesById.set(i.id, i);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PrefabManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PrefabReloadListener): () => void {
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
          "[prefabRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): PrefabManifest {
    if (!this._manifest) throw new PrefabNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get prefabs(): readonly Prefab[] {
    return this.manifest.prefabs;
  }

  get instances(): readonly PrefabInstance[] {
    return this.manifest.instances;
  }

  hasPrefab(id: string): boolean {
    return this._prefabsById.has(id);
  }

  prefab(id: string): Prefab {
    const p = this._prefabsById.get(id);
    if (!p) {
      throw new UnknownPrefabError(id, Array.from(this._prefabsById.keys()));
    }
    return p;
  }

  hasInstance(id: string): boolean {
    return this._instancesById.has(id);
  }

  instance(id: string): PrefabInstance {
    const i = this._instancesById.get(id);
    if (!i) {
      throw new UnknownPrefabInstanceError(
        id,
        Array.from(this._instancesById.keys()),
      );
    }
    return i;
  }

  /** Resolve a prefab's entity by localId; throws if missing. */
  entity(prefabId: string, localId: string): PrefabEntity {
    const p = this.prefab(prefabId);
    const e = p.entities.find((x) => x.localId === localId);
    if (!e) {
      throw new Error(
        `prefab "${prefabId}" has no entity with localId "${localId}". Known: ${p.entities
          .map((x) => x.localId)
          .join(", ")}`,
      );
    }
    return e;
  }

  /**
   * Effective properties for an instance's entity, merging the prefab
   * entity's defaults with any matching instance overrides.
   */
  effectiveProperties(
    instanceId: string,
    localId: string,
  ): Record<string, PrefabPropertyValue> {
    const inst = this.instance(instanceId);
    const entity = this.entity(inst.prefabId, localId);
    const out: Record<string, PrefabPropertyValue> = { ...entity.properties };
    for (const o of inst.overrides) {
      if (o.targetLocalId === localId) out[o.propertyName] = o.value;
    }
    return out;
  }

  /** Instances targeting a given prefabId. */
  instancesOf(prefabId: string): PrefabInstance[] {
    return this.manifest.instances.filter((i) => i.prefabId === prefabId);
  }
}
