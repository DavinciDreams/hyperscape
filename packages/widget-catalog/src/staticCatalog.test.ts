/**
 * Unit tests for static-catalog builders. Uses fixture widgets +
 * synthesized "source" strings — no filesystem I/O.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineWidget } from "@hyperforge/ui-framework";

import { buildStaticCatalogDocument, buildStaticEntry } from "./staticCatalog";

const tooltipWidget = defineWidget({
  manifest: {
    id: "test.overlay.tooltip",
    name: "Tooltip",
    description: "Hover hint with title and body.",
    category: "overlay",
    defaultSize: { width: 16, height: 8 },
  },
  propsSchema: z.object({
    title: z.string().default(""),
    body: z.string().default(""),
  }),
  defaultProps: {
    title: "",
    body: "",
  },
});

const hpBarWidget = defineWidget({
  manifest: {
    id: "test.hud.hp-bar",
    name: "HP Bar",
    description: "Horizontal HP bar.",
    category: "hud",
    defaultSize: { width: 24, height: 4 },
  },
  propsSchema: z.object({
    current: z.number(),
    max: z.number(),
  }),
  defaultProps: {
    current: 100,
    max: 100,
  },
});

const SAMPLE_SOURCE = `/**
 * TooltipWidget — first-paragraph summary that lands in the static
 * catalog as \`jsdocSummary\`.
 *
 * Body content the static catalog should NOT include.
 */
import { defineWidget } from "@hyperforge/ui-framework";`;

describe("buildStaticEntry", () => {
  it("composes a static entry from a widget + source + path", () => {
    const entry = buildStaticEntry({
      widget: tooltipWidget,
      source: SAMPLE_SOURCE,
      sourcePath: "packages/some/path/TooltipWidget.tsx",
    });
    expect(entry.id).toBe("test.overlay.tooltip");
    expect(entry.name).toBe("Tooltip");
    expect(entry.category).toBe("overlay");
    expect(entry.jsdocSummary).toContain("first-paragraph summary");
    expect(entry.sourcePath).toBe("packages/some/path/TooltipWidget.tsx");
  });

  it("falls back to empty jsdocSummary when source has no leading block", () => {
    const entry = buildStaticEntry({
      widget: tooltipWidget,
      source: `import x from "y"; export const z = 1;`,
      sourcePath: "x.tsx",
    });
    expect(entry.jsdocSummary).toBe("");
  });

  it("preserves the runtime catalog entry shape", () => {
    const entry = buildStaticEntry({
      widget: hpBarWidget,
      source: SAMPLE_SOURCE,
      sourcePath: "x.tsx",
    });
    // Runtime catalog fields still present.
    expect(entry.props.length).toBeGreaterThan(0);
    expect(entry.defaultProps).toEqual({ current: 100, max: 100 });
  });
});

describe("buildStaticCatalogDocument", () => {
  it("emits version + builtAt + sorted widget list", () => {
    const a = buildStaticEntry({
      widget: tooltipWidget,
      source: SAMPLE_SOURCE,
      sourcePath: "tooltip.tsx",
    });
    const b = buildStaticEntry({
      widget: hpBarWidget,
      source: SAMPLE_SOURCE,
      sourcePath: "hp-bar.tsx",
    });
    const fixedNow = new Date("2026-04-28T12:00:00.000Z");
    const doc = buildStaticCatalogDocument([a, b], {
      now: () => fixedNow,
    });
    expect(doc.version).toBe(1);
    expect(doc.builtAt).toBe("2026-04-28T12:00:00.000Z");
    // Sorted alphabetically by id.
    expect(doc.widgets.map((w) => w.id)).toEqual([
      "test.hud.hp-bar",
      "test.overlay.tooltip",
    ]);
  });

  it("computes stats", () => {
    const doc = buildStaticCatalogDocument([
      buildStaticEntry({
        widget: tooltipWidget,
        source: "",
        sourcePath: "",
      }),
      buildStaticEntry({
        widget: hpBarWidget,
        source: "",
        sourcePath: "",
      }),
    ]);
    expect(doc.stats.total).toBe(2);
    expect(doc.stats.byCategory).toEqual({ hud: 1, overlay: 1 });
  });

  it("is JSON-serializable round-trip-safe", () => {
    const doc = buildStaticCatalogDocument([
      buildStaticEntry({
        widget: tooltipWidget,
        source: SAMPLE_SOURCE,
        sourcePath: "tooltip.tsx",
      }),
    ]);
    const text = JSON.stringify(doc);
    const parsed = JSON.parse(text);
    expect(parsed.widgets.length).toBe(1);
    expect(parsed.widgets[0].jsdocSummary).toContain("first-paragraph summary");
  });

  it("handles empty input", () => {
    const doc = buildStaticCatalogDocument([]);
    expect(doc.widgets).toEqual([]);
    expect(doc.stats.total).toBe(0);
    expect(doc.stats.byCategory).toEqual({});
  });
});
