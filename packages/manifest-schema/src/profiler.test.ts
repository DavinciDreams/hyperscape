/**
 * Faithfulness + defensiveness tests for `ProfilerOverlayManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ProfilerOverlayManifestSchema,
  type ProfilerOverlayManifest,
} from "./profiler.js";

const reference: ProfilerOverlayManifest = {
  enabled: true,
  anchor: "top-right",
  refreshMs: 250,
  backgroundOpacity: 0.6,
  fontScale: 1,
  groups: [
    {
      id: "render",
      title: "Render",
      collapsed: false,
      metrics: [
        {
          id: "fps",
          label: "FPS",
          kind: "fps",
          display: "text",
          sampleWindow: 30,
          visible: true,
          thresholds: { good: 30, warn: 50 },
        },
        {
          id: "frame_ms",
          label: "Frame (ms)",
          kind: "ms",
          display: "sparkline",
          sampleWindow: 60,
          visible: true,
        },
      ],
    },
    {
      id: "entities",
      title: "Entities",
      collapsed: true,
      metrics: [
        {
          id: "entity_count",
          label: "Entities",
          kind: "count",
          display: "text",
          sampleWindow: 1,
          visible: true,
        },
      ],
    },
  ],
};

describe("ProfilerOverlayManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ProfilerOverlayManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on empty config", () => {
    const parsed = ProfilerOverlayManifestSchema.parse({});
    expect(parsed.enabled).toBe(false);
    expect(parsed.anchor).toBe("top-left");
    expect(parsed.refreshMs).toBe(250);
    expect(parsed.backgroundOpacity).toBe(0.6);
    expect(parsed.fontScale).toBe(1);
    expect(parsed.groups).toEqual([]);
  });

  it("applies defaults on a minimal metric", () => {
    const parsed = ProfilerOverlayManifestSchema.parse({
      groups: [
        {
          id: "g",
          title: "G",
          metrics: [{ id: "m", label: "M", kind: "fps" }],
        },
      ],
    });
    expect(parsed.groups[0].collapsed).toBe(false);
    expect(parsed.groups[0].metrics[0].display).toBe("text");
    expect(parsed.groups[0].metrics[0].sampleWindow).toBe(30);
    expect(parsed.groups[0].metrics[0].visible).toBe(true);
  });

  it("rejects unknown metric kind", () => {
    const bad = {
      groups: [
        {
          id: "g",
          title: "G",
          metrics: [{ id: "m", label: "M", kind: "temperature" }],
        },
      ],
    };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects threshold where good > warn", () => {
    const bad = {
      groups: [
        {
          id: "g",
          title: "G",
          metrics: [
            {
              id: "m",
              label: "M",
              kind: "ms",
              thresholds: { good: 50, warn: 10 },
            },
          ],
        },
      ],
    };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sampleWindow below 1", () => {
    const bad = {
      groups: [
        {
          id: "g",
          title: "G",
          metrics: [{ id: "m", label: "M", kind: "fps", sampleWindow: 0 }],
        },
      ],
    };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects refreshMs below 16", () => {
    const bad = { refreshMs: 8 };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects backgroundOpacity above 1", () => {
    const bad = { backgroundOpacity: 1.5 };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects fontScale out of range", () => {
    expect(
      ProfilerOverlayManifestSchema.safeParse({ fontScale: 0.1 }).success,
    ).toBe(false);
    expect(
      ProfilerOverlayManifestSchema.safeParse({ fontScale: 3 }).success,
    ).toBe(false);
  });

  it("rejects invalid anchor", () => {
    const bad = { anchor: "center" };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate group ids", () => {
    const bad = {
      groups: [
        {
          id: "g",
          title: "A",
          metrics: [{ id: "m1", label: "M", kind: "fps" }],
        },
        {
          id: "g",
          title: "B",
          metrics: [{ id: "m2", label: "M", kind: "fps" }],
        },
      ],
    };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate metric ids across groups", () => {
    const bad = {
      groups: [
        {
          id: "a",
          title: "A",
          metrics: [{ id: "m", label: "M1", kind: "fps" }],
        },
        {
          id: "b",
          title: "B",
          metrics: [{ id: "m", label: "M2", kind: "ms" }],
        },
      ],
    };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty metrics array in a group", () => {
    const bad = { groups: [{ id: "g", title: "G", metrics: [] }] };
    expect(ProfilerOverlayManifestSchema.safeParse(bad).success).toBe(false);
  });
});
