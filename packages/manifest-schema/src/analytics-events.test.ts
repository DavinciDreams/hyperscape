/**
 * Faithfulness + defensiveness tests for `AnalyticsEventManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  AnalyticsEventManifestSchema,
  type AnalyticsEventManifest,
} from "./analytics-events.js";

const reference: AnalyticsEventManifest = [
  {
    name: "session_start",
    category: "session",
    description: "Fired once per client session at login.",
    piiSafe: true,
    samplingRate: 1,
    props: [
      {
        name: "platform",
        kind: "enum",
        enumValues: ["web", "ios", "android"],
        description: "Client platform",
        required: true,
        cardinality: "low",
        piiSafe: true,
      },
      {
        name: "client_version",
        kind: "string",
        required: true,
        cardinality: "medium",
        piiSafe: true,
        description: "",
      },
      {
        name: "player_level",
        kind: "integer",
        required: false,
        cardinality: "low",
        piiSafe: true,
        description: "",
      },
    ],
  },
  {
    name: "quest_completed",
    category: "progression",
    description: "Fired when a player finishes a quest.",
    piiSafe: true,
    samplingRate: 1,
    props: [
      {
        name: "quest_id",
        kind: "string",
        required: true,
        cardinality: "medium",
        piiSafe: true,
        description: "",
      },
      {
        name: "duration_seconds",
        kind: "number",
        required: true,
        cardinality: "high",
        piiSafe: true,
        description: "",
      },
      {
        name: "completed_at",
        kind: "timestamp",
        required: true,
        cardinality: "high",
        piiSafe: true,
        description: "",
      },
    ],
  },
];

describe("AnalyticsEventManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = AnalyticsEventManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal event + prop", () => {
    const parsed = AnalyticsEventManifestSchema.parse([
      {
        name: "page_view",
        category: "navigation",
        props: [{ name: "route", kind: "string" }],
      },
    ]);
    expect(parsed[0].description).toBe("");
    expect(parsed[0].piiSafe).toBe(true);
    expect(parsed[0].samplingRate).toBe(1);
    expect(parsed[0].props[0].required).toBe(true);
    expect(parsed[0].props[0].cardinality).toBe("unknown");
    expect(parsed[0].props[0].piiSafe).toBe(true);
  });

  it("rejects non-snake_case event name", () => {
    const bad = [{ ...reference[0], name: "sessionStart" }];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-snake_case prop name", () => {
    const bad = [
      {
        ...reference[0],
        props: [{ ...reference[0].props[0], name: "Platform" }],
      },
    ];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sampling rate > 1", () => {
    const bad = [{ ...reference[0], samplingRate: 1.5 }];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate event names", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate prop names within an event", () => {
    const bad = [
      {
        ...reference[0],
        props: [reference[0].props[0], reference[0].props[0]],
      },
    ];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects enum prop missing enumValues", () => {
    const bad = [
      {
        ...reference[0],
        props: [{ name: "mode", kind: "enum" }],
      },
    ];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-enum prop with enumValues", () => {
    const bad = [
      {
        ...reference[0],
        props: [
          { name: "client_version", kind: "string", enumValues: ["a", "b"] },
        ],
      },
    ];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown prop kind", () => {
    const bad = [
      {
        ...reference[0],
        props: [{ name: "oops", kind: "uuid" }],
      },
    ];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty category", () => {
    const bad = [{ ...reference[0], category: "" }];
    expect(AnalyticsEventManifestSchema.safeParse(bad).success).toBe(false);
  });
});
