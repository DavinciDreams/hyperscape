import { BuildingsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
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
});
