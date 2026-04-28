/**
 * DragGhostOverlayWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  DRAG_GHOST_KINDS,
  type DragGhostKind,
  dragGhostOverlayRegistration,
  dragGhostOverlayWidget,
} from "../../index.js";

describe("DragGhostOverlayWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(dragGhostOverlayWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.drag-ghost-overlay",
    );
    expect(dragGhostOverlayWidget.manifest.category).toBe("overlay");
    expect(dragGhostOverlayWidget.manifest.defaultSize).toEqual({
      width: 8,
      height: 4,
    });
  });

  it("default props match the legacy hand-coded overlay", () => {
    expect(dragGhostOverlayWidget.defaultProps).toMatchObject({
      visible: false,
      x: 0,
      y: 0,
      kind: "marker",
      label: "",
      tabFontSize: 12,
      markerSizePx: 24,
    });
  });

  it("DRAG_GHOST_KINDS covers tab/marker/none", () => {
    expect(DRAG_GHOST_KINDS).toEqual(["tab", "marker", "none"]);
  });

  it("schema accepts every kind value", () => {
    for (const kind of DRAG_GHOST_KINDS) {
      expect(
        dragGhostOverlayWidget.propsSchema.safeParse({ kind }).success,
      ).toBe(true);
    }
  });

  it("rejects unknown kind", () => {
    expect(
      dragGhostOverlayWidget.propsSchema.safeParse({
        kind: "card" as unknown as DragGhostKind,
      }).success,
    ).toBe(false);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = dragGhostOverlayWidget.propsSchema.safeParse({
      visible: true,
      x: 320,
      y: 480,
      kind: "tab",
      label: "Inventory",
      zIndex: 12_345,
      tabBackgroundColor: "#101522",
      accentColor: "#ffd84d",
      tabTextColor: "#fff",
      tabFontSize: 14,
      markerSizePx: 32,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range markerSizePx", () => {
    expect(
      dragGhostOverlayWidget.propsSchema.safeParse({ markerSizePx: 2 }).success,
    ).toBe(false);
    expect(
      dragGhostOverlayWidget.propsSchema.safeParse({ markerSizePx: 100 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(dragGhostOverlayRegistration.widget).toBe(dragGhostOverlayWidget);
    expect(typeof dragGhostOverlayRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — drag ghost overlay widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the drag ghost overlay registration", () => {
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
    expect(registered).toContain(dragGhostOverlayRegistration);
  });
});
