import { describe, expect, it } from "vitest";
import { BUILTIN_WIDGETS, hpBarWidget, minimapWidget } from "./builtins";
import {
  LAYOUT_ANCHORS,
  LayoutVariantOverrideSchema,
  LayoutVariantSchema,
  UILayoutManifestSchema,
  UIOverrideSchema,
  UIUserLayoutSchema,
  WidgetCustomizationSchema,
  WidgetPositionSchema,
  validateLayout,
  type UILayoutManifest,
} from "./layout";
import { WidgetRegistry } from "./registry";

const makeRegistry = (): WidgetRegistry<() => string> => {
  const r = new WidgetRegistry<() => string>();
  r.defineBuiltins(BUILTIN_WIDGETS);
  return r;
};

const goodLayout: UILayoutManifest = {
  id: "hyperscape-ui",
  name: "Hyperscape Default HUD",
  grid: { columns: 24, rows: 16 },
  instances: [
    {
      instanceId: "hp",
      widgetId: hpBarWidget.manifest.id,
      position: {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 12, y: 12 },
      },
      props: {
        orientation: "horizontal",
        showNumeric: true,
        current: 10,
        max: 10,
      },
      visible: true,
    },
    {
      instanceId: "map",
      widgetId: minimapWidget.manifest.id,
      position: {
        kind: "grid",
        column: 19,
        row: 0,
        columnSpan: 5,
        rowSpan: 5,
      },
      props: {
        size: 220,
        baseRadius: 48,
        showCompass: true,
        showPlayerPips: true,
        showEntityPips: true,
      },
      visible: true,
    },
  ],
};

describe("WidgetPositionSchema", () => {
  it("accepts an anchored position with any documented anchor", () => {
    for (const anchor of LAYOUT_ANCHORS) {
      expect(() =>
        WidgetPositionSchema.parse({
          kind: "anchored",
          anchor,
          offset: { x: 0, y: 0 },
        }),
      ).not.toThrow();
    }
  });

  it("defaults grid spans to 1", () => {
    const parsed = WidgetPositionSchema.parse({
      kind: "grid",
      column: 2,
      row: 3,
    });
    expect(parsed).toEqual({
      kind: "grid",
      column: 2,
      row: 3,
      columnSpan: 1,
      rowSpan: 1,
    });
  });

  it("rejects zero-span grid cells", () => {
    expect(() =>
      WidgetPositionSchema.parse({
        kind: "grid",
        column: 0,
        row: 0,
        columnSpan: 0,
        rowSpan: 1,
      }),
    ).toThrow();
  });

  it("rejects flex entries with an empty container name", () => {
    expect(() =>
      WidgetPositionSchema.parse({
        kind: "flex",
        container: "",
        order: 0,
      }),
    ).toThrow();
  });

  it("rejects an unknown position kind", () => {
    expect(() =>
      WidgetPositionSchema.parse({
        kind: "freeform",
        x: 100,
        y: 100,
      }),
    ).toThrow();
  });
});

describe("UILayoutManifestSchema", () => {
  it("accepts the good layout", () => {
    expect(() => UILayoutManifestSchema.parse(goodLayout)).not.toThrow();
  });

  it("rejects a manifest without an id", () => {
    expect(() =>
      UILayoutManifestSchema.parse({ ...goodLayout, id: "" }),
    ).toThrow();
  });
});

describe("validateLayout", () => {
  it("returns ok for a correct layout", () => {
    const result = validateLayout(goodLayout, makeRegistry());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("flags unknown widget ids", () => {
    const bad: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          widgetId: "hyperforge.hud.does-not-exist",
        },
      ],
    };
    const result = validateLayout(bad, makeRegistry());
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "unknown-widget-id")).toBe(
      true,
    );
  });

  it("flags duplicate instance ids", () => {
    const bad: UILayoutManifest = {
      ...goodLayout,
      instances: [goodLayout.instances[0], goodLayout.instances[0]],
    };
    const result = validateLayout(bad, makeRegistry());
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "duplicate-instance-id")).toBe(
      true,
    );
  });

  it("flags props that violate the widget's propsSchema", () => {
    const bad: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          props: {
            orientation: "diagonal", // not in the enum
            showNumeric: true,
            current: 10,
            max: 10,
          },
        },
      ],
    };
    const result = validateLayout(bad, makeRegistry());
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "invalid-props")).toBe(true);
  });

  it("flags grid instances that extend past the grid bounds", () => {
    const bad: UILayoutManifest = {
      ...goodLayout,
      grid: { columns: 10, rows: 10 },
      instances: [
        {
          instanceId: "map",
          widgetId: minimapWidget.manifest.id,
          position: {
            kind: "grid",
            column: 8,
            row: 0,
            columnSpan: 5, // 8+5 = 13 > 10
            rowSpan: 5,
          },
          props: minimapWidget.defaultProps,
          visible: true,
        },
      ],
    };
    const result = validateLayout(bad, makeRegistry());
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((i) => i.code === "grid-cell-out-of-bounds"),
    ).toBe(true);
  });

  it("promotes Zod parse errors to schema-error issues", () => {
    const result = validateLayout({ id: 123 }, makeRegistry());
    expect(result.ok).toBe(false);
    expect(result.issues.every((i) => i.code === "schema-error")).toBe(true);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("collects multiple issues instead of failing fast", () => {
    const bad: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          widgetId: "nope",
        },
        {
          ...goodLayout.instances[1],
          instanceId: goodLayout.instances[0].instanceId, // duplicate
        },
      ],
    };
    const result = validateLayout(bad, makeRegistry());
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts instances with valid bindings", () => {
    const withBindings: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          bindings: {
            current: "$player.hp",
            max: "$player.maxHp",
          },
        },
        goodLayout.instances[1],
      ],
    };
    const result = validateLayout(withBindings, makeRegistry());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("flags instances with malformed binding expressions", () => {
    const withBadBinding: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          bindings: { current: "$player.hp" },
        },
      ],
    };
    // Manifest-level parsing already rejects unparseable bindings via
    // BindingExpressionSchema, so we feed an expression that parses OK
    // into the schema but then tunnel in a broken expression through a
    // raw `unknown` payload to exercise the validator's defensive check.
    const raw = {
      ...withBadBinding,
      instances: [
        {
          ...withBadBinding.instances[0],
          bindings: { current: "totally bogus" },
        },
      ],
    };
    const result = validateLayout(raw, makeRegistry());
    expect(result.ok).toBe(false);
    // Should surface at the Zod schema-parse step (bindings value fails
    // BindingExpressionSchema.refine) rather than silently ignoring it.
    expect(result.issues.length).toBeGreaterThan(0);
    const hasBindingIssue = result.issues.some(
      (i) =>
        i.code === "schema-error" || i.code === "invalid-binding-expression",
    );
    expect(hasBindingIssue).toBe(true);
  });

  it("skips per-instance checks when the widgetId is unknown", () => {
    // Unknown widgetId means we cannot validate props, so we should
    // not emit a spurious invalid-props issue for that instance.
    const bad: UILayoutManifest = {
      ...goodLayout,
      instances: [
        {
          ...goodLayout.instances[0],
          widgetId: "nope",
          props: { totally: "bogus" },
        },
      ],
    };
    const result = validateLayout(bad, makeRegistry());
    const propsIssues = result.issues.filter((i) => i.code === "invalid-props");
    expect(propsIssues).toEqual([]);
  });
});

describe("WidgetCustomizationSchema", () => {
  it("accepts an empty policy object", () => {
    expect(() => WidgetCustomizationSchema.parse({})).not.toThrow();
  });

  it("accepts a fully-populated policy", () => {
    const full = {
      movable: true,
      resizable: true,
      lockable: true,
      snapToGrid: 16,
      minWidth: 100,
      maxWidth: 800,
      minHeight: 40,
      maxHeight: 400,
      aspectRatio: 16 / 9,
    };
    expect(WidgetCustomizationSchema.parse(full)).toEqual(full);
  });

  it("rejects non-positive min/max sizes", () => {
    expect(() => WidgetCustomizationSchema.parse({ minWidth: 0 })).toThrow();
    expect(() => WidgetCustomizationSchema.parse({ maxHeight: -1 })).toThrow();
  });

  it("rejects zero or negative snapToGrid", () => {
    expect(() => WidgetCustomizationSchema.parse({ snapToGrid: 0 })).toThrow();
  });
});

describe("AnchoredPositionSchema width/height", () => {
  it("accepts explicit width and height", () => {
    const parsed = WidgetPositionSchema.parse({
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 0, y: 0 },
      width: 200,
      height: 40,
    });
    expect(parsed).toMatchObject({ width: 200, height: 40 });
  });

  it("rejects non-positive explicit width", () => {
    expect(() =>
      WidgetPositionSchema.parse({
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 0, y: 0 },
        width: 0,
      }),
    ).toThrow();
  });
});

describe("UIOverrideSchema", () => {
  it("accepts a minimal override with only an instanceId", () => {
    expect(() => UIOverrideSchema.parse({ instanceId: "hp" })).not.toThrow();
  });

  it("accepts position + visibility + transparency together", () => {
    const parsed = UIOverrideSchema.parse({
      instanceId: "hp",
      position: { offsetX: 20, offsetY: 30 },
      visible: false,
      transparency: 0.5,
    });
    expect(parsed).toMatchObject({
      instanceId: "hp",
      visible: false,
      transparency: 0.5,
    });
  });

  it("rejects transparency outside [0,1]", () => {
    expect(() =>
      UIOverrideSchema.parse({ instanceId: "hp", transparency: 1.5 }),
    ).toThrow();
    expect(() =>
      UIOverrideSchema.parse({ instanceId: "hp", transparency: -0.1 }),
    ).toThrow();
  });
});

describe("UIUserLayoutSchema", () => {
  it("accepts a user layout with zero overrides", () => {
    const parsed = UIUserLayoutSchema.parse({
      schemaVersion: 1,
      layoutId: "hud-default",
      updatedAt: 1_700_000_000_000,
      overrides: [],
    });
    expect(parsed.overrides).toEqual([]);
  });

  it("rejects schemaVersion other than 1", () => {
    expect(() =>
      UIUserLayoutSchema.parse({
        schemaVersion: 2,
        layoutId: "hud-default",
        updatedAt: 0,
        overrides: [],
      }),
    ).toThrow();
  });

  it("carries layoutRevision when present", () => {
    const parsed = UIUserLayoutSchema.parse({
      schemaVersion: 1,
      layoutId: "hud-default",
      layoutRevision: 7,
      updatedAt: 1_700_000_000_000,
      overrides: [],
    });
    expect(parsed.layoutRevision).toBe(7);
  });
});

describe("UILayoutManifestSchema revision", () => {
  it("accepts a manifest with no revision (backward compat)", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "x",
        name: "x",
        instances: [],
      }),
    ).not.toThrow();
  });

  it("accepts a nonnegative integer revision", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      revision: 5,
      instances: [],
    });
    expect(parsed.revision).toBe(5);
  });

  it("rejects a negative revision", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "x",
        name: "x",
        revision: -1,
        instances: [],
      }),
    ).toThrow();
  });
});

describe("UILayoutManifestSchema theme companion", () => {
  it("accepts a manifest with no theme (backward compat)", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      instances: [],
    });
    expect(parsed.theme).toBeUndefined();
    expect(parsed.themeId).toBeUndefined();
  });

  it("accepts a manifest with a themeId reference", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      themeId: "hyperscape.dark",
      instances: [],
    });
    expect(parsed.themeId).toBe("hyperscape.dark");
  });

  it("accepts a manifest with an inline theme manifest", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      theme: {
        id: "x.theme",
        name: "Custom",
        colors: { primary: "#ff0000" },
      },
      instances: [],
    });
    expect(parsed.theme?.id).toBe("x.theme");
    expect(parsed.theme?.colors.primary).toBe("#ff0000");
  });

  it("rejects an empty-string themeId", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "x",
        name: "x",
        themeId: "",
        instances: [],
      }),
    ).toThrow();
  });

  it("rejects a malformed inline theme (missing id)", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "x",
        name: "x",
        theme: { name: "Missing id" },
        instances: [],
      }),
    ).toThrow();
  });
});

describe("WidgetInstanceSchema visibility", () => {
  const baseInstance = {
    instanceId: "hp",
    widgetId: hpBarWidget.manifest.id,
    position: {
      kind: "anchored" as const,
      anchor: "top-left" as const,
      offset: { x: 0, y: 0 },
    },
    props: {
      orientation: "horizontal",
      showNumeric: true,
      current: 10,
      max: 10,
    },
    visible: true,
  };

  it("accepts an instance with no visibility rule", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      instances: [baseInstance],
    });
    expect(parsed.instances[0]!.visibility).toBeUndefined();
  });

  it("accepts a visibility rule with contexts", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      instances: [
        {
          ...baseInstance,
          visibility: { contexts: ["combat", "menu"] },
        },
      ],
    });
    expect(parsed.instances[0]!.visibility?.contexts).toEqual([
      "combat",
      "menu",
    ]);
  });

  it("accepts a visibility rule with hiddenIn", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      instances: [
        {
          ...baseInstance,
          visibility: { hiddenIn: ["cutscene"] },
        },
      ],
    });
    expect(parsed.instances[0]!.visibility?.hiddenIn).toEqual(["cutscene"]);
  });

  it("accepts a visibility rule with a binding expression", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "x",
      name: "x",
      instances: [
        {
          ...baseInstance,
          visibility: { expression: "$player.inCombat" },
        },
      ],
    });
    expect(parsed.instances[0]!.visibility?.expression).toBe(
      "$player.inCombat",
    );
  });

  it("rejects a visibility rule with an empty context string", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "x",
        name: "x",
        instances: [
          {
            ...baseInstance,
            visibility: { contexts: [""] },
          },
        ],
      }),
    ).toThrow();
  });
});

// ----------------------------------------------------------------------
// U9 — Per-viewport variants
// ----------------------------------------------------------------------

describe("LayoutVariantOverrideSchema (U9)", () => {
  it("accepts a position-only override", () => {
    expect(
      LayoutVariantOverrideSchema.parse({
        instanceId: "hp",
        position: { anchor: "top-left", offsetX: 10, offsetY: 20 },
      }).instanceId,
    ).toBe("hp");
  });

  it("accepts hidden: true as an instance-drop flag", () => {
    const parsed = LayoutVariantOverrideSchema.parse({
      instanceId: "chat",
      hidden: true,
    });
    expect(parsed.hidden).toBe(true);
  });

  it("rejects an empty instanceId", () => {
    expect(() =>
      LayoutVariantOverrideSchema.parse({ instanceId: "" }),
    ).toThrow();
  });
});

describe("LayoutVariantSchema (U9)", () => {
  it("defaults overrides to an empty array", () => {
    const parsed = LayoutVariantSchema.parse({});
    expect(parsed.overrides).toEqual([]);
  });

  it("accepts a variant-level grid override", () => {
    const parsed = LayoutVariantSchema.parse({
      grid: { columns: 12, rows: 8 },
    });
    expect(parsed.grid).toEqual({ columns: 12, rows: 8 });
  });

  it("accepts themeId variant", () => {
    const parsed = LayoutVariantSchema.parse({ themeId: "dark-mobile" });
    expect(parsed.themeId).toBe("dark-mobile");
  });

  it("rejects an invalid grid geometry", () => {
    expect(() =>
      LayoutVariantSchema.parse({ grid: { columns: 0, rows: 8 } }),
    ).toThrow();
  });
});

describe("UILayoutManifestSchema variants (U9)", () => {
  it("defaults variants to undefined", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "base",
      name: "Base",
      instances: [],
    });
    expect(parsed.variants).toBeUndefined();
  });

  it("accepts mobile/tablet/desktop variant set", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "base",
      name: "Base",
      instances: [],
      variants: {
        mobile: { overrides: [{ instanceId: "chat", hidden: true }] },
        tablet: { overrides: [] },
        desktop: { overrides: [] },
      },
    });
    expect(parsed.variants?.mobile?.overrides).toHaveLength(1);
    expect(parsed.variants?.mobile?.overrides[0]?.hidden).toBe(true);
  });

  it("accepts a single mobile variant without tablet/desktop", () => {
    const parsed = UILayoutManifestSchema.parse({
      id: "base",
      name: "Base",
      instances: [],
      variants: {
        mobile: {
          overrides: [
            {
              instanceId: "hp",
              position: { anchor: "top-center", offsetX: 0, offsetY: 8 },
            },
          ],
        },
      },
    });
    expect(parsed.variants?.mobile).toBeDefined();
    expect(parsed.variants?.tablet).toBeUndefined();
    expect(parsed.variants?.desktop).toBeUndefined();
  });

  it("rejects a variant with an invalid override shape", () => {
    expect(() =>
      UILayoutManifestSchema.parse({
        id: "base",
        name: "Base",
        instances: [],
        variants: {
          mobile: {
            overrides: [{ instanceId: "" }],
          },
        },
      }),
    ).toThrow();
  });
});
