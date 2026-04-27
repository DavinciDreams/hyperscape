/**
 * Factions registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `factions.ts`.
 * Pure logic: faction lookup, reputation tier resolution by standing
 * value, pairwise disposition resolution (defaults to neutral), and
 * mutually-exclusive rep propagation.
 */

import {
  type Faction,
  type FactionDisposition,
  type FactionRelationship,
  type FactionsManifest,
  type ReputationTier,
  FactionsManifestSchema,
} from "@hyperforge/manifest-schema";

export class FactionsNotLoadedError extends Error {
  constructor() {
    super("FactionsRegistry used before load()");
    this.name = "FactionsNotLoadedError";
  }
}

export class UnknownFactionError extends Error {
  readonly factionId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `faction "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownFactionError";
    this.factionId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type FactionsReloadListener = () => void;

export class FactionsRegistry {
  private _manifest: FactionsManifest | null = null;
  private _byId = new Map<string, Faction>();
  private _reloadListeners = new Set<FactionsReloadListener>();

  constructor(manifest?: FactionsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: FactionsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const f of manifest.factions) this._byId.set(f.id, f);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(FactionsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: FactionsReloadListener): () => void {
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
          "[factionsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): FactionsManifest {
    if (!this._manifest) throw new FactionsNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Faction {
    const f = this._byId.get(id);
    if (!f) {
      throw new UnknownFactionError(id, Array.from(this._byId.keys()));
    }
    return f;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  playerJoinable(): Faction[] {
    return Array.from(this._byId.values()).filter((f) => f.playerJoinable);
  }

  /** Resolve the tier for a standing value (tier.min ≤ standing < tier.max). */
  tierForStanding(factionId: string, standing: number): ReputationTier {
    const f = this.get(factionId);
    for (const t of f.tiers) {
      if (standing >= t.minStanding && standing < t.maxStanding) return t;
    }
    // standing is guaranteed by schema to fall within *some* tier when
    // viewed as startingStanding, but at runtime it can drift out of
    // the authored window; clamp to nearest tier.
    const sorted = [...f.tiers].sort((a, b) => a.minStanding - b.minStanding);
    if (standing < sorted[0]!.minStanding) return sorted[0]!;
    return sorted[sorted.length - 1]!;
  }

  /**
   * Disposition between two factions. Defaults to 'neutral' when no
   * explicit relationship exists. Order of args doesn't matter.
   */
  disposition(
    a: string,
    b: string,
  ): { disposition: FactionDisposition; mutuallyExclusiveRep: boolean } {
    if (a === b) {
      return { disposition: "allied", mutuallyExclusiveRep: false };
    }
    const rel = this.manifest.relationships.find(
      (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
    );
    if (!rel) return { disposition: "neutral", mutuallyExclusiveRep: false };
    return {
      disposition: rel.disposition,
      mutuallyExclusiveRep: rel.mutuallyExclusiveRep,
    };
  }

  relationships(): readonly FactionRelationship[] {
    return this.manifest.relationships;
  }

  /** All relationships mentioning this faction (either side). */
  relationshipsFor(factionId: string): FactionRelationship[] {
    return this.manifest.relationships.filter(
      (r) => r.a === factionId || r.b === factionId,
    );
  }

  /**
   * Apply a standing delta to `factionId`, returning a map of
   * {factionId → delta} after cascading mutually-exclusive relationships.
   * Positive delta on A yields negative delta on mutually-exclusive
   * partners, and vice versa.
   */
  propagateStandingDelta(
    factionId: string,
    delta: number,
  ): Map<string, number> {
    const out = new Map<string, number>();
    out.set(factionId, (out.get(factionId) ?? 0) + delta);
    for (const r of this.relationshipsFor(factionId)) {
      if (!r.mutuallyExclusiveRep) continue;
      const other = r.a === factionId ? r.b : r.a;
      out.set(other, (out.get(other) ?? 0) - delta);
    }
    return out;
  }
}
