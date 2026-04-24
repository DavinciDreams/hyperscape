import { AudioBusMixManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { AudioBusMixer } from "../AudioBusMixer.js";

function manifest() {
  return AudioBusMixManifestSchema.parse({
    masterVolumeDb: 0,
    buses: [
      { id: "master", name: "Master" },
      { id: "music", name: "Music", parent: "master", volumeDb: 0 },
      { id: "sfx", name: "SFX", parent: "master", volumeDb: -6 },
      { id: "ui", name: "UI", parent: "master" },
      { id: "dialogue", name: "Dialogue", parent: "master" },
    ],
    duckRules: [
      {
        trigger: "dialogue",
        target: "music",
        attenuationToLinear: 0.25,
        attackSec: 0.1,
        releaseSec: 0.2,
        thresholdLinear: 0.05,
      },
    ],
  });
}

describe("AudioBusMixer — basics", () => {
  it("size reflects loaded bus count", () => {
    const m = new AudioBusMixer(manifest());
    expect(m.size).toBe(5);
  });

  it("computes linear gain from volumeDb", () => {
    const m = new AudioBusMixer(manifest());
    const gains = m.computeGains({ dtSec: 0 });
    // master = 0 dB → 1
    expect(gains.get("master")).toBeCloseTo(1, 5);
    // music = 0 dB under master (1) → 1
    expect(gains.get("music")).toBeCloseTo(1, 5);
    // sfx = -6 dB → ~0.5 under master (1)
    expect(gains.get("sfx")).toBeCloseTo(0.5012, 3);
  });

  it("cascades parent gain", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        buses: [
          { id: "master", name: "M", volumeDb: -6 },
          { id: "sfx", name: "S", parent: "master", volumeDb: -6 },
        ],
      }),
    );
    const gains = m.computeGains({ dtSec: 0 });
    // -6 * -6 dB on sfx = 0.5012 * 0.5012 ≈ 0.2512
    expect(gains.get("sfx")).toBeCloseTo(0.2512, 3);
  });

  it("applies masterVolumeDb to every bus", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        masterVolumeDb: -6,
        buses: [
          { id: "master", name: "M" },
          { id: "music", name: "Mu", parent: "master" },
        ],
      }),
    );
    const gains = m.computeGains({ dtSec: 0 });
    expect(gains.get("master")).toBeCloseTo(0.5012, 3);
    expect(gains.get("music")).toBeCloseTo(0.5012, 3);
  });

  it("rejects non-finite dtSec", () => {
    const m = new AudioBusMixer(manifest());
    expect(() => m.computeGains({ dtSec: Number.NaN })).toThrow(TypeError);
    expect(() => m.computeGains({ dtSec: -1 })).toThrow(TypeError);
  });
});

describe("AudioBusMixer — mute and solo", () => {
  it("muted bus has gain 0", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        buses: [
          { id: "master", name: "M" },
          { id: "sfx", name: "S", parent: "master", muted: true },
        ],
      }),
    );
    const gains = m.computeGains({ dtSec: 0 });
    expect(gains.get("sfx")).toBe(0);
    expect(gains.get("master")).toBeGreaterThan(0);
  });

  it("soloed bus mutes its non-solo peers globally", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        buses: [
          { id: "master", name: "M" },
          { id: "music", name: "Mu", parent: "master", solo: true },
          { id: "sfx", name: "S", parent: "master" },
        ],
      }),
    );
    const gains = m.computeGains({ dtSec: 0 });
    expect(gains.get("music")).toBeGreaterThan(0);
    expect(gains.get("sfx")).toBe(0);
  });

  it("cascade propagates mute to children", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        buses: [
          { id: "master", name: "M", muted: true },
          { id: "sfx", name: "S", parent: "master" },
        ],
      }),
    );
    const gains = m.computeGains({ dtSec: 0 });
    // master muted → sfx cascade 0
    expect(gains.get("sfx")).toBe(0);
  });
});

describe("AudioBusMixer — ducking", () => {
  it("duck engages when trigger exceeds threshold", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.5); // above 0.05 threshold
    // dtSec=0 snaps envelope immediately
    const g = m.computeGains({ dtSec: 0 });
    // music gets ducked 0.25 under master 1 → 0.25
    expect(g.get("music")).toBeCloseTo(0.25, 5);
    expect(m.getDuckAttenuation("dialogue", "music")).toBeCloseTo(0.25, 5);
  });

  it("duck disengages when trigger drops below threshold", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.5);
    m.computeGains({ dtSec: 0 }); // snap to 0.25
    m.updateLoudness("dialogue", 0);
    m.computeGains({ dtSec: 0 }); // snap back to 1
    expect(m.getDuckAttenuation("dialogue", "music")).toBe(1);
  });

  it("attack envelope eases toward target over time", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.5);
    // attack=0.1s. One step at dt=0.05 → alpha=0.5 toward 0.25.
    // current = 1 + (0.25 - 1) * 0.5 = 0.625
    m.computeGains({ dtSec: 0.05 });
    expect(m.getDuckAttenuation("dialogue", "music")).toBeCloseTo(0.625, 5);
    // Another step at dt=0.05 → alpha=0.5 again from 0.625 → 0.4375
    m.computeGains({ dtSec: 0.05 });
    expect(m.getDuckAttenuation("dialogue", "music")).toBeCloseTo(0.4375, 5);
  });

  it("release envelope eases back toward 1", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.5);
    m.computeGains({ dtSec: 0 }); // snap to 0.25
    m.updateLoudness("dialogue", 0);
    // release=0.2s. dt=0.1 → alpha=0.5, current = 0.25 + (1 - 0.25) * 0.5 = 0.625
    m.computeGains({ dtSec: 0.1 });
    expect(m.getDuckAttenuation("dialogue", "music")).toBeCloseTo(0.625, 5);
  });

  it("below-threshold loudness does not duck", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.01); // below 0.05
    m.computeGains({ dtSec: 0 });
    expect(m.getDuckAttenuation("dialogue", "music")).toBe(1);
  });

  it("multiple rules targeting one bus multiply", () => {
    const m = new AudioBusMixer(
      AudioBusMixManifestSchema.parse({
        buses: [
          { id: "master", name: "M" },
          { id: "music", name: "Mu", parent: "master" },
          { id: "dialogue", name: "D", parent: "master" },
          { id: "sfx", name: "S", parent: "master" },
        ],
        duckRules: [
          {
            trigger: "dialogue",
            target: "music",
            attenuationToLinear: 0.5,
            attackSec: 0,
            releaseSec: 0,
          },
          {
            trigger: "sfx",
            target: "music",
            attenuationToLinear: 0.5,
            attackSec: 0,
            releaseSec: 0,
          },
        ],
      }),
    );
    m.updateLoudness("dialogue", 1);
    m.updateLoudness("sfx", 1);
    const g = m.computeGains({ dtSec: 0 });
    // music ducked by both → 0.5 * 0.5 = 0.25
    expect(g.get("music")).toBeCloseTo(0.25, 5);
  });

  it("updateLoudness rejects non-finite values", () => {
    const m = new AudioBusMixer(manifest());
    expect(() => m.updateLoudness("dialogue", Number.NaN)).toThrow(TypeError);
    expect(() => m.updateLoudness("dialogue", -1)).toThrow(TypeError);
  });
});

describe("AudioBusMixer — reset + reload", () => {
  it("reset() re-opens all envelopes and clears loudness", () => {
    const m = new AudioBusMixer(manifest());
    m.updateLoudness("dialogue", 0.5);
    m.computeGains({ dtSec: 0 });
    expect(m.getDuckAttenuation("dialogue", "music")).toBeCloseTo(0.25, 5);
    m.reset();
    expect(m.getDuckAttenuation("dialogue", "music")).toBe(1);
  });

  it("load replaces manifest", () => {
    const m = new AudioBusMixer(manifest());
    expect(m.size).toBe(5);
    m.load(
      AudioBusMixManifestSchema.parse({
        buses: [{ id: "master", name: "M" }],
      }),
    );
    expect(m.size).toBe(1);
  });

  it("loadFromJson validates before loading", () => {
    const m = new AudioBusMixer();
    m.loadFromJson({ buses: [{ id: "solo", name: "Solo" }] });
    expect(m.size).toBe(1);
  });

  it("empty mixer returns empty gains map", () => {
    const m = new AudioBusMixer();
    expect(m.computeGains({ dtSec: 0 }).size).toBe(0);
  });
});
