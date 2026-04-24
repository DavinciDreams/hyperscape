/**
 * Plugin catalog.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `plugin.ts`.
 * Stores a collection of plugin manifests (each authored as its
 * own `plugin.json`) indexed by id, and provides the pure-logic
 * helpers the `PluginLoader` needs: id lookup, dep-graph traversal,
 * load-order resolution (topological sort respecting `dependencies`
 * and `loadAfter`).
 *
 * The registry itself does not execute plugins — that's the loader's
 * job. This layer exists so the editor's Plugin Browser and the
 * runtime loader can share one source of truth without each
 * reparsing `plugin.json` files.
 */

import {
  type PluginManifest,
  PluginManifestSchema,
} from "@hyperforge/manifest-schema";

export class PluginCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginCatalogError";
  }
}

export class UnknownPluginError extends Error {
  readonly pluginId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `plugin "${id}" not found in catalog. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPluginError";
    this.pluginId = id;
    this.availableIds = availableIds;
  }
}

export class PluginDependencyCycleError extends Error {
  readonly cycle: readonly string[];
  constructor(cycle: readonly string[]) {
    super(`plugin dependency cycle: ${cycle.join(" -> ")}`);
    this.name = "PluginDependencyCycleError";
    this.cycle = cycle;
  }
}

export class PluginCatalog {
  private _byId = new Map<string, PluginManifest>();

  constructor(plugins: readonly PluginManifest[] = []) {
    for (const p of plugins) this.addPlugin(p);
  }

  /** Add a plugin manifest. Throws on duplicate id. */
  addPlugin(plugin: PluginManifest): void {
    if (this._byId.has(plugin.id)) {
      throw new PluginCatalogError(
        `duplicate plugin id "${plugin.id}" in catalog`,
      );
    }
    this._byId.set(plugin.id, plugin);
  }

  addFromJson(raw: unknown): void {
    this.addPlugin(PluginManifestSchema.parse(raw));
  }

  /** Remove a plugin by id; returns true if it existed. */
  remove(id: string): boolean {
    return this._byId.delete(id);
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): PluginManifest {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownPluginError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  plugins(): readonly PluginManifest[] {
    return Array.from(this._byId.values());
  }

  /**
   * Resolve the declared hard-dependency ids for a plugin. Excludes
   * optional dependencies. Missing ids are still returned — callers
   * decide whether to treat as fatal.
   */
  hardDependencyIds(id: string): string[] {
    const p = this.get(id);
    return p.dependencies.filter((d) => !d.optional).map((d) => d.id);
  }

  /** Returns the ids of any declared hard dependencies not in the catalog. */
  missingHardDependencies(id: string): string[] {
    return this.hardDependencyIds(id).filter((d) => !this._byId.has(d));
  }

  /**
   * Topological load order over all plugins in the catalog.
   *
   * Edges come from `dependencies` (hard deps must load first) and
   * `loadAfter` (soft ordering). Missing edge targets are skipped.
   * Throws `PluginDependencyCycleError` on a cycle.
   *
   * Ordering inside a level is id-alphabetical for determinism.
   */
  loadOrder(): PluginManifest[] {
    const ids = Array.from(this._byId.keys()).sort();
    const visited = new Map<string, "gray" | "black">();
    const stack: string[] = [];
    const out: PluginManifest[] = [];

    const visit = (id: string): void => {
      const state = visited.get(id);
      if (state === "black") return;
      if (state === "gray") {
        const cycleStart = stack.indexOf(id);
        const cycle =
          cycleStart >= 0 ? [...stack.slice(cycleStart), id] : [...stack, id];
        throw new PluginDependencyCycleError(cycle);
      }
      visited.set(id, "gray");
      stack.push(id);
      const p = this._byId.get(id);
      if (p) {
        const deps = [
          ...p.dependencies.filter((d) => !d.optional).map((d) => d.id),
          ...p.loadAfter,
        ];
        for (const dep of deps) {
          if (this._byId.has(dep)) visit(dep);
        }
      }
      stack.pop();
      visited.set(id, "black");
      if (p) out.push(p);
    };

    for (const id of ids) visit(id);
    return out;
  }
}
