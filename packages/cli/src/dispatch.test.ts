import { describe, expect, it } from "vitest";
import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import { dispatch } from "./dispatch";
import { parseArgs } from "./parseArgs";

const catalog: StaticCatalogDocument = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.demo.alpha",
      name: "Alpha",
      description: "First",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: { total: 1, byCategory: { panel: 1 } },
};

const loader = () => catalog;

describe("dispatch", () => {
  it("returns help for no args", () => {
    const r = dispatch(parseArgs([]));
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("HyperForge CLI");
  });

  it("returns help for --help", () => {
    const r = dispatch(parseArgs(["--help"]));
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("Usage");
  });

  it("dispatches to widgets list", () => {
    const r = dispatch(parseArgs(["widgets", "list"]), {
      catalogLoader: loader,
    });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("com.test.demo.alpha");
  });

  it("dispatches to widgets get + returns 3 for unknown", () => {
    const ok = dispatch(parseArgs(["widgets", "get", "com.test.demo.alpha"]), {
      catalogLoader: loader,
    });
    expect(ok.exitCode).toBe(0);

    const bad = dispatch(parseArgs(["widgets", "get", "nope"]), {
      catalogLoader: loader,
    });
    expect(bad.exitCode).toBe(3);
  });

  it("dispatches to catalog stats", () => {
    const r = dispatch(parseArgs(["catalog", "stats"]), {
      catalogLoader: loader,
    });
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("total:    1");
  });

  it("returns 1 for unknown top-level command", () => {
    const r = dispatch(parseArgs(["bogus"]));
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("Unknown command");
  });

  it("returns 1 for unknown widgets subcommand", () => {
    const r = dispatch(parseArgs(["widgets", "explode"]), {
      catalogLoader: loader,
    });
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("Usage");
  });

  it("returns 2 when catalog loader throws", () => {
    const r = dispatch(parseArgs(["widgets", "list"]), {
      catalogLoader: () => {
        throw new Error("simulated missing catalog");
      },
    });
    expect(r.exitCode).toBe(2);
    expect(r.text).toContain("simulated missing catalog");
  });
});
