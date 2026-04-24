/**
 * Skill unlocks registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `skill-unlocks.ts`. Lookup of OSRS-style content unlocks per skill
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

export class SkillUnlocksRegistry {
  private _manifest: SkillUnlocksManifest | null = null;

  constructor(manifest?: SkillUnlocksManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: SkillUnlocksManifest): void {
    this._manifest = manifest;
  }

  loadFromJson(raw: unknown): void {
    this.load(SkillUnlocksManifestSchema.parse(raw));
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
