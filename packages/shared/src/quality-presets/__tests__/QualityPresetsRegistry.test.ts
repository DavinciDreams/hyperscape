import { QualityPresetsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  QualityPresetsNotLoadedError,
  QualityPresetsRegistry,
  UnknownQualityPresetError,
} from "../QualityPresetsRegistry.js";

function preset(id: string) {
  return {
    id,
    name: id,
    shadowResolution: "2048" as const,
    shadowDistance: 100,
    reflections: "cubemap" as const,
    postProcess: {
      bloom: true,
      toneMapping: true,
      ssao: false,
      motionBlur: false,
      depthOfField: false,
      colorGrading: true,
      vignette: false,
    },
    particleDensity: 0.75,
  };
}

function manifest() {
  return QualityPresetsManifestSchema.parse([
    preset("low"),
    preset("medium"),
    preset("high"),
    preset("ultra"),
  ]);
}

describe("QualityPresetsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new QualityPresetsRegistry().manifest).toThrow(
      QualityPresetsNotLoadedError,
    );
  });

  it("indexes by id", () => {
    const r = new QualityPresetsRegistry(manifest());
    expect(r.ids).toEqual(["low", "medium", "high", "ultra"]);
    expect(r.has("high")).toBe(true);
    expect(r.get("ultra").name).toBe("ultra");
  });

  it("throws on unknown", () => {
    const r = new QualityPresetsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownQualityPresetError);
  });

  it("loadFromJson parses and loads", () => {
    const r = new QualityPresetsRegistry();
    r.loadFromJson([preset("only")]);
    expect(r.has("only")).toBe(true);
  });
});

describe("QualityPresetsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new QualityPresetsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new QualityPresetsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new QualityPresetsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
