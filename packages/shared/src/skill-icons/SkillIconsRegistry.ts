/**
 * Skill icons registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `skill-icons.ts`.
 * Pure lookup: skill definitions (label/icon/category/defaultLevel)
 * plus a broader emoji lookup table keyed by lowercase skill name,
 * with a fallback icon for unknown keys.
 */

import {
  type SkillCategory,
  type SkillDefinition,
  type SkillIconsManifest,
  SkillIconsManifestSchema,
} from "@hyperforge/manifest-schema";

export class SkillIconsNotLoadedError extends Error {
  constructor() {
    super("SkillIconsRegistry used before load()");
    this.name = "SkillIconsNotLoadedError";
  }
}

export class UnknownSkillDefinitionError extends Error {
  readonly skillKey: string;
  readonly availableKeys: readonly string[];
  constructor(key: string, availableKeys: readonly string[]) {
    super(
      `skill definition "${key}" not found. Known keys: ${
        availableKeys.length > 0 ? availableKeys.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownSkillDefinitionError";
    this.skillKey = key;
    this.availableKeys = availableKeys;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type SkillIconsReloadListener = () => void;

export class SkillIconsRegistry {
  private _manifest: SkillIconsManifest | null = null;
  private _byKey = new Map<string, SkillDefinition>();
  private _reloadListeners = new Set<SkillIconsReloadListener>();

  constructor(manifest?: SkillIconsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SkillIconsManifest): void {
    this._manifest = manifest;
    this._byKey.clear();
    for (const d of manifest.definitions) this._byKey.set(d.key, d);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(SkillIconsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to "registry reloaded" notifications. Fires after every
   * successful `load()` / `loadFromJson()`. Returns an unsubscribe
   * function. Listener throws are caught + logged.
   */
  onReloaded(cb: SkillIconsReloadListener): () => void {
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
          "[skillIconsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Test-only reset back to the unloaded state. Mirrors the
   * `WorldAreasRegistry._unloadForTests` / `NPCSizesRegistry._unloadForTests`
   * pattern — module-level singleton needs a way to clear state
   * between integration tests that exercise the registry-prefer-
   * fallback branch in consumer systems. Don't call from production.
   */
  _unloadForTests(): void {
    this._manifest = null;
    this._byKey.clear();
  }

  get manifest(): SkillIconsManifest {
    if (!this._manifest) throw new SkillIconsNotLoadedError();
    return this._manifest;
  }

  get fallbackIcon(): string {
    return this.manifest.fallbackIcon;
  }

  hasDefinition(key: string): boolean {
    return this._byKey.has(key);
  }

  definition(key: string): SkillDefinition {
    const d = this._byKey.get(key);
    if (!d) {
      throw new UnknownSkillDefinitionError(
        key,
        Array.from(this._byKey.keys()),
      );
    }
    return d;
  }

  definitions(): SkillDefinition[] {
    return Array.from(this._byKey.values());
  }

  /** Emoji icon keyed by lowercase skill name (alias-aware). */
  iconFor(nameOrKey: string): string {
    const lower = nameOrKey.toLowerCase();
    return this.manifest.icons[lower] ?? this.manifest.fallbackIcon;
  }

  byCategory(category: SkillCategory): SkillDefinition[] {
    return this.definitions().filter((d) => d.category === category);
  }
}
