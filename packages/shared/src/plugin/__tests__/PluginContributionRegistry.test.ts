import { describe, expect, it } from "vitest";
import {
  DuplicateContributionIdError,
  PluginContributionRegistry,
  UnknownContributionIdError,
} from "../PluginContributionRegistry.js";

interface PaletteCategory {
  id: string;
  label: string;
}

function mkRegistry() {
  return new PluginContributionRegistry<PaletteCategory>(
    (c) => c.id,
    "paletteCategory",
  );
}

describe("PluginContributionRegistry", () => {
  it("starts empty", () => {
    const r = mkRegistry();
    expect(r.size).toBe(0);
    expect(r.records()).toEqual([]);
    expect(r.groupedByPlugin()).toEqual({});
  });

  it("registers items under a plugin id", () => {
    const r = mkRegistry();
    r.register("com.a.one", { id: "cat1", label: "One" });
    r.register("com.a.one", { id: "cat2", label: "Two" });
    expect(r.size).toBe(2);
    expect(r.has("cat1")).toBe(true);
    expect(r.has("cat2")).toBe(true);
    expect(r.idsForPlugin("com.a.one")).toEqual(["cat1", "cat2"]);
  });

  it("rejects duplicate ids across plugins with DuplicateContributionIdError", () => {
    const r = mkRegistry();
    r.register("com.a.one", { id: "catX", label: "X" });
    expect(() =>
      r.register("com.a.two", { id: "catX", label: "X2" }),
    ).toThrowError(DuplicateContributionIdError);
    // original wins
    expect(r.get("catX").label).toBe("X");
  });

  it("rejects duplicate ids within the same plugin", () => {
    const r = mkRegistry();
    r.register("com.a.one", { id: "catX", label: "X" });
    expect(() =>
      r.register("com.a.one", { id: "catX", label: "X2" }),
    ).toThrowError(DuplicateContributionIdError);
  });

  it("`registerAll` is equivalent to sequential `register`", () => {
    const r = mkRegistry();
    r.registerAll("com.a.one", [
      { id: "cat1", label: "One" },
      { id: "cat2", label: "Two" },
    ]);
    expect(r.idsForPlugin("com.a.one")).toEqual(["cat1", "cat2"]);
  });

  it("`unregister` removes a single item and clears the plugin bucket when empty", () => {
    const r = mkRegistry();
    r.register("com.a.one", { id: "cat1", label: "One" });
    r.unregister("cat1");
    expect(r.has("cat1")).toBe(false);
    expect(r.idsForPlugin("com.a.one")).toEqual([]);
  });

  it("`unregister` throws UnknownContributionIdError for missing id", () => {
    const r = mkRegistry();
    expect(() => r.unregister("cat-missing")).toThrowError(
      UnknownContributionIdError,
    );
  });

  it("`unregisterAllForPlugin` drops every item contributed by a plugin", () => {
    const r = mkRegistry();
    r.registerAll("com.a.one", [
      { id: "cat1", label: "One" },
      { id: "cat2", label: "Two" },
    ]);
    r.register("com.a.two", { id: "cat3", label: "Three" });

    r.unregisterAllForPlugin("com.a.one");
    expect(r.size).toBe(1);
    expect(r.has("cat1")).toBe(false);
    expect(r.has("cat2")).toBe(false);
    expect(r.has("cat3")).toBe(true);
    expect(r.idsForPlugin("com.a.one")).toEqual([]);
    expect(r.idsForPlugin("com.a.two")).toEqual(["cat3"]);
  });

  it("`unregisterAllForPlugin` is a no-op for plugins with nothing registered", () => {
    const r = mkRegistry();
    expect(() => r.unregisterAllForPlugin("com.a.nobody")).not.toThrow();
    expect(r.size).toBe(0);
  });

  it("allows a plugin to re-register its ids after unregistering (replacement flow)", () => {
    const r = mkRegistry();
    r.register("com.a.one", { id: "cat1", label: "One" });
    r.unregisterAllForPlugin("com.a.one");
    r.register("com.a.one", { id: "cat1", label: "One-v2" });
    expect(r.get("cat1").label).toBe("One-v2");
  });

  it("`records` preserves insertion order", () => {
    const r = mkRegistry();
    r.register("com.a.two", { id: "cat2", label: "Two" });
    r.register("com.a.one", { id: "cat1", label: "One" });
    r.register("com.a.three", { id: "cat3", label: "Three" });
    expect(r.records().map((rec) => rec.item.id)).toEqual([
      "cat2",
      "cat1",
      "cat3",
    ]);
    expect(r.records().map((rec) => rec.pluginId)).toEqual([
      "com.a.two",
      "com.a.one",
      "com.a.three",
    ]);
  });

  it("`groupedByPlugin` buckets items per plugin id", () => {
    const r = mkRegistry();
    r.registerAll("com.a.one", [
      { id: "cat1", label: "One" },
      { id: "cat2", label: "Two" },
    ]);
    r.register("com.a.two", { id: "cat3", label: "Three" });

    const grouped = r.groupedByPlugin();
    expect(Object.keys(grouped).sort()).toEqual(["com.a.one", "com.a.two"]);
    expect(grouped["com.a.one"].map((c) => c.id)).toEqual(["cat1", "cat2"]);
    expect(grouped["com.a.two"].map((c) => c.id)).toEqual(["cat3"]);
  });

  it("`get` throws UnknownContributionIdError for missing id", () => {
    const r = mkRegistry();
    expect(() => r.get("cat-missing")).toThrowError(UnknownContributionIdError);
  });

  it("custom `kind` surfaces in error messages", () => {
    const r = new PluginContributionRegistry<PaletteCategory>(
      (c) => c.id,
      "toolbarTool",
    );
    try {
      r.get("missing");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("toolbarTool");
    }
  });
});
