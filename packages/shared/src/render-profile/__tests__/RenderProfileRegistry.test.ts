import { RenderProfileManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
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

describe("RenderProfileRegistry — onReloaded", () => {
  const manifest = () => RenderProfileManifestSchema.parse([profile("hi")]);

  it("fires after every successful load()", () => {
    const r = new RenderProfileRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new RenderProfileRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new RenderProfileRegistry();
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
