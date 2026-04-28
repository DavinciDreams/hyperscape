/**
 * TextInputWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  TEXT_INPUT_TYPES,
  type TextInputType,
  textInputRegistration,
  textInputWidget,
} from "../../index.js";

describe("TextInputWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(textInputWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.text-input",
    );
    expect(textInputWidget.manifest.category).toBe("panel");
    expect(textInputWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match a sensible base", () => {
    expect(textInputWidget.defaultProps).toMatchObject({
      value: "",
      type: "text",
      placeholder: "",
      label: "",
      description: "",
      required: false,
      disabled: false,
      autoFocus: false,
      error: "",
      maxLength: 0,
      leadingIcon: "",
      fontSize: 13,
      paddingYPx: 8,
      paddingXPx: 10,
      borderRadiusPx: 6,
    });
  });

  it("TEXT_INPUT_TYPES covers the canonical native input types", () => {
    expect(TEXT_INPUT_TYPES).toEqual([
      "text",
      "email",
      "password",
      "number",
      "search",
      "url",
      "tel",
    ]);
  });

  it("schema accepts every type", () => {
    for (const type of TEXT_INPUT_TYPES) {
      expect(textInputWidget.propsSchema.safeParse({ type }).success).toBe(
        true,
      );
    }
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = textInputWidget.propsSchema.safeParse({
      value: "hello",
      type: "email",
      placeholder: "you@example.com",
      label: "Email",
      description: "We'll never share it",
      required: true,
      disabled: false,
      autoFocus: true,
      error: "",
      maxLength: 320,
      leadingIcon: "📧",
      backgroundColor: "#222",
      borderColor: "#444",
      focusBorderColor: "#0f0",
      errorBorderColor: "#f00",
      textColor: "#fff",
      placeholderColor: "#888",
      labelColor: "#eee",
      descriptionColor: "#aaa",
      requiredMarkerColor: "#f00",
      errorTextColor: "#fca5a5",
      iconColor: "#aaa",
      fontSize: 14,
      paddingYPx: 10,
      paddingXPx: 12,
      borderRadiusPx: 8,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown type", () => {
    expect(
      textInputWidget.propsSchema.safeParse({
        type: "color" as unknown as TextInputType,
      }).success,
    ).toBe(false);
  });

  it("rejects negative maxLength", () => {
    expect(
      textInputWidget.propsSchema.safeParse({ maxLength: -1 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(textInputWidget.propsSchema.safeParse({ fontSize: 4 }).success).toBe(
      false,
    );
    expect(
      textInputWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(textInputRegistration.widget).toBe(textInputWidget);
    expect(typeof textInputRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — text input widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the text input registration", () => {
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
    expect(registered).toContain(textInputRegistration);
  });
});
