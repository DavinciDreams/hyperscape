import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  countLiveContributionsForPlugin,
  countLiveContributionsForPlugins,
} from "../PluginContributionCounts.js";

interface PaletteItem {
  readonly id: string;
  readonly label: string;
}

interface ToolbarItem {
  readonly id: string;
  readonly group: string;
}

function mkPalette() {
  return new PluginContributionRegistry<PaletteItem>((x) => x.id, "palette");
}

function mkToolbar() {
  return new PluginContributionRegistry<ToolbarItem>(
    (x) => x.id,
    "toolbarTool",
  );
}

describe("countLiveContributionsForPlugin", () => {
  it("returns an empty object when no registries are provided", () => {
    expect(countLiveContributionsForPlugin("com.a", [])).toEqual({});
  });

  it("emits zero for a registry where the plugin has no contributions", () => {
    const palette = mkPalette();
    expect(countLiveContributionsForPlugin("com.a", [palette])).toEqual({
      palette: 0,
    });
  });

  it("counts items the plugin owns across two distinct-kind registries", () => {
    const palette = mkPalette();
    const toolbar = mkToolbar();

    palette.registerAll("com.a", [
      { id: "p.1", label: "one" },
      { id: "p.2", label: "two" },
    ]);
    toolbar.registerAll("com.a", [{ id: "t.1", group: "edit" }]);
    toolbar.registerAll("com.b", [{ id: "t.2", group: "view" }]);

    expect(
      countLiveContributionsForPlugin("com.a", [palette, toolbar]),
    ).toEqual({
      palette: 2,
      toolbarTool: 1,
    });
  });

  it("sums counts when two registries share a `kind`", () => {
    const palette1 = mkPalette();
    const palette2 = mkPalette();
    palette1.registerAll("com.a", [{ id: "p.1", label: "a" }]);
    palette2.registerAll("com.a", [
      { id: "p.2", label: "b" },
      { id: "p.3", label: "c" },
    ]);
    expect(
      countLiveContributionsForPlugin("com.a", [palette1, palette2]),
    ).toEqual({ palette: 3 });
  });
});

describe("countLiveContributionsForPlugins", () => {
  it("returns an empty record when plugin-id list is empty", () => {
    const palette = mkPalette();
    expect(countLiveContributionsForPlugins([], [palette])).toEqual({});
  });

  it("produces a uniform shape for each plugin id, including zero-owners", () => {
    const palette = mkPalette();
    const toolbar = mkToolbar();
    palette.registerAll("com.a", [{ id: "p.1", label: "one" }]);
    toolbar.registerAll("com.b", [{ id: "t.1", group: "edit" }]);

    expect(
      countLiveContributionsForPlugins(
        ["com.a", "com.b", "com.c"],
        [palette, toolbar],
      ),
    ).toEqual({
      "com.a": { palette: 1, toolbarTool: 0 },
      "com.b": { palette: 0, toolbarTool: 1 },
      "com.c": { palette: 0, toolbarTool: 0 },
    });
  });

  it("does not mutate registries", () => {
    const palette = mkPalette();
    palette.registerAll("com.a", [{ id: "p.1", label: "one" }]);
    const sizeBefore = palette.size;
    countLiveContributionsForPlugins(["com.a", "com.b"], [palette]);
    expect(palette.size).toBe(sizeBefore);
  });
});
