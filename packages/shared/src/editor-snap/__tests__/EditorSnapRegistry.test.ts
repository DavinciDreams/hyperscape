import { EditorSnapManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
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

describe("EditorSnapRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new EditorSnapRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new EditorSnapRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new EditorSnapRegistry();
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
