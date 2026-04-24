/**
 * CombatTuningAgentBindingsProvider
 *
 * Companion singleton to `CombatTuningProvider`. Holds the authored
 * `characterId → profileId | null` record that
 * `StreamingDuelScheduler.setCombatTuningProfileForAgent` /
 * `clearCombatTuningProfileForAgent` consumes to apply per-agent
 * tuning overrides on top of the authored tuning library.
 *
 * Kept separate from `CombatTuningProvider` (rather than folded into a
 * single "combat tuning bundle") so the two manifests can be
 * hot-reloaded and versioned independently — editing a single
 * character → profile pointer shouldn't require re-validating the
 * entire tuning library.
 */

import {
  CombatTuningAgentBindingsManifestSchema,
  type CombatTuningAgentBindingsManifest,
} from "@hyperforge/manifest-schema";

class CombatTuningAgentBindingsProvider {
  private static _instance: CombatTuningAgentBindingsProvider | null = null;
  private _bindings: CombatTuningAgentBindingsManifest | null = null;

  public static getInstance(): CombatTuningAgentBindingsProvider {
    if (!CombatTuningAgentBindingsProvider._instance) {
      CombatTuningAgentBindingsProvider._instance =
        new CombatTuningAgentBindingsProvider();
    }
    return CombatTuningAgentBindingsProvider._instance;
  }

  /** Install an already-validated bindings record. */
  public load(bindings: CombatTuningAgentBindingsManifest): void {
    this._bindings = bindings;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): CombatTuningAgentBindingsManifest {
    const parsed = CombatTuningAgentBindingsManifestSchema.parse(raw);
    this._bindings = parsed;
    return parsed;
  }

  /** Detach the authored bindings. `isLoaded()` becomes false. */
  public unload(): void {
    this._bindings = null;
  }

  /** Hot-reload entry point. `null` clears the authored bindings. */
  public hotReload(bindings: CombatTuningAgentBindingsManifest | null): void {
    this._bindings = bindings;
  }

  public isLoaded(): boolean {
    return this._bindings !== null;
  }

  /**
   * Current authored bindings. Empty object when not loaded — safe to
   * spread or iterate unconditionally.
   */
  public getBindings(): CombatTuningAgentBindingsManifest {
    return this._bindings ?? {};
  }

  /** Raw record reference (null when not loaded). Mainly for tests. */
  public getManifest(): CombatTuningAgentBindingsManifest | null {
    return this._bindings;
  }
}

export { CombatTuningAgentBindingsProvider };
export const combatTuningAgentBindingsProvider =
  CombatTuningAgentBindingsProvider.getInstance();
