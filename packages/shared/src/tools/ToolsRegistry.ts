/**
 * Tools registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `tools.ts`.
 * Indexes gathering tools (hatchets, pickaxes, fishing gear) by
 * itemId and supports "best tool for this skill at this level"
 * resolution via (levelRequired, priority) ordering.
 */

import {
  type ToolEntry,
  type ToolsManifest,
  ToolsManifestSchema,
} from "@hyperforge/manifest-schema";

export type ToolSkill = ToolEntry["skill"];

export class ToolsNotLoadedError extends Error {
  constructor() {
    super("ToolsRegistry used before load()");
    this.name = "ToolsNotLoadedError";
  }
}

export class UnknownToolError extends Error {
  readonly itemId: string;
  readonly availableIds: readonly string[];
  constructor(itemId: string, availableIds: readonly string[]) {
    super(
      `tool "${itemId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownToolError";
    this.itemId = itemId;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type ToolsReloadListener = () => void;

export class ToolsRegistry {
  private _manifest: ToolsManifest | null = null;
  private _byItemId = new Map<string, ToolEntry>();
  private _reloadListeners = new Set<ToolsReloadListener>();

  constructor(manifest?: ToolsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ToolsManifest): void {
    this._manifest = manifest;
    this._byItemId.clear();
    for (const t of manifest) this._byItemId.set(t.itemId, t);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(ToolsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: ToolsReloadListener): () => void {
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
          "[toolsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ToolsManifest {
    if (!this._manifest) throw new ToolsNotLoadedError();
    return this._manifest;
  }

  get ids(): string[] {
    return Array.from(this._byItemId.keys());
  }

  has(itemId: string): boolean {
    return this._byItemId.has(itemId);
  }

  get(itemId: string): ToolEntry {
    const t = this._byItemId.get(itemId);
    if (!t) throw new UnknownToolError(itemId, this.ids);
    return t;
  }

  forSkill(skill: ToolSkill): ToolEntry[] {
    return this.manifest.filter((t) => t.skill === skill);
  }

  /** Tools a player of `playerLevel` can wield for a given skill. */
  usableAt(skill: ToolSkill, playerLevel: number): ToolEntry[] {
    return this.forSkill(skill).filter((t) => t.levelRequired <= playerLevel);
  }

  /**
   * Highest-priority usable tool the player already owns. Ties
   * resolved by `priority` (descending), then `levelRequired`
   * (descending) so a bronze→iron→steel ladder picks the strongest
   * eligible tool deterministically.
   */
  bestOwned(
    skill: ToolSkill,
    playerLevel: number,
    ownedItemIds: ReadonlySet<string>,
  ): ToolEntry | undefined {
    const eligible = this.usableAt(skill, playerLevel).filter((t) =>
      ownedItemIds.has(t.itemId),
    );
    if (eligible.length === 0) return undefined;
    eligible.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.levelRequired !== b.levelRequired) {
        return b.levelRequired - a.levelRequired;
      }
      return a.itemId.localeCompare(b.itemId);
    });
    return eligible[0];
  }
}
