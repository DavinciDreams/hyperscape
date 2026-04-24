/**
 * Physics config registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `physics-config.ts`.
 * Indexes authored physics materials + collision layers, and resolves
 * the interaction kind for any unordered (layerA, layerB) pair via a
 * sparse matrix + `defaultInteraction` fallback.
 *
 * Scope: distinct from `packages/shared/src/physics/` which houses the
 * PhysX runtime integration. This registry is the data-driven config
 * shape consumed by that runtime.
 */

import {
  type CollisionLayer,
  type LayerInteractionKind,
  type PhysicsConfigManifest,
  PhysicsConfigManifestSchema,
  type PhysicsMaterial,
} from "@hyperforge/manifest-schema";

export class PhysicsConfigNotLoadedError extends Error {
  constructor() {
    super("PhysicsConfigRegistry used before load()");
    this.name = "PhysicsConfigNotLoadedError";
  }
}

export class UnknownPhysicsMaterialError extends Error {
  readonly materialId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `physics material "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownPhysicsMaterialError";
    this.materialId = id;
  }
}

export class UnknownCollisionLayerError extends Error {
  readonly layerId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `collision layer "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownCollisionLayerError";
    this.layerId = id;
  }
}

function pairKey(a: string, b: string): string {
  // Unordered pair — canonicalize so pairKey("x","y") == pairKey("y","x").
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export class PhysicsConfigRegistry {
  private _manifest: PhysicsConfigManifest | null = null;
  private _materialsById = new Map<string, PhysicsMaterial>();
  private _layersById = new Map<string, CollisionLayer>();
  private _matrix = new Map<string, LayerInteractionKind>();

  constructor(manifest?: PhysicsConfigManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PhysicsConfigManifest): void {
    this._manifest = manifest;
    this._materialsById.clear();
    this._layersById.clear();
    this._matrix.clear();
    for (const m of manifest.materials) this._materialsById.set(m.id, m);
    for (const l of manifest.layers) this._layersById.set(l.id, l);
    for (const e of manifest.matrix)
      this._matrix.set(pairKey(e.a, e.b), e.kind);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  loadFromJson(raw: unknown): void {
    this.load(PhysicsConfigManifestSchema.parse(raw));
  }

  get manifest(): PhysicsConfigManifest {
    if (!this._manifest) throw new PhysicsConfigNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get defaultInteraction(): LayerInteractionKind {
    return this.manifest.defaultInteraction;
  }

  get materials(): readonly PhysicsMaterial[] {
    return this.manifest.materials;
  }

  get layers(): readonly CollisionLayer[] {
    return this.manifest.layers;
  }

  hasMaterial(id: string): boolean {
    return this._materialsById.has(id);
  }

  material(id: string): PhysicsMaterial {
    const m = this._materialsById.get(id);
    if (!m) {
      throw new UnknownPhysicsMaterialError(
        id,
        Array.from(this._materialsById.keys()),
      );
    }
    return m;
  }

  /** Fallback material resolved via `defaultMaterialId`, or `null` if unset. */
  defaultMaterial(): PhysicsMaterial | null {
    const id = this.manifest.defaultMaterialId;
    return id !== undefined ? this.material(id) : null;
  }

  hasLayer(id: string): boolean {
    return this._layersById.has(id);
  }

  layer(id: string): CollisionLayer {
    const l = this._layersById.get(id);
    if (!l) {
      throw new UnknownCollisionLayerError(
        id,
        Array.from(this._layersById.keys()),
      );
    }
    return l;
  }

  /**
   * Resolve the interaction kind for an unordered (a, b) pair. If no
   * explicit matrix entry exists, returns `defaultInteraction`.
   */
  interactionFor(a: string, b: string): LayerInteractionKind {
    return this._matrix.get(pairKey(a, b)) ?? this.defaultInteraction;
  }
}
