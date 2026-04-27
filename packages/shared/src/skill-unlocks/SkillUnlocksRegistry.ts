/**
 * Skill unlocks registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `skill-unlocks.ts`. Lookup of tile-based-MMORPG-style content unlocks per skill
 * level. Used by the level-up UI popup.
 */

import {
  type SkillUnlockEntry,
  type SkillUnlocksManifest,
  SkillUnlocksManifestSchema,
} from "@hyperforge/manifest-schema";

export class SkillUnlocksNotLoadedError extends Error {
  constructor() {
    super("SkillUnlocksRegistry used before load()");
    this.name = "SkillUnlocksNotLoadedError";
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type SkillUnlocksReloadListener = () => void;

export class SkillUnlocksRegistry {
  private _manifest: SkillUnlocksManifest | null = null;
  private _reloadListeners = new Set<SkillUnlocksReloadListener>();

  constructor(manifest?: SkillUnlocksManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SkillUnlocksManifest): void {
    this._manifest = manifest;
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(SkillUnlocksManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: SkillUnlocksReloadListener): () => void {
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
          "[skillUnlocksRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): SkillUnlocksManifest {
    if (!this._manifest) throw new SkillUnlocksNotLoadedError();
    return this._manifest;
  }

  hasSkill(skillKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.skills, skillKey);
  }

  /** All authored unlocks for a skill (or empty array when unknown). */
  forSkill(skillKey: string): SkillUnlockEntry[] {
    return this.manifest.skills[skillKey] ?? [];
  }

  /** Only the unlocks triggered at exactly `level`. */
  atLevel(skillKey: string, level: number): SkillUnlockEntry[] {
    return this.forSkill(skillKey).filter((e) => e.level === level);
  }

  /** All unlocks a player with `currentLevel` already has on a skill. */
  upToLevel(skillKey: string, currentLevel: number): SkillUnlockEntry[] {
    return this.forSkill(skillKey).filter((e) => e.level <= currentLevel);
  }

  /** The next upcoming unlock on a skill strictly above `currentLevel`. */
  nextUnlock(skillKey: string, currentLevel: number): SkillUnlockEntry | null {
    const upcoming = this.forSkill(skillKey)
      .filter((e) => e.level > currentLevel)
      .sort((a, b) => a.level - b.level);
    return upcoming.length > 0 ? upcoming[0]! : null;
  }
}
