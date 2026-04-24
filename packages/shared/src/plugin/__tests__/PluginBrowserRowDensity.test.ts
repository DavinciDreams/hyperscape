import { describe, expect, it } from "vitest";
import {
  createPluginBrowserRowDensity,
  DEFAULT_PLUGIN_BROWSER_DENSITY,
  PLUGIN_BROWSER_DENSITY_METRICS,
} from "../PluginBrowserRowDensity.js";

describe("createPluginBrowserRowDensity — defaults", () => {
  it("defaults to the canonical default mode", () => {
    const d = createPluginBrowserRowDensity();
    expect(d.mode()).toBe(DEFAULT_PLUGIN_BROWSER_DENSITY);
  });

  it("exposes canonical metrics for the current mode", () => {
    const d = createPluginBrowserRowDensity();
    expect(d.metrics()).toEqual(
      PLUGIN_BROWSER_DENSITY_METRICS[DEFAULT_PLUGIN_BROWSER_DENSITY],
    );
  });
});

describe("createPluginBrowserRowDensity — initialMode", () => {
  it("honors an initialMode of 'compact'", () => {
    const d = createPluginBrowserRowDensity({ initialMode: "compact" });
    expect(d.mode()).toBe("compact");
    expect(d.metrics().rowHeightPx).toBe(
      PLUGIN_BROWSER_DENSITY_METRICS.compact.rowHeightPx,
    );
  });

  it("honors an initialMode of 'comfortable'", () => {
    const d = createPluginBrowserRowDensity({ initialMode: "comfortable" });
    expect(d.mode()).toBe("comfortable");
  });

  it("falls back to default when initialMode is an unknown value", () => {
    const d = createPluginBrowserRowDensity({
      // deliberately invalid — simulating stale persisted state
      initialMode: "giant" as unknown as "compact",
    });
    expect(d.mode()).toBe(DEFAULT_PLUGIN_BROWSER_DENSITY);
  });
});

describe("createPluginBrowserRowDensity — setMode", () => {
  it("changes the mode", () => {
    const d = createPluginBrowserRowDensity();
    d.setMode("compact");
    expect(d.mode()).toBe("compact");
    d.setMode("comfortable");
    expect(d.mode()).toBe("comfortable");
  });

  it("silently ignores unknown modes", () => {
    const d = createPluginBrowserRowDensity();
    d.setMode("giant" as unknown as "compact");
    expect(d.mode()).toBe(DEFAULT_PLUGIN_BROWSER_DENSITY);
  });

  it("metrics update to match the new mode", () => {
    const d = createPluginBrowserRowDensity();
    d.setMode("compact");
    expect(d.metrics()).toEqual(PLUGIN_BROWSER_DENSITY_METRICS.compact);
    d.setMode("comfortable");
    expect(d.metrics()).toEqual(PLUGIN_BROWSER_DENSITY_METRICS.comfortable);
  });
});

describe("createPluginBrowserRowDensity — cycle", () => {
  it("cycles compact → cozy → comfortable → compact", () => {
    const d = createPluginBrowserRowDensity({ initialMode: "compact" });
    d.cycle();
    expect(d.mode()).toBe("cozy");
    d.cycle();
    expect(d.mode()).toBe("comfortable");
    d.cycle();
    expect(d.mode()).toBe("compact");
  });
});

describe("createPluginBrowserRowDensity — reset", () => {
  it("restores the default mode", () => {
    const d = createPluginBrowserRowDensity({ initialMode: "compact" });
    d.reset();
    expect(d.mode()).toBe(DEFAULT_PLUGIN_BROWSER_DENSITY);
  });
});

describe("PLUGIN_BROWSER_DENSITY_METRICS — sanity", () => {
  it("compact row height is smaller than cozy, which is smaller than comfortable", () => {
    const a = PLUGIN_BROWSER_DENSITY_METRICS.compact.rowHeightPx;
    const b = PLUGIN_BROWSER_DENSITY_METRICS.cozy.rowHeightPx;
    const c = PLUGIN_BROWSER_DENSITY_METRICS.comfortable.rowHeightPx;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });

  it("all metric fields are positive integers", () => {
    for (const mode of ["compact", "cozy", "comfortable"] as const) {
      const m = PLUGIN_BROWSER_DENSITY_METRICS[mode];
      for (const v of [
        m.rowHeightPx,
        m.rowPaddingYPx,
        m.fontSizePx,
        m.iconSizePx,
        m.cellPaddingXPx,
      ]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it("metrics tables are frozen", () => {
    expect(Object.isFrozen(PLUGIN_BROWSER_DENSITY_METRICS)).toBe(true);
    expect(Object.isFrozen(PLUGIN_BROWSER_DENSITY_METRICS.compact)).toBe(true);
  });
});
