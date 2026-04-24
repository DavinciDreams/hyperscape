/**
 * CombatTuningProvider
 *
 * Single-source-of-truth holder for the authored `CombatTuningManifest`
 * (library of combat-tuning profiles). Mirrors the
 * `DialogueConditionBindingsProvider` pattern — an instanced singleton
 * that DataManager populates at boot and PIE/editor flows update via
 * `hotReload`.
 *
 * The DuelOrchestrator already owns its own `CombatTuningRegistry`
 * instance (it swaps it in-place on `setAuthoredCombatTuning`) so this
 * provider is just a pass-through persistence layer. At server boot the
 * StreamingDuelScheduler consults `combatTuningProvider.getManifest()`
 * and, when loaded, calls `setAuthoredCombatTuning(manifest)` once —
 * symmetric with how SystemLoader consults
 * `dialogueConditionBindingsProvider.isLoaded()`.
 *
 * This provider deliberately does not touch the scheduler/orchestrator
 * directly; the event bus (`combat:tuning:updated`) + the explicit
 * init-time read are the two seams.
 */

import {
  CombatTuningManifestSchema,
  type CombatTuningManifest,
} from "@hyperforge/manifest-schema";

class CombatTuningProvider {
  private static _instance: CombatTuningProvider | null = null;
  private _manifest: CombatTuningManifest | null = null;

  public static getInstance(): CombatTuningProvider {
    if (!CombatTuningProvider._instance) {
      CombatTuningProvider._instance = new CombatTuningProvider();
    }
    return CombatTuningProvider._instance;
  }

  /**
   * Install an already-validated manifest. Callers that start from raw
   * JSON (e.g. DataManager reading a file from disk) should use
   * `loadRaw` so validation happens at the edge.
   */
  public load(manifest: CombatTuningManifest): void {
    this._manifest = manifest;
  }

  /**
   * Validate and install a raw JSON-parsed payload. Throws on schema
   * violations with the standard Zod error surface — on throw the
   * provider stays in its previous state (not half-loaded).
   */
  public loadRaw(raw: unknown): CombatTuningManifest {
    const parsed = CombatTuningManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /**
   * Hot-reload entry point (PIE + editor). `null` payload clears the
   * authored manifest; semantically equivalent to `unload` but kept as
   * a matched verb for callers mirroring the dialogue-condition provider.
   */
  public hotReload(manifest: CombatTuningManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Current authored profile library. Empty readonly array when not
   * loaded — safe to iterate unconditionally.
   */
  public getProfiles(): CombatTuningManifest {
    return this._manifest ?? [];
  }

  /** Raw manifest reference (null when not loaded). Mainly for tests. */
  public getManifest(): CombatTuningManifest | null {
    return this._manifest;
  }
}

export { CombatTuningProvider };
export const combatTuningProvider = CombatTuningProvider.getInstance();
