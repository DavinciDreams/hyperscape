/**
 * StepIndicatorWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  STEP_STATES,
  STEP_INDICATOR_ORIENTATIONS,
  type StepState,
  type StepIndicatorOrientation,
  stepIndicatorRegistration,
  stepIndicatorWidget,
} from "../../index.js";

describe("StepIndicatorWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(stepIndicatorWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.step-indicator",
    );
    expect(stepIndicatorWidget.manifest.category).toBe("panel");
    expect(stepIndicatorWidget.manifest.defaultSize).toEqual({
      width: 48,
      height: 12,
    });
  });

  it("default props match a sensible base", () => {
    expect(stepIndicatorWidget.defaultProps).toMatchObject({
      steps: [],
      orientation: "horizontal",
      circleSizePx: 28,
      lineThicknessPx: 2,
      labelFontSize: 12,
      descriptionFontSize: 10,
      circleFontSize: 13,
    });
  });

  it("STEP_STATES covers the 4 canonical step states", () => {
    expect(STEP_STATES).toEqual(["pending", "current", "complete", "error"]);
  });

  it("STEP_INDICATOR_ORIENTATIONS covers horizontal/vertical", () => {
    expect(STEP_INDICATOR_ORIENTATIONS).toEqual(["horizontal", "vertical"]);
  });

  it("schema accepts every state and orientation", () => {
    for (const state of STEP_STATES) {
      expect(
        stepIndicatorWidget.propsSchema.safeParse({
          steps: [{ id: "x", label: "X", state }],
        }).success,
      ).toBe(true);
    }
    for (const orientation of STEP_INDICATOR_ORIENTATIONS) {
      expect(
        stepIndicatorWidget.propsSchema.safeParse({ orientation }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown step state", () => {
    expect(
      stepIndicatorWidget.propsSchema.safeParse({
        steps: [
          { id: "x", label: "X", state: "ghost" as unknown as StepState },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown orientation", () => {
    expect(
      stepIndicatorWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as StepIndicatorOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects empty step id", () => {
    expect(
      stepIndicatorWidget.propsSchema.safeParse({
        steps: [{ id: "", label: "X", state: "pending" }],
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = stepIndicatorWidget.propsSchema.safeParse({
      steps: [
        { id: "name", label: "Name", state: "complete" },
        { id: "appearance", label: "Appearance", state: "current" },
        { id: "review", label: "Review", state: "pending" },
        {
          id: "submit",
          label: "Submit",
          description: "Save and continue",
          state: "error",
        },
      ],
      orientation: "horizontal",
      circleSizePx: 32,
      lineThicknessPx: 3,
      pendingBackgroundColor: "#222",
      pendingBorderColor: "#444",
      pendingTextColor: "#666",
      currentBackgroundColor: "#252",
      currentBorderColor: "#0f0",
      currentTextColor: "#0f0",
      completeBackgroundColor: "#0f0",
      completeBorderColor: "#0f0",
      completeTextColor: "#000",
      errorBackgroundColor: "#522",
      errorBorderColor: "#f00",
      errorTextColor: "#f00",
      lineColor: "#444",
      lineCompleteColor: "#0f0",
      labelCurrentColor: "#fff",
      labelColor: "#aaa",
      descriptionColor: "#666",
      labelFontSize: 14,
      descriptionFontSize: 12,
      circleFontSize: 14,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range circleSizePx", () => {
    expect(
      stepIndicatorWidget.propsSchema.safeParse({ circleSizePx: 8 }).success,
    ).toBe(false);
    expect(
      stepIndicatorWidget.propsSchema.safeParse({ circleSizePx: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range lineThicknessPx", () => {
    expect(
      stepIndicatorWidget.propsSchema.safeParse({ lineThicknessPx: 0 }).success,
    ).toBe(false);
    expect(
      stepIndicatorWidget.propsSchema.safeParse({ lineThicknessPx: 20 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(stepIndicatorRegistration.widget).toBe(stepIndicatorWidget);
    expect(typeof stepIndicatorRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — step indicator widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the step indicator registration", () => {
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
    expect(registered).toContain(stepIndicatorRegistration);
  });
});
