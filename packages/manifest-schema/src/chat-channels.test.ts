/**
 * Faithfulness + defensiveness tests for `ChatChannelsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ChatChannelsManifestSchema,
  type ChatChannelsManifest,
} from "./chat-channels.js";

const reference: ChatChannelsManifest = {
  channels: [
    {
      id: "global",
      name: "Global",
      description: "Server-wide chat.",
      scope: "global",
      postPermission: "verified-email",
      color: "#ffffff",
      defaultVisible: true,
      rateLimitPerMinute: 20,
      maxMessageLength: 500,
      cooldownSec: 1,
      historySize: 500,
      filterRuleIds: ["profanity", "spam"],
      customScopeKey: "",
    },
    {
      id: "zone",
      name: "Local",
      description: "Visible to nearby players.",
      scope: "zone",
      postPermission: "anyone",
      color: "#ffee88",
      defaultVisible: true,
      rateLimitPerMinute: 60,
      maxMessageLength: 500,
      cooldownSec: 0,
      historySize: 200,
      filterRuleIds: ["profanity"],
      customScopeKey: "",
    },
    {
      id: "party",
      name: "Party",
      description: "",
      scope: "party",
      postPermission: "anyone",
      color: "#66ccff",
      defaultVisible: true,
      rateLimitPerMinute: 120,
      maxMessageLength: 500,
      cooldownSec: 0,
      historySize: 200,
      filterRuleIds: [],
      customScopeKey: "",
    },
    {
      id: "system",
      name: "System",
      description: "Engine broadcasts.",
      scope: "system",
      postPermission: "system-only",
      color: "#ffaa00",
      defaultVisible: true,
      rateLimitPerMinute: 0,
      maxMessageLength: 1000,
      cooldownSec: 0,
      historySize: 200,
      filterRuleIds: [],
      customScopeKey: "",
    },
    {
      id: "trade",
      name: "Trade",
      description: "",
      scope: "custom",
      postPermission: "anyone",
      color: "#ff99ff",
      defaultVisible: false,
      rateLimitPerMinute: 10,
      maxMessageLength: 500,
      cooldownSec: 2,
      historySize: 200,
      filterRuleIds: ["profanity", "spam"],
      customScopeKey: "tradeHall",
    },
  ],
  filterRules: [
    {
      id: "profanity",
      pattern: "\\b(badword1|badword2)\\b",
      action: "censor",
      severity: 3,
    },
    { id: "spam", pattern: "(?:.)\\1{10,}", action: "warn", severity: 1 },
  ],
};

describe("ChatChannelsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ChatChannelsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies channel defaults on minimal manifest", () => {
    const parsed = ChatChannelsManifestSchema.parse({
      channels: [{ id: "g", name: "G", scope: "global", color: "#ffffff" }],
    });
    expect(parsed.channels[0].postPermission).toBe("anyone");
    expect(parsed.channels[0].defaultVisible).toBe(true);
    expect(parsed.channels[0].rateLimitPerMinute).toBe(60);
    expect(parsed.channels[0].maxMessageLength).toBe(500);
    expect(parsed.channels[0].cooldownSec).toBe(0);
    expect(parsed.channels[0].historySize).toBe(200);
    expect(parsed.channels[0].filterRuleIds).toEqual([]);
    expect(parsed.channels[0].customScopeKey).toBe("");
    expect(parsed.filterRules).toEqual([]);
  });

  it("rejects empty channels array", () => {
    expect(ChatChannelsManifestSchema.safeParse({ channels: [] }).success).toBe(
      false,
    );
  });

  it("rejects duplicate channel ids", () => {
    const bad = {
      channels: [
        { id: "g", name: "A", scope: "global", color: "#ffffff" },
        { id: "g", name: "B", scope: "global", color: "#ffffff" },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate filter rule ids", () => {
    const bad = {
      channels: [{ id: "g", name: "A", scope: "global", color: "#ffffff" }],
      filterRules: [
        { id: "dup", pattern: "a", action: "block" },
        { id: "dup", pattern: "b", action: "block" },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects channel referencing unknown filter rule", () => {
    const bad = {
      channels: [
        {
          id: "g",
          name: "A",
          scope: "global",
          color: "#ffffff",
          filterRuleIds: ["ghost"],
        },
      ],
      filterRules: [{ id: "profanity", pattern: "a", action: "block" }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects custom scope without customScopeKey", () => {
    const bad = {
      channels: [{ id: "c", name: "C", scope: "custom", color: "#ffffff" }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-custom scope with customScopeKey set", () => {
    const bad = {
      channels: [
        {
          id: "c",
          name: "C",
          scope: "global",
          color: "#ffffff",
          customScopeKey: "foo",
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects more than one defaultVisible system channel", () => {
    const bad = {
      channels: [
        {
          id: "sys1",
          name: "System 1",
          scope: "system",
          color: "#ffaa00",
          defaultVisible: true,
        },
        {
          id: "sys2",
          name: "System 2",
          scope: "system",
          color: "#ffaa00",
          defaultVisible: true,
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multiple system channels when at most one is defaultVisible", () => {
    const ok = {
      channels: [
        {
          id: "sys",
          name: "System",
          scope: "system",
          color: "#ffaa00",
          defaultVisible: true,
        },
        {
          id: "debug",
          name: "Debug",
          scope: "system",
          color: "#888888",
          defaultVisible: false,
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects invalid channel id format", () => {
    const bad = {
      channels: [
        { id: "Has Spaces", name: "X", scope: "global", color: "#ffffff" },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid color format", () => {
    const bad = {
      channels: [{ id: "c", name: "C", scope: "global", color: "blue" }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown scope", () => {
    const bad = {
      channels: [
        { id: "c", name: "C", scope: "intergalactic", color: "#ffffff" },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown postPermission", () => {
    const bad = {
      channels: [
        {
          id: "c",
          name: "C",
          scope: "global",
          color: "#ffffff",
          postPermission: "vip-only",
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rate limit > 600", () => {
    const bad = {
      channels: [
        {
          id: "c",
          name: "C",
          scope: "global",
          color: "#ffffff",
          rateLimitPerMinute: 1000,
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxMessageLength > 8192", () => {
    const bad = {
      channels: [
        {
          id: "c",
          name: "C",
          scope: "global",
          color: "#ffffff",
          maxMessageLength: 10000,
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown filter action", () => {
    const bad = {
      channels: [{ id: "c", name: "C", scope: "global", color: "#ffffff" }],
      filterRules: [{ id: "r", pattern: "x", action: "nuke" }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty filter pattern", () => {
    const bad = {
      channels: [{ id: "c", name: "C", scope: "global", color: "#ffffff" }],
      filterRules: [{ id: "r", pattern: "", action: "block" }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects filter severity > 10", () => {
    const bad = {
      channels: [{ id: "c", name: "C", scope: "global", color: "#ffffff" }],
      filterRules: [{ id: "r", pattern: "x", action: "block", severity: 20 }],
    };
    expect(ChatChannelsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts rate limit 0 (unlimited)", () => {
    const ok = {
      channels: [
        {
          id: "c",
          name: "C",
          scope: "system",
          color: "#ffffff",
          rateLimitPerMinute: 0,
        },
      ],
    };
    expect(ChatChannelsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
