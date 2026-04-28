/**
 * ProgressBarWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  PROGRESS_BAR_ORIENTATIONS,
  type ProgressBarOrientation,
  progressBarRegistration,
  progressBarWidget,
} from "../../index.js";

describe("ProgressBarWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(progressBarWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.progress-bar",
    );
    expect(progressBarWidget.manifest.category).toBe("panel");
    expect(progressBarWidget.manifest.defaultSize).toEqual({
      width: 32,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(progressBarWidget.defaultProps).toMatchObject({
      progress: 0,
      label: "",
      showPercent: false,
      indeterminate: false,
      orientation: "horizontal",
      thicknessPx: 8,
      lengthPx: 0,
      borderRadiusPx: 4,
      fontSize: 12,
      indeterminateDurationMs: 1_500,
    });
  });

  it("PROGRESS_BAR_ORIENTATIONS covers row/column", () => {
    expect(PROGRESS_BAR_ORIENTATIONS).toEqual(["horizontal", "vertical"]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = progressBarWidget.propsSchema.safeParse({
      progress: 0.42,
      label: "Loading shaders",
      showPercent: true,
      indeterminate: false,
      orientation: "horizontal",
      thicknessPx: 10,
      lengthPx: 300,
      trackColor: "#222",
      fillColor: "#0f0",
      borderColor: "#444",
      borderRadiusPx: 6,
      labelColor: "#aaa",
      percentColor: "#fff",
      fontSize: 13,
      indeterminateDurationMs: 1_200,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects progress outside [0, 1]", () => {
    expect(
      progressBarWidget.propsSchema.safeParse({ progress: 1.5 }).success,
    ).toBe(false);
    expect(
      progressBarWidget.propsSchema.safeParse({ progress: -0.1 }).success,
    ).toBe(false);
  });

  it("rejects unknown orientation", () => {
    expect(
      progressBarWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as ProgressBarOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range thicknessPx", () => {
    expect(
      progressBarWidget.propsSchema.safeParse({ thicknessPx: 1 }).success,
    ).toBe(false);
    expect(
      progressBarWidget.propsSchema.safeParse({ thicknessPx: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range indeterminateDurationMs", () => {
    expect(
      progressBarWidget.propsSchema.safeParse({ indeterminateDurationMs: 50 })
        .success,
    ).toBe(false);
    expect(
      progressBarWidget.propsSchema.safeParse({
        indeterminateDurationMs: 50_000,
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(progressBarRegistration.widget).toBe(progressBarWidget);
    expect(typeof progressBarRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — progress bar widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the progress bar registration", () => {
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
    expect(registered).toContain(progressBarRegistration);
  });
});
