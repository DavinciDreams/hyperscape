/**
 * Faithfulness + defensiveness tests for `HapticsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { HapticsManifestSchema, type HapticsManifest } from "./haptics.js";

const reference: HapticsManifest = [
  {
    id: "hitHeavy",
    name: "Heavy Hit",
    description: "Two-stage thump on heavy melee hit.",
    category: "combat",
    stages: [
      {
        channel: "both",
        durationMs: 80,
        startAmplitude: 1,
        endAmplitude: 0.5,
        envelope: "linear",
        frequencyHz: 0,
      },
      {
        channel: "low-frequency",
        durationMs: 160,
        startAmplitude: 0.5,
        endAmplitude: 0,
        envelope: "ease-out",
        frequencyHz: 0,
      },
    ],
    intensityScale: 1,
    loop: false,
    loopGapMs: 0,
    cancellable: true,
    priority: 50,
  },
  {
    id: "uiConfirm",
    name: "UI Confirm",
    description: "Short sharp tick.",
    category: "ui",
    stages: [
      {
        channel: "high-frequency",
        durationMs: 30,
        startAmplitude: 0.6,
        endAmplitude: 0.6,
        envelope: "constant",
        frequencyHz: 0,
      },
    ],
    intensityScale: 1,
    loop: false,
    loopGapMs: 0,
    cancellable: false,
    priority: 20,
  },
  {
    id: "ambientEngine",
    name: "Vehicle Engine",
    description: "Looped low-frequency rumble.",
    category: "ambient",
    stages: [
      {
        channel: "low-frequency",
        durationMs: 800,
        startAmplitude: 0.3,
        endAmplitude: 0.4,
        envelope: "ease-in-out",
        frequencyHz: 0,
      },
      {
        channel: "low-frequency",
        durationMs: 800,
        startAmplitude: 0.4,
        endAmplitude: 0.3,
        envelope: "ease-in-out",
        frequencyHz: 0,
      },
    ],
    intensityScale: 0.8,
    loop: true,
    loopGapMs: 0,
    cancellable: true,
    priority: 5,
  },
];

describe("HapticsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = HapticsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies pattern defaults on a minimal entry", () => {
    const parsed = HapticsManifestSchema.parse([
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 1,
            endAmplitude: 0,
          },
        ],
      },
    ]);
    expect(parsed[0].stages[0].envelope).toBe("linear");
    expect(parsed[0].stages[0].frequencyHz).toBe(0);
    expect(parsed[0].intensityScale).toBe(1);
    expect(parsed[0].loop).toBe(false);
    expect(parsed[0].loopGapMs).toBe(0);
    expect(parsed[0].cancellable).toBe(true);
    expect(parsed[0].priority).toBe(10);
    expect(parsed[0].description).toBe("");
  });

  it("accepts empty manifest", () => {
    expect(HapticsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate pattern ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 1,
            endAmplitude: 0,
          },
        ],
      },
      {
        id: "dup",
        name: "B",
        category: "ui",
        stages: [
          {
            channel: "both",
            durationMs: 30,
            startAmplitude: 0.5,
            endAmplitude: 0,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects pattern with zero stages", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects pattern with more than 32 stages", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: Array.from({ length: 33 }, () => ({
          channel: "both",
          durationMs: 10,
          startAmplitude: 0.5,
          endAmplitude: 0.5,
          envelope: "constant",
        })),
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stage amplitudes > 1", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 2,
            endAmplitude: 0,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stage durationMs < 1", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 0,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stage durationMs > 10000", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 20000,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects constant envelope with mismatched amplitudes", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 1,
            endAmplitude: 0,
            envelope: "constant",
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts constant envelope with matched amplitudes", () => {
    const ok = [
      {
        id: "p",
        name: "P",
        category: "ui",
        stages: [
          {
            channel: "high-frequency",
            durationMs: 30,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant",
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects loopGapMs > 0 without loop=true", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "ambient",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant",
          },
        ],
        loop: false,
        loopGapMs: 500,
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts loopGapMs > 0 when loop=true", () => {
    const ok = [
      {
        id: "p",
        name: "P",
        category: "ambient",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant",
          },
        ],
        loop: true,
        loopGapMs: 500,
      },
    ];
    expect(HapticsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects invalid pattern id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
            envelope: "constant",
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown channel", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "stereo-surround",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0.5,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown envelope", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0,
            envelope: "bounce",
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "screensaver",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0,
            envelope: "linear",
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects frequencyHz > 1000", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "mobile-default",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0,
            envelope: "linear",
            frequencyHz: 5000,
          },
        ],
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects priority > 100", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0,
            envelope: "linear",
          },
        ],
        priority: 1000,
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects intensityScale > 1", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        category: "combat",
        stages: [
          {
            channel: "both",
            durationMs: 50,
            startAmplitude: 0.5,
            endAmplitude: 0,
            envelope: "linear",
          },
        ],
        intensityScale: 2,
      },
    ];
    expect(HapticsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
