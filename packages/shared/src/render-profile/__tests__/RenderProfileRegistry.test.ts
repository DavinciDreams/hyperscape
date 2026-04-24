import { RenderProfileManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  RenderProfileNotLoadedError,
  RenderProfileRegistry,
  UnknownRenderProfileError,
} from "../RenderProfileRegistry.js";

function profile(id: string) {
  return { id, name: id };
}

describe("RenderProfileRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new RenderProfileRegistry().manifest).toThrow(
      RenderProfileNotLoadedError,
    );
  });

  it("indexes by id", () => {
    const m = RenderProfileManifestSchema.parse([
      profile("default"),
      profile("dungeon"),
    ]);
    const r = new RenderProfileRegistry(m);
    expect(r.ids).toEqual(["default", "dungeon"]);
    expect(r.has("dungeon")).toBe(true);
    expect(r.get("default").name).toBe("default");
  });

  it("throws on unknown", () => {
    const m = RenderProfileManifestSchema.parse([profile("only")]);
    const r = new RenderProfileRegistry(m);
    expect(() => r.get("ghost")).toThrow(UnknownRenderProfileError);
  });
});
