/**
 * Tests for the PushNotificationsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pushNotificationsProvider } from "../PushNotificationsProvider";

beforeEach(() => {
  pushNotificationsProvider.unload();
});
afterEach(() => {
  pushNotificationsProvider.unload();
});

const validManifest = {
  enabled: true,
  channels: [
    {
      id: "apns",
      name: "APNs Production",
      transport: "apns" as const,
      credentialsNameRef: "apns_creds",
      maxMessagesPerHour: 1000,
    },
    {
      id: "inApp",
      name: "In-App",
      transport: "inApp" as const,
    },
  ],
  categories: [
    {
      id: "whispers",
      titleLocalizationKey: "push.whispers.title",
      channelIds: ["apns", "inApp"],
      priority: "high" as const,
    },
    {
      id: "dailyReward",
      titleLocalizationKey: "push.dailyReward.title",
      channelIds: ["inApp"],
      priority: "low" as const,
      respectQuietHours: true,
    },
  ],
};

describe("PushNotificationsProvider", () => {
  it("starts unloaded", () => {
    expect(pushNotificationsProvider.isLoaded()).toBe(false);
    expect(pushNotificationsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = pushNotificationsProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.channels.length).toBe(2);
    expect(parsed.categories.length).toBe(2);
    expect(parsed.quietHours.enabled).toBe(false);
    expect(pushNotificationsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = pushNotificationsProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.channels.length).toBe(0);
    expect(pushNotificationsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no channels", () => {
    const bad = { ...validManifest, channels: [] };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects enabled=true with no categories", () => {
    const bad = { ...validManifest, categories: [] };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = pushNotificationsProvider.loadRaw(validManifest);
    pushNotificationsProvider.unload();
    pushNotificationsProvider.load(parsed);
    expect(pushNotificationsProvider.isLoaded()).toBe(true);
    expect(pushNotificationsProvider.getManifest()?.channels.length).toBe(2);
  });

  it("loadRaw() rejects duplicate channel ids", () => {
    const bad = {
      ...validManifest,
      channels: [validManifest.channels[0], { ...validManifest.channels[0] }],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects duplicate category ids", () => {
    const bad = {
      ...validManifest,
      categories: [
        validManifest.categories[0],
        { ...validManifest.categories[0] },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects non-inApp channel without credentialsNameRef", () => {
    const bad = {
      ...validManifest,
      channels: [
        {
          id: "naked",
          name: "Naked FCM",
          transport: "fcm" as const,
        },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects category channel ref to undeclared channel", () => {
    const bad = {
      ...validManifest,
      categories: [
        {
          id: "orphan",
          titleLocalizationKey: "push.orphan.title",
          channelIds: ["nonexistent"],
        },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects two enabled channels for same transport", () => {
    const bad = {
      ...validManifest,
      channels: [
        {
          id: "apns1",
          name: "A1",
          transport: "apns" as const,
          credentialsNameRef: "creds1",
        },
        {
          id: "apns2",
          name: "A2",
          transport: "apns" as const,
          credentialsNameRef: "creds2",
        },
      ],
      categories: [
        {
          id: "c",
          titleLocalizationKey: "k",
          channelIds: ["apns1"],
        },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts duplicate transports when one is disabled", () => {
    const parsed = pushNotificationsProvider.loadRaw({
      ...validManifest,
      channels: [
        {
          id: "apnsEnabled",
          name: "A",
          transport: "apns" as const,
          credentialsNameRef: "c",
          enabled: true,
        },
        {
          id: "apnsStandby",
          name: "B",
          transport: "apns" as const,
          credentialsNameRef: "c2",
          enabled: false,
        },
      ],
      categories: [
        { id: "c", titleLocalizationKey: "k", channelIds: ["apnsEnabled"] },
      ],
    });
    expect(parsed.channels.length).toBe(2);
  });

  it("loadRaw() rejects category with empty channelIds", () => {
    const bad = {
      ...validManifest,
      categories: [{ id: "empty", titleLocalizationKey: "k", channelIds: [] }],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects category with duplicate channelIds", () => {
    const bad = {
      ...validManifest,
      categories: [
        {
          id: "dup",
          titleLocalizationKey: "k",
          channelIds: ["apns", "apns"],
        },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects unknown transport", () => {
    const bad = {
      ...validManifest,
      channels: [
        {
          id: "weird",
          name: "x",
          transport: "pager" as unknown as "apns",
          credentialsNameRef: "c",
        },
      ],
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects invalid quietHours HH:MM", () => {
    const bad = {
      ...validManifest,
      quietHours: {
        enabled: true,
        defaultStartLocal: "25:00",
        defaultEndLocal: "08:00",
      },
    };
    expect(() => pushNotificationsProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    pushNotificationsProvider.loadRaw(validManifest);
    const parsed = pushNotificationsProvider.loadRaw({
      ...validManifest,
      deduplicateWindowSec: 300,
    });
    pushNotificationsProvider.hotReload(parsed);
    expect(pushNotificationsProvider.getManifest()?.deduplicateWindowSec).toBe(
      300,
    );
  });

  it("hotReload(null) clears the manifest", () => {
    pushNotificationsProvider.loadRaw(validManifest);
    pushNotificationsProvider.hotReload(null);
    expect(pushNotificationsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    pushNotificationsProvider.loadRaw(validManifest);
    pushNotificationsProvider.unload();
    expect(pushNotificationsProvider.isLoaded()).toBe(false);
    expect(pushNotificationsProvider.getManifest()).toBeNull();
  });
});
