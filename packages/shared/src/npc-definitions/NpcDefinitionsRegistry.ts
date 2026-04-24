/**
 * NPC definitions registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `npc-definitions.ts` — the rich per-NPC catalog (stats, combat,
 * drops, dialogue, services, appearance).
 *
 * Distinct from `NpcSizesRegistry` (collision footprint only) and
 * `NpcScheduleRegistry` (spawning schedule). Those cover narrow
 * slices; this one is the canonical NPC definition catalog.
 *
 * Indexes by `id` for O(1) lookup. Mirrors the in-tree `ALL_NPCS`
 * Map shape so consumers can swap source via the
 * `getNPCById` registry-prefer wiring without changing call sites.
 */

import {
  type NpcDefinition,
  type NpcDefinitionsManifest,
  NpcDefinitionsManifestSchema,
} from "@hyperforge/manifest-schema";

export class NpcDefinitionsNotLoadedError extends Error {
  constructor() {
    super("NpcDefinitionsRegistry used before load()");
    this.name = "NpcDefinitionsNotLoadedError";
  }
}

export class UnknownNpcDefinitionError extends Error {
  readonly npcId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `npc definition "${id}" not found. Known ids (sample): ${
        availableIds.slice(0, 8).join(", ") || "(none loaded)"
      }`,
    );
    this.name = "UnknownNpcDefinitionError";
    this.npcId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type NpcDefinitionsReloadListener = () => void;

export class NpcDefinitionsRegistry {
  private _manifest: NpcDefinitionsManifest | null = null;
  private _byId = new Map<string, NpcDefinition>();
  private _reloadListeners = new Set<NpcDefinitionsReloadListener>();

  constructor(manifest?: NpcDefinitionsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: NpcDefinitionsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const npc of manifest) {
      if (this._byId.has(npc.id)) {
        throw new Error(`npc definition id collision: "${npc.id}"`);
      }
      this._byId.set(npc.id, npc);
    }
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(NpcDefinitionsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()` — both at server boot
   * (DataManager) and on PIE hot-reload (`PIEEditorSession.updateManifests`).
   * Returns an unsubscribe function. Listener throws are caught + logged.
   */
  onReloaded(cb: NpcDefinitionsReloadListener): () => void {
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
          "[npcDefinitionsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  /**
   * Non-throwing check for consumers that prefer the registry when
   * a manifest has been loaded and fall back to the legacy `ALL_NPCS`
   * map otherwise. Mirrors the other registry isLoaded() patterns.
   */
  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state. Module-level
   * singleton needs this to clear state between integration tests
   * that exercise the registry-prefer-fallback branch in consumer
   * systems. Don't call from production.
   */
  _unloadForTests(): void {
    this._manifest = null;
    this._byId.clear();
  }

  get manifest(): NpcDefinitionsManifest {
    if (!this._manifest) throw new NpcDefinitionsNotLoadedError();
    return this._manifest;
  }

  get size(): number {
    return this._byId.size;
  }

  get ids(): string[] {
    return Array.from(this._byId.keys());
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  /**
   * Throwing lookup. Use {@link find} for the non-throwing variant
   * (preferred when wiring via the registry-prefer-fallback pattern).
   */
  get(id: string): NpcDefinition {
    const npc = this._byId.get(id);
    if (!npc) throw new UnknownNpcDefinitionError(id, this.ids);
    return npc;
  }

  /**
   * Non-throwing per-id lookup. Mirrors `Map.get` semantics —
   * returns the entry or `undefined`. Use this in the registry-
   * prefer branch of `getNPCById(id)` so the legacy fallback path
   * runs cleanly when an id isn't authored.
   */
  find(id: string): NpcDefinition | undefined {
    return this._byId.get(id);
  }

  all(): readonly NpcDefinition[] {
    return Array.from(this._byId.values());
  }
}
