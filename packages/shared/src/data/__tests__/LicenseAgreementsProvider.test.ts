/**
 * Tests for the LicenseAgreementsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { licenseAgreementsProvider } from "../LicenseAgreementsProvider";

beforeEach(() => {
  licenseAgreementsProvider.unload();
});
afterEach(() => {
  licenseAgreementsProvider.unload();
});

const globalVariant = {
  jurisdiction: "global" as const,
  bodyAssetRef: "eulaBodyGlobal",
  localeCode: "en",
};
const ukVariant = {
  jurisdiction: "GB" as const,
  bodyAssetRef: "eulaBodyGb",
  localeCode: "en-GB",
};

const validManifest = {
  enabled: true,
  documents: [
    {
      id: "eula",
      name: "EULA",
      kind: "eula" as const,
      gate: "beforeFirstLogin" as const,
      currentVersion: "1.1.0",
      versions: [
        {
          version: "1.0.0",
          publishedAtIso: "2026-01-01T00:00:00Z",
          variants: [globalVariant],
        },
        {
          version: "1.1.0",
          publishedAtIso: "2026-04-01T00:00:00Z",
          variants: [globalVariant, ukVariant],
        },
      ],
    },
    {
      id: "tos",
      name: "TOS",
      kind: "termsOfService" as const,
      currentVersion: "1.0.0",
      versions: [
        {
          version: "1.0.0",
          publishedAtIso: "2026-01-01T00:00:00Z",
          variants: [globalVariant],
        },
      ],
    },
  ],
};

describe("LicenseAgreementsProvider", () => {
  it("starts unloaded", () => {
    expect(licenseAgreementsProvider.isLoaded()).toBe(false);
    expect(licenseAgreementsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = licenseAgreementsProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.documents.length).toBe(2);
    expect(parsed.documents[0].versions.length).toBe(2);
    expect(licenseAgreementsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = licenseAgreementsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.documents.length).toBe(0);
    expect(licenseAgreementsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no documents", () => {
    expect(() =>
      licenseAgreementsProvider.loadRaw({ enabled: true }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = licenseAgreementsProvider.loadRaw(validManifest);
    licenseAgreementsProvider.unload();
    licenseAgreementsProvider.load(parsed);
    expect(licenseAgreementsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects duplicate document ids", () => {
    const bad = {
      ...validManifest,
      documents: [
        validManifest.documents[0],
        { ...validManifest.documents[0] },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects two documents of same non-custom kind", () => {
    const bad = {
      ...validManifest,
      documents: [
        validManifest.documents[0],
        { ...validManifest.documents[0], id: "eulaDup" },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts multiple documents with kind='custom'", () => {
    const parsed = licenseAgreementsProvider.loadRaw({
      ...validManifest,
      documents: [
        validManifest.documents[0],
        {
          id: "custom1",
          name: "Custom A",
          kind: "custom" as const,
          customKey: "betaWarning",
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-02-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
        {
          id: "custom2",
          name: "Custom B",
          kind: "custom" as const,
          customKey: "giftingDisclosure",
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-02-02T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    });
    expect(parsed.documents.length).toBe(3);
  });

  it("loadRaw() rejects kind='custom' without customKey", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "naked",
          name: "Naked",
          kind: "custom" as const,
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects malformed SemVer in version", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eulaBad",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "v1",
          versions: [
            {
              version: "v1",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate version strings within document", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant],
            },
            {
              version: "1.0.0",
              publishedAtIso: "2026-02-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects currentVersion not appearing in versions", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "9.9.9",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects non-increasing publishedAtIso order", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "1.1.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-04-01T00:00:00Z",
              variants: [globalVariant],
            },
            {
              version: "1.1.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects version missing 'global' variant", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [ukVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate jurisdictions within version", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [globalVariant, globalVariant],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects invalid jurisdiction format", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          id: "eula",
          name: "EULA",
          kind: "eula" as const,
          currentVersion: "1.0.0",
          versions: [
            {
              version: "1.0.0",
              publishedAtIso: "2026-01-01T00:00:00Z",
              variants: [
                globalVariant,
                {
                  ...globalVariant,
                  jurisdiction: "usa" as unknown as "global",
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects minimumAgeYears out of range", () => {
    const bad = {
      ...validManifest,
      documents: [
        {
          ...validManifest.documents[0],
          minimumAgeYears: 150,
        },
      ],
    };
    expect(() => licenseAgreementsProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    licenseAgreementsProvider.loadRaw(validManifest);
    const parsed = licenseAgreementsProvider.loadRaw({
      ...validManifest,
      enabled: false,
      documents: [],
    });
    licenseAgreementsProvider.hotReload(parsed);
    expect(licenseAgreementsProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    licenseAgreementsProvider.loadRaw(validManifest);
    licenseAgreementsProvider.hotReload(null);
    expect(licenseAgreementsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    licenseAgreementsProvider.loadRaw(validManifest);
    licenseAgreementsProvider.unload();
    expect(licenseAgreementsProvider.isLoaded()).toBe(false);
  });
});
