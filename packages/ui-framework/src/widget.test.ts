import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  WIDGET_CATEGORIES,
  WidgetManifestSchema,
  defineWidget,
  registerWidget,
} from "./widget";

describe("WidgetManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const result = WidgetManifestSchema.parse({
      id: "hyperforge.hud.hp-bar",
      name: "HP Bar",
      category: "hud",
      defaultSize: { width: 4, height: 1 },
    });
    expect(result.id).toBe("hyperforge.hud.hp-bar");
    expect(result.category).toBe("hud");
  });

  it("rejects an empty id", () => {
    expect(() =>
      WidgetManifestSchema.parse({
        id: "",
        name: "X",
        category: "hud",
        defaultSize: { width: 1, height: 1 },
      }),
    ).toThrow();
  });

  it("rejects an unknown category", () => {
    expect(() =>
      WidgetManifestSchema.parse({
        id: "x",
        name: "X",
        category: "not-a-real-category",
        defaultSize: { width: 1, height: 1 },
      }),
    ).toThrow();
  });

  it("rejects zero or negative default size", () => {
    expect(() =>
      WidgetManifestSchema.parse({
        id: "x",
        name: "X",
        category: "hud",
        defaultSize: { width: 0, height: 1 },
      }),
    ).toThrow();
  });

  it("covers every documented WIDGET_CATEGORIES entry", () => {
    for (const cat of WIDGET_CATEGORIES) {
      const parsed = WidgetManifestSchema.parse({
        id: `x.${cat}`,
        name: cat,
        category: cat,
        defaultSize: { width: 1, height: 1 },
      });
      expect(parsed.category).toBe(cat);
    }
  });
});

describe("defineWidget", () => {
  const hpPropsSchema = z.object({
    orientation: z.enum(["horizontal", "vertical"]),
    showNumeric: z.boolean(),
  });

  it("infers props type from the Zod schema", () => {
    const widget = defineWidget({
      manifest: {
        id: "hyperforge.hud.hp-bar",
        name: "HP Bar",
        category: "hud",
        defaultSize: { width: 4, height: 1 },
      },
      propsSchema: hpPropsSchema,
      defaultProps: { orientation: "horizontal", showNumeric: true },
    });
    // Compile-time: widget.defaultProps.orientation is typed.
    expect(widget.defaultProps.orientation).toBe("horizontal");
    expect(widget.defaultProps.showNumeric).toBe(true);
  });

  it("throws if the manifest is malformed", () => {
    expect(() =>
      defineWidget({
        manifest: {
          id: "",
          name: "HP Bar",
          category: "hud",
          defaultSize: { width: 4, height: 1 },
        },
        propsSchema: hpPropsSchema,
        defaultProps: { orientation: "horizontal", showNumeric: true },
      }),
    ).toThrow();
  });

  it("throws if defaultProps violate the prop schema", () => {
    expect(() =>
      defineWidget({
        manifest: {
          id: "hyperforge.hud.hp-bar",
          name: "HP Bar",
          category: "hud",
          defaultSize: { width: 4, height: 1 },
        },
        propsSchema: hpPropsSchema,
        // @ts-expect-error intentionally-wrong defaultProps
        defaultProps: { orientation: "diagonal", showNumeric: true },
      }),
    ).toThrow();
  });

  it("produces a widget whose propsSchema round-trips a valid prop set", () => {
    const widget = defineWidget({
      manifest: {
        id: "hyperforge.hud.hp-bar",
        name: "HP Bar",
        category: "hud",
        defaultSize: { width: 4, height: 1 },
      },
      propsSchema: hpPropsSchema,
      defaultProps: { orientation: "horizontal", showNumeric: true },
    });
    const parsed = widget.propsSchema.parse({
      orientation: "vertical",
      showNumeric: false,
    });
    expect(parsed.orientation).toBe("vertical");
  });
});

describe("registerWidget", () => {
  it("bundles a widget with a consumer-supplied Component", () => {
    const widget = defineWidget({
      manifest: {
        id: "hyperforge.hud.dot",
        name: "Dot",
        category: "hud",
        defaultSize: { width: 1, height: 1 },
      },
      propsSchema: z.object({ color: z.string() }),
      defaultProps: { color: "#ff0000" },
    });
    const FakeComponent = () => "dot";
    const registration = registerWidget(widget, FakeComponent);
    expect(registration.widget).toBe(widget);
    expect(registration.Component).toBe(FakeComponent);
  });
});
