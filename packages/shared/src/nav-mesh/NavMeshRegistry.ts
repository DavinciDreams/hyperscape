/**
 * Nav-mesh registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `nav-mesh.ts`.
 * Indexes authored agent profiles, modifier volumes, and jump links, and
 * surfaces voxelizer settings. Schema refinements guarantee unique ids
 * and valid `jumpLinks[].agentTag` references at load time.
 */

import {
  type NavAgentProfile,
  type NavJumpLink,
  type NavMeshManifest,
  NavMeshManifestSchema,
  type NavModifierVolume,
} from "@hyperforge/manifest-schema";

export class NavMeshNotLoadedError extends Error {
  constructor() {
    super("NavMeshRegistry used before load()");
    this.name = "NavMeshNotLoadedError";
  }
}

export class UnknownNavAgentError extends Error {
  readonly agentId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `nav agent "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownNavAgentError";
    this.agentId = id;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type NavMeshReloadListener = () => void;

export class NavMeshRegistry {
  private _manifest: NavMeshManifest | null = null;
  private _agentsById = new Map<string, NavAgentProfile>();
  private _modifiersById = new Map<string, NavModifierVolume>();
  private _jumpLinksById = new Map<string, NavJumpLink>();
  private _reloadListeners = new Set<NavMeshReloadListener>();

  constructor(manifest?: NavMeshManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NavMeshManifest): void {
    this._manifest = manifest;
    this._agentsById.clear();
    this._modifiersById.clear();
    this._jumpLinksById.clear();
    for (const a of manifest.agents) this._agentsById.set(a.id, a);
    for (const v of manifest.modifierVolumes) this._modifiersById.set(v.id, v);
    for (const j of manifest.jumpLinks) this._jumpLinksById.set(j.id, j);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: NavMeshReloadListener): () => void {
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
          "[navMeshRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(NavMeshManifestSchema.parse(raw));
  }

  get manifest(): NavMeshManifest {
    if (!this._manifest) throw new NavMeshNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get quality() {
    return this.manifest.quality;
  }

  get cellSize(): number {
    return this.manifest.cellSize;
  }

  get cellHeight(): number {
    return this.manifest.cellHeight;
  }

  get tileSizeVoxels(): number {
    return this.manifest.tileSizeVoxels;
  }

  get minRegionAreaSqMeters(): number {
    return this.manifest.minRegionAreaSqMeters;
  }

  get agents(): readonly NavAgentProfile[] {
    return this.manifest.agents;
  }

  get modifierVolumes(): readonly NavModifierVolume[] {
    return this.manifest.modifierVolumes;
  }

  get jumpLinks(): readonly NavJumpLink[] {
    return this.manifest.jumpLinks;
  }

  hasAgent(id: string): boolean {
    return this._agentsById.has(id);
  }

  agent(id: string): NavAgentProfile {
    const a = this._agentsById.get(id);
    if (!a) {
      throw new UnknownNavAgentError(id, Array.from(this._agentsById.keys()));
    }
    return a;
  }

  modifier(id: string): NavModifierVolume | undefined {
    return this._modifiersById.get(id);
  }

  jumpLink(id: string): NavJumpLink | undefined {
    return this._jumpLinksById.get(id);
  }

  /** Jump links that apply to a given agent (by id or area tag it declares). */
  jumpLinksForAgent(agentId: string): NavJumpLink[] {
    const agent = this._agentsById.get(agentId);
    if (!agent) return [];
    const tags = new Set<string>([agent.id, ...agent.areaTags]);
    return this.manifest.jumpLinks.filter(
      (j) => j.agentTag === undefined || tags.has(j.agentTag),
    );
  }
}
