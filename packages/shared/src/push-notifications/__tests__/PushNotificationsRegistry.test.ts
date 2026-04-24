import { PushNotificationsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  PushNotificationsNotLoadedError,
  PushNotificationsRegistry,
  UnknownPushCategoryError,
  UnknownPushChannelError,
} from "../PushNotificationsRegistry.js";

function manifest(
  opts: {
    quiet?: { enabled?: boolean; start?: string; end?: string };
  } = {},
) {
  return PushNotificationsManifestSchema.parse({
    enabled: true,
    channels: [
      {
        id: "apnsProd",
        name: "APNs Production",
        transport: "apns",
        credentialsNameRef: "deploy.apns.prod",
      },
      {
        id: "fcmProd",
        name: "FCM Production",
        transport: "fcm",
        credentialsNameRef: "deploy.fcm.prod",
      },
      {
        id: "webPush",
        name: "Web Push",
        transport: "webPush",
        credentialsNameRef: "deploy.webpush.vapid",
        enabled: false,
      },
      { id: "inAppBus", name: "In-app", transport: "inApp" },
    ],
    categories: [
      {
        id: "whispers",
        titleLocalizationKey: "push.cat.whispers",
        channelIds: ["apnsProd", "fcmProd", "inAppBus"],
        priority: "high",
      },
      {
        id: "maintenance",
        titleLocalizationKey: "push.cat.maintenance",
        channelIds: ["apnsProd", "fcmProd"],
        priority: "critical",
      },
      {
        id: "marketing",
        titleLocalizationKey: "push.cat.marketing",
        channelIds: ["apnsProd", "fcmProd", "webPush"],
        priority: "low",
      },
    ],
    quietHours: {
      enabled: opts.quiet?.enabled ?? true,
      defaultStartLocal: opts.quiet?.start ?? "22:00",
      defaultEndLocal: opts.quiet?.end ?? "08:00",
      criticalAlwaysDelivers: true,
    },
  });
}

describe("PushNotificationsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new PushNotificationsRegistry().manifest).toThrow(
      PushNotificationsNotLoadedError,
    );
  });
});

describe("PushNotificationsRegistry — lookup", () => {
  it("channel + category by id", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.channel("apnsProd").transport).toBe("apns");
    expect(r.category("whispers").priority).toBe("high");
  });

  it("throws on unknown channel / category", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(() => r.channel("ghost")).toThrow(UnknownPushChannelError);
    expect(() => r.category("ghost")).toThrow(UnknownPushCategoryError);
  });
});

describe("PushNotificationsRegistry — channelsForCategory", () => {
  it("filters out disabled channels", () => {
    const r = new PushNotificationsRegistry(manifest());
    const ids = r.channelsForCategory("marketing").map((c) => c.id);
    expect(ids).toEqual(["apnsProd", "fcmProd"]);
  });

  it("keeps all enabled channels", () => {
    const r = new PushNotificationsRegistry(manifest());
    const ids = r.channelsForCategory("whispers").map((c) => c.id);
    expect(ids).toEqual(["apnsProd", "fcmProd", "inAppBus"]);
  });
});

describe("PushNotificationsRegistry — transport lookup", () => {
  it("returns first enabled channel for transport", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.channelByTransport("fcm")?.id).toBe("fcmProd");
    expect(r.channelByTransport("webPush")).toBeUndefined();
  });
});

describe("PushNotificationsRegistry — quiet hours", () => {
  it("wrap-around window (22:00→08:00)", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.isQuietAt("23:00")).toBe(true);
    expect(r.isQuietAt("03:00")).toBe(true);
    expect(r.isQuietAt("07:59")).toBe(true);
    expect(r.isQuietAt("08:00")).toBe(false);
    expect(r.isQuietAt("12:00")).toBe(false);
    expect(r.isQuietAt("22:00")).toBe(true);
  });

  it("normal window (10:00→14:00)", () => {
    const r = new PushNotificationsRegistry(
      manifest({ quiet: { start: "10:00", end: "14:00" } }),
    );
    expect(r.isQuietAt("09:59")).toBe(false);
    expect(r.isQuietAt("10:00")).toBe(true);
    expect(r.isQuietAt("13:59")).toBe(true);
    expect(r.isQuietAt("14:00")).toBe(false);
  });

  it("disabled quiet hours always returns false", () => {
    const r = new PushNotificationsRegistry(
      manifest({ quiet: { enabled: false } }),
    );
    expect(r.isQuietAt("03:00")).toBe(false);
  });
});

describe("PushNotificationsRegistry — canDeliverAt", () => {
  it("quiet window suppresses non-critical", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.canDeliverAt("whispers", "03:00")).toBe(false);
    expect(r.canDeliverAt("marketing", "03:00")).toBe(false);
  });

  it("quiet window always lets critical through", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.canDeliverAt("maintenance", "03:00")).toBe(true);
  });

  it("outside quiet window all categories deliver", () => {
    const r = new PushNotificationsRegistry(manifest());
    expect(r.canDeliverAt("whispers", "12:00")).toBe(true);
    expect(r.canDeliverAt("marketing", "12:00")).toBe(true);
  });
});
