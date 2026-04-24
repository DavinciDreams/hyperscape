/**
 * NpcDialogueBindingsProvider
 *
 * Companion singleton to `DialogueProvider`. Holds the authored
 * `npcId → treeId` record that
 * `DialogueSystem.setAuthoredNpcDialogueBindings` consumes to route
 * NPC interactions to the authored dialogue tree.
 *
 * Kept separate from `DialogueProvider` so bindings and the tree
 * library can be edited and hot-reloaded independently without
 * re-validating the other.
 */

import {
  NpcDialogueBindingsManifestSchema,
  type NpcDialogueBindingsManifest,
} from "@hyperforge/manifest-schema";

class NpcDialogueBindingsProvider {
  private static _instance: NpcDialogueBindingsProvider | null = null;
  private _bindings: NpcDialogueBindingsManifest | null = null;

  public static getInstance(): NpcDialogueBindingsProvider {
    if (!NpcDialogueBindingsProvider._instance) {
      NpcDialogueBindingsProvider._instance = new NpcDialogueBindingsProvider();
    }
    return NpcDialogueBindingsProvider._instance;
  }

  public load(bindings: NpcDialogueBindingsManifest): void {
    this._bindings = bindings;
  }

  public loadRaw(raw: unknown): NpcDialogueBindingsManifest {
    const parsed = NpcDialogueBindingsManifestSchema.parse(raw);
    this._bindings = parsed;
    return parsed;
  }

  public unload(): void {
    this._bindings = null;
  }

  public hotReload(bindings: NpcDialogueBindingsManifest | null): void {
    this._bindings = bindings;
  }

  public isLoaded(): boolean {
    return this._bindings !== null;
  }

  /**
   * Current authored bindings. Empty object when not loaded — safe to
   * spread or iterate unconditionally.
   */
  public getBindings(): NpcDialogueBindingsManifest {
    return this._bindings ?? {};
  }

  /** Raw record reference (null when not loaded). Mainly for tests. */
  public getManifest(): NpcDialogueBindingsManifest | null {
    return this._bindings;
  }
}

export { NpcDialogueBindingsProvider };
export const npcDialogueBindingsProvider =
  NpcDialogueBindingsProvider.getInstance();
