/**
 * License-agreements registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `license-agreements.ts`. Pure logic: document lookup by id or kind,
 * active version resolution, jurisdiction variant selection with
 * `global` fallback, and consent-pending computation from a set of
 * already-accepted (docId, version) pairs.
 */

import {
  type DocumentKind,
  type DocumentVersion,
  type JurisdictionalVariant,
  type LegalDocument,
  type LicenseAgreementsManifest,
  LicenseAgreementsManifestSchema,
} from "@hyperforge/manifest-schema";

export class LicenseAgreementsNotLoadedError extends Error {
  constructor() {
    super("LicenseAgreementsRegistry used before load()");
    this.name = "LicenseAgreementsNotLoadedError";
  }
}

export class UnknownLegalDocumentError extends Error {
  readonly documentId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `legal document "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownLegalDocumentError";
    this.documentId = id;
    this.availableIds = availableIds;
  }
}

export interface AcceptedConsent {
  readonly documentId: string;
  readonly version: string;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type LicenseAgreementsReloadListener = () => void;

export class LicenseAgreementsRegistry {
  private _manifest: LicenseAgreementsManifest | null = null;
  private _byId = new Map<string, LegalDocument>();
  private _reloadListeners = new Set<LicenseAgreementsReloadListener>();

  constructor(manifest?: LicenseAgreementsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: LicenseAgreementsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const d of manifest.documents) this._byId.set(d.id, d);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: LicenseAgreementsReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[licenseAgreementsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(LicenseAgreementsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): LicenseAgreementsManifest {
    if (!this._manifest) throw new LicenseAgreementsNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  document(id: string): LegalDocument {
    const d = this._byId.get(id);
    if (!d) {
      throw new UnknownLegalDocumentError(id, Array.from(this._byId.keys()));
    }
    return d;
  }

  /** Finds the (at-most-one) non-custom document of a given kind. */
  documentByKind(kind: DocumentKind): LegalDocument | undefined {
    if (kind === "custom") return undefined;
    return this.manifest.documents.find((d) => d.kind === kind);
  }

  /** Resolve the currently-active version of a document. */
  activeVersion(documentId: string): DocumentVersion {
    const doc = this.document(documentId);
    const version = doc.versions.find((v) => v.version === doc.currentVersion);
    // Schema refinement guarantees presence.
    return version as DocumentVersion;
  }

  /**
   * Pick a jurisdictional variant for a version.
   * Prefers exact match, then the country code (stripped region),
   * then 'global'.
   */
  variantFor(
    documentId: string,
    version: string,
    jurisdiction: string,
  ): JurisdictionalVariant {
    const doc = this.document(documentId);
    const ver = doc.versions.find((v) => v.version === version);
    if (!ver) {
      throw new Error(
        `version "${version}" not found on document "${documentId}"`,
      );
    }
    const exact = ver.variants.find((v) => v.jurisdiction === jurisdiction);
    if (exact) return exact;
    const country = jurisdiction.includes("-")
      ? jurisdiction.split("-")[0]
      : null;
    if (country) {
      const countryMatch = ver.variants.find((v) => v.jurisdiction === country);
      if (countryMatch) return countryMatch;
    }
    // Schema refinement guarantees a 'global' variant exists.
    return ver.variants.find(
      (v) => v.jurisdiction === "global",
    ) as JurisdictionalVariant;
  }

  /**
   * Given a player's set of already-accepted consents, return the
   * documents whose current version still needs acceptance.
   * Respects each document's `requiresReAcceptance` flag on the
   * current version.
   */
  pendingFor(accepted: ReadonlyArray<AcceptedConsent>): LegalDocument[] {
    const acceptedByDoc = new Map<string, Set<string>>();
    for (const a of accepted) {
      let set = acceptedByDoc.get(a.documentId);
      if (!set) {
        set = new Set<string>();
        acceptedByDoc.set(a.documentId, set);
      }
      set.add(a.version);
    }
    const out: LegalDocument[] = [];
    for (const doc of this.manifest.documents) {
      if (doc.gate === "optional") continue;
      const seen = acceptedByDoc.get(doc.id);
      if (!seen || seen.size === 0) {
        out.push(doc);
        continue;
      }
      if (seen.has(doc.currentVersion)) continue;
      const current = this.activeVersion(doc.id);
      if (current.requiresReAcceptance) out.push(doc);
    }
    return out;
  }
}
