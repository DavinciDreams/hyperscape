/**
 * LicenseAgreementsProvider
 *
 * Singleton persistence layer for the authored license-agreements
 * manifest — 7-kind legal document registry (eula/tos/privacy/
 * coc/ageConsent/dlcAddendum/custom) with SemVer-versioned
 * histories, per-version JurisdictionalVariant[] keyed by
 * global / ISO-3166-1 / ISO-3166-2 region codes, acceptance
 * gates (beforeAccountCreation / beforeFirstLogin / beforeGameplay /
 * beforePurchase / onNextLogin / optional), revocation policy,
 * and consent-flow rules. Wraps the `@hyperforge/manifest-schema`
 * `LicenseAgreementsManifestSchema` with null-when-unloaded
 * semantics.
 *
 * Schema enforces `enabled=true requires ≥1 document` and
 * at-most-one-doc-per-non-custom-kind, so a `{enabled: false}`
 * baseline keeps the pipeline inert until legal authors a
 * document. Runtime LegalConsentSystem not yet shipped.
 */

import {
  LicenseAgreementsManifestSchema,
  type LicenseAgreementsManifest,
} from "@hyperforge/manifest-schema";

class LicenseAgreementsProvider {
  private static _instance: LicenseAgreementsProvider | null = null;
  private _manifest: LicenseAgreementsManifest | null = null;

  public static getInstance(): LicenseAgreementsProvider {
    if (!LicenseAgreementsProvider._instance) {
      LicenseAgreementsProvider._instance = new LicenseAgreementsProvider();
    }
    return LicenseAgreementsProvider._instance;
  }

  public load(manifest: LicenseAgreementsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): LicenseAgreementsManifest {
    const parsed = LicenseAgreementsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: LicenseAgreementsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): LicenseAgreementsManifest | null {
    return this._manifest;
  }
}

export { LicenseAgreementsProvider };
export const licenseAgreementsProvider =
  LicenseAgreementsProvider.getInstance();
