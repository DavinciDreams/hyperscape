/**
 * ConnectionIndicatorWidget — definition + plugin onEnable
 * contribution test. Mirrors the overlay-widget pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  connectionIndicatorRegistration,
  connectionIndicatorWidget,
  CONNECTION_STATUSES,
  type ConnectionStatus,
} from "../../index.js";

describe("ConnectionIndicatorWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(connectionIndicatorWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.connection-indicator",
    );
    expect(connectionIndicatorWidget.manifest.category).toBe("hud");
    expect(connectionIndicatorWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 6,
    });
  });

  it("default props match the legacy hand-coded indicator", () => {
    expect(connectionIndicatorWidget.defaultProps).toMatchObject({
      status: "connected",
      attempt: 0,
      maxAttempts: 10,
      topOffsetPx: 56,
    });
  });

  it("CONNECTION_STATUSES is the canonical status-state set", () => {
    expect(CONNECTION_STATUSES).toEqual([
      "connected",
      "disconnected",
      "reconnecting",
      "failed",
    ]);
  });

  it("schema accepts all connection statuses", () => {
    for (const status of CONNECTION_STATUSES) {
      const parsed = connectionIndicatorWidget.propsSchema.safeParse({
        status,
        attempt: 1,
        maxAttempts: 10,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects an unknown status", () => {
    const parsed = connectionIndicatorWidget.propsSchema.safeParse({
      status: "elsewhere" as unknown as ConnectionStatus,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects out-of-range maxAttempts", () => {
    expect(
      connectionIndicatorWidget.propsSchema.safeParse({ maxAttempts: 0 })
        .success,
    ).toBe(false);
    expect(
      connectionIndicatorWidget.propsSchema.safeParse({ maxAttempts: 5_000 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(connectionIndicatorRegistration.widget).toBe(
      connectionIndicatorWidget,
    );
    expect(typeof connectionIndicatorRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — connection indicator widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the connection indicator registration", () => {
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
    expect(registered).toContain(connectionIndicatorRegistration);
  });
});
