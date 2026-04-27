import { SkyboxAtmosphereManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  SkyboxAtmosphereNotLoadedError,
  SkyboxAtmosphereRegistry,
  UnknownSkyboxError,
} from "../SkyboxAtmosphereRegistry.js";

function skybox(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} preset`,
    sun: {
      direction: { x: 0.3, y: 0.8, z: 0.2 },
      color: "#ffffff",
      angularDiameterDeg: 0.53,
      intensity: 1,
    },
    moon: {
      direction: { x: -0.3, y: 0.8, z: -0.2 },
      color: "#aaaacc",
      angularDiameterDeg: 0.5,
      intensity: 0.2,
    },
  };
}

function manifest() {
  return SkyboxAtmosphereManifestSchema.parse({
    skyboxes: [skybox("dayClear", "Day Clear"), skybox("duskOrange", "Dusk")],
    activeSkyboxId: "dayClear",
  });
}

describe("SkyboxAtmosphereRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new SkyboxAtmosphereRegistry().manifest).toThrow(
      SkyboxAtmosphereNotLoadedError,
    );
  });

  it("indexes by id + get/has/all/ids", () => {
    const r = new SkyboxAtmosphereRegistry(manifest());
    expect(r.has("dayClear")).toBe(true);
    expect(r.has("ghost")).toBe(false);
    expect(r.ids.sort()).toEqual(["dayClear", "duskOrange"]);
    expect(r.get("dayClear").name).toBe("Day Clear");
    expect(r.all().length).toBe(2);
    expect(() => r.get("ghost")).toThrow(UnknownSkyboxError);
  });

  it("active + activeId", () => {
    const r = new SkyboxAtmosphereRegistry(manifest());
    expect(r.activeId).toBe("dayClear");
    expect(r.active.name).toBe("Day Clear");
  });
});

describe("SkyboxAtmosphereRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new SkyboxAtmosphereRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new SkyboxAtmosphereRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new SkyboxAtmosphereRegistry();
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
