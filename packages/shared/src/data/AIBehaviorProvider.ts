/**
 * AIBehaviorProvider
 *
 * Singleton persistence layer for the authored AI behavior-tree
 * manifest — array of named BehaviorTree objects that consumers can
 * bind to by id. Refinement: unique tree ids.
 *
 * Baseline fixture is `[]` — no authored trees, runtime must rely
 * on fallback defaults.
 *
 * BehaviorTreeInterpreter runtime shipped 2026-04-20; registry
 * wiring to look up trees by id is pending.
 */

import {
  AIBehaviorManifestSchema,
  type AIBehaviorManifest,
} from "@hyperforge/manifest-schema";

class AIBehaviorProvider {
  private static _instance: AIBehaviorProvider | null = null;
  private _manifest: AIBehaviorManifest | null = null;

  public static getInstance(): AIBehaviorProvider {
    if (!AIBehaviorProvider._instance) {
      AIBehaviorProvider._instance = new AIBehaviorProvider();
    }
    return AIBehaviorProvider._instance;
  }

  public load(manifest: AIBehaviorManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): AIBehaviorManifest {
    const parsed = AIBehaviorManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: AIBehaviorManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): AIBehaviorManifest | null {
    return this._manifest;
  }
}

export { AIBehaviorProvider };
export const aiBehaviorProvider = AIBehaviorProvider.getInstance();
