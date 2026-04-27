/**
 * KickedOverlayWidget — definition + plugin onEnable contribution
 * test. Mirrors XPOrbWidget.test.ts pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  kickedOverlayRegistration,
  kickedOverlayWidget,
  DEFAULT_KICK_MESSAGES,
} from "../../index.js";

describe("KickedOverlayWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(kickedOverlayWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.kicked-overlay",
    );
    expect(kickedOverlayWidget.manifest.category).toBe("overlay");
    expect(kickedOverlayWidget.manifest.defaultSize).toEqual({
      width: 96,
      height: 24,
    });
  });

  it("default props validate through the Zod schema", () => {
    expect(kickedOverlayWidget.defaultProps).toMatchObject({
      code: "unknown",
      backgroundColor: "#0b0d12",
      textColor: "#e6e8ec",
      fontSize: 18,
    });
    expect(kickedOverlayWidget.defaultProps.messages).toEqual(
      DEFAULT_KICK_MESSAGES,
    );
  });

  it("schema accepts a custom messages map", () => {
    const parsed = kickedOverlayWidget.propsSchema.safeParse({
      code: "banned",
      messages: { banned: "You have been banned for cheating." },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range fontSize", () => {
    const parsed = kickedOverlayWidget.propsSchema.safeParse({
      code: "x",
      fontSize: 200, // above max 96
    });
    expect(parsed.success).toBe(false);
  });

  it("DEFAULT_KICK_MESSAGES carries the legacy hand-coded set", () => {
    expect(DEFAULT_KICK_MESSAGES.duplicate_user).toMatch(/already active/);
    expect(DEFAULT_KICK_MESSAGES.player_limit).toMatch(/limit/);
    expect(DEFAULT_KICK_MESSAGES.unknown).toMatch(/kicked/i);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(kickedOverlayRegistration.widget).toBe(kickedOverlayWidget);
    expect(typeof kickedOverlayRegistration.Component).toBe("function");
  });
});

/**
 * Stub world with the minimum surface the meta-plugin's onEnable
 * touches. Mirrors FakeWorld in __tests__/onEnable.test.ts — keep
 * these in sync if onEnable starts calling new world methods.
 */
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

describe("Hyperscape meta-plugin — kicked overlay widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the kicked overlay registration", () => {
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
    expect(registered).toContain(kickedOverlayRegistration);
  });
});
