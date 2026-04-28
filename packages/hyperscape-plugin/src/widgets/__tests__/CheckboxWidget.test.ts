/**
 * CheckboxWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  checkboxRegistration,
  checkboxWidget,
} from "../../index.js";

describe("CheckboxWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(checkboxWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.checkbox",
    );
    expect(checkboxWidget.manifest.category).toBe("panel");
    expect(checkboxWidget.manifest.defaultSize).toEqual({
      width: 24,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(checkboxWidget.defaultProps).toMatchObject({
      checked: false,
      indeterminate: false,
      disabled: false,
      label: "",
      description: "",
      sizePx: 18,
      labelFontSize: 13,
      descriptionFontSize: 11,
      borderRadiusPx: 3,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = checkboxWidget.propsSchema.safeParse({
      checked: true,
      indeterminate: false,
      disabled: false,
      label: "Remember me",
      description: "Keep me signed in on this device",
      sizePx: 20,
      uncheckedBackgroundColor: "#222",
      checkedBackgroundColor: "#0f0",
      uncheckedBorderColor: "#444",
      checkedBorderColor: "#0f0",
      checkColor: "#000",
      labelColor: "#fff",
      descriptionColor: "#aaa",
      labelFontSize: 14,
      descriptionFontSize: 12,
      borderRadiusPx: 4,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range sizePx", () => {
    expect(checkboxWidget.propsSchema.safeParse({ sizePx: 8 }).success).toBe(
      false,
    );
    expect(checkboxWidget.propsSchema.safeParse({ sizePx: 100 }).success).toBe(
      false,
    );
  });

  it("rejects out-of-range labelFontSize", () => {
    expect(
      checkboxWidget.propsSchema.safeParse({ labelFontSize: 4 }).success,
    ).toBe(false);
    expect(
      checkboxWidget.propsSchema.safeParse({ labelFontSize: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range borderRadiusPx", () => {
    expect(
      checkboxWidget.propsSchema.safeParse({ borderRadiusPx: -1 }).success,
    ).toBe(false);
    expect(
      checkboxWidget.propsSchema.safeParse({ borderRadiusPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(checkboxRegistration.widget).toBe(checkboxWidget);
    expect(typeof checkboxRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — checkbox widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the checkbox registration", () => {
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
    expect(registered).toContain(checkboxRegistration);
  });
});
