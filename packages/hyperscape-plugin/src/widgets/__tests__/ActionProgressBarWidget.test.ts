/**
 * ActionProgressBarWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  actionProgressBarRegistration,
  actionProgressBarWidget,
} from "../../index.js";

describe("ActionProgressBarWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(actionProgressBarWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.action-progress-bar",
    );
    expect(actionProgressBarWidget.manifest.category).toBe("hud");
    expect(actionProgressBarWidget.manifest.defaultSize).toEqual({
      width: 48,
      height: 8,
    });
  });

  it("default props match the legacy hand-coded bar", () => {
    expect(actionProgressBarWidget.defaultProps).toMatchObject({
      progress: null,
      action: "",
      resourceName: "",
      icon: "🪓",
      bottomOffsetPx: 120,
      widthPx: 320,
    });
  });

  it("schema accepts a full action snapshot", () => {
    const parsed = actionProgressBarWidget.propsSchema.safeParse({
      progress: 0.65,
      action: "Chopping",
      resourceName: "Tree",
      icon: "🪓",
      bottomOffsetPx: 100,
      widthPx: 400,
      fillColor: "#0f0",
      trackColor: "#000",
      borderColor: "#222",
      textColor: "#fff",
      barHeightPx: 32,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null progress (= no current action)", () => {
    expect(
      actionProgressBarWidget.propsSchema.safeParse({ progress: null }).success,
    ).toBe(true);
  });

  it("rejects progress outside [0, 1]", () => {
    expect(
      actionProgressBarWidget.propsSchema.safeParse({ progress: 1.5 }).success,
    ).toBe(false);
    expect(
      actionProgressBarWidget.propsSchema.safeParse({ progress: -0.1 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range bar geometry", () => {
    expect(
      actionProgressBarWidget.propsSchema.safeParse({ widthPx: 50 }).success,
    ).toBe(false);
    expect(
      actionProgressBarWidget.propsSchema.safeParse({ barHeightPx: 200 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(actionProgressBarRegistration.widget).toBe(actionProgressBarWidget);
    expect(typeof actionProgressBarRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — action progress bar widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the action progress bar registration", () => {
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
    expect(registered).toContain(actionProgressBarRegistration);
  });
});
