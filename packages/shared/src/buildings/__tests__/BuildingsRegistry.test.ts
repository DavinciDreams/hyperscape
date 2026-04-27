import { BuildingsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  BuildingsNotLoadedError,
  BuildingsRegistry,
  UnknownBuildingError,
} from "../BuildingsRegistry.js";

describe("BuildingsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new BuildingsRegistry().manifest).toThrow(
      BuildingsNotLoadedError,
    );
  });

  it("handles empty manifest", () => {
    const r = new BuildingsRegistry(BuildingsManifestSchema.parse([]));
    expect(r.ids).toEqual([]);
    expect(r.all()).toEqual([]);
  });

  it("indexes by id", () => {
    const r = new BuildingsRegistry(
      BuildingsManifestSchema.parse([
        { id: "house_small", size: "small", floors: 1 },
        { id: "watchtower", size: "medium", floors: 3 },
      ]),
    );
    expect(r.ids).toEqual(["house_small", "watchtower"]);
    expect(r.get("watchtower").id).toBe("watchtower");
    expect(r.has("house_small")).toBe(true);
  });

  it("throws UnknownBuildingError on miss", () => {
    const r = new BuildingsRegistry(
      BuildingsManifestSchema.parse([{ id: "house_small" }]),
    );
    expect(() => r.get("ghost")).toThrow(UnknownBuildingError);
  });

  describe("onReloaded", () => {
    it("fires after every successful load()", () => {
      const r = new BuildingsRegistry();
      const cb = vi.fn();
      r.onReloaded(cb);
      r.load(BuildingsManifestSchema.parse([{ id: "a" }]));
      r.load(BuildingsManifestSchema.parse([{ id: "b" }]));
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("returned unsubscribe stops further notifications", () => {
      const r = new BuildingsRegistry();
      const cb = vi.fn();
      const off = r.onReloaded(cb);
      r.load(BuildingsManifestSchema.parse([{ id: "a" }]));
      off();
      r.load(BuildingsManifestSchema.parse([{ id: "b" }]));
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("a throwing listener does not break subsequent listeners", () => {
      const r = new BuildingsRegistry();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const bad = vi.fn(() => {
        throw new Error("listener boom");
      });
      const good = vi.fn();
      r.onReloaded(bad);
      r.onReloaded(good);
      r.load(BuildingsManifestSchema.parse([{ id: "a" }]));
      expect(bad).toHaveBeenCalledTimes(1);
      expect(good).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});
