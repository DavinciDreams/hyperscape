import { describe, expect, it } from "vitest";
import {
  FadeRulesSchema,
  LoadingScreensManifestSchema,
  LoadingSlateSchema,
} from "./loading-screens.js";

describe("LoadingSlateSchema", () => {
  const base = {
    id: "vista",
    backgroundAssetRef: "bgVista",
  };

  it("accepts a minimal slate", () => {
    const s = LoadingSlateSchema.parse(base);
    expect(s.backgroundMotion).toBe("static");
    expect(s.progressBarStyle).toBe("indeterminate");
    expect(s.minDisplayMs).toBe(500);
  });

  it("rejects duplicate tip localization keys", () => {
    expect(() =>
      LoadingSlateSchema.parse({
        ...base,
        tipLocalizationKeys: ["tip.a", "tip.a"],
      }),
    ).toThrow(/unique/);
  });

  it("accepts maxDisplayMs = 0 (unbounded)", () => {
    const s = LoadingSlateSchema.parse({
      ...base,
      minDisplayMs: 1000,
      maxDisplayMs: 0,
    });
    expect(s.maxDisplayMs).toBe(0);
  });

  it("rejects maxDisplayMs > 0 but < minDisplayMs", () => {
    expect(() =>
      LoadingSlateSchema.parse({
        ...base,
        minDisplayMs: 2000,
        maxDisplayMs: 1000,
      }),
    ).toThrow(/maxDisplayMs/);
  });

  it("accepts maxDisplayMs >= minDisplayMs", () => {
    const s = LoadingSlateSchema.parse({
      ...base,
      minDisplayMs: 500,
      maxDisplayMs: 3000,
    });
    expect(s.maxDisplayMs).toBe(3000);
  });

  it("rejects duplicate triggers", () => {
    expect(() =>
      LoadingSlateSchema.parse({
        ...base,
        triggers: ["initialLoad", "initialLoad"],
      }),
    ).toThrow(/triggers/);
  });
});

describe("FadeRulesSchema", () => {
  it("accepts defaults", () => {
    const f = FadeRulesSchema.parse({});
    expect(f.fadeColorHex).toBe("#000000");
  });

  it("rejects invalid hex", () => {
    expect(() => FadeRulesSchema.parse({ fadeColorHex: "black" })).toThrow();
  });
});

describe("LoadingScreensManifestSchema", () => {
  const slate = {
    id: "s1",
    backgroundAssetRef: "bg",
  };

  it("accepts disabled empty manifest", () => {
    const m = LoadingScreensManifestSchema.parse({ enabled: false });
    expect(m.slates).toEqual([]);
  });

  it("requires ≥1 slate when enabled", () => {
    expect(() => LoadingScreensManifestSchema.parse({ enabled: true })).toThrow(
      /at least one slate/,
    );
  });

  it("rejects duplicate slate ids", () => {
    expect(() =>
      LoadingScreensManifestSchema.parse({
        slates: [slate, slate],
      }),
    ).toThrow(/unique/);
  });

  it("rejects defaultSlateId pointing at undefined slate", () => {
    expect(() =>
      LoadingScreensManifestSchema.parse({
        slates: [slate],
        defaultSlateId: "missing",
      }),
    ).toThrow(/defaultSlateId/);
  });

  it("accepts defaultSlateId pointing at defined slate", () => {
    const m = LoadingScreensManifestSchema.parse({
      slates: [slate],
      defaultSlateId: "s1",
    });
    expect(m.defaultSlateId).toBe("s1");
  });

  it("accepts empty defaultSlateId as 'use any matching'", () => {
    const m = LoadingScreensManifestSchema.parse({ slates: [slate] });
    expect(m.defaultSlateId).toBe("");
  });
});
