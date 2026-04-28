/**
 * NotificationToastListWidget — definition + plugin onEnable
 * contribution test. Mirrors the established widget-test pattern.
 */

import { describe, expect, it, vi } from "vitest";
import defaultFactory, {
  type HyperscapeContext,
  DEFAULT_NOTIFICATION_TYPE_STYLES,
  NOTIFICATION_TYPES,
  NOTIFICATION_ANCHORS,
  type NotificationType,
  type NotificationAnchor,
  notificationToastListRegistration,
  notificationToastListWidget,
} from "../../index.js";

describe("NotificationToastListWidget — definition", () => {
  it("declares a stable manifest id, category, and default size", () => {
    expect(notificationToastListWidget.manifest.id).toBe(
      "com.hyperforge.hyperscape.notification-toast-list",
    );
    expect(notificationToastListWidget.manifest.category).toBe("overlay");
    expect(notificationToastListWidget.manifest.defaultSize).toEqual({
      width: 36,
      height: 24,
    });
  });

  it("default props match the legacy hand-coded container", () => {
    expect(notificationToastListWidget.defaultProps).toMatchObject({
      notifications: [],
      anchor: "top-right",
      edgeOffsetPx: 16,
      minWidthPx: 280,
      maxWidthPx: 400,
      gapPx: 8,
    });
  });

  it("NOTIFICATION_TYPES is the canonical severity set", () => {
    expect(NOTIFICATION_TYPES).toEqual(["success", "error", "warning", "info"]);
  });

  it("DEFAULT_NOTIFICATION_TYPE_STYLES has an entry per type", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(DEFAULT_NOTIFICATION_TYPE_STYLES[type]).toBeTruthy();
      expect(DEFAULT_NOTIFICATION_TYPE_STYLES[type].icon).toBeTruthy();
    }
  });

  it("NOTIFICATION_ANCHORS covers the 4 corners", () => {
    expect(NOTIFICATION_ANCHORS).toEqual([
      "top-right",
      "top-left",
      "bottom-right",
      "bottom-left",
    ]);
  });

  it("schema accepts a populated runtime payload", () => {
    const parsed = notificationToastListWidget.propsSchema.safeParse({
      notifications: [
        {
          id: "n1",
          type: "success",
          title: "Saved",
          message: "Your settings were saved.",
          dismissible: true,
        },
        {
          id: "n2",
          type: "error",
          message: "Connection lost",
          actionLabel: "Retry",
        },
      ],
      anchor: "bottom-left",
      edgeOffsetPx: 24,
      zIndex: 12_000,
      textColor: "#fff",
      bodyTextColor: "rgba(255,255,255,0.9)",
      actionBackgroundColor: "rgba(255,255,255,0.2)",
      actionBorderColor: "rgba(255,255,255,0.3)",
      dismissColor: "rgba(255,255,255,0.7)",
      minWidthPx: 320,
      maxWidthPx: 480,
      gapPx: 12,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown notification type", () => {
    expect(
      notificationToastListWidget.propsSchema.safeParse({
        notifications: [
          {
            id: "x",
            type: "fatal" as unknown as NotificationType,
            message: "nope",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown anchor", () => {
    expect(
      notificationToastListWidget.propsSchema.safeParse({
        anchor: "center" as unknown as NotificationAnchor,
      }).success,
    ).toBe(false);
  });

  it("rejects empty notification id", () => {
    expect(
      notificationToastListWidget.propsSchema.safeParse({
        notifications: [{ id: "", type: "info", message: "x" }],
      }).success,
    ).toBe(false);
  });

  it("pairs the widget with a non-null React component in the bundled registration", () => {
    expect(notificationToastListRegistration.widget).toBe(
      notificationToastListWidget,
    );
    expect(typeof notificationToastListRegistration.Component).toBe("function");
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

describe("Hyperscape meta-plugin — notification toast list widget contribution", () => {
  it("onEnable calls ctx.widgets.register with the notification toast list registration", () => {
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
    expect(registered).toContain(notificationToastListRegistration);
  });
});
