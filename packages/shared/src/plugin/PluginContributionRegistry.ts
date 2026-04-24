/**
 * Plugin contribution registry.
 *
 * Pure-logic substrate for the "editor API" seam described in the
 * Phase I plan (Step 12): plugins contribute palette categories,
 * toolbar tools, manifest editors, widgets, entity schemas, systems,
 * and commands into caller-owned registries, and the editor renders
 * from whatever has been registered.
 *
 * Every contribution kind follows the same ownership rule:
 *   - each item has a globally unique `id`
 *   - each item belongs to exactly one plugin
 *   - a plugin can retract its whole bundle atomically (used by
 *     scope-tracked teardown during `onDisable`)
 *
 * Rather than copy-paste seven near-identical registries, we ship
 * one generic container with an `identify(item)` extractor. Callers
 * write:
 *
 *   const paletteCategories =
 *     new PluginContributionRegistry<PaletteCategory>(
 *       (c) => c.id,
 *       "paletteCategory",
 *     );
 *
 * and then plug its `register`/`unregister` methods into the
 * per-plugin context that `PluginHost` produces.
 *
 * No DOM, no React, no `World`. 100% test-coverable.
 */

/** Extract the canonical globally-unique id from a contribution. */
export type ContributionIdentifier<TItem> = (item: TItem) => string;

export class DuplicateContributionIdError extends Error {
  readonly kind: string;
  readonly id: string;
  readonly existingPluginId: string;
  readonly incomingPluginId: string;
  constructor(
    kind: string,
    id: string,
    existingPluginId: string,
    incomingPluginId: string,
  ) {
    super(
      `${kind} "${id}" already registered by plugin "${existingPluginId}"; ` +
        `plugin "${incomingPluginId}" cannot re-register the same id`,
    );
    this.name = "DuplicateContributionIdError";
    this.kind = kind;
    this.id = id;
    this.existingPluginId = existingPluginId;
    this.incomingPluginId = incomingPluginId;
  }
}

export class UnknownContributionIdError extends Error {
  readonly kind: string;
  readonly id: string;
  constructor(kind: string, id: string) {
    super(`no ${kind} registered with id "${id}"`);
    this.name = "UnknownContributionIdError";
    this.kind = kind;
    this.id = id;
  }
}

/**
 * Single entry in the registry. Plain object so snapshots can be
 * shipped across workers / serialized to devtools.
 */
export interface ContributionRecord<TItem> {
  readonly pluginId: string;
  readonly item: TItem;
}

export class PluginContributionRegistry<TItem> {
  /** Human-readable kind name used in error messages. */
  private readonly _kind: string;
  private readonly _identify: ContributionIdentifier<TItem>;
  /** id → record (globally unique). */
  private readonly _byId = new Map<string, ContributionRecord<TItem>>();
  /** pluginId → ordered ids contributed by that plugin. */
  private readonly _byPlugin = new Map<string, string[]>();

  constructor(identify: ContributionIdentifier<TItem>, kind = "contribution") {
    this._identify = identify;
    this._kind = kind;
  }

  get kind(): string {
    return this._kind;
  }

  get size(): number {
    return this._byId.size;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  /**
   * Register a single item on behalf of `pluginId`. Throws
   * `DuplicateContributionIdError` if the id is already taken.
   */
  register(pluginId: string, item: TItem): void {
    const id = this._identify(item);
    const existing = this._byId.get(id);
    if (existing) {
      throw new DuplicateContributionIdError(
        this._kind,
        id,
        existing.pluginId,
        pluginId,
      );
    }
    this._byId.set(id, { pluginId, item });
    let ids = this._byPlugin.get(pluginId);
    if (!ids) {
      ids = [];
      this._byPlugin.set(pluginId, ids);
    }
    ids.push(id);
  }

  /**
   * Convenience: register an array of items in order. If any item
   * collides, prior registrations in the same call stay — caller
   * owns deciding whether to roll back via `unregisterAllForPlugin`.
   */
  registerAll(pluginId: string, items: readonly TItem[]): void {
    for (const item of items) {
      this.register(pluginId, item);
    }
  }

  /** Remove a single item by id. Throws if unknown. */
  unregister(id: string): void {
    const existing = this._byId.get(id);
    if (!existing) {
      throw new UnknownContributionIdError(this._kind, id);
    }
    this._byId.delete(id);
    const ids = this._byPlugin.get(existing.pluginId);
    if (ids) {
      const idx = ids.indexOf(id);
      if (idx >= 0) ids.splice(idx, 1);
      if (ids.length === 0) this._byPlugin.delete(existing.pluginId);
    }
  }

  /**
   * Atomic teardown used by scope-tracked disposers: remove every
   * item registered by `pluginId`. No-op when the plugin has
   * nothing registered.
   */
  unregisterAllForPlugin(pluginId: string): void {
    const ids = this._byPlugin.get(pluginId);
    if (!ids) return;
    for (const id of ids) this._byId.delete(id);
    this._byPlugin.delete(pluginId);
  }

  /** Fetch the item by id. Throws if unknown. */
  get(id: string): TItem {
    const existing = this._byId.get(id);
    if (!existing) {
      throw new UnknownContributionIdError(this._kind, id);
    }
    return existing.item;
  }

  /** Ids contributed by `pluginId`, preserving registration order. */
  idsForPlugin(pluginId: string): readonly string[] {
    return this._byPlugin.get(pluginId) ?? [];
  }

  /** All records in registration order (insertion order of the Map). */
  records(): readonly ContributionRecord<TItem>[] {
    return Array.from(this._byId.values());
  }

  /**
   * Grouped snapshot: `{ pluginId: [item, item, ...] }`. Handy for
   * editor panels that render sections per plugin.
   */
  groupedByPlugin(): Record<string, readonly TItem[]> {
    const out: Record<string, TItem[]> = {};
    for (const [pluginId, ids] of this._byPlugin.entries()) {
      out[pluginId] = ids.map((id) => this._byId.get(id)!.item);
    }
    return out;
  }
}
