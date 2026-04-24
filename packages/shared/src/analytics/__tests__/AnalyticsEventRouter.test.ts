import { AnalyticsEventManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { AnalyticsEventRouter } from "../AnalyticsEventRouter.js";

function manifest() {
  return AnalyticsEventManifestSchema.parse([
    {
      name: "session_start",
      category: "session",
      props: [
        { name: "session_id", kind: "string", required: true },
        { name: "account_id", kind: "string", required: true, piiSafe: false },
        {
          name: "platform",
          kind: "enum",
          required: true,
          enumValues: ["web", "ios", "android"],
        },
      ],
    },
    {
      name: "quest_completed",
      category: "progression",
      samplingRate: 0.5,
      props: [
        { name: "quest_id", kind: "string", required: true },
        { name: "level", kind: "integer", required: false },
        { name: "reward_gold", kind: "number", required: false },
      ],
    },
    {
      name: "heartbeat",
      category: "session",
      samplingRate: 0,
      props: [{ name: "uptime_sec", kind: "number", required: true }],
    },
  ]);
}

describe("AnalyticsEventRouter — lookup", () => {
  it("indexes by name", () => {
    const r = new AnalyticsEventRouter(manifest());
    expect(r.size).toBe(3);
    expect(r.has("session_start")).toBe(true);
    expect(r.get("session_start")?.category).toBe("session");
  });
});

describe("AnalyticsEventRouter — validate", () => {
  it("accepts a valid event", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "session_start",
      { session_id: "abc", account_id: "u1", platform: "web" },
      { skipSampling: true },
    );
    expect(out.status).toBe("accept");
  });

  it("rejects unknown event", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate("ghost", {});
    expect(out.status).toBe("reject");
    if (out.status === "reject") {
      expect(out.errors[0].kind).toBe("unknown-event");
    }
  });

  it("rejects missing required prop", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "session_start",
      { session_id: "abc", platform: "web" },
      { skipSampling: true },
    );
    expect(out.status).toBe("reject");
    if (out.status === "reject") {
      expect(out.errors.some((e) => e.kind === "missing-prop")).toBe(true);
    }
  });

  it("rejects unknown prop", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "session_start",
      {
        session_id: "abc",
        account_id: "u1",
        platform: "web",
        rogue: "extra",
      },
      { skipSampling: true },
    );
    expect(out.status).toBe("reject");
    if (out.status === "reject") {
      expect(out.errors[0].kind).toBe("unknown-prop");
    }
  });

  it("rejects type mismatch", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "quest_completed",
      { quest_id: "q1", level: 1.5 },
      { skipSampling: true },
    );
    expect(out.status).toBe("reject");
    if (out.status === "reject") {
      expect(out.errors[0].kind).toBe("type-mismatch");
    }
  });

  it("accepts integer prop with whole number", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "quest_completed",
      { quest_id: "q1", level: 10 },
      { skipSampling: true },
    );
    expect(out.status).toBe("accept");
  });

  it("rejects enum-mismatch", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "session_start",
      {
        session_id: "abc",
        account_id: "u1",
        platform: "toaster",
      },
      { skipSampling: true },
    );
    expect(out.status).toBe("reject");
    if (out.status === "reject") {
      expect(out.errors[0].kind).toBe("enum-mismatch");
    }
  });
});

describe("AnalyticsEventRouter — sampling", () => {
  it("drops when rng >= samplingRate", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "quest_completed",
      { quest_id: "q1" },
      { rng: () => 0.9 },
    );
    expect(out.status).toBe("drop");
  });

  it("accepts when rng < samplingRate", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "quest_completed",
      { quest_id: "q1" },
      { rng: () => 0.1 },
    );
    expect(out.status).toBe("accept");
  });

  it("samplingRate=0 always drops", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate("heartbeat", { uptime_sec: 123 }, { rng: () => 0 });
    expect(out.status).toBe("drop");
  });

  it("skipSampling bypasses rate", () => {
    const r = new AnalyticsEventRouter(manifest());
    const out = r.validate(
      "heartbeat",
      { uptime_sec: 123 },
      { skipSampling: true },
    );
    expect(out.status).toBe("accept");
  });
});

describe("AnalyticsEventRouter — timestamps", () => {
  it("accepts Date values for timestamp kind", () => {
    const r = new AnalyticsEventRouter(
      AnalyticsEventManifestSchema.parse([
        {
          name: "evt",
          category: "x",
          props: [{ name: "at", kind: "timestamp", required: true }],
        },
      ]),
    );
    const out = r.validate("evt", { at: new Date() }, { skipSampling: true });
    expect(out.status).toBe("accept");
  });

  it("accepts finite number for timestamp kind", () => {
    const r = new AnalyticsEventRouter(
      AnalyticsEventManifestSchema.parse([
        {
          name: "evt",
          category: "x",
          props: [{ name: "at", kind: "timestamp", required: true }],
        },
      ]),
    );
    const out = r.validate(
      "evt",
      { at: 1_700_000_000_000 },
      { skipSampling: true },
    );
    expect(out.status).toBe("accept");
  });
});
