import { HapticsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  HapticsNotLoadedError,
  HapticsRegistry,
  UnknownHapticPatternError,
} from "../HapticsRegistry.js";

function pattern(
  id: string,
  extra: {
    category?:
      | "combat"
      | "ui"
      | "ambient"
      | "notification"
      | "environment"
      | "custom";
    priority?: number;
    cancellable?: boolean;
    stages?: Array<{
      channel: "low-frequency" | "high-frequency" | "both";
      durationMs: number;
      startAmplitude: number;
      endAmplitude: number;
    }>;
  } = {},
) {
  return {
    id,
    name: id,
    category: extra.category ?? "combat",
    priority: extra.priority ?? 10,
    cancellable: extra.cancellable ?? true,
    stages: extra.stages ?? [
      {
        channel: "both",
        durationMs: 100,
        startAmplitude: 0.5,
        endAmplitude: 0.5,
        envelope: "constant",
      },
    ],
  };
}

function manifest() {
  return HapticsManifestSchema.parse([
    pattern("hitLight", {
      stages: [
        {
          channel: "high-frequency",
          durationMs: 60,
          startAmplitude: 0.3,
          endAmplitude: 0.3,
        },
      ],
    }),
    pattern("hitHeavy", {
      priority: 50,
      stages: [
        {
          channel: "both",
          durationMs: 120,
          startAmplitude: 0.9,
          endAmplitude: 0.9,
        },
        {
          channel: "low-frequency",
          durationMs: 80,
          startAmplitude: 0.7,
          endAmplitude: 0.3,
        },
      ],
    }),
    pattern("uiTick", {
      category: "ui",
      cancellable: false,
      priority: 5,
    }),
    pattern("ambientLoop", { category: "ambient", priority: 1 }),
  ]);
}

describe("HapticsRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new HapticsRegistry().manifest).toThrow(HapticsNotLoadedError);
  });
});

describe("HapticsRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.ids).toEqual(["hitLight", "hitHeavy", "uiTick", "ambientLoop"]);
    expect(r.has("hitHeavy")).toBe(true);
    expect(r.get("uiTick").category).toBe("ui");
  });

  it("throws on unknown", () => {
    const r = new HapticsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownHapticPatternError);
  });
});

describe("HapticsRegistry — by category", () => {
  it("filters", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.byCategory("combat").map((p) => p.id)).toEqual([
      "hitLight",
      "hitHeavy",
    ]);
    expect(r.byCategory("ui").map((p) => p.id)).toEqual(["uiTick"]);
  });
});

describe("HapticsRegistry — duration", () => {
  it("sums stage durations for single play", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.singlePlayDurationMs("hitLight")).toBe(60);
    expect(r.singlePlayDurationMs("hitHeavy")).toBe(200);
  });
});

describe("HapticsRegistry — preemption", () => {
  it("higher priority preempts cancellable pattern", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.shouldPreempt("hitLight", "hitHeavy")).toBe(true);
  });

  it("equal priority does not preempt", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.shouldPreempt("hitLight", "hitLight")).toBe(false);
  });

  it("non-cancellable pattern is never preempted", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.shouldPreempt("uiTick", "hitHeavy")).toBe(false);
  });

  it("lower priority does not preempt", () => {
    const r = new HapticsRegistry(manifest());
    expect(r.shouldPreempt("hitHeavy", "hitLight")).toBe(false);
  });
});
