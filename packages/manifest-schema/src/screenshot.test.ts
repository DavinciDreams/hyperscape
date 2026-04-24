import { describe, expect, it } from "vitest";
import {
  CaptureRulesSchema,
  PhotoModeRulesSchema,
  ScreenshotManifestSchema,
  ShareTargetSchema,
  WatermarkRulesSchema,
} from "./screenshot.js";

describe("CaptureRulesSchema", () => {
  it("accepts defaults", () => {
    const c = CaptureRulesSchema.parse({});
    expect(c.format).toBe("png");
    expect(c.qualityPercent).toBe(90);
    expect(c.superResolutionMultiplier).toBe(1);
  });

  it("rejects superResolutionMultiplier above 8", () => {
    expect(() =>
      CaptureRulesSchema.parse({ superResolutionMultiplier: 16 }),
    ).toThrow();
  });
});

describe("PhotoModeRulesSchema", () => {
  it("accepts defaults", () => {
    const p = PhotoModeRulesSchema.parse({});
    expect(p.enabled).toBe(true);
    expect(p.defaultAspect).toBe("auto");
  });
});

describe("WatermarkRulesSchema", () => {
  it("accepts disabled defaults", () => {
    const w = WatermarkRulesSchema.parse({});
    expect(w.enabled).toBe(false);
    expect(w.position).toBe("none");
  });

  it("rejects enabled + position 'none'", () => {
    expect(() =>
      WatermarkRulesSchema.parse({ enabled: true, position: "none" }),
    ).toThrow(/position/);
  });

  it("accepts enabled + bottomRight", () => {
    const w = WatermarkRulesSchema.parse({
      enabled: true,
      position: "bottomRight",
    });
    expect(w.position).toBe("bottomRight");
  });
});

describe("ShareTargetSchema", () => {
  it("accepts saveToDisk without endpointNameRef", () => {
    const t = ShareTargetSchema.parse({ id: "disk", kind: "saveToDisk" });
    expect(t.enabled).toBe(true);
  });

  it("rejects uploadToGallery without endpointNameRef", () => {
    expect(() =>
      ShareTargetSchema.parse({ id: "gal", kind: "uploadToGallery" }),
    ).toThrow(/endpointNameRef/);
  });

  it("accepts external with endpointNameRef", () => {
    const t = ShareTargetSchema.parse({
      id: "twitter",
      kind: "external",
      endpointNameRef: "shareApi",
    });
    expect(t.endpointNameRef).toBe("shareApi");
  });
});

describe("ScreenshotManifestSchema", () => {
  it("accepts disabled empty manifest", () => {
    const m = ScreenshotManifestSchema.parse({ enabled: false });
    expect(m.shareTargets).toEqual([]);
  });

  it("requires at least one enabled share target when enabled", () => {
    expect(() =>
      ScreenshotManifestSchema.parse({ enabled: true, shareTargets: [] }),
    ).toThrow(/share target/);
  });

  it("accepts enabled manifest with share targets", () => {
    const m = ScreenshotManifestSchema.parse({
      enabled: true,
      shareTargets: [{ id: "disk", kind: "saveToDisk" }],
    });
    expect(m.shareTargets).toHaveLength(1);
  });

  it("rejects duplicate share target ids", () => {
    const t = { id: "disk", kind: "saveToDisk" };
    expect(() =>
      ScreenshotManifestSchema.parse({ shareTargets: [t, t] }),
    ).toThrow(/unique/);
  });
});
