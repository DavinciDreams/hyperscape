/**
 * OnboardingGoalsProvider
 *
 * Singleton persistence layer for the authored onboarding-goals manifest —
 * new-player goal graph with criteria, rewards, and prerequisite DAG.
 *
 * Baseline fixture is `{}` — every field has a default
 * (enabled:true, goals:[], abort, showTracker:true, trackerTitleLocalizationKey).
 * Runtime onboarding tracker HUD has no goals to display when unloaded.
 */

import {
  OnboardingGoalsManifestSchema,
  type OnboardingGoalsManifest,
} from "@hyperforge/manifest-schema";

class OnboardingGoalsProvider {
  private static _instance: OnboardingGoalsProvider | null = null;
  private _manifest: OnboardingGoalsManifest | null = null;

  public static getInstance(): OnboardingGoalsProvider {
    if (!OnboardingGoalsProvider._instance) {
      OnboardingGoalsProvider._instance = new OnboardingGoalsProvider();
    }
    return OnboardingGoalsProvider._instance;
  }

  public load(manifest: OnboardingGoalsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): OnboardingGoalsManifest {
    const parsed = OnboardingGoalsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: OnboardingGoalsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): OnboardingGoalsManifest | null {
    return this._manifest;
  }
}

export { OnboardingGoalsProvider };
export const onboardingGoalsProvider = OnboardingGoalsProvider.getInstance();
