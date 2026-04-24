import { describe, expect, it } from "vitest";
import {
  ConsentFlowRulesSchema,
  DocumentVersionSchema,
  JurisdictionalVariantSchema,
  LegalDocumentSchema,
  LicenseAgreementsManifestSchema,
} from "./license-agreements.js";

describe("JurisdictionalVariantSchema", () => {
  it("accepts a global variant", () => {
    const v = JurisdictionalVariantSchema.parse({
      jurisdiction: "global",
      bodyAssetRef: "eulaBodyEn",
      localeCode: "en",
    });
    expect(v.jurisdiction).toBe("global");
  });

  it("accepts ISO-3166-1 and -2 codes", () => {
    const v = JurisdictionalVariantSchema.parse({
      jurisdiction: "DE",
      bodyAssetRef: "eulaBodyDe",
      localeCode: "de-DE",
    });
    expect(v.jurisdiction).toBe("DE");
    const v2 = JurisdictionalVariantSchema.parse({
      jurisdiction: "US-CA",
      bodyAssetRef: "eulaBodyCcpa",
      localeCode: "en-US",
    });
    expect(v2.jurisdiction).toBe("US-CA");
  });

  it("rejects lowercase jurisdiction", () => {
    expect(() =>
      JurisdictionalVariantSchema.parse({
        jurisdiction: "de",
        bodyAssetRef: "x",
        localeCode: "de",
      }),
    ).toThrow(/jurisdiction/);
  });

  it("rejects invalid locale", () => {
    expect(() =>
      JurisdictionalVariantSchema.parse({
        jurisdiction: "global",
        bodyAssetRef: "x",
        localeCode: "xx-xx",
      }),
    ).toThrow(/localeCode/);
  });
});

describe("DocumentVersionSchema", () => {
  const globalVariant = {
    jurisdiction: "global",
    bodyAssetRef: "body",
    localeCode: "en",
  };

  it("accepts a valid version", () => {
    const v = DocumentVersionSchema.parse({
      version: "1.0.0",
      publishedAtIso: "2024-01-01",
      variants: [globalVariant],
    });
    expect(v.requiresReAcceptance).toBe(true);
  });

  it("rejects non-SemVer version", () => {
    expect(() =>
      DocumentVersionSchema.parse({
        version: "v1",
        publishedAtIso: "2024-01-01",
        variants: [globalVariant],
      }),
    ).toThrow(/SemVer/);
  });

  it("requires publishedAtIso", () => {
    expect(() =>
      DocumentVersionSchema.parse({
        version: "1.0.0",
        publishedAtIso: "",
        variants: [globalVariant],
      }),
    ).toThrow();
  });

  it("requires at least one variant", () => {
    expect(() =>
      DocumentVersionSchema.parse({
        version: "1.0.0",
        publishedAtIso: "2024-01-01",
        variants: [],
      }),
    ).toThrow();
  });

  it("requires global fallback variant", () => {
    expect(() =>
      DocumentVersionSchema.parse({
        version: "1.0.0",
        publishedAtIso: "2024-01-01",
        variants: [
          {
            jurisdiction: "DE",
            bodyAssetRef: "body",
            localeCode: "de",
          },
        ],
      }),
    ).toThrow(/global/);
  });

  it("rejects duplicate jurisdiction within a version", () => {
    expect(() =>
      DocumentVersionSchema.parse({
        version: "1.0.0",
        publishedAtIso: "2024-01-01",
        variants: [globalVariant, globalVariant],
      }),
    ).toThrow(/unique jurisdictions/);
  });
});

describe("LegalDocumentSchema", () => {
  const globalVariant = {
    jurisdiction: "global",
    bodyAssetRef: "body",
    localeCode: "en",
  };
  const validVersion = {
    version: "1.0.0",
    publishedAtIso: "2024-01-01",
    variants: [globalVariant],
  };

  it("accepts a valid EULA", () => {
    const d = LegalDocumentSchema.parse({
      id: "eula",
      name: "EULA",
      kind: "eula",
      currentVersion: "1.0.0",
      versions: [validVersion],
    });
    expect(d.gate).toBe("beforeFirstLogin");
  });

  it("rejects custom without customKey", () => {
    expect(() =>
      LegalDocumentSchema.parse({
        id: "ext",
        name: "Ext",
        kind: "custom",
        currentVersion: "1.0.0",
        versions: [validVersion],
      }),
    ).toThrow(/customKey/);
  });

  it("rejects currentVersion not in versions", () => {
    expect(() =>
      LegalDocumentSchema.parse({
        id: "eula",
        name: "EULA",
        kind: "eula",
        currentVersion: "9.0.0",
        versions: [validVersion],
      }),
    ).toThrow(/currentVersion/);
  });

  it("rejects duplicate version strings", () => {
    expect(() =>
      LegalDocumentSchema.parse({
        id: "eula",
        name: "EULA",
        kind: "eula",
        currentVersion: "1.0.0",
        versions: [validVersion, validVersion],
      }),
    ).toThrow(/unique/);
  });

  it("rejects versions out of publish order", () => {
    expect(() =>
      LegalDocumentSchema.parse({
        id: "eula",
        name: "EULA",
        kind: "eula",
        currentVersion: "2.0.0",
        versions: [
          {
            version: "2.0.0",
            publishedAtIso: "2025-01-01",
            variants: [globalVariant],
          },
          {
            version: "1.0.0",
            publishedAtIso: "2024-01-01",
            variants: [globalVariant],
          },
        ],
      }),
    ).toThrow(/strictly-increasing/);
  });

  it("accepts multi-version strictly-increasing history", () => {
    const d = LegalDocumentSchema.parse({
      id: "tos",
      name: "ToS",
      kind: "termsOfService",
      currentVersion: "2.0.0",
      versions: [
        {
          version: "1.0.0",
          publishedAtIso: "2024-01-01",
          variants: [globalVariant],
        },
        {
          version: "2.0.0",
          publishedAtIso: "2025-06-01",
          variants: [globalVariant],
        },
      ],
    });
    expect(d.versions).toHaveLength(2);
  });
});

describe("ConsentFlowRulesSchema", () => {
  it("defaults are reasonable", () => {
    const r = ConsentFlowRulesSchema.parse({});
    expect(r.blockLoginOnPending).toBe(true);
    expect(r.auditRetentionDays).toBe(730);
  });

  it("rejects auditRetentionDays < 30", () => {
    expect(() =>
      ConsentFlowRulesSchema.parse({ auditRetentionDays: 10 }),
    ).toThrow();
  });
});

describe("LicenseAgreementsManifestSchema", () => {
  const globalVariant = {
    jurisdiction: "global",
    bodyAssetRef: "body",
    localeCode: "en",
  };
  const eulaDoc = {
    id: "eula",
    name: "EULA",
    kind: "eula" as const,
    currentVersion: "1.0.0",
    versions: [
      {
        version: "1.0.0",
        publishedAtIso: "2024-01-01",
        variants: [globalVariant],
      },
    ],
  };

  it("accepts a minimal manifest", () => {
    const m = LicenseAgreementsManifestSchema.parse({
      documents: [eulaDoc],
    });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled with zero documents", () => {
    expect(() =>
      LicenseAgreementsManifestSchema.parse({ documents: [] }),
    ).toThrow(/at least one document/);
  });

  it("rejects duplicate document ids", () => {
    expect(() =>
      LicenseAgreementsManifestSchema.parse({
        documents: [eulaDoc, eulaDoc],
      }),
    ).toThrow(/document ids/);
  });

  it("rejects two documents of same non-custom kind", () => {
    expect(() =>
      LicenseAgreementsManifestSchema.parse({
        documents: [eulaDoc, { ...eulaDoc, id: "eula2" }],
      }),
    ).toThrow(/non-custom kind/);
  });

  it("allows multiple custom-kind documents", () => {
    const customDoc = {
      ...eulaDoc,
      id: "dlcA",
      kind: "custom" as const,
      customKey: "dlcA",
    };
    const customDoc2 = {
      ...eulaDoc,
      id: "dlcB",
      kind: "custom" as const,
      customKey: "dlcB",
    };
    const m = LicenseAgreementsManifestSchema.parse({
      documents: [customDoc, customDoc2],
    });
    expect(m.documents).toHaveLength(2);
  });
});
