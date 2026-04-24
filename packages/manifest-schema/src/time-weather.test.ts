/**
 * Faithfulness + defensiveness tests for `TimeWeatherManifestSchema`.
 *
 * Reference pack covers a plausible day/night loop (dawn → midday →
 * dusk → night) plus a three-state weather graph (clear → overcast →
 * rain → clear) so that both the cycle and the transition edges
 * parse cleanly.
 */

import { describe, expect, it } from "vitest";

import {
  TimeWeatherManifestSchema,
  type TimeWeatherManifest,
} from "./time-weather.js";

const reference: TimeWeatherManifest = {
  dayNight: {
    cycleSeconds: 1200,
    timeOrigin: "dawn",
    keyframes: [
      {
        t: 0,
        sunColor: 0xffcc88,
        moonColor: 0x000000,
        ambientColor: 0x556677,
        sunIntensity: 0.4,
        moonIntensity: 0,
        fogColor: 0xffccaa,
        fogDensity: 0.02,
      },
      {
        t: 0.5,
        sunColor: 0xffffff,
        moonColor: 0x000000,
        ambientColor: 0x99aacc,
        sunIntensity: 1.0,
        moonIntensity: 0,
        fogColor: 0xbbccdd,
        fogDensity: 0.004,
      },
      {
        t: 0.85,
        sunColor: 0x664433,
        moonColor: 0x334466,
        ambientColor: 0x223344,
        sunIntensity: 0.15,
        moonIntensity: 0.4,
        fogColor: 0x223344,
        fogDensity: 0.03,
      },
      {
        t: 1,
        sunColor: 0xffcc88,
        moonColor: 0x000000,
        ambientColor: 0x556677,
        sunIntensity: 0.4,
        moonIntensity: 0,
        fogColor: 0xffccaa,
        fogDensity: 0.02,
      },
    ],
  },
  weather: {
    defaultStateId: "clear",
    transitionSeconds: 6,
    states: [
      {
        id: "clear",
        name: "Clear",
        description: "Blue sky, low fog",
        skyTint: 0xffffff,
        fogDensityBoost: 0,
        wind: { x: 0.2, y: 0, z: 0 },
        rainIntensity: 0,
        snowIntensity: 0,
        lightningChancePerSecond: 0,
      },
      {
        id: "overcast",
        name: "Overcast",
        description: "Grey diffuse lighting",
        skyTint: 0xaaaaaa,
        fogDensityBoost: 0.01,
        wind: { x: 0.8, y: 0, z: 0 },
        rainIntensity: 0,
        snowIntensity: 0,
        lightningChancePerSecond: 0,
      },
      {
        id: "rain",
        name: "Rain",
        description: "Steady rainfall",
        skyTint: 0x667788,
        fogDensityBoost: 0.02,
        wind: { x: 1.2, y: 0, z: 0 },
        rainIntensity: 0.7,
        snowIntensity: 0,
        lightningChancePerSecond: 0.001,
        ambientSfxId: "amb_rain_loop",
        enterVfxId: "rain_onset",
      },
    ],
    transitions: [
      { from: "clear", to: "overcast", chance: 0.1, cooldownSeconds: 60 },
      { from: "overcast", to: "clear", chance: 0.2, cooldownSeconds: 30 },
      { from: "overcast", to: "rain", chance: 0.15, cooldownSeconds: 30 },
      { from: "rain", to: "overcast", chance: 0.25, cooldownSeconds: 30 },
    ],
  },
};

describe("TimeWeatherManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = TimeWeatherManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal weather state", () => {
    const minimal = {
      dayNight: reference.dayNight,
      weather: {
        defaultStateId: "clear",
        states: [{ id: "clear", name: "Clear" }],
      },
    };
    const parsed = TimeWeatherManifestSchema.parse(minimal);
    const s = parsed.weather.states[0];
    expect(s.skyTint).toBe(0xffffff);
    expect(s.fogDensityBoost).toBe(0);
    expect(s.rainIntensity).toBe(0);
    expect(s.snowIntensity).toBe(0);
    expect(s.lightningChancePerSecond).toBe(0);
    expect(s.wind).toEqual({ x: 0, y: 0, z: 0 });
    expect(parsed.weather.transitions).toEqual([]);
    expect(parsed.weather.transitionSeconds).toBe(4);
  });

  it("applies dayNight origin default", () => {
    const noOrigin = {
      dayNight: { ...reference.dayNight, timeOrigin: undefined },
      weather: reference.weather,
    };
    const parsed = TimeWeatherManifestSchema.parse(noOrigin);
    expect(parsed.dayNight.timeOrigin).toBe("dawn");
  });

  it("rejects single-keyframe cycle (needs at least two)", () => {
    const bad = {
      dayNight: {
        ...reference.dayNight,
        keyframes: [reference.dayNight.keyframes[0]],
      },
      weather: reference.weather,
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects cycleSeconds <= 0", () => {
    const bad = {
      dayNight: { ...reference.dayNight, cycleSeconds: 0 },
      weather: reference.weather,
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects keyframe t outside [0,1]", () => {
    const bad = {
      dayNight: {
        ...reference.dayNight,
        keyframes: [
          reference.dayNight.keyframes[0],
          { ...reference.dayNight.keyframes[0], t: 1.2 },
        ],
      },
      weather: reference.weather,
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects rainIntensity outside [0,1]", () => {
    const bad = {
      dayNight: reference.dayNight,
      weather: {
        ...reference.weather,
        states: [{ ...reference.weather.states[0], rainIntensity: 1.2 }],
      },
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty weather state list", () => {
    const bad = {
      dayNight: reference.dayNight,
      weather: { defaultStateId: "clear", states: [] },
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects transition with empty from/to", () => {
    const bad = {
      dayNight: reference.dayNight,
      weather: {
        ...reference.weather,
        transitions: [{ from: "", to: "clear", chance: 0.5 }],
      },
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects transition chance outside [0,1]", () => {
    const bad = {
      dayNight: reference.dayNight,
      weather: {
        ...reference.weather,
        transitions: [{ from: "clear", to: "rain", chance: 2 }],
      },
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty defaultStateId", () => {
    const bad = {
      dayNight: reference.dayNight,
      weather: { ...reference.weather, defaultStateId: "" },
    };
    expect(TimeWeatherManifestSchema.safeParse(bad).success).toBe(false);
  });
});
