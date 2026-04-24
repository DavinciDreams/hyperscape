import { describe, expect, it } from "vitest";
import {
  createPluginBrowserViewMode,
  DEFAULT_PLUGIN_BROWSER_VIEW_MODE,
  PLUGIN_BROWSER_VIEW_MODE_METRICS,
} from "../PluginBrowserViewMode.js";

describe("createPluginBrowserViewMode — defaults", () => {
  it("defaults to the canonical mode", () => {
    const v = createPluginBrowserViewMode();
    expect(v.mode()).toBe(DEFAULT_PLUGIN_BROWSER_VIEW_MODE);
  });

  it("exposes canonical metrics for the current mode", () => {
    const v = createPluginBrowserViewMode();
    expect(v.metrics()).toEqual(
      PLUGIN_BROWSER_VIEW_MODE_METRICS[DEFAULT_PLUGIN_BROWSER_VIEW_MODE],
    );
  });
});

describe("createPluginBrowserViewMode — initialMode", () => {
  it("honors initialMode='grid'", () => {
    const v = createPluginBrowserViewMode({
      initialMode: "grid",
    });
    expect(v.mode()).toBe("grid");
  });

  it("honors initialMode='cards'", () => {
    const v = createPluginBrowserViewMode({
      initialMode: "cards",
    });
    expect(v.mode()).toBe("cards");
  });

  it("falls back to default when initialMode is unknown", () => {
    const v = createPluginBrowserViewMode({
      initialMode: "gallery" as unknown as "list",
    });
    expect(v.mode()).toBe(DEFAULT_PLUGIN_BROWSER_VIEW_MODE);
  });
});

describe("createPluginBrowserViewMode — setMode", () => {
  it("changes the mode", () => {
    const v = createPluginBrowserViewMode();
    v.setMode("grid");
    expect(v.mode()).toBe("grid");
    v.setMode("cards");
    expect(v.mode()).toBe("cards");
  });

  it("silently ignores unknown modes", () => {
    const v = createPluginBrowserViewMode();
    v.setMode("gallery" as unknown as "list");
    expect(v.mode()).toBe(DEFAULT_PLUGIN_BROWSER_VIEW_MODE);
  });

  it("metrics update to match new mode", () => {
    const v = createPluginBrowserViewMode();
    v.setMode("grid");
    expect(v.metrics()).toEqual(PLUGIN_BROWSER_VIEW_MODE_METRICS.grid);
  });
});

describe("createPluginBrowserViewMode — cycle", () => {
  it("cycles list → grid → cards → list", () => {
    const v = createPluginBrowserViewMode({
      initialMode: "list",
    });
    v.cycle();
    expect(v.mode()).toBe("grid");
    v.cycle();
    expect(v.mode()).toBe("cards");
    v.cycle();
    expect(v.mode()).toBe("list");
  });
});

describe("createPluginBrowserViewMode — reset", () => {
  it("restores the default mode", () => {
    const v = createPluginBrowserViewMode({
      initialMode: "cards",
    });
    v.reset();
    expect(v.mode()).toBe(DEFAULT_PLUGIN_BROWSER_VIEW_MODE);
  });
});

describe("PLUGIN_BROWSER_VIEW_MODE_METRICS — sanity", () => {
  it("list mode uses fill width", () => {
    expect(PLUGIN_BROWSER_VIEW_MODE_METRICS.list.itemWidthPx).toBe("fill");
  });

  it("grid + cards use numeric widths", () => {
    expect(typeof PLUGIN_BROWSER_VIEW_MODE_METRICS.grid.itemWidthPx).toBe(
      "number",
    );
    expect(typeof PLUGIN_BROWSER_VIEW_MODE_METRICS.cards.itemWidthPx).toBe(
      "number",
    );
  });

  it("cards mode has rich metadata, list+grid don't", () => {
    expect(PLUGIN_BROWSER_VIEW_MODE_METRICS.cards.showRichMetadata).toBe(true);
    expect(PLUGIN_BROWSER_VIEW_MODE_METRICS.list.showRichMetadata).toBe(false);
    expect(PLUGIN_BROWSER_VIEW_MODE_METRICS.grid.showRichMetadata).toBe(false);
  });

  it("positive integer itemHeightPx across modes", () => {
    for (const m of ["list", "grid", "cards"] as const) {
      const h = PLUGIN_BROWSER_VIEW_MODE_METRICS[m].itemHeightPx;
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });

  it("metrics tables are frozen", () => {
    expect(Object.isFrozen(PLUGIN_BROWSER_VIEW_MODE_METRICS)).toBe(true);
    expect(Object.isFrozen(PLUGIN_BROWSER_VIEW_MODE_METRICS.grid)).toBe(true);
  });
});
