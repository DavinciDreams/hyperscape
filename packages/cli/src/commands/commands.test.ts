import { describe, expect, it } from "vitest";
import type { StaticCatalogDocument } from "@hyperforge/widget-catalog";
import { parseArgs } from "../parseArgs";
import { widgetsListCommand } from "./widgetsList";
import { widgetsGetCommand } from "./widgetsGet";
import { widgetsSearchCommand } from "./widgetsSearch";
import { catalogStatsCommand } from "./catalogStats";

const fixture: StaticCatalogDocument = {
  version: 1,
  builtAt: "2026-04-28T19:00:00.000Z",
  widgets: [
    {
      id: "com.test.demo.alpha",
      name: "Alpha",
      description: "First demo widget",
      category: "panel",
      defaultSize: { width: 4, height: 3 },
      icon: "",
      props: [
        {
          name: "label",
          type: "string",
          optional: true,
          description: "Label text",
        },
      ],
      defaultProps: { label: "" },
      jsdocSummary: "Alpha widget — does alpha things.",
      sourcePath: "packages/test/src/widgets/AlphaWidget.tsx",
    },
    {
      id: "com.test.demo.beta",
      name: "Beta",
      description: "Second demo widget",
      category: "hud",
      defaultSize: { width: 2, height: 2 },
      icon: "",
      props: [],
      defaultProps: {},
      jsdocSummary: "",
      sourcePath: "",
    },
  ],
  stats: {
    total: 2,
    byCategory: { panel: 1, hud: 1 },
  },
};

describe("widgetsListCommand", () => {
  it("returns every widget with text format", () => {
    const r = widgetsListCommand(fixture, parseArgs(["widgets", "list"]));
    expect(r.exitCode).toBe(0);
    expect(r.data.count).toBe(2);
    expect(r.text).toContain("com.test.demo.alpha");
    expect(r.text).toContain("com.test.demo.beta");
  });

  it("filters by --category", () => {
    const r = widgetsListCommand(
      fixture,
      parseArgs(["widgets", "list", "--category", "panel"]),
    );
    expect(r.data.count).toBe(1);
    expect(r.data.widgets[0]!.id).toBe("com.test.demo.alpha");
  });

  it("emits JSON when --format=json", () => {
    const r = widgetsListCommand(
      fixture,
      parseArgs(["widgets", "list", "--format=json"]),
    );
    expect(() => JSON.parse(r.text)).not.toThrow();
    const parsed = JSON.parse(r.text);
    expect(parsed.count).toBe(2);
  });

  it("handles empty result with friendly text", () => {
    const r = widgetsListCommand(
      fixture,
      parseArgs(["widgets", "list", "--category=ghost"]),
    );
    expect(r.exitCode).toBe(0);
    expect(r.data.count).toBe(0);
    expect(r.text).toContain('"ghost"');
  });
});

describe("widgetsGetCommand", () => {
  it("returns the entry for a known id", () => {
    const r = widgetsGetCommand(
      fixture,
      parseArgs(["widgets", "get", "com.test.demo.alpha"]),
    );
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("Alpha");
    expect(r.text).toContain("category:    panel");
    expect(r.text).toContain("Label text");
  });

  it("emits JSON when --format=json", () => {
    const r = widgetsGetCommand(
      fixture,
      parseArgs(["widgets", "get", "com.test.demo.alpha", "--format=json"]),
    );
    const parsed = JSON.parse(r.text) as { id: string };
    expect(parsed.id).toBe("com.test.demo.alpha");
  });

  it("returns exit 3 for unknown id", () => {
    const r = widgetsGetCommand(
      fixture,
      parseArgs(["widgets", "get", "com.test.demo.gamma"]),
    );
    expect(r.exitCode).toBe(3);
    expect(r.text).toContain("not found");
  });

  it("returns exit 1 when id is missing", () => {
    const r = widgetsGetCommand(fixture, parseArgs(["widgets", "get"]));
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("Usage");
  });
});

describe("widgetsSearchCommand", () => {
  it("matches across id/name/description/summary", () => {
    const byName = widgetsSearchCommand(
      fixture,
      parseArgs(["widgets", "search", "alpha"]),
    );
    expect(byName.exitCode).toBe(0);
    expect("count" in byName.data ? byName.data.count : 0).toBe(1);

    const byDesc = widgetsSearchCommand(
      fixture,
      parseArgs(["widgets", "search", "second"]),
    );
    expect("count" in byDesc.data ? byDesc.data.count : 0).toBe(1);

    const bySummary = widgetsSearchCommand(
      fixture,
      parseArgs(["widgets", "search", "alpha things"]),
    );
    expect("count" in bySummary.data ? bySummary.data.count : 0).toBe(1);
  });

  it("returns zero matches with friendly text", () => {
    const r = widgetsSearchCommand(
      fixture,
      parseArgs(["widgets", "search", "nothingmatchesthis"]),
    );
    expect(r.exitCode).toBe(0);
    expect(r.text).toContain("No widgets match");
  });

  it("returns exit 1 when query missing", () => {
    const r = widgetsSearchCommand(fixture, parseArgs(["widgets", "search"]));
    expect(r.exitCode).toBe(1);
    expect(r.text).toContain("Usage");
  });
});

describe("catalogStatsCommand", () => {
  it("returns total + byCategory + builtAt", () => {
    const r = catalogStatsCommand(fixture, parseArgs(["catalog", "stats"]));
    expect(r.exitCode).toBe(0);
    expect(r.data.total).toBe(2);
    expect(r.data.byCategory.panel).toBe(1);
    expect(r.data.byCategory.hud).toBe(1);
    expect(r.text).toContain("total:    2");
  });

  it("emits valid JSON when --format=json", () => {
    const r = catalogStatsCommand(
      fixture,
      parseArgs(["catalog", "stats", "--format=json"]),
    );
    const parsed = JSON.parse(r.text) as { total: number };
    expect(parsed.total).toBe(2);
  });
});
