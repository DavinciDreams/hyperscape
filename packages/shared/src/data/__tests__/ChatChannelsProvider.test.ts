/**
 * Tests for the ChatChannelsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chatChannelsProvider } from "../ChatChannelsProvider";

beforeEach(() => {
  chatChannelsProvider.unload();
});
afterEach(() => {
  chatChannelsProvider.unload();
});

const validManifest = {
  channels: [
    {
      id: "global",
      name: "Global",
      scope: "global" as const,
      color: "#ffffff",
    },
    {
      id: "system",
      name: "System",
      scope: "system" as const,
      color: "#ffcc00",
      postPermission: "system-only" as const,
    },
    {
      id: "guildGreeting",
      name: "Guild",
      scope: "guild" as const,
      color: "#66ccff",
      filterRuleIds: ["mildProfanity"],
    },
  ],
  filterRules: [
    {
      id: "mildProfanity",
      pattern: "(crap|dang)",
      action: "censor" as const,
      severity: 2,
    },
  ],
};

describe("ChatChannelsProvider", () => {
  it("starts unloaded", () => {
    expect(chatChannelsProvider.isLoaded()).toBe(false);
    expect(chatChannelsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = chatChannelsProvider.loadRaw(validManifest);
    expect(parsed.channels.length).toBe(3);
    expect(parsed.channels[0].postPermission).toBe("anyone");
    expect(parsed.channels[0].defaultVisible).toBe(true);
    expect(parsed.channels[0].rateLimitPerMinute).toBe(60);
    expect(parsed.channels[0].maxMessageLength).toBe(500);
    expect(parsed.channels[0].historySize).toBe(200);
    expect(parsed.filterRules.length).toBe(1);
    expect(chatChannelsProvider.isLoaded()).toBe(true);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = chatChannelsProvider.loadRaw(validManifest);
    chatChannelsProvider.unload();
    chatChannelsProvider.load(parsed);
    expect(chatChannelsProvider.isLoaded()).toBe(true);
    expect(chatChannelsProvider.getManifest()?.channels.length).toBe(3);
  });

  it("loadRaw() rejects empty channels array", () => {
    expect(() => chatChannelsProvider.loadRaw({ channels: [] })).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate channel ids", () => {
    const bad = {
      channels: [
        { id: "x", name: "A", scope: "global", color: "#ffffff" },
        { id: "x", name: "B", scope: "zone", color: "#ffffff" },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects duplicate filter rule ids", () => {
    const bad = {
      channels: [{ id: "x", name: "X", scope: "global", color: "#ffffff" }],
      filterRules: [
        { id: "r", pattern: "a", action: "block" },
        { id: "r", pattern: "b", action: "block" },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects channel filterRuleIds referring to missing rules", () => {
    const bad = {
      channels: [
        {
          id: "x",
          name: "X",
          scope: "global",
          color: "#ffffff",
          filterRuleIds: ["ghost"],
        },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects more than one defaultVisible system channel", () => {
    const bad = {
      channels: [
        {
          id: "sys1",
          name: "System 1",
          scope: "system",
          color: "#ff0000",
          defaultVisible: true,
        },
        {
          id: "sys2",
          name: "System 2",
          scope: "system",
          color: "#00ff00",
          defaultVisible: true,
        },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects custom scope without customScopeKey", () => {
    const bad = {
      channels: [
        { id: "cust", name: "Custom", scope: "custom", color: "#ffffff" },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects non-custom scope with customScopeKey set", () => {
    const bad = {
      channels: [
        {
          id: "x",
          name: "X",
          scope: "global",
          color: "#ffffff",
          customScopeKey: "shouldNotBeHere",
        },
      ],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects malformed hex color", () => {
    const bad = {
      channels: [{ id: "x", name: "X", scope: "global", color: "not-hex" }],
    };
    expect(() => chatChannelsProvider.loadRaw(bad)).toThrow();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    chatChannelsProvider.loadRaw(validManifest);
    const replacement = chatChannelsProvider.loadRaw({
      channels: [
        { id: "only", name: "Only", scope: "global", color: "#ffffff" },
      ],
    });
    chatChannelsProvider.hotReload(replacement);
    expect(chatChannelsProvider.getManifest()?.channels.length).toBe(1);
    expect(chatChannelsProvider.getManifest()?.channels[0].id).toBe("only");
  });

  it("hotReload(null) clears", () => {
    chatChannelsProvider.loadRaw(validManifest);
    chatChannelsProvider.hotReload(null);
    expect(chatChannelsProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    chatChannelsProvider.loadRaw(validManifest);
    chatChannelsProvider.unload();
    expect(chatChannelsProvider.isLoaded()).toBe(false);
    expect(chatChannelsProvider.getManifest()).toBeNull();
  });
});
