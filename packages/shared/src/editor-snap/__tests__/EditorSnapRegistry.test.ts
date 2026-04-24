import { EditorSnapManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  EditorSnapNotLoadedError,
  EditorSnapRegistry,
  snapToStep,
} from "../EditorSnapRegistry.js";

function manifest(snapByDefault = true) {
  return EditorSnapManifestSchema.parse({
    grid: { enabled: true, translate: 0.5, rotate: 15, scale: 0.1 },
    snapByDefault,
  });
}

describe("EditorSnapRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new EditorSnapRegistry().manifest).toThrow(
      EditorSnapNotLoadedError,
    );
  });

  it("snapToStep rounds to nearest multiple", () => {
    expect(snapToStep(1.3, 0.5)).toBe(1.5);
    expect(snapToStep(1.2, 0.5)).toBe(1);
    expect(snapToStep(-0.3, 0.5)).toBe(-0.5);
    expect(snapToStep(3.14, 0)).toBe(3.14);
  });

  it("snapTranslation uses grid.translate", () => {
    const r = new EditorSnapRegistry(manifest());
    expect(r.snapTranslation(1.3)).toBe(1.5);
  });

  it("snapRotationDeg uses grid.rotate", () => {
    const r = new EditorSnapRegistry(manifest());
    expect(r.snapRotationDeg(20)).toBe(15);
    expect(r.snapRotationDeg(23)).toBe(30);
  });

  it("snapScale uses grid.scale", () => {
    const r = new EditorSnapRegistry(manifest());
    expect(r.snapScale(1.24)).toBeCloseTo(1.2, 5);
  });

  it("isActive XORs snapByDefault with key state", () => {
    const rOn = new EditorSnapRegistry(manifest(true));
    expect(rOn.isActive(false)).toBe(true);
    expect(rOn.isActive(true)).toBe(false);
    const rOff = new EditorSnapRegistry(manifest(false));
    expect(rOff.isActive(false)).toBe(false);
    expect(rOff.isActive(true)).toBe(true);
  });
});
