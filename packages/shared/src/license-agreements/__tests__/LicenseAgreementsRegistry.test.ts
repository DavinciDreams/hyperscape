import { LicenseAgreementsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LicenseAgreementsNotLoadedError,
  LicenseAgreementsRegistry,
  UnknownLegalDocumentError,
} from "../LicenseAgreementsRegistry.js";

function manifest() {
  return LicenseAgreementsManifestSchema.parse({
    enabled: true,
    documents: [
      {
        id: "eula",
        name: "EULA",
        kind: "eula",
        gate: "beforeFirstLogin",
        currentVersion: "2.0.0",
        versions: [
          {
            version: "1.0.0",
            publishedAtIso: "2025-01-01",
            variants: [
              {
                jurisdiction: "global",
                bodyAssetRef: "eulaGlobalV1",
                localeCode: "en",
              },
            ],
          },
          {
            version: "2.0.0",
            publishedAtIso: "2026-01-01",
            variants: [
              {
                jurisdiction: "global",
                bodyAssetRef: "eulaGlobalV2",
                localeCode: "en",
              },
              {
                jurisdiction: "DE",
                bodyAssetRef: "eulaDeV2",
                localeCode: "de",
              },
              {
                jurisdiction: "US-CA",
                bodyAssetRef: "eulaUsCaV2",
                localeCode: "en-US",
              },
            ],
          },
        ],
      },
      {
        id: "privacy",
        name: "Privacy Policy",
        kind: "privacyPolicy",
        gate: "beforeFirstLogin",
        currentVersion: "1.0.0",
        versions: [
          {
            version: "1.0.0",
            publishedAtIso: "2026-02-01",
            requiresReAcceptance: false,
            variants: [
              {
                jurisdiction: "global",
                bodyAssetRef: "privacyGlobalV1",
                localeCode: "en",
              },
            ],
          },
        ],
      },
      {
        id: "optionalNotice",
        name: "Optional Notice",
        kind: "custom",
        customKey: "ambientNotice",
        gate: "optional",
        currentVersion: "1.0.0",
        versions: [
          {
            version: "1.0.0",
            publishedAtIso: "2026-03-01",
            variants: [
              {
                jurisdiction: "global",
                bodyAssetRef: "ambientGlobal",
                localeCode: "en",
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("LicenseAgreementsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new LicenseAgreementsRegistry().manifest).toThrow(
      LicenseAgreementsNotLoadedError,
    );
  });
});

describe("LicenseAgreementsRegistry — lookup", () => {
  it("by id", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    expect(r.has("eula")).toBe(true);
    expect(r.document("eula").name).toBe("EULA");
  });

  it("throws on unknown id", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    expect(() => r.document("ghost")).toThrow(UnknownLegalDocumentError);
  });

  it("by kind", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    expect(r.documentByKind("eula")?.id).toBe("eula");
    expect(r.documentByKind("custom")).toBeUndefined();
    expect(r.documentByKind("termsOfService")).toBeUndefined();
  });
});

describe("LicenseAgreementsRegistry — active version", () => {
  it("returns currentVersion entry", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    expect(r.activeVersion("eula").version).toBe("2.0.0");
  });
});

describe("LicenseAgreementsRegistry — variant selection", () => {
  it("exact match returned when present", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const v = r.variantFor("eula", "2.0.0", "DE");
    expect(v.bodyAssetRef).toBe("eulaDeV2");
  });

  it("US-CA exact variant found", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const v = r.variantFor("eula", "2.0.0", "US-CA");
    expect(v.bodyAssetRef).toBe("eulaUsCaV2");
  });

  it("country-level fallback strips region", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    // No DE-BY variant → strip to DE → found.
    const v = r.variantFor("eula", "2.0.0", "DE-BY");
    expect(v.bodyAssetRef).toBe("eulaDeV2");
  });

  it("unknown jurisdiction falls back to global", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const v = r.variantFor("eula", "2.0.0", "ZZ");
    expect(v.bodyAssetRef).toBe("eulaGlobalV2");
  });
});

describe("LicenseAgreementsRegistry — pending consents", () => {
  it("empty accepted list requires all required docs", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const pending = r.pendingFor([]);
    expect(pending.map((d) => d.id).sort()).toEqual(["eula", "privacy"]);
    // Optional notice is NOT required.
  });

  it("current version accepted skips the doc", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const pending = r.pendingFor([
      { documentId: "eula", version: "2.0.0" },
      { documentId: "privacy", version: "1.0.0" },
    ]);
    expect(pending).toEqual([]);
  });

  it("older version re-acceptance required when flag set", () => {
    const r = new LicenseAgreementsRegistry(manifest());
    const pending = r.pendingFor([
      { documentId: "eula", version: "1.0.0" },
      { documentId: "privacy", version: "1.0.0" },
    ]);
    expect(pending.map((d) => d.id)).toEqual(["eula"]);
  });
});
