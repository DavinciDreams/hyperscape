/**
 * TalentTreesProvider
 *
 * Singleton persistence layer for the authored talent-trees
 * manifest — branching progression registry. 6-kind tree
 * enum (class/weapon/profession/racial/pet/custom) + 6-kind
 * node enum (statBoost/abilityGrant/abilityModifier/passive/
 * keystone/aura) DAG with prereq (nodeId + minPoints), tier
 * 0..20 with tierPointRequirement gating, maxPoints 1..10
 * per node, exclusiveWithSiblings for PoE-cluster-jewel
 * pattern, 20×40 grid layout, and respec rules (baseCost +
 * costMultiplierPerUse + freeRespecsPerWeek +
 * respecCooldownHours + allowPartialRespec).
 *
 * Schema refinements (enforced per tree): DFS DAG cycle
 * detection on prerequisite graph + prereq resolves +
 * prereq.minPoints ≤ target.maxPoints + prereq target tier <
 * current tier + max-tier * tierPointRequirement ≤
 * totalPoints + keystone requires tags + keystone maxPoints=1
 * + abilityGrant/Modifier requires abilityRef + custom-kind
 * requires customKey. Manifest-level: unique tree ids +
 * enabled=true requires ≥1 tree.
 *
 * A `{enabled: false}` baseline keeps the pipeline inert
 * until talent trees are authored. Runtime TalentTreeSystem
 * not yet shipped.
 */

import {
  TalentTreesManifestSchema,
  type TalentTreesManifest,
} from "@hyperforge/manifest-schema";

class TalentTreesProvider {
  private static _instance: TalentTreesProvider | null = null;
  private _manifest: TalentTreesManifest | null = null;

  public static getInstance(): TalentTreesProvider {
    if (!TalentTreesProvider._instance) {
      TalentTreesProvider._instance = new TalentTreesProvider();
    }
    return TalentTreesProvider._instance;
  }

  public load(manifest: TalentTreesManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): TalentTreesManifest {
    const parsed = TalentTreesManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: TalentTreesManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): TalentTreesManifest | null {
    return this._manifest;
  }
}

export { TalentTreesProvider };
export const talentTreesProvider = TalentTreesProvider.getInstance();
