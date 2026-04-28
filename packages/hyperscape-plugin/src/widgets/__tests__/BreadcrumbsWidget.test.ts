/**
 * BreadcrumbsWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  breadcrumbsRegistration,
  breadcrumbsWidget,
} from "../../index.js";

describe("BreadcrumbsWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(breadcrumbsWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.breadcrumbs",
    );
    expect(breadcrumbsWidget.manifest.category).toBe("panel");
    expect(breadcrumbsWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(breadcrumbsWidget.defaultProps).toMatchObject({
      crumbs: [],
      separator: "›",
      ariaLabel: "Breadcrumbs",
      fontSize: 12,
      gapPx: 6,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = breadcrumbsWidget.propsSchema.safeParse({
      crumbs: [
        { id: "home", label: "Home" },
        { id: "audio", label: "Audio", icon: "🔊" },
        { id: "ambience", label: "Ambience", noLink: true },
      ],
      separator: "/",
      ariaLabel: "Settings navigation",
      activeColor: "#fff",
      linkColor: "#aaa",
      linkHoverColor: "#ffd84d",
      separatorColor: "#666",
      fontSize: 14,
      gapPx: 8,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty crumb id or label", () => {
    expect(
      breadcrumbsWidget.propsSchema.safeParse({
        crumbs: [{ id: "", label: "X" }],
      }).success,
    ).toBe(false);
    expect(
      breadcrumbsWidget.propsSchema.safeParse({
        crumbs: [{ id: "x", label: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects empty separator", () => {
    expect(
      breadcrumbsWidget.propsSchema.safeParse({ separator: "" }).success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(
      breadcrumbsWidget.propsSchema.safeParse({ fontSize: 4 }).success,
    ).toBe(false);
    expect(
      breadcrumbsWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range gapPx", () => {
    expect(breadcrumbsWidget.propsSchema.safeParse({ gapPx: -1 }).success).toBe(
      false,
    );
    expect(
      breadcrumbsWidget.propsSchema.safeParse({ gapPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(breadcrumbsRegistration.widget).toBe(breadcrumbsWidget);
    expect(typeof breadcrumbsRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — breadcrumbs widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the breadcrumbs registration", () => {
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
    expect(registered).toContain(breadcrumbsRegistration);
  });
});
