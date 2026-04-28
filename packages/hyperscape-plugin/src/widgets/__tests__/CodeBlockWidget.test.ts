/**
 * CodeBlockWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  codeBlockRegistration,
  codeBlockWidget,
} from "../../index.js";

describe("CodeBlockWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(codeBlockWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.code-block",
    );
    expect(codeBlockWidget.manifest.category).toBe("panel");
    expect(codeBlockWidget.manifest.defaultSize).toEqual({
      width: 48,
      height: 24,
    });
  });

  it("default props match a sensible base", () => {
    expect(codeBlockWidget.defaultProps).toMatchObject({
      code: "",
      language: "",
      showCopy: true,
      showLineNumbers: false,
      wrapLines: false,
      maxHeightPx: 0,
      copyLabel: "Copy",
      copiedLabel: "Copied!",
      copiedFeedbackMs: 1_500,
      fontSize: 12,
      headerFontSize: 11,
      paddingPx: 12,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = codeBlockWidget.propsSchema.safeParse({
      code: '{\n  "id": 42\n}',
      language: "json",
      showCopy: true,
      showLineNumbers: true,
      wrapLines: false,
      maxHeightPx: 240,
      copyLabel: "Copy",
      copiedLabel: "Copied!",
      copiedFeedbackMs: 1_200,
      backgroundColor: "#000",
      borderColor: "#222",
      borderRadiusPx: 8,
      headerBackgroundColor: "#111",
      headerBorderColor: "#222",
      languageLabelColor: "#aaa",
      codeColor: "#fff",
      lineNumberColor: "#666",
      copyButtonColor: "#aaa",
      copyButtonHoverColor: "#ffd84d",
      copyButtonSuccessColor: "#0f0",
      fontSize: 13,
      headerFontSize: 12,
      paddingPx: 16,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range copiedFeedbackMs", () => {
    expect(
      codeBlockWidget.propsSchema.safeParse({ copiedFeedbackMs: 50 }).success,
    ).toBe(false);
    expect(
      codeBlockWidget.propsSchema.safeParse({ copiedFeedbackMs: 50_000 })
        .success,
    ).toBe(false);
  });

  it("rejects out-of-range fontSize", () => {
    expect(codeBlockWidget.propsSchema.safeParse({ fontSize: 4 }).success).toBe(
      false,
    );
    expect(
      codeBlockWidget.propsSchema.safeParse({ fontSize: 100 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range maxHeightPx", () => {
    expect(
      codeBlockWidget.propsSchema.safeParse({ maxHeightPx: -1 }).success,
    ).toBe(false);
    expect(
      codeBlockWidget.propsSchema.safeParse({ maxHeightPx: 5_000 }).success,
    ).toBe(false);
  });

  it("rejects out-of-range paddingPx", () => {
    expect(
      codeBlockWidget.propsSchema.safeParse({ paddingPx: -1 }).success,
    ).toBe(false);
    expect(
      codeBlockWidget.propsSchema.safeParse({ paddingPx: 100 }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(codeBlockRegistration.widget).toBe(codeBlockWidget);
    expect(typeof codeBlockRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — code block widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the code block registration", () => {
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
    expect(registered).toContain(codeBlockRegistration);
  });
});
