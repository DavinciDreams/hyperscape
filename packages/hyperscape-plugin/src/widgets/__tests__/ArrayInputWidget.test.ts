/**
 * ArrayInputWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  ARRAY_INPUT_TYPES,
  type ArrayInputType,
  arrayInputRegistration,
  arrayInputWidget,
} from "../../index.js";

describe("ArrayInputWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(arrayInputWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.array-input",
    );
    expect(arrayInputWidget.manifest.category).toBe("panel");
    expect(arrayInputWidget.manifest.defaultSize).toEqual({
      width: 48,
      height: 32,
    });
  });

  it("default props match the legacy hand-coded input", () => {
    expect(arrayInputWidget.defaultProps).toMatchObject({
      label: "",
      values: [],
      placeholder: "Enter value",
      required: false,
      maxItems: 0,
      inputType: "text",
      addGlyph: "+",
      removeGlyph: "✕",
    });
  });

  it("ARRAY_INPUT_TYPES is the canonical set", () => {
    expect(ARRAY_INPUT_TYPES).toEqual(["text", "textarea"]);
  });

  it("schema accepts every input type", () => {
    for (const inputType of ARRAY_INPUT_TYPES) {
      expect(
        arrayInputWidget.propsSchema.safeParse({ inputType }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown inputType", () => {
    expect(
      arrayInputWidget.propsSchema.safeParse({
        inputType: "checkbox" as unknown as ArrayInputType,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = arrayInputWidget.propsSchema.safeParse({
      label: "Bio",
      description: "Up to 5 lines",
      values: ["a", "b", "c"],
      placeholder: "Add a line",
      required: true,
      maxItems: 5,
      inputType: "textarea",
      addGlyph: "+",
      removeGlyph: "x",
      labelColor: "#fff",
      descriptionColor: "#888",
      requiredMarkerColor: "#f00",
      inputBackgroundColor: "#222",
      inputBorderColor: "#444",
      inputFocusBorderColor: "#ffd84d",
      inputTextColor: "#eee",
      addButtonBackgroundColor: "#222",
      addButtonBorderColor: "#444",
      addButtonTextColor: "#ffd84d",
      removeButtonBorderColor: "#400",
      removeButtonTextColor: "#f00",
      counterColor: "#888",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative maxItems", () => {
    expect(
      arrayInputWidget.propsSchema.safeParse({ maxItems: -1 }).success,
    ).toBe(false);
  });

  it("rejects empty addGlyph or removeGlyph", () => {
    expect(
      arrayInputWidget.propsSchema.safeParse({ addGlyph: "" }).success,
    ).toBe(false);
    expect(
      arrayInputWidget.propsSchema.safeParse({ removeGlyph: "" }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(arrayInputRegistration.widget).toBe(arrayInputWidget);
    expect(typeof arrayInputRegistration.Component).toBe("function");
  });
});

function makeStubWorld() {
  return {
    isServer: true,
    registered: [] as string[],
    unregistered: [] as string[],
    register(name: string, _ctor: unknown) {
      this.registered.push(name);
    },
    unregister(name: string) {
      this.unregistered.push(name);
    },
    getSystem(_name: string) {
      return null;
    },
    on() {},
    off() {},
    emit() {},
    entities: {
      items: new Map<string, unknown>(),
      players: new Map<string, unknown>(),
      get: (_id: string) => undefined,
      values: () => new Map().values(),
    },
    collision: {
      addFlags() {},
      removeFlags() {},
    },
    systemsByName: new Map<string, unknown>(),
  };
}

function makeStubScope() {
  return { register: vi.fn() };
}

describe("Hyperscape meta-plugin — array input widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the array input registration", () => {
    const registered: unknown[] = [];
    const plugin = defaultFactory({
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
    });

    const ctx: HyperscapeContext = {
      pluginId: "com.hyperforge.hyperscape",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      scope: makeStubScope() as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      world: makeStubWorld() as any,
      widgets: {
        register(contribution) {
          registered.push(contribution);
        },
      },
    };

    plugin.onEnable?.(ctx);
    expect(registered).toContain(arrayInputRegistration);
  });
});
