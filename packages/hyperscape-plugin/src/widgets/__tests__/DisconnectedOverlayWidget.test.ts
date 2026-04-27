/**
 * DisconnectedOverlayWidget — definition + plugin onEnable
 * contribution test. Mirrors KickedOverlayWidget.test.ts pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  disconnectedOverlayRegistration,
  disconnectedOverlayWidget,
} from "../../index.js";

describe("DisconnectedOverlayWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(disconnectedOverlayWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.disconnected-overlay",
    );
    expect(disconnectedOverlayWidget.manifest.category).toBe("overlay");
    expect(disconnectedOverlayWidget.manifest.defaultSize).toEqual({
      width: 96,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded overlay", () => {
    expect(disconnectedOverlayWidget.defaultProps).toMatchObject({
      countdownSeconds: 5,
      title: "Connection Lost",
    });
  });

  it("schema accepts custom countdown + colors", () => {
    const parsed = disconnectedOverlayWidget.propsSchema.safeParse({
      countdownSeconds: 10,
      title: "Lost",
      panelBackgroundColor: "rgba(0,0,0,0.7)",
      textColor: "#fff",
      secondaryTextColor: "#888",
      reconnectingDotColor: "#0f0",
      cancelledDotColor: "#f00",
      primaryButtonColor: "#00f",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range countdownSeconds", () => {
    expect(
      disconnectedOverlayWidget.propsSchema.safeParse({
        countdownSeconds: 200,
      }).success,
    ).toBe(false);
    expect(
      disconnectedOverlayWidget.propsSchema.safeParse({
        countdownSeconds: -1,
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(disconnectedOverlayRegistration.widget).toBe(
      disconnectedOverlayWidget,
    );
    expect(typeof disconnectedOverlayRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — disconnected overlay widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the disconnected overlay registration", () => {
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
    expect(registered).toContain(disconnectedOverlayRegistration);
  });
});
