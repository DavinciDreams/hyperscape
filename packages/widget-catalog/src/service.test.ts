/**
 * Round-trip tests for the catalog service. Builds a few fixture
 * widgets, registers them, queries through the service, and asserts
 * the returned shape matches the documented contract.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { WidgetRegistry, defineWidget } from "@hyperforge/ui-framework";

import {
  WidgetCatalogService,
  extractPropSummary,
  fromRegistry,
  toCatalogEntry,
} from "./index";

// ---- fixture widgets ------------------------------------------------

const hpBarWidget = defineWidget({
  manifest: {
    id: "test.hud.hp-bar",
    name: "HP Bar",
    description: "Horizontal HP bar with optional numeric readout.",
    category: "hud",
    icon: "heart",
    defaultSize: { width: 24, height: 4 },
  },
  propsSchema: z.object({
    current: z.number().describe("Current HP value (≥ 0)."),
    max: z.number().describe("Maximum HP. Bar fills relative to this."),
    showNumeric: z
      .boolean()
      .default(true)
      .describe("Render the `current/max` text overlay."),
    color: z
      .enum(["red", "green", "yellow"])
      .default("red")
      .describe("Bar fill color."),
    onLowHpThreshold: z
      .number()
      .optional()
      .describe("Optional pulse-trigger HP fraction (0..1)."),
  }),
  defaultProps: {
    current: 100,
    max: 100,
    showNumeric: true,
    color: "red",
  },
});

const chatPanelWidget = defineWidget({
  manifest: {
    id: "test.panel.chat",
    name: "Chat Panel",
    description: "Scrolling chat log with input field.",
    category: "panel",
    defaultSize: { width: 32, height: 16 },
  },
  propsSchema: z.object({
    maxLines: z.number().default(100),
    showTimestamps: z.boolean().default(false),
  }),
  defaultProps: {
    maxLines: 100,
    showTimestamps: false,
  },
});

const debugStatsWidget = defineWidget({
  manifest: {
    id: "test.debug.stats",
    name: "Debug Stats",
    category: "debug",
    defaultSize: { width: 16, height: 8 },
  },
  propsSchema: z.object({
    rows: z.array(z.string()).default([]),
  }),
  defaultProps: {
    rows: [],
  },
});

function buildPopulatedRegistry() {
  const registry = new WidgetRegistry<unknown>();
  registry.defineWidget(hpBarWidget);
  registry.defineWidget(chatPanelWidget);
  registry.defineWidget(debugStatsWidget);
  return registry;
}

// ---- toCatalogEntry -------------------------------------------------

describe("toCatalogEntry", () => {
  it("derives the basic entry shape from a widget manifest", () => {
    const entry = toCatalogEntry(hpBarWidget);
    expect(entry.id).toBe("test.hud.hp-bar");
    expect(entry.name).toBe("HP Bar");
    expect(entry.description).toContain("HP bar");
    expect(entry.category).toBe("hud");
    expect(entry.icon).toBe("heart");
    expect(entry.defaultSize).toEqual({ width: 24, height: 4 });
  });

  it("falls back to empty strings when description / icon are absent", () => {
    const entry = toCatalogEntry(debugStatsWidget);
    expect(entry.description).toBe("");
    expect(entry.icon).toBe("");
  });

  it("freezes defaultProps to surface mutation attempts in dev", () => {
    const entry = toCatalogEntry(hpBarWidget);
    expect(Object.isFrozen(entry.defaultProps)).toBe(true);
  });

  it("includes a prop summary derived from the schema", () => {
    const entry = toCatalogEntry(hpBarWidget);
    const names = entry.props.map((p) => p.name);
    expect(names).toEqual([
      "current",
      "max",
      "showNumeric",
      "color",
      "onLowHpThreshold",
    ]);
  });
});

// ---- extractPropSummary ---------------------------------------------

describe("extractPropSummary", () => {
  it("classifies primitive types with descriptions", () => {
    const props = extractPropSummary(hpBarWidget.propsSchema);
    const current = props.find((p) => p.name === "current");
    expect(current).toBeDefined();
    expect(current?.type).toBe("number");
    expect(current?.optional).toBe(false);
    expect(current?.description).toContain("Current HP");
  });

  it("marks defaulted fields as optional", () => {
    const props = extractPropSummary(hpBarWidget.propsSchema);
    const showNumeric = props.find((p) => p.name === "showNumeric");
    expect(showNumeric?.type).toBe("boolean");
    expect(showNumeric?.optional).toBe(true);
  });

  it("marks .optional() fields as optional", () => {
    const props = extractPropSummary(hpBarWidget.propsSchema);
    const onLow = props.find((p) => p.name === "onLowHpThreshold");
    expect(onLow?.optional).toBe(true);
  });

  it("surfaces enum values when present", () => {
    const props = extractPropSummary(hpBarWidget.propsSchema);
    const color = props.find((p) => p.name === "color");
    expect(color?.type).toBe("enum");
    expect(color?.enumValues).toEqual(["red", "green", "yellow"]);
  });

  it("classifies arrays", () => {
    const props = extractPropSummary(debugStatsWidget.propsSchema);
    const rows = props.find((p) => p.name === "rows");
    expect(rows?.type).toBe("array");
    expect(rows?.optional).toBe(true);
  });

  it("returns empty array for non-object schemas", () => {
    expect(extractPropSummary(z.string())).toEqual([]);
    expect(extractPropSummary(z.number())).toEqual([]);
  });
});

// ---- WidgetCatalogService -------------------------------------------

describe("WidgetCatalogService", () => {
  it("lists every registered widget in registration order", () => {
    const registry = buildPopulatedRegistry();
    const catalog = new WidgetCatalogService(fromRegistry(registry));
    const list = catalog.listWidgets();
    expect(list.map((w) => w.id)).toEqual([
      "test.hud.hp-bar",
      "test.panel.chat",
      "test.debug.stats",
    ]);
  });

  it("looks up by id", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    const hp = catalog.getWidget("test.hud.hp-bar");
    expect(hp?.name).toBe("HP Bar");
    expect(catalog.getWidget("nonexistent")).toBeNull();
  });

  it("filters by category", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    const huds = catalog.listWidgets({ category: "hud" });
    expect(huds.map((w) => w.id)).toEqual(["test.hud.hp-bar"]);
    const debugs = catalog.getCategory("debug");
    expect(debugs.map((w) => w.id)).toEqual(["test.debug.stats"]);
  });

  it("filters by case-insensitive substring across id/name/description", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    expect(catalog.searchWidgets("CHAT").map((w) => w.id)).toEqual([
      "test.panel.chat",
    ]);
    expect(catalog.searchWidgets("hp").map((w) => w.id)).toEqual([
      "test.hud.hp-bar",
    ]);
    // matches description text, not just id
    expect(
      catalog.searchWidgets("scrolling chat log").map((w) => w.id),
    ).toEqual(["test.panel.chat"]);
    // no match → empty
    expect(catalog.searchWidgets("nope")).toEqual([]);
  });

  it("composes category + search filters", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    const out = catalog.listWidgets({ category: "panel", search: "chat" });
    expect(out.map((w) => w.id)).toEqual(["test.panel.chat"]);
    const empty = catalog.listWidgets({ category: "hud", search: "chat" });
    expect(empty).toEqual([]);
  });

  it("lists categories that have at least one widget", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    expect(catalog.listCategories().sort()).toEqual(["debug", "hud", "panel"]);
  });

  it("reports stats", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    const stats = catalog.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byCategory).toEqual({ hud: 1, panel: 1, debug: 1 });
  });

  it("returns fresh arrays so callers can mutate without side effects", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(buildPopulatedRegistry()),
    );
    const a = catalog.listWidgets();
    const b = catalog.listWidgets();
    expect(a).not.toBe(b);
    // mutating the returned array doesn't break the next call
    (
      a as WidgetCatalogService["listWidgets"] extends () => infer R
        ? R extends ReadonlyArray<infer _>
          ? unknown[]
          : never
        : never
    ).pop();
    expect(catalog.listWidgets().length).toBe(3);
  });

  it("refreshes after late registrations", () => {
    const registry = new WidgetRegistry<unknown>();
    registry.defineWidget(hpBarWidget);
    const catalog = new WidgetCatalogService(fromRegistry(registry));
    expect(catalog.getStats().total).toBe(1);
    registry.defineWidget(chatPanelWidget);
    // before refresh — stale view
    expect(catalog.getStats().total).toBe(1);
    catalog.refresh();
    expect(catalog.getStats().total).toBe(2);
  });

  it("uses an injected `now` for deterministic refresh timestamps", () => {
    const registry = buildPopulatedRegistry();
    let t = 1000;
    const catalog = new WidgetCatalogService(fromRegistry(registry), {
      now: () => t,
    });
    expect(catalog.getLastRefreshedAt()).toBe(1000);
    t = 2000;
    catalog.refresh();
    expect(catalog.getLastRefreshedAt()).toBe(2000);
  });

  it("works with an empty registry", () => {
    const catalog = new WidgetCatalogService(
      fromRegistry(new WidgetRegistry<unknown>()),
    );
    expect(catalog.listWidgets()).toEqual([]);
    expect(catalog.listCategories()).toEqual([]);
    expect(catalog.getStats()).toEqual({ total: 0, byCategory: {} });
  });
});
