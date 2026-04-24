/**
 * Tests for the TimeWeatherProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { timeWeatherProvider } from "../TimeWeatherProvider";

beforeEach(() => {
  timeWeatherProvider.unload();
});
afterEach(() => {
  timeWeatherProvider.unload();
});

const validManifest = {
  dayNight: {
    cycleSeconds: 1200,
    timeOrigin: "dawn" as const,
    keyframes: [
      {
        t: 0,
        sunColor: 0xffd8a0,
        moonColor: 0x202040,
        ambientColor: 0x404060,
        sunIntensity: 1.0,
        moonIntensity: 0.0,
        fogColor: 0xb0c0d0,
        fogDensity: 0.01,
      },
      {
        t: 0.5,
        sunColor: 0xffffff,
        moonColor: 0x000000,
        ambientColor: 0x808080,
        sunIntensity: 1.5,
        moonIntensity: 0.0,
        fogColor: 0xa0b0c0,
        fogDensity: 0.005,
      },
    ],
  },
  weather: {
    states: [
      {
        id: "clear",
        name: "Clear",
      },
      {
        id: "rain",
        name: "Rain",
        rainIntensity: 0.6,
      },
    ],
    transitions: [{ from: "clear", to: "rain", chance: 0.02 }],
    defaultStateId: "clear",
  },
};

describe("TimeWeatherProvider", () => {
  it("starts unloaded", () => {
    expect(timeWeatherProvider.isLoaded()).toBe(false);
    expect(timeWeatherProvider.getManifest()).toBeNull();
  });

  it("load() installs an already-validated manifest", () => {
    timeWeatherProvider.load(validManifest);
    expect(timeWeatherProvider.isLoaded()).toBe(true);
    expect(timeWeatherProvider.getManifest()).not.toBeNull();
  });

  it("loadRaw() rejects a day/night cycle with <2 keyframes", () => {
    const bad = {
      ...validManifest,
      dayNight: {
        ...validManifest.dayNight,
        keyframes: [validManifest.dayNight.keyframes[0]],
      },
    };
    expect(() => timeWeatherProvider.loadRaw(bad)).toThrow();
    expect(timeWeatherProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects a weather manifest with no states", () => {
    const bad = {
      ...validManifest,
      weather: {
        ...validManifest.weather,
        states: [],
        defaultStateId: "clear",
      },
    };
    expect(() => timeWeatherProvider.loadRaw(bad)).toThrow();
    expect(timeWeatherProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() rejects keyframe t outside [0,1]", () => {
    const bad = {
      ...validManifest,
      dayNight: {
        ...validManifest.dayNight,
        keyframes: [
          { ...validManifest.dayNight.keyframes[0], t: 1.5 },
          validManifest.dayNight.keyframes[1],
        ],
      },
    };
    expect(() => timeWeatherProvider.loadRaw(bad)).toThrow();
    expect(timeWeatherProvider.isLoaded()).toBe(false);
  });

  it("loadRaw() accepts valid payload and returns parsed manifest", () => {
    const parsed = timeWeatherProvider.loadRaw(validManifest);
    expect(parsed.weather.states.length).toBe(2);
    expect(timeWeatherProvider.isLoaded()).toBe(true);
  });

  it("hotReload(manifest) replaces the current manifest", () => {
    timeWeatherProvider.load(validManifest);
    const replacement = {
      ...validManifest,
      weather: { ...validManifest.weather, defaultStateId: "rain" },
    };
    timeWeatherProvider.hotReload(replacement);
    expect(timeWeatherProvider.getManifest()?.weather.defaultStateId).toBe(
      "rain",
    );
  });

  it("hotReload(null) clears", () => {
    timeWeatherProvider.load(validManifest);
    timeWeatherProvider.hotReload(null);
    expect(timeWeatherProvider.isLoaded()).toBe(false);
  });

  it("unload() resets", () => {
    timeWeatherProvider.load(validManifest);
    timeWeatherProvider.unload();
    expect(timeWeatherProvider.isLoaded()).toBe(false);
    expect(timeWeatherProvider.getManifest()).toBeNull();
  });
});
