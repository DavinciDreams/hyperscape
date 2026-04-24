import { ProfilerOverlayManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  ProfilerOverlayNotLoadedError,
  ProfilerOverlayRegistry,
  UnknownProfilerMetricError,
} from "../ProfilerOverlayRegistry.js";

function manifest() {
  return ProfilerOverlayManifestSchema.parse({
    enabled: true,
    groups: [
      {
        id: "render",
        title: "Render",
        metrics: [
          {
            id: "fps",
            label: "FPS",
            kind: "fps",
          },
          {
            id: "frameMs",
            label: "Frame ms",
            kind: "ms",
            thresholds: { good: 16, warn: 33 },
          },
        ],
      },
      {
        id: "entity",
        title: "Entities",
        collapsed: true,
        metrics: [{ id: "entityCount", label: "Count", kind: "count" }],
      },
      {
        id: "hidden",
        title: "Hidden",
        metrics: [
          {
            id: "hiddenMetric",
            label: "Hidden",
            kind: "count",
            visible: false,
          },
        ],
      },
    ],
  });
}

describe("ProfilerOverlayRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new ProfilerOverlayRegistry().manifest).toThrow(
      ProfilerOverlayNotLoadedError,
    );
  });

  it("metric lookup + throws unknown", () => {
    const r = new ProfilerOverlayRegistry(manifest());
    expect(r.metric("fps").label).toBe("FPS");
    expect(() => r.metric("ghost")).toThrow(UnknownProfilerMetricError);
  });

  it("group for metric", () => {
    const r = new ProfilerOverlayRegistry(manifest());
    expect(r.groupForMetric("entityCount").id).toBe("entity");
  });

  it("visibleMetrics excludes collapsed group + hidden metric", () => {
    const r = new ProfilerOverlayRegistry(manifest());
    expect(r.visibleMetrics().map((m) => m.id)).toEqual(["fps", "frameMs"]);
  });

  it("bandFor handles threshold bands (lower-is-better)", () => {
    const r = new ProfilerOverlayRegistry(manifest());
    // frameMs: good=16, warn=33 — value ≤ good → green, ≤ warn → yellow, else red.
    expect(r.bandFor("frameMs", 10)).toBe("green");
    expect(r.bandFor("frameMs", 16)).toBe("green");
    expect(r.bandFor("frameMs", 20)).toBe("yellow");
    expect(r.bandFor("frameMs", 33)).toBe("yellow");
    expect(r.bandFor("frameMs", 40)).toBe("red");
  });

  it("bandFor returns neutral with no thresholds", () => {
    const r = new ProfilerOverlayRegistry(manifest());
    expect(r.bandFor("entityCount", 999)).toBe("neutral");
  });
});
