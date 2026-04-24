import { ChatChannelsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ChatChannelRegistry,
  ChatRouter,
  UnknownChatChannelError,
} from "../ChatRouter.js";

function manifest() {
  return ChatChannelsManifestSchema.parse({
    channels: [
      {
        id: "global",
        name: "Global",
        scope: "global",
        color: "#ffffff",
        rateLimitPerMinute: 3,
        maxMessageLength: 20,
        cooldownSec: 1,
        filterRuleIds: ["blockSlur", "censorCurse", "warnCaps"],
      },
      {
        id: "modOnly",
        name: "Mod Channel",
        scope: "custom",
        customScopeKey: "moderators",
        postPermission: "moderator",
        color: "#ff00ff",
        rateLimitPerMinute: 0,
        cooldownSec: 0,
        filterRuleIds: [],
      },
      {
        id: "broadcast",
        name: "System",
        scope: "system",
        postPermission: "system-only",
        color: "#00ff00",
        cooldownSec: 0,
        rateLimitPerMinute: 0,
        filterRuleIds: [],
      },
    ],
    filterRules: [
      { id: "blockSlur", pattern: "badword", action: "block" },
      { id: "censorCurse", pattern: "darn", action: "censor" },
      { id: "warnCaps", pattern: "[A-Z]{5,}", action: "warn", severity: 2 },
    ],
  });
}

function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}

describe("ChatChannelRegistry", () => {
  it("indexes channels by id", () => {
    const reg = new ChatChannelRegistry(manifest());
    expect(reg.size).toBe(3);
    expect(reg.has("global")).toBe(true);
    expect(reg.get("global").name).toBe("Global");
  });

  it("get throws UnknownChatChannelError on miss", () => {
    const reg = new ChatChannelRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownChatChannelError);
  });

  it("defaultVisibleChannelIds returns channels with defaultVisible=true", () => {
    const reg = new ChatChannelRegistry(manifest());
    // All three default to visible=true
    expect(reg.defaultVisibleChannelIds()).toEqual(
      expect.arrayContaining(["global", "modOnly", "broadcast"]),
    );
  });

  it("loadFromJson validates before loading", () => {
    const reg = new ChatChannelRegistry();
    reg.loadFromJson({
      channels: [
        {
          id: "x",
          name: "X",
          scope: "global",
          color: "#000000",
        },
      ],
    });
    expect(reg.size).toBe(1);
  });
});

describe("ChatRouter — permission tiers", () => {
  it("accepts anyone on `anyone` channels", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "hi",
    });
    expect(res.kind).toBe("delivered");
  });

  it("rejects anyone from a `moderator` channel", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "modOnly",
      senderId: "p1",
      senderPermission: "anyone",
      text: "hi",
    });
    expect(res).toEqual({ kind: "rejected", reason: "permission-denied" });
  });

  it("accepts moderator on moderator channel", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "modOnly",
      senderId: "m1",
      senderPermission: "moderator",
      text: "hi",
    });
    expect(res.kind).toBe("delivered");
  });

  it("only system-only senders can post to system channels", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const admin = r.send({
      channelId: "broadcast",
      senderId: "a1",
      senderPermission: "admin",
      text: "hi",
    });
    expect(admin).toEqual({ kind: "rejected", reason: "permission-denied" });
    const system = r.send({
      channelId: "broadcast",
      senderId: "server",
      senderPermission: "system-only",
      text: "ANNOUNCEMENT",
    });
    expect(system.kind).toBe("delivered");
  });
});

describe("ChatRouter — unknown channel + length", () => {
  it("rejects unknown channel", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "ghost",
      senderId: "p1",
      senderPermission: "anyone",
      text: "hi",
    });
    expect(res).toEqual({ kind: "rejected", reason: "unknown-channel" });
  });

  it("rejects text exceeding maxMessageLength", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "x".repeat(21), // cap is 20
    });
    expect(res).toEqual({ kind: "rejected", reason: "over-length" });
  });

  it("length of exactly maxMessageLength is accepted", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "x".repeat(20),
    });
    expect(res.kind).toBe("delivered");
  });
});

describe("ChatRouter — rate limit", () => {
  it("allows up to rateLimitPerMinute, rejects the N+1th", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    // cap is 3/minute on `global`
    for (let i = 0; i < 3; i++) {
      const res = r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `m${i}`,
      });
      expect(res.kind).toBe("delivered");
      clock.advance(2000); // past cooldown
    }
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "m3",
    });
    expect(res).toEqual({ kind: "rejected", reason: "rate-limit" });
  });

  it("rate bucket empties after 60 seconds", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    for (let i = 0; i < 3; i++) {
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `m${i}`,
      });
      clock.advance(2000);
    }
    // Jump past 60s window
    clock.advance(60_000);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "fresh",
    });
    expect(res.kind).toBe("delivered");
  });

  it("rate limit is per-sender per-channel", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    for (let i = 0; i < 3; i++) {
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `m${i}`,
      });
      clock.advance(2000);
    }
    // p2 is unaffected
    const res = r.send({
      channelId: "global",
      senderId: "p2",
      senderPermission: "anyone",
      text: "hi",
    });
    expect(res.kind).toBe("delivered");
  });
});

describe("ChatRouter — cooldown", () => {
  it("rejects messages within cooldown window", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    const a = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "m1",
    });
    expect(a.kind).toBe("delivered");
    clock.advance(500); // cooldown is 1000ms
    const b = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "m2",
    });
    expect(b).toEqual({ kind: "rejected", reason: "cooldown" });
  });

  it("accepts again after cooldown elapses", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "m1",
    });
    clock.advance(1500);
    const b = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "m2",
    });
    expect(b.kind).toBe("delivered");
  });
});

describe("ChatRouter — filter rules", () => {
  it("block rule rejects with filterRuleId", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "hey badword",
    });
    expect(res).toEqual({
      kind: "rejected",
      reason: "blocked-by-filter",
      filterRuleId: "blockSlur",
    });
  });

  it("censor rule replaces matches with asterisks and flags hit", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "oh darn",
    });
    expect(res.kind).toBe("delivered");
    if (res.kind === "delivered") {
      expect(res.text).toBe("oh ****");
      expect(res.flags).toEqual([{ ruleId: "censorCurse", action: "censor" }]);
    }
  });

  it("warn rule adds flag without modifying text", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "HELLOO", // 6 caps → matches [A-Z]{5,}
    });
    expect(res.kind).toBe("delivered");
    if (res.kind === "delivered") {
      expect(res.text).toBe("HELLOO");
      expect(res.flags).toEqual([{ ruleId: "warnCaps", action: "warn" }]);
    }
  });

  it("messages without filter hits have empty flags array", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "hi there",
    });
    expect(res.kind).toBe("delivered");
    if (res.kind === "delivered") {
      expect(res.flags).toEqual([]);
    }
  });

  it("block wins over censor — blocked message is not delivered", () => {
    const reg = new ChatChannelRegistry(manifest());
    const r = new ChatRouter(reg, makeClock().now);
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "darn badword", // would censor AND block
    });
    expect(res.kind).toBe("rejected");
    if (res.kind === "rejected") {
      expect(res.reason).toBe("blocked-by-filter");
      expect(res.filterRuleId).toBe("blockSlur");
    }
  });

  it("rejected messages do not consume rate budget", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    // Send 2 bad (blocked) messages — should not count against rate
    for (let i = 0; i < 2; i++) {
      const res = r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "badword",
      });
      expect(res.kind).toBe("rejected");
      clock.advance(2000);
    }
    // Still have full 3-msg budget
    for (let i = 0; i < 3; i++) {
      const res = r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `ok${i}`,
      });
      expect(res.kind).toBe("delivered");
      clock.advance(2000);
    }
  });
});

describe("ChatRouter — reset", () => {
  it("reset() clears rate + cooldown state for all senders", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    for (let i = 0; i < 3; i++) {
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `m${i}`,
      });
      clock.advance(2000);
    }
    r.reset();
    const res = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "fresh",
    });
    expect(res.kind).toBe("delivered");
  });

  it("resetSender clears only that sender's state", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    for (let i = 0; i < 3; i++) {
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: `a${i}`,
      });
      r.send({
        channelId: "global",
        senderId: "p2",
        senderPermission: "anyone",
        text: `b${i}`,
      });
      clock.advance(2000);
    }
    r.resetSender("p1");
    const p1 = r.send({
      channelId: "global",
      senderId: "p1",
      senderPermission: "anyone",
      text: "fresh",
    });
    expect(p1.kind).toBe("delivered");
    const p2 = r.send({
      channelId: "global",
      senderId: "p2",
      senderPermission: "anyone",
      text: "still-rate-limited",
    });
    expect(p2).toEqual({ kind: "rejected", reason: "rate-limit" });
  });
});

describe("ChatRouter — integration", () => {
  it("realistic mixed session: deliveries, censor, block, rate-limit", () => {
    const reg = new ChatChannelRegistry(manifest());
    const clock = makeClock();
    const r = new ChatRouter(reg, clock.now);
    const outcomes: string[] = [];
    const push = (res: ReturnType<typeof r.send>) => {
      if (res.kind === "delivered") {
        outcomes.push(
          `ok:${res.text}${res.flags.length ? `(${res.flags.map((f) => f.action).join(",")})` : ""}`,
        );
      } else {
        outcomes.push(`no:${res.reason}`);
      }
    };
    push(
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "hello",
      }),
    );
    clock.advance(2000);
    push(
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "oh darn",
      }),
    );
    clock.advance(2000);
    push(
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "badword",
      }),
    ); // blocked — doesn't count
    clock.advance(2000);
    push(
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "third",
      }),
    );
    clock.advance(2000);
    push(
      r.send({
        channelId: "global",
        senderId: "p1",
        senderPermission: "anyone",
        text: "fourth",
      }),
    ); // rate-limit hit
    expect(outcomes).toEqual([
      "ok:hello",
      "ok:oh ****(censor)",
      "no:blocked-by-filter",
      "ok:third",
      "no:rate-limit",
    ]);
  });
});
