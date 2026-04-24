/**
 * HousingProvider
 *
 * Singleton persistence layer for the authored housing manifest
 * — plot-type registry (6-category enum apartment/cottage/manor/
 * estate/openWorld/guildHall) with per-plot size/slots/visitor
 * cap/cost, plus 4 global rule blocks: customization (decoration/
 * structural edits/clipping + stack-height + session-minutes),
 * permissions (coOwners/friendEntries/blockEntries/publicListing),
 * upkeep (cyclePeriodDays 0=lifetime + gracePeriodDays +
 * reclaimAfterDays > gracePeriodDays strict refinement), and
 * visitors (interact/guestbook + combatPolicy allow/block/
 * ownerChoice).
 *
 * Manifest-level refinements: unique plotType ids +
 * maxPlotsPerAccount ≥ maxPlotsPerCharacter + enabled=true
 * requires ≥1 plotType.
 *
 * A `{enabled: false}` baseline keeps the pipeline inert until
 * plots are authored. Runtime HousingSystem not yet shipped.
 */

import {
  HousingManifestSchema,
  type HousingManifest,
} from "@hyperforge/manifest-schema";

class HousingProvider {
  private static _instance: HousingProvider | null = null;
  private _manifest: HousingManifest | null = null;

  public static getInstance(): HousingProvider {
    if (!HousingProvider._instance) {
      HousingProvider._instance = new HousingProvider();
    }
    return HousingProvider._instance;
  }

  public load(manifest: HousingManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): HousingManifest {
    const parsed = HousingManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: HousingManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): HousingManifest | null {
    return this._manifest;
  }
}

export { HousingProvider };
export const housingProvider = HousingProvider.getInstance();
