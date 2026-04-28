/**
 * KeyboardShortcutHintWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  HINT_ORIENTATIONS,
  type HintOrientation,
  formatHintLabel,
  keyboardShortcutHintRegistration,
  keyboardShortcutHintWidget,
} from "../../index.js";

describe("KeyboardShortcutHintWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(keyboardShortcutHintWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.keyboard-shortcut-hint",
    );
    expect(keyboardShortcutHintWidget.manifest.category).toBe("hud");
    expect(keyboardShortcutHintWidget.manifest.defaultSize).toEqual({
      width: 12,
      height: 4,
    });
  });

  it("default props match a sensible base", () => {
    expect(keyboardShortcutHintWidget.defaultProps).toMatchObject({
      keys: [],
      joiner: "+",
      action: "",
      orientation: "row",
      keyFontSize: 11,
      actionFontSize: 12,
      keyMinWidthPx: 16,
      keyBorderRadiusPx: 3,
      gapPx: 4,
      monospace: true,
    });
  });

  it("HINT_ORIENTATIONS covers row/column", () => {
    expect(HINT_ORIENTATIONS).toEqual(["row", "column"]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = keyboardShortcutHintWidget.propsSchema.safeParse({
      keys: ["Ctrl", "Shift", "P"],
      joiner: "+",
      action: "Open command palette",
      orientation: "row",
      keyBackgroundColor: "#222",
      keyBorderColor: "#444",
      keyTextColor: "#fff",
      actionColor: "#aaa",
      joinerColor: "#666",
      keyFontSize: 12,
      actionFontSize: 13,
      keyPaddingYPx: 3,
      keyPaddingXPx: 8,
      keyMinWidthPx: 20,
      keyBorderRadiusPx: 4,
      gapPx: 6,
      monospace: false,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown orientation", () => {
    expect(
      keyboardShortcutHintWidget.propsSchema.safeParse({
        orientation: "diagonal" as unknown as HintOrientation,
      }).success,
    ).toBe(false);
  });

  it("rejects empty key labels in the keys array", () => {
    expect(
      keyboardShortcutHintWidget.propsSchema.safeParse({
        keys: ["E", ""],
      }).success,
    ).toBe(false);
  });

  it("rejects out-of-range keyFontSize", () => {
    expect(
      keyboardShortcutHintWidget.propsSchema.safeParse({ keyFontSize: 4 })
        .success,
    ).toBe(false);
    expect(
      keyboardShortcutHintWidget.propsSchema.safeParse({ keyFontSize: 100 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(keyboardShortcutHintRegistration.widget).toBe(
      keyboardShortcutHintWidget,
    );
    expect(typeof keyboardShortcutHintRegistration.Component).toBe("function");
  });
});

describe("formatHintLabel", () => {
  it("formats a single key + action", () => {
    expect(formatHintLabel(["E"], "+", "Interact")).toBe("E: Interact");
  });

  it("formats a chord with spaced joiner", () => {
    expect(formatHintLabel(["Ctrl", "Shift", "P"], "+", "Palette")).toBe(
      "Ctrl + Shift + P: Palette",
    );
  });

  it("returns just the keys when action is empty", () => {
    expect(formatHintLabel(["A"], "+", "")).toBe("A");
    expect(formatHintLabel(["Ctrl", "C"], "+", "")).toBe("Ctrl + C");
  });

  it("returns just the action when keys are empty", () => {
    expect(formatHintLabel([], "+", "Confirm")).toBe("Confirm");
  });

  it("preserves non-spaced joiners verbatim", () => {
    expect(formatHintLabel(["A", "B"], "", "Sequence")).toBe("AB: Sequence");
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

describe("Hyperscape meta-plugin — keyboard shortcut hint widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the keyboard shortcut hint registration", () => {
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
    expect(registered).toContain(keyboardShortcutHintRegistration);
  });
});
