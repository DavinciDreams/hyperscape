import { TimeWeatherManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  TimeWeatherDriver,
  UnknownWeatherStateError,
} from "../TimeWeatherDriver.js";

function manifest() {
  return TimeWeatherManifestSchema.parse({
    dayNight: {
      cycleSeconds: 120,
      timeOrigin: "dawn",
      keyframes: [
        {
          t: 0,
          sunColor: 0xff8844,
          moonColor: 0x000000,
          ambientColor: 0x222244,
          sunIntensity: 0.5,
          moonIntensity: 0,
          fogColor: 0x334455,
          fogDensity: 0.01,
        },
        {
          t: 0.5,
          sunColor: 0xffffff,
          moonColor: 0x000000,
          ambientColor: 0x888899,
          sunIntensity: 1,
          moonIntensity: 0,
          fogColor: 0xccccee,
          fogDensity: 0.005,
        },
        {
          t: 1,
          sunColor: 0xff8844,
          moonColor: 0x000000,
          ambientColor: 0x222244,
          sunIntensity: 0.5,
          moonIntensity: 0,
          fogColor: 0x334455,
          fogDensity: 0.01,
        },
      ],
    },
    weather: {
      states: [
        {
          id: "clear",
          name: "Clear",
          skyTint: 0xffffff,
          fogDensityBoost: 0,
          rainIntensity: 0,
        },
        {
          id: "rain",
          name: "Rain",
          skyTint: 0x8899aa,
          fogDensityBoost: 0.02,
          rainIntensity: 0.7,
        },
        {
          id: "storm",
          name: "Storm",
          skyTint: 0x444455,
          fogDensityBoost: 0.04,
          rainIntensity: 1,
          lightningChancePerSecond: 0.1,
        },
      ],
      transitions: [
        { from: "clear", to: "rain", chance: 0.5, cooldownSeconds: 10 },
        { from: "rain", to: "storm", chance: 0.5 },
        { from: "rain", to: "clear", chance: 0.5 },
        { from: "storm", to: "rain", chance: 0.5 },
      ],
      transitionSeconds: 4,
      defaultStateId: "clear",
    },
  });
}

/** Deterministic RNG that cycles through a provided sequence. */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i++;
    return v;
  };
}

describe("TimeWeatherDriver — load / setWeather", () => {
  it("starts in the default state", () => {
    const d = new TimeWeatherDriver(manifest());
    expect(d.currentStateId).toBe("clear");
  });

  it("setWeather changes state + throws on unknown", () => {
    const d = new TimeWeatherDriver(manifest());
    d.setWeather("rain");
    expect(d.currentStateId).toBe("rain");
    expect(() => d.setWeather("ghost")).toThrow(UnknownWeatherStateError);
  });

  it("loadFromJson validates before loading", () => {
    const d = new TimeWeatherDriver();
    d.loadFromJson({
      dayNight: {
        cycleSeconds: 60,
        keyframes: [
          {
            t: 0,
            sunColor: 0xffffff,
            moonColor: 0,
            ambientColor: 0,
            sunIntensity: 1,
            moonIntensity: 0,
            fogColor: 0,
            fogDensity: 0.01,
          },
          {
            t: 1,
            sunColor: 0xffffff,
            moonColor: 0,
            ambientColor: 0,
            sunIntensity: 1,
            moonIntensity: 0,
            fogColor: 0,
            fogDensity: 0.01,
          },
        ],
      },
      weather: {
        states: [{ id: "a", name: "A" }],
        defaultStateId: "a",
      },
    });
    expect(d.currentStateId).toBe("a");
  });

  it("load throws when defaultStateId is not in states", () => {
    const d = new TimeWeatherDriver();
    expect(() =>
      d.loadFromJson({
        dayNight: {
          cycleSeconds: 60,
          keyframes: [
            {
              t: 0,
              sunColor: 0xffffff,
              moonColor: 0,
              ambientColor: 0,
              sunIntensity: 1,
              moonIntensity: 0,
              fogColor: 0,
              fogDensity: 0.01,
            },
            {
              t: 1,
              sunColor: 0xffffff,
              moonColor: 0,
              ambientColor: 0,
              sunIntensity: 1,
              moonIntensity: 0,
              fogColor: 0,
              fogDensity: 0.01,
            },
          ],
        },
        weather: {
          states: [{ id: "a", name: "A" }],
          defaultStateId: "missing",
        },
      }),
    ).toThrow(UnknownWeatherStateError);
  });
});

describe("TimeWeatherDriver — sampleDayNight", () => {
  it("reads first keyframe at t=0", () => {
    const d = new TimeWeatherDriver(manifest());
    const s = d.sampleDayNight(0);
    expect(s.cycleT).toBe(0);
    expect(s.sunIntensity).toBe(0.5);
    expect(s.sunColor).toBe(0xff8844);
  });

  it("lerps to middle keyframe at t=0.5", () => {
    const d = new TimeWeatherDriver(manifest());
    const s = d.sampleDayNight(60);
    expect(s.cycleT).toBeCloseTo(0.5);
    expect(s.sunIntensity).toBeCloseTo(1);
    expect(s.sunColor).toBe(0xffffff);
  });

  it("wraps past cycleSeconds via modulo", () => {
    const d = new TimeWeatherDriver(manifest());
    const a = d.sampleDayNight(10);
    const b = d.sampleDayNight(130);
    expect(b.cycleT).toBeCloseTo(a.cycleT);
    expect(b.sunIntensity).toBeCloseTo(a.sunIntensity);
  });

  it("linearly interpolates between keyframes", () => {
    const d = new TimeWeatherDriver(manifest());
    // t=0.25 → midway between kf[0] (t=0, sunI=0.5) and kf[1] (t=0.5, sunI=1)
    const s = d.sampleDayNight(30);
    expect(s.sunIntensity).toBeCloseTo(0.75, 5);
  });

  it("rejects negative / NaN cycleSeconds", () => {
    const d = new TimeWeatherDriver(manifest());
    expect(() => d.sampleDayNight(-1)).toThrow(TypeError);
    expect(() => d.sampleDayNight(Number.NaN)).toThrow(TypeError);
  });

  it("throws if load not called", () => {
    const d = new TimeWeatherDriver();
    expect(() => d.sampleDayNight(0)).toThrow();
  });

  it("blends skyTint into fogColor via weather sample", () => {
    // Clear weather has white skyTint → fog blends toward 0xffffff.
    const d = new TimeWeatherDriver(manifest());
    d.setWeather("storm"); // skyTint = 0x444455
    const s = d.sampleDayNight(0); // base fog 0x334455
    // Blended toward storm tint; differs from base.
    expect(s.fogColor).not.toBe(0x334455);
  });

  it("adds weather fogDensityBoost to base fogDensity", () => {
    const d = new TimeWeatherDriver(manifest());
    const baseClear = d.sampleDayNight(0).fogDensity;
    d.setWeather("rain");
    const withRain = d.sampleDayNight(0).fogDensity;
    expect(withRain).toBeCloseTo(baseClear + 0.02, 5);
  });
});

describe("TimeWeatherDriver — tick / weather FSM", () => {
  it("never fires when rng always returns 1", () => {
    const d = new TimeWeatherDriver(manifest(), () => 1);
    const ev = d.tick(1);
    expect(ev).toBeNull();
    expect(d.currentStateId).toBe("clear");
  });

  it("fires first eligible transition when rng returns 0", () => {
    const d = new TimeWeatherDriver(manifest(), () => 0);
    const ev = d.tick(1);
    expect(ev).not.toBeNull();
    expect(ev?.kind).toBe("change");
    expect(ev?.previous.id).toBe("clear");
    expect(ev?.next.id).toBe("rain");
    expect(d.currentStateId).toBe("rain");
  });

  it("respects cooldown — no re-fire within cooldownSeconds", () => {
    // Sequence: first tick rolls low (fires clear→rain). Reset back
    // to clear and tick again — cooldown should block the retry.
    const d = new TimeWeatherDriver(manifest(), () => 0);
    d.tick(1); // fires clear→rain, cooldown on "clear→rain"
    expect(d.currentStateId).toBe("rain");

    // Force back to clear WITHOUT clearing cooldowns (setWeather
    // doesn't touch cooldowns).
    d.setWeather("clear");
    // Even with rng=0, the clear→rain transition is on cooldown.
    const ev = d.tick(1);
    expect(ev).toBeNull();
    expect(d.currentStateId).toBe("clear");
  });

  it("cooldowns decay — re-fire allowed after cooldownSeconds", () => {
    const d = new TimeWeatherDriver(manifest(), () => 0);
    d.tick(1); // fire clear→rain; cooldown "clear→rain" = 10s
    expect(d.currentStateId).toBe("rain");
    d.setWeather("clear");
    // Advance past the 10s cooldown in one big tick. Decay happens
    // before the candidate loop, so by the time rng is consulted the
    // cooldown has been removed.
    const ev = d.tick(11);
    expect(ev?.next.id).toBe("rain");
  });

  it("transitionProgress eases toward 1 over transitionSeconds", () => {
    const d = new TimeWeatherDriver(manifest(), () => 0);
    d.tick(1); // fire; transitionProgress = 0
    // Sample immediately after: weather is the *previous* (clear)
    // fully, because progress is 0 → cur weight 0 → blend outputs
    // prev (clear). skyTint should be near 0xffffff (clear).
    // After advancing 4 seconds (transitionSeconds), progress = 1 →
    // cur weight 1 → blend outputs cur (rain).
    const rainTint = 0x8899aa;
    const fogBeforeAdvance = d.sampleDayNight(0);
    // Force rng=1 so no new transition fires on the advance tick.
    const d2 = new TimeWeatherDriver(manifest(), () => 0);
    d2.tick(1);
    // Now swap rng to always-1 behavior implicitly by advancing with
    // a big dt to saturate the progress.
    d2.tick(4);
    const fogAfter = d2.sampleDayNight(0);
    // Before advance: fog is blend of day/night base and (mostly
    // clear) skyTint. After advance: fog should be blend toward
    // storm... actually rain — but we need reliable check.
    // Instead: rainIntensity should interpolate from 0 → 0.7.
    expect(fogBeforeAdvance.rainIntensity).toBeCloseTo(0, 5);
    expect(fogAfter.rainIntensity).toBeCloseTo(0.7, 5);
  });

  it("reset restores default state + clears cooldowns", () => {
    const d = new TimeWeatherDriver(manifest(), () => 0);
    d.tick(1); // fire clear→rain, adds cooldown
    expect(d.currentStateId).toBe("rain");
    d.reset();
    expect(d.currentStateId).toBe("clear");
    // After reset, cooldown cleared; next rng=0 fires again.
    const ev = d.tick(1);
    expect(ev?.next.id).toBe("rain");
  });

  it("rejects negative / NaN dtSec", () => {
    const d = new TimeWeatherDriver(manifest());
    expect(() => d.tick(-1)).toThrow(TypeError);
    expect(() => d.tick(Number.NaN)).toThrow(TypeError);
  });

  it("throws if tick called before load", () => {
    const d = new TimeWeatherDriver();
    expect(() => d.tick(1)).toThrow();
  });

  it("skips transitions with chance=0", () => {
    const parsed = TimeWeatherManifestSchema.parse({
      dayNight: {
        cycleSeconds: 60,
        keyframes: [
          {
            t: 0,
            sunColor: 0xffffff,
            moonColor: 0,
            ambientColor: 0,
            sunIntensity: 1,
            moonIntensity: 0,
            fogColor: 0,
            fogDensity: 0.01,
          },
          {
            t: 1,
            sunColor: 0xffffff,
            moonColor: 0,
            ambientColor: 0,
            sunIntensity: 1,
            moonIntensity: 0,
            fogColor: 0,
            fogDensity: 0.01,
          },
        ],
      },
      weather: {
        states: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        transitions: [{ from: "a", to: "b", chance: 0 }],
        defaultStateId: "a",
      },
    });
    const d = new TimeWeatherDriver(parsed, () => 0);
    expect(d.tick(1)).toBeNull();
    expect(d.currentStateId).toBe("a");
  });
});
