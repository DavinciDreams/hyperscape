/**
 * IncomingRequestModalWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  incomingRequestModalRegistration,
  incomingRequestModalWidget,
} from "../../index.js";

describe("IncomingRequestModalWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(incomingRequestModalWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.incoming-request-modal",
    );
    expect(incomingRequestModalWidget.manifest.category).toBe("modal");
    expect(incomingRequestModalWidget.manifest.defaultSize).toEqual({
      width: 48,
      height: 32,
    });
  });

  it("default props match the legacy hand-coded modal", () => {
    expect(incomingRequestModalWidget.defaultProps).toMatchObject({
      visible: false,
      title: "Incoming Request",
      playerName: "",
      playerBadgeText: "",
      bodyText: "wants to interact with you",
      footerText: "",
      acceptLabel: "Accept",
      declineLabel: "Decline",
      widthPx: 360,
    });
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = incomingRequestModalWidget.propsSchema.safeParse({
      visible: true,
      title: "Trade Request",
      playerName: "Eldorin",
      playerBadgeText: "Level: 42",
      bodyText: "wishes to trade with you",
      footerText: "Request expires in 30 seconds",
      acceptLabel: "Accept",
      declineLabel: "Decline",
      widthPx: 400,
      backdropColor: "rgba(0,0,0,0.5)",
      panelBackgroundColor: "#101522",
      panelBorderColor: "#222",
      headerBackgroundColor: "#1a2030",
      titleColor: "#fff",
      playerInfoBackgroundColor: "#222",
      playerInfoBorderColor: "#333",
      textColor: "#eee",
      secondaryTextColor: "#aaa",
      mutedTextColor: "#888",
      badgeAccentColor: "#ffd84d",
      acceptAccentColor: "#0f0",
      declineAccentColor: "#f00",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range widthPx", () => {
    expect(
      incomingRequestModalWidget.propsSchema.safeParse({ widthPx: 100 })
        .success,
    ).toBe(false);
    expect(
      incomingRequestModalWidget.propsSchema.safeParse({ widthPx: 2_000 })
        .success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(incomingRequestModalRegistration.widget).toBe(
      incomingRequestModalWidget,
    );
    expect(typeof incomingRequestModalRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — incoming request modal widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the incoming request modal registration", () => {
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
    expect(registered).toContain(incomingRequestModalRegistration);
  });
});
