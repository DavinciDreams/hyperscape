import { LicenseAgreementsRegistry } from "./LicenseAgreementsRegistry.js";

export {
  type AcceptedConsent,
  LicenseAgreementsNotLoadedError,
  LicenseAgreementsRegistry,
  UnknownLegalDocumentError,
} from "./LicenseAgreementsRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ licenseAgreements })` can live-
 * dispatch authored edits to legal-doc registry + acceptance gates +
 * version-history policy consumed by LegalConsentSystem.
 */
export const licenseAgreementsRegistry = new LicenseAgreementsRegistry();
