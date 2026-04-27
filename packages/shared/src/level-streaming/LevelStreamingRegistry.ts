/**
 * Level streaming registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `level-streaming.ts`.
 * Indexes sublevels by id and surfaces topological load order via DFS
 * over the `dependsOn` graph. Schema refinements guarantee acyclic
 * dependencies and valid id references at load time.
 */

import {
  type LevelStreamingManifest,
  LevelStreamingManifestSchema,
  type StreamPolicy,
  type Sublevel,
} from "@hyperforge/manifest-schema";

export class LevelStreamingNotLoadedError extends Error {
  constructor() {
    super("LevelStreamingRegistry used before load()");
    this.name = "LevelStreamingNotLoadedError";
  }
}

export class UnknownSublevelError extends Error {
  readonly sublevelId: string;
  constructor(id: string, available: readonly string[]) {
    super(
      `sublevel "${id}" not found. Known: ${
        available.length > 0 ? available.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownSublevelError";
    this.sublevelId = id;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type LevelStreamingReloadListener = () => void;

export class LevelStreamingRegistry {
  private _manifest: LevelStreamingManifest | null = null;
  private _byId = new Map<string, Sublevel>();
  private _reloadListeners = new Set<LevelStreamingReloadListener>();

  constructor(manifest?: LevelStreamingManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LevelStreamingManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest) this._byId.set(s.id, s);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(LevelStreamingManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: LevelStreamingReloadListener): () => void {
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
          "[levelStreamingRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  get manifest(): LevelStreamingManifest {
    if (!this._manifest) throw new LevelStreamingNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): Sublevel {
    const s = this._byId.get(id);
    if (!s) throw new UnknownSublevelError(id, this.ids);
    return s;
  }

  all(): readonly Sublevel[] {
    return this.manifest;
  }

  /** Sublevels whose policy matches the given value. */
  byPolicy(policy: StreamPolicy): Sublevel[] {
    return this.manifest.filter((s) => s.policy === policy);
  }

  /** Sublevels tagged with `tag`. */
  byTag(tag: string): Sublevel[] {
    return this.manifest.filter((s) => s.tags.includes(tag));
  }

  /**
   * Topological load order via post-order DFS over `dependsOn`. Schema
   * refinements guarantee the graph is acyclic, so no cycle check here.
   */
  loadOrder(): Sublevel[] {
    const visited = new Set<string>();
    const out: Sublevel[] = [];
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this._byId.get(id);
      if (!node) return;
      for (const dep of node.dependsOn) visit(dep);
      out.push(node);
    };
    const sortedIds = Array.from(this._byId.keys()).sort();
    for (const id of sortedIds) visit(id);
    return out;
  }
}
