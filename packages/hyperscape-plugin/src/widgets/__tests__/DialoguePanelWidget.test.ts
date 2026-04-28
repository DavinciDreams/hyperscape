/**
 * DialoguePanelWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  dialoguePanelRegistration,
  dialoguePanelWidget,
} from "../../index.js";

describe("DialoguePanelWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(dialoguePanelWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.dialogue-panel",
    );
    expect(dialoguePanelWidget.manifest.category).toBe("panel");
    expect(dialoguePanelWidget.manifest.defaultSize).toEqual({
      width: 64,
      height: 32,
    });
  });

  it("default props match the legacy hand-coded panel", () => {
    expect(dialoguePanelWidget.defaultProps).toMatchObject({
      visible: false,
      npcName: "",
      text: "",
      responses: [],
      npcPortraitImageUrl: "",
      continueLabel: "Click to continue...",
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = dialoguePanelWidget.propsSchema.safeParse({
      visible: true,
      npcName: "Hans",
      text: "Welcome to Lumbridge.",
      responses: [
        { text: "How do I level up?", nextNodeId: "node-2" },
        { text: "Goodbye.", nextNodeId: "node-end", effect: "close" },
      ],
      npcPortraitImageUrl: "https://example.com/hans.png",
      continueLabel: "Press Space to continue",
      textColor: "#fff",
      mutedTextColor: "#888",
      accentColor: "#ffd84d",
      insetBackgroundColor: "#222",
      insetBorderColor: "#444",
      hoverBackgroundColor: "#333",
    });
    expect(parsed.success).toBe(true);
  });

  it("schema accepts an empty response list (continue button mode)", () => {
    expect(
      dialoguePanelWidget.propsSchema.safeParse({
        visible: true,
        text: "He nods silently.",
        responses: [],
      }).success,
    ).toBe(true);
  });

  it("rejects a response with empty text", () => {
    expect(
      dialoguePanelWidget.propsSchema.safeParse({
        responses: [{ text: "", nextNodeId: "x" }],
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(dialoguePanelRegistration.widget).toBe(dialoguePanelWidget);
    expect(typeof dialoguePanelRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — dialogue panel widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the dialogue panel registration", () => {
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
    expect(registered).toContain(dialoguePanelRegistration);
  });
});
