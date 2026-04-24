import { describe, expect, it } from "vitest";
import {
  CreditEntrySchema,
  CreditSectionSchema,
  CreditsManifestSchema,
  ScrollRulesSchema,
} from "./credits.js";

describe("CreditEntrySchema", () => {
  it("accepts person with both keys", () => {
    const e = CreditEntrySchema.parse({
      id: "designer1",
      kind: "person",
      primaryLocalizationKey: "credits.jane.name",
      secondaryLocalizationKey: "credits.jane.role",
    });
    expect(e.alignment).toBe("center");
  });

  it("rejects person missing secondary key", () => {
    expect(() =>
      CreditEntrySchema.parse({
        id: "p",
        kind: "person",
        primaryLocalizationKey: "n",
      }),
    ).toThrow(/person/);
  });

  it("accepts spacer with no keys", () => {
    const e = CreditEntrySchema.parse({ id: "sp1", kind: "spacer" });
    expect(e.kind).toBe("spacer");
  });

  it("rejects sectionHeader without primary key", () => {
    expect(() =>
      CreditEntrySchema.parse({ id: "h", kind: "sectionHeader" }),
    ).toThrow(/sectionHeader/);
  });

  it("rejects image without imageAssetRef", () => {
    expect(() => CreditEntrySchema.parse({ id: "img", kind: "image" })).toThrow(
      /image/,
    );
  });

  it("accepts image with imageAssetRef", () => {
    const e = CreditEntrySchema.parse({
      id: "img",
      kind: "image",
      imageAssetRef: "studioLogo",
    });
    expect(e.imageAssetRef).toBe("studioLogo");
  });
});

describe("CreditSectionSchema", () => {
  it("accepts empty section", () => {
    const s = CreditSectionSchema.parse({ id: "design" });
    expect(s.entries).toEqual([]);
  });

  it("rejects duplicate entry ids within a section", () => {
    const e = { id: "sp", kind: "spacer" };
    expect(() =>
      CreditSectionSchema.parse({ id: "design", entries: [e, e] }),
    ).toThrow(/unique/);
  });
});

describe("ScrollRulesSchema", () => {
  it("accepts defaults", () => {
    const s = ScrollRulesSchema.parse({});
    expect(s.scrollSpeedPxPerSec).toBe(60);
    expect(s.speedUpMultiplier).toBe(3);
  });
});

describe("CreditsManifestSchema", () => {
  it("accepts disabled empty manifest", () => {
    const m = CreditsManifestSchema.parse({ enabled: false });
    expect(m.sections).toEqual([]);
  });

  it("requires ≥1 section when enabled", () => {
    expect(() => CreditsManifestSchema.parse({ enabled: true })).toThrow(
      /at least one section/,
    );
  });

  it("rejects duplicate section ids", () => {
    const section = { id: "design" };
    expect(() =>
      CreditsManifestSchema.parse({ sections: [section, section] }),
    ).toThrow(/unique/);
  });

  it("accepts enabled manifest with sections", () => {
    const m = CreditsManifestSchema.parse({
      sections: [{ id: "design" }],
    });
    expect(m.sections).toHaveLength(1);
  });
});
