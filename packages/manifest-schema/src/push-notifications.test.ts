import { describe, expect, it } from "vitest";
import {
  DeliveryChannelSchema,
  NotificationCategorySchema,
  PushConsentGatingSchema,
  PushNotificationsManifestSchema,
  QuietHoursRulesSchema,
} from "./push-notifications.js";

describe("DeliveryChannelSchema", () => {
  it("accepts an apns channel", () => {
    const c = DeliveryChannelSchema.parse({
      id: "apnsProd",
      name: "APNs Prod",
      transport: "apns",
      credentialsNameRef: "apnsCredProd",
    });
    expect(c.enabled).toBe(true);
  });

  it("accepts inApp channel without credentials", () => {
    const c = DeliveryChannelSchema.parse({
      id: "toast",
      name: "In-App Toast",
      transport: "inApp",
    });
    expect(c.credentialsNameRef).toBe("");
  });

  it("rejects non-inApp transport without credentialsNameRef", () => {
    expect(() =>
      DeliveryChannelSchema.parse({
        id: "fcm",
        name: "FCM",
        transport: "fcm",
      }),
    ).toThrow(/credentialsNameRef/);
  });
});

describe("NotificationCategorySchema", () => {
  it("accepts a valid category", () => {
    const c = NotificationCategorySchema.parse({
      id: "whispers",
      titleLocalizationKey: "push.whispers.title",
      channelIds: ["apnsProd", "fcmProd"],
    });
    expect(c.priority).toBe("normal");
  });

  it("requires at least one channel", () => {
    expect(() =>
      NotificationCategorySchema.parse({
        id: "x",
        titleLocalizationKey: "x",
        channelIds: [],
      }),
    ).toThrow();
  });

  it("rejects duplicate channelIds", () => {
    expect(() =>
      NotificationCategorySchema.parse({
        id: "x",
        titleLocalizationKey: "x",
        channelIds: ["a", "a"],
      }),
    ).toThrow(/unique/);
  });
});

describe("QuietHoursRulesSchema", () => {
  it("defaults to disabled 22:00–08:00", () => {
    const q = QuietHoursRulesSchema.parse({});
    expect(q.enabled).toBe(false);
    expect(q.defaultStartLocal).toBe("22:00");
    expect(q.defaultEndLocal).toBe("08:00");
  });

  it("rejects invalid HH:MM", () => {
    expect(() =>
      QuietHoursRulesSchema.parse({ defaultStartLocal: "25:00" }),
    ).toThrow(/HH:MM/);
  });

  it("accepts overnight window (22:00–08:00)", () => {
    const q = QuietHoursRulesSchema.parse({
      enabled: true,
      defaultStartLocal: "22:00",
      defaultEndLocal: "08:00",
    });
    expect(q.enabled).toBe(true);
  });
});

describe("PushConsentGatingSchema", () => {
  it("defaults require opt-in", () => {
    const c = PushConsentGatingSchema.parse({});
    expect(c.requireOptIn).toBe(true);
    expect(c.allowGlobalOptOut).toBe(true);
  });
});

describe("PushNotificationsManifestSchema", () => {
  const apnsCh = {
    id: "apnsProd",
    name: "APNs Prod",
    transport: "apns" as const,
    credentialsNameRef: "apnsCred",
  };
  const fcmCh = {
    id: "fcmProd",
    name: "FCM Prod",
    transport: "fcm" as const,
    credentialsNameRef: "fcmCred",
  };
  const cat = {
    id: "whispers",
    titleLocalizationKey: "push.whispers.title",
    channelIds: ["apnsProd"],
  };

  it("accepts a minimal manifest", () => {
    const m = PushNotificationsManifestSchema.parse({
      channels: [apnsCh],
      categories: [cat],
    });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled manifest with no channels", () => {
    expect(() =>
      PushNotificationsManifestSchema.parse({
        channels: [],
        categories: [cat],
      }),
    ).toThrow(/at least one channel/);
  });

  it("rejects enabled manifest with no categories", () => {
    expect(() =>
      PushNotificationsManifestSchema.parse({
        channels: [apnsCh],
        categories: [],
      }),
    ).toThrow(/at least one category/);
  });

  it("rejects duplicate channel ids", () => {
    expect(() =>
      PushNotificationsManifestSchema.parse({
        channels: [apnsCh, apnsCh],
        categories: [cat],
      }),
    ).toThrow(/channel ids/);
  });

  it("rejects category pointing to unknown channel", () => {
    expect(() =>
      PushNotificationsManifestSchema.parse({
        channels: [apnsCh],
        categories: [{ ...cat, channelIds: ["ghost"] }],
      }),
    ).toThrow(/channelIds must resolve/);
  });

  it("rejects two enabled channels with same transport", () => {
    expect(() =>
      PushNotificationsManifestSchema.parse({
        channels: [apnsCh, { ...apnsCh, id: "apnsProd2" }],
        categories: [cat],
      }),
    ).toThrow(/one enabled channel per transport/);
  });

  it("allows multiple transports (apns + fcm)", () => {
    const m = PushNotificationsManifestSchema.parse({
      channels: [apnsCh, fcmCh],
      categories: [{ ...cat, channelIds: ["apnsProd", "fcmProd"] }],
    });
    expect(m.channels).toHaveLength(2);
  });

  it("allows duplicate transports if all but one disabled", () => {
    const m = PushNotificationsManifestSchema.parse({
      channels: [apnsCh, { ...apnsCh, id: "apnsStaging", enabled: false }],
      categories: [cat],
    });
    expect(m.channels).toHaveLength(2);
  });
});
