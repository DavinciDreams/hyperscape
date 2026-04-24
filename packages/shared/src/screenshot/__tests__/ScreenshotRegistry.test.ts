import { ScreenshotManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ScreenshotNotLoadedError,
  ScreenshotRegistry,
  UnknownShareTargetError,
} from "../ScreenshotRegistry.js";

function manifest() {
  return ScreenshotManifestSchema.parse({
    enabled: true,
    capture: {
      captureWidthPx: 0,
      captureHeightPx: 0,
      format: "jpeg",
      qualityPercent: 85,
      superResolutionMultiplier: 2,
    },
    photoMode: {
      enabled: true,
      renderProfileRef: "photoMode",
    },
    watermark: {
      enabled: true,
      position: "bottomRight",
      opacity: 0.7,
    },
    shareTargets: [
      { id: "saveDisk", kind: "saveToDisk", enabled: true },
      { id: "clipboard", kind: "clipboard", enabled: true },
      {
        id: "gallery",
        kind: "uploadToGallery",
        endpointNameRef: "deploy.gallery.prod",
        enabled: true,
      },
      {
        id: "twitter",
        kind: "external",
        endpointNameRef: "deploy.twitter",
        enabled: false,
      },
    ],
  });
}

describe("ScreenshotRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new ScreenshotRegistry().manifest).toThrow(
      ScreenshotNotLoadedError,
    );
  });
});

describe("ScreenshotRegistry — lookup", () => {
  it("share target by id", () => {
    const r = new ScreenshotRegistry(manifest());
    expect(r.shareTarget("gallery").endpointNameRef).toBe(
      "deploy.gallery.prod",
    );
  });

  it("throws on unknown", () => {
    const r = new ScreenshotRegistry(manifest());
    expect(() => r.shareTarget("ghost")).toThrow(UnknownShareTargetError);
  });
});

describe("ScreenshotRegistry — enabled filter", () => {
  it("enabledShareTargets drops disabled", () => {
    const r = new ScreenshotRegistry(manifest());
    expect(r.enabledShareTargets().map((t) => t.id)).toEqual([
      "saveDisk",
      "clipboard",
      "gallery",
    ]);
  });

  it("shareTargetsByKind filters enabled + kind", () => {
    const r = new ScreenshotRegistry(manifest());
    expect(r.shareTargetsByKind("external")).toEqual([]);
    expect(r.shareTargetsByKind("uploadToGallery").map((t) => t.id)).toEqual([
      "gallery",
    ]);
  });
});

describe("ScreenshotRegistry — capture size", () => {
  it("0×0 capture size matches viewport then applies SR multiplier", () => {
    const r = new ScreenshotRegistry(manifest());
    expect(r.effectiveCaptureSize(1920, 1080)).toEqual({
      widthPx: 3840,
      heightPx: 2160,
    });
  });

  it("explicit capture size ignores viewport", () => {
    const m = ScreenshotManifestSchema.parse({
      enabled: true,
      capture: {
        captureWidthPx: 800,
        captureHeightPx: 600,
        superResolutionMultiplier: 1,
      },
      shareTargets: [{ id: "disk", kind: "saveToDisk", enabled: true }],
    });
    const r = new ScreenshotRegistry(m);
    expect(r.effectiveCaptureSize(1920, 1080)).toEqual({
      widthPx: 800,
      heightPx: 600,
    });
  });
});
