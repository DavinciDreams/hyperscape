/**
 * LoadingSpinnerWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  LOADING_SPINNER_KINDS,
  type LoadingSpinnerKind,
  loadingSpinnerRegistration,
  loadingSpinnerWidget,
} from "../../index.js";

describe("LoadingSpinnerWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(loadingSpinnerWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.loading-spinner",
    );
    expect(loadingSpinnerWidget.manifest.category).toBe("panel");
    expect(loadingSpinnerWidget.manifest.defaultSize).toEqual({
      width: 4,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(loadingSpinnerWidget.defaultProps).toMatchObject({
      visible: true,
      kind: "ring",
      sizePx: 24,
      durationMs: 900,
      strokeWidth: 3,
      label: "",
      labelFontSize: 12,
    });
  });

  it("LOADING_SPINNER_KINDS covers ring/dots/bar", () => {
    expect(LOADING_SPINNER_KINDS).toEqual(["ring", "dots", "bar"]);
  });

  it("schema accepts every kind value", () => {
    for (const kind of LOADING_SPINNER_KINDS) {
      expect(loadingSpinnerWidget.propsSchema.safeParse({ kind }).success).toBe(
        true,
      );
    }
  });

  it("rejects unknown kind", () => {
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({
        kind: "spiral" as unknown as LoadingSpinnerKind,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = loadingSpinnerWidget.propsSchema.safeParse({
      visible: true,
      kind: "dots",
      sizePx: 32,
      durationMs: 1_200,
      color: "#0f0",
      trackColor: "#222",
      strokeWidth: 4,
      label: "Loading map",
      labelColor: "#aaa",
      labelFontSize: 13,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range sizePx", () => {
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ sizePx: 4 }).success,
    ).toBe(false);
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ sizePx: 1_000 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range durationMs", () => {
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ durationMs: 50 }).success,
    ).toBe(false);
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ durationMs: 50_000 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range strokeWidth", () => {
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ strokeWidth: 0 }).success,
    ).toBe(false);
    expect(
      loadingSpinnerWidget.propsSchema.safeParse({ strokeWidth: 20 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(loadingSpinnerRegistration.widget).toBe(loadingSpinnerWidget);
    expect(typeof loadingSpinnerRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — loading spinner widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the loading spinner registration", () => {
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
    expect(registered).toContain(loadingSpinnerRegistration);
  });
});
