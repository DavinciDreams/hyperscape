import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BUILTIN_WIDGETS,
  actionBarWidget,
  chatWidget,
  hpBarWidget,
  inventoryWidget,
  minimapWidget,
  tooltipWidget,
} from "./builtins";
import { WidgetRegistry } from "./registry";
import { defineWidget } from "./widget";

describe("WidgetRegistry", () => {
  it("registers a widget schema without a renderer", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineWidget(hpBarWidget);
    expect(reg.hasWidget("hyperforge.hud.hp-bar")).toBe(true);
    expect(reg.hasComponent("hyperforge.hud.hp-bar")).toBe(false);
  });

  it("throws when binding a component to an unknown id", () => {
    const reg = new WidgetRegistry<() => string>();
    expect(() => reg.bindComponent("not.real", () => "x")).toThrow(
      /unknown widget id/,
    );
  });

  it("throws when redefining an existing widget", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineWidget(hpBarWidget);
    expect(() => reg.defineWidget(hpBarWidget)).toThrow(/already defined/);
  });

  it("returns the bound component after binding", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineWidget(hpBarWidget);
    const impl = () => "hpbar";
    reg.bindComponent(hpBarWidget.manifest.id, impl);
    expect(reg.getComponent(hpBarWidget.manifest.id)).toBe(impl);
    expect(reg.hasComponent(hpBarWidget.manifest.id)).toBe(true);
  });

  it("throws when getComponent is called on an unbound widget", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineWidget(hpBarWidget);
    expect(() => reg.getComponent(hpBarWidget.manifest.id)).toThrow(
      /no bound Component/,
    );
  });

  it("register() defines + binds in one call", () => {
    const reg = new WidgetRegistry<() => string>();
    const impl = () => "x";
    const widget = defineWidget({
      manifest: {
        id: "test.one-shot",
        name: "One Shot",
        category: "hud",
        defaultSize: { width: 1, height: 1 },
      },
      propsSchema: z.object({}),
      defaultProps: {},
    });
    reg.register({ widget, Component: impl });
    expect(reg.getComponent("test.one-shot")).toBe(impl);
  });

  it("defineBuiltins registers every shipped built-in", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineBuiltins(BUILTIN_WIDGETS);
    expect(reg.listWidgets().length).toBe(BUILTIN_WIDGETS.length);
    for (const w of BUILTIN_WIDGETS) {
      expect(reg.hasWidget(w.manifest.id)).toBe(true);
    }
  });

  it("clear() wipes state", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineBuiltins(BUILTIN_WIDGETS);
    reg.clear();
    expect(reg.listWidgets().length).toBe(0);
  });

  it("listWidgets preserves insertion order", () => {
    const reg = new WidgetRegistry<() => string>();
    reg.defineBuiltins(BUILTIN_WIDGETS);
    const ids = reg.listWidgets().map((w) => w.manifest.id);
    expect(ids).toEqual(BUILTIN_WIDGETS.map((w) => w.manifest.id));
  });
});

describe("BUILTIN_WIDGETS catalog", () => {
  it("ships the full D6 widget catalog in stable order", () => {
    expect(BUILTIN_WIDGETS.map((w) => w.manifest.id)).toEqual([
      "hyperforge.hud.hp-bar",
      "hyperforge.hud.minimap",
      "hyperforge.panel.inventory",
      "hyperforge.panel.chat",
      "hyperforge.overlay.tooltip",
      "hyperforge.hud.action-bar",
      "hyperforge.panel.skills",
      "hyperforge.panel.equipment",
      "hyperforge.panel.stats",
      "hyperforge.panel.prayer",
      "hyperforge.panel.spells",
      "hyperforge.panel.quests",
      "hyperforge.panel.bank",
      "hyperforge.panel.friends",
      "hyperforge.panel.settings",
    ]);
  });

  it("every widget's defaultProps satisfies its own propsSchema", () => {
    for (const w of BUILTIN_WIDGETS) {
      expect(() => w.propsSchema.parse(w.defaultProps)).not.toThrow();
    }
  });

  it("every widget has a lucide icon declared", () => {
    for (const w of BUILTIN_WIDGETS) {
      expect(typeof w.manifest.icon).toBe("string");
      expect((w.manifest.icon as string).length).toBeGreaterThan(0);
    }
  });
});

describe("individual builtin widget schemas", () => {
  it("hpBarWidget rejects negative current HP", () => {
    expect(() =>
      hpBarWidget.propsSchema.parse({
        orientation: "horizontal",
        showNumeric: true,
        current: -1,
        max: 10,
      }),
    ).toThrow();
  });

  it("minimapWidget rejects non-positive size", () => {
    expect(() =>
      minimapWidget.propsSchema.parse({
        ...minimapWidget.defaultProps,
        size: 0,
      }),
    ).toThrow();
  });

  it("inventoryWidget rejects non-integer rows", () => {
    expect(() =>
      inventoryWidget.propsSchema.parse({
        ...inventoryWidget.defaultProps,
        rows: 5.5,
      }),
    ).toThrow();
  });

  it("chatWidget accepts zero autoHideDelaySeconds", () => {
    expect(() =>
      chatWidget.propsSchema.parse({
        ...chatWidget.defaultProps,
        autoHideDelaySeconds: 0,
      }),
    ).not.toThrow();
  });

  it("tooltipWidget rejects an unknown anchor value", () => {
    expect(() =>
      tooltipWidget.propsSchema.parse({
        ...tooltipWidget.defaultProps,
        anchor: "viewport",
      }),
    ).toThrow();
  });

  it("actionBarWidget rejects non-positive slotCount", () => {
    expect(() =>
      actionBarWidget.propsSchema.parse({
        ...actionBarWidget.defaultProps,
        slotCount: 0,
      }),
    ).toThrow();
  });
});

describe("WidgetRegistry.unregister", () => {
  const makeTestWidget = (id: string) => ({
    manifest: {
      id,
      name: id,
      category: "hud" as const,
      defaultSize: { width: 1, height: 1 },
    },
    propsSchema: actionBarWidget.propsSchema,
    defaultProps: actionBarWidget.defaultProps,
  });

  it("removes a registered widget by id and returns true", () => {
    const reg = new WidgetRegistry<() => string>();
    const w = makeTestWidget("test.unregister.basic");
    reg.register({ widget: w, Component: () => "x" });

    expect(reg.hasWidget(w.manifest.id)).toBe(true);
    expect(reg.hasComponent(w.manifest.id)).toBe(true);

    const removed = reg.unregister(w.manifest.id);
    expect(removed).toBe(true);
    expect(reg.hasWidget(w.manifest.id)).toBe(false);
    expect(reg.hasComponent(w.manifest.id)).toBe(false);
    expect(reg.getWidget(w.manifest.id)).toBeUndefined();
  });

  it("is idempotent — unknown id returns false and does not throw", () => {
    const reg = new WidgetRegistry<() => string>();
    expect(reg.unregister("never-registered")).toBe(false);

    const w = makeTestWidget("test.unregister.idem");
    reg.register({ widget: w, Component: () => "x" });
    expect(reg.unregister(w.manifest.id)).toBe(true);
    // Second call against the same id.
    expect(reg.unregister(w.manifest.id)).toBe(false);
  });

  it("allows re-register after unregister (plugin hot-reload pattern)", () => {
    const reg = new WidgetRegistry<() => string>();
    const w = makeTestWidget("test.unregister.re-register");
    reg.register({ widget: w, Component: () => "v1" });
    reg.unregister(w.manifest.id);
    // Re-registering under the same id no longer throws
    // "already defined" — unregister cleared the slot.
    expect(() =>
      reg.register({ widget: w, Component: () => "v2" }),
    ).not.toThrow();
    expect(reg.getComponent(w.manifest.id)()).toBe("v2");
  });
});
