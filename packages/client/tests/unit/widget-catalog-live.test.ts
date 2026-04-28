/**
 * Live integration test for `@hyperforge/widget-catalog` against
 * the client's process-wide `uiRegistry`.
 *
 * Phase A1 of `PLAN_AI_AUTHORING_FOUNDATIONS.md` — slice 2.
 *
 * The unit-only catalog tests in `widget-catalog/src/service.test.ts`
 * use fixture widgets in a fresh registry. This test asserts the
 * service works against the **same** registry the live client uses,
 * the one populated by `bindAllWidgets()` from the
 * `@hyperforge/ui-widgets` bindings.
 *
 * Plugin-contributed widgets (the `com.hyperforge.hyperscape.*` set
 * from slices 31-80) are NOT exercised here because importing
 * `@hyperforge/hyperscape` from a vitest run currently triggers a
 * pre-existing module-load failure in `DuelArenaVisualsSystem.ts`
 * — same failure that breaks `client-plugin-boot.test.ts`. The
 * catalog's ability to hold plugin-style registrations is proven
 * by the unit-test suite in `widget-catalog/src/service.test.ts`
 * (which uses `defineWidget()` + `WidgetRegistry.register()` to
 * stand in for the plugin onEnable path). When the upstream
 * module-load issue is fixed, this test can be extended to
 * additionally exercise plugin widgets without touching the
 * catalog's contract.
 */

import { describe, expect, it } from "vitest";

import { bindAllWidgets, uiRegistry } from "../../src/ui-framework/bindings";
import { WidgetCatalogService, fromRegistry } from "@hyperforge/widget-catalog";

describe("Widget catalog — live `uiRegistry` integration (builtins)", () => {
  it("catalog finds builtin widgets after `bindAllWidgets()`", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));
    const ids = catalog.listWidgets().map((w) => w.id);
    // Sentinel ids from `@hyperforge/ui-widgets/bindings.ts`. If
    // any of these ever moves, this test fails loudly — which is
    // the correct signal: the catalog must reflect the live set.
    expect(ids).toContain("hyperforge.hud.hp-bar");
    expect(ids).toContain("hyperforge.hud.action-bar");
    expect(ids).toContain("hyperforge.hud.minimap");
    expect(ids).toContain("hyperforge.overlay.tooltip");
    expect(ids).toContain("hyperforge.panel.inventory");
    expect(ids).toContain("hyperforge.panel.chat");
    expect(ids).toContain("hyperforge.panel.skills");
    expect(ids).toContain("hyperforge.panel.bank");
  });

  it("catalog stats summarize the live builtin set", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));
    const stats = catalog.getStats();

    // 15 builtins live in `@hyperforge/ui-widgets`. Asserting
    // ≥ 15 keeps the test resilient when more get added.
    expect(stats.total).toBeGreaterThanOrEqual(15);

    // Every category that the builtin set populates should have
    // ≥ 1 widget. The builtin set covers hud + panel + overlay
    // today.
    expect(stats.byCategory.hud ?? 0).toBeGreaterThan(0);
    expect(stats.byCategory.panel ?? 0).toBeGreaterThan(0);
    expect(stats.byCategory.overlay ?? 0).toBeGreaterThan(0);
  });

  it("catalog filter works against the live registry", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));

    const huds = catalog.listWidgets({ category: "hud" });
    expect(huds.map((w) => w.id)).toContain("hyperforge.hud.hp-bar");
    for (const h of huds) {
      expect(h.category).toBe("hud");
    }

    const panels = catalog.listWidgets({ category: "panel" });
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.category).toBe("panel");
    }
  });

  it("catalog search resolves a builtin widget by name/id", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));

    const inv = catalog.searchWidgets("inventory");
    expect(inv.length).toBeGreaterThanOrEqual(1);
    expect(inv.map((w) => w.id)).toContain("hyperforge.panel.inventory");

    const tooltip = catalog.searchWidgets("Tooltip");
    expect(tooltip.length).toBeGreaterThanOrEqual(1);
    expect(tooltip.map((w) => w.id)).toContain("hyperforge.overlay.tooltip");
  });

  it("catalog entries surface schema-derived prop summaries for builtins", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));

    const hpBar = catalog.getWidget("hyperforge.hud.hp-bar");
    expect(hpBar).not.toBeNull();
    expect(hpBar?.props.length).toBeGreaterThan(0);
    const propNames = (hpBar?.props ?? []).map((p) => p.name);
    // The HP bar manifest declares `current` + `max` at minimum;
    // both should appear in the surfaced prop summary.
    expect(propNames).toContain("current");
    expect(propNames).toContain("max");
  });

  it("listCategories returns only categories with at least one widget", () => {
    bindAllWidgets();
    const catalog = new WidgetCatalogService(fromRegistry(uiRegistry));
    const cats = catalog.listCategories();
    // Sanity-check: every reported category has ≥ 1 widget.
    for (const c of cats) {
      expect(catalog.getCategory(c).length).toBeGreaterThan(0);
    }
    // hud + panel + overlay are populated by the builtin set.
    expect(cats).toContain("hud");
    expect(cats).toContain("panel");
    expect(cats).toContain("overlay");
  });
});
