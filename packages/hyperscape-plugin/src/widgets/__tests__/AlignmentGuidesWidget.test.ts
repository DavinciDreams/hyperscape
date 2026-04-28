/**
 * AlignmentGuidesWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  ALIGNMENT_GUIDE_AXES,
  type AlignmentGuideAxis,
  alignmentGuidesRegistration,
  alignmentGuidesWidget,
} from "../../index.js";

describe("AlignmentGuidesWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(alignmentGuidesWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.alignment-guides",
    );
    expect(alignmentGuidesWidget.manifest.category).toBe("debug");
    expect(alignmentGuidesWidget.manifest.defaultSize).toEqual({
      width: 96,
      height: 96,
    });
  });

  it("default props match a sensible base", () => {
    expect(alignmentGuidesWidget.defaultProps).toMatchObject({
      guides: [],
      defaultColor: "#4CAF50",
      glow: true,
      thicknessPx: 2,
      opacity: 0.9,
      zIndex: 9_998,
    });
  });

  it("ALIGNMENT_GUIDE_AXES covers horizontal/vertical", () => {
    expect(ALIGNMENT_GUIDE_AXES).toEqual(["horizontal", "vertical"]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = alignmentGuidesWidget.propsSchema.safeParse({
      guides: [
        { id: "v-100", axis: "vertical", position: 100, color: "#0ff" },
        { id: "h-200", axis: "horizontal", position: 200 },
      ],
      defaultColor: "#0f0",
      glow: false,
      thicknessPx: 3,
      opacity: 0.7,
      zIndex: 12_000,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown axis", () => {
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({
        guides: [
          {
            id: "x",
            axis: "diagonal" as unknown as AlignmentGuideAxis,
            position: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects empty guide id", () => {
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({
        guides: [{ id: "", axis: "vertical", position: 0 }],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range opacity", () => {
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({ opacity: -0.1 }).success,
    ).toBe(false);
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({ opacity: 2 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range thicknessPx", () => {
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({ thicknessPx: 0 }).success,
    ).toBe(false);
    expect(
      alignmentGuidesWidget.propsSchema.safeParse({ thicknessPx: 16 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(alignmentGuidesRegistration.widget).toBe(alignmentGuidesWidget);
    expect(typeof alignmentGuidesRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — alignment guides widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the alignment guides registration", () => {
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
    expect(registered).toContain(alignmentGuidesRegistration);
  });
});
