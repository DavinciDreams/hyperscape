import { RenderProfileManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  RenderProfileRegistry,
  UnknownRenderProfileError,
} from "../RenderProfileRegistry.js";

function manifest() {
  return RenderProfileManifestSchema.parse([
    { id: "hyperscape-default", name: "Hyperscape Default" },
    {
      id: "dark-dungeon",
      name: "Dark Dungeon",
      toneMapping: "reinhard",
      exposure: 0.6,
    },
  ]);
}

describe("RenderProfileRegistry", () => {
  it("indexes profiles by id", () => {
    const reg = new RenderProfileRegistry(manifest());
    expect(reg.size).toBe(2);
    expect(reg.has("hyperscape-default")).toBe(true);
    expect(reg.get("dark-dungeon").exposure).toBe(0.6);
  });

  it("defaults to the first profile when no defaultId provided", () => {
    const reg = new RenderProfileRegistry(manifest());
    expect(reg.defaultId).toBe("hyperscape-default");
    expect(reg.getDefault().id).toBe("hyperscape-default");
  });

  it("honors an explicit defaultId", () => {
    const reg = new RenderProfileRegistry(manifest(), "dark-dungeon");
    expect(reg.getDefault().id).toBe("dark-dungeon");
  });

  it("throws when defaultId is not present in the manifest", () => {
    expect(() => new RenderProfileRegistry(manifest(), "ghost")).toThrow(
      UnknownRenderProfileError,
    );
  });

  it("setDefault updates the active default", () => {
    const reg = new RenderProfileRegistry(manifest());
    reg.setDefault("dark-dungeon");
    expect(reg.getDefault().id).toBe("dark-dungeon");
  });

  it("setDefault throws on unknown id", () => {
    const reg = new RenderProfileRegistry(manifest());
    expect(() => reg.setDefault("ghost")).toThrow(UnknownRenderProfileError);
  });

  it("get throws UnknownRenderProfileError on miss", () => {
    const reg = new RenderProfileRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownRenderProfileError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new RenderProfileRegistry();
    reg.loadFromJson([{ id: "only", name: "Only" }]);
    expect(reg.size).toBe(1);
  });

  it("load replaces prior profiles", () => {
    const reg = new RenderProfileRegistry(manifest());
    reg.load(
      RenderProfileManifestSchema.parse([{ id: "fresh", name: "Fresh" }]),
    );
    expect(reg.size).toBe(1);
    expect(reg.has("hyperscape-default")).toBe(false);
    expect(reg.getDefault().id).toBe("fresh");
  });
});
