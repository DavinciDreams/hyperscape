/**
 * SceneLightingCore — Pure functions for scene lighting updates.
 *
 * Single source of truth for day/night cycle calculations and light updates.
 * Both the game (Environment.ts) and the World Studio (TileBasedTerrain.tsx)
 * call these functions for identical visual results.
 *
 * Pattern: "one system, two contexts" — no System dependency, no renderer,
 * no scene graph. Just math + mutations on passed Three.js light objects.
 */

import type * as THREE from "three/webgpu";
import {
  DAY_CYCLE,
  SUN_LIGHT,
  HEMISPHERE_LIGHT,
  AMBIENT_LIGHT,
  EXPOSURE,
  FOG_COLORS,
} from "./LightingConfig";

// ============================================================================
// DAY PHASE & INTENSITY
// ============================================================================

/** Convert 0–24 hour to dayPhase (0–1). 0 = midnight, 0.25 = sunrise, 0.5 = noon. */
export function hourToDayPhase(hour: number): number {
  return (((hour % 24) + 24) % 24) / 24;
}

/**
 * Compute dayIntensity (0–1) from dayPhase.
 * Uses smoothstep dawn/dusk transitions and noon oscillation from DAY_CYCLE.
 */
export function computeDayIntensity(dayPhase: number): number {
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  if (dayPhase < DAY_CYCLE.DAWN_START || dayPhase >= DAY_CYCLE.DUSK_END)
    return 0;
  if (dayPhase < DAY_CYCLE.DAWN_END)
    return ss(DAY_CYCLE.DAWN_START, DAY_CYCLE.DAWN_END, dayPhase);
  if (dayPhase < DAY_CYCLE.DUSK_START) {
    const noonFactor = 1 - Math.abs(dayPhase - 0.5) * 2;
    return (
      DAY_CYCLE.NOON_MIN_INTENSITY +
      noonFactor * (1 - DAY_CYCLE.NOON_MIN_INTENSITY)
    );
  }
  return 1 - ss(DAY_CYCLE.DUSK_START, DAY_CYCLE.DUSK_END, dayPhase);
}

/**
 * Compute transition fade during dawn/dusk sun-moon swap.
 * Fades light OUT approaching midpoint, then back IN — prevents harsh pop.
 * Returns smoothstepped value in [0, 1].
 */
export function computeTransitionFade(dayPhase: number): number {
  let fade = 1.0;
  if (dayPhase >= DAY_CYCLE.DAWN_START && dayPhase < DAY_CYCLE.DAWN_MID) {
    fade =
      1.0 -
      (dayPhase - DAY_CYCLE.DAWN_START) /
        (DAY_CYCLE.DAWN_MID - DAY_CYCLE.DAWN_START);
  } else if (dayPhase >= DAY_CYCLE.DAWN_MID && dayPhase < DAY_CYCLE.DAWN_END) {
    fade =
      (dayPhase - DAY_CYCLE.DAWN_MID) /
      (DAY_CYCLE.DAWN_END - DAY_CYCLE.DAWN_MID);
  } else if (
    dayPhase >= DAY_CYCLE.DUSK_START &&
    dayPhase < DAY_CYCLE.DUSK_MID
  ) {
    fade =
      1.0 -
      (dayPhase - DAY_CYCLE.DUSK_START) /
        (DAY_CYCLE.DUSK_MID - DAY_CYCLE.DUSK_START);
  } else if (dayPhase >= DAY_CYCLE.DUSK_MID && dayPhase < DAY_CYCLE.DUSK_END) {
    fade =
      (dayPhase - DAY_CYCLE.DUSK_MID) /
      (DAY_CYCLE.DUSK_END - DAY_CYCLE.DUSK_MID);
  }
  return fade * fade * (3 - 2 * fade); // smoothstep
}

/** True when dayPhase is between dawn midpoint and dusk midpoint. */
export function computeIsDay(dayPhase: number): boolean {
  return dayPhase >= DAY_CYCLE.DAWN_MID && dayPhase < DAY_CYCLE.DUSK_MID;
}

/** True when dayPhase falls within any golden-hour range. */
export function isGoldenHour(dayPhase: number): boolean {
  return SUN_LIGHT.GOLDEN_HOUR_RANGES.some(
    ([start, end]) => dayPhase >= start && dayPhase < end,
  );
}

// ============================================================================
// INDIVIDUAL LIGHT UPDATES
// ============================================================================

/**
 * Update directional light (sun/moon) color and intensity.
 * Discrete day/night switch with transitionFade — matches game exactly.
 */
export function updateSunLight(
  dayIntensity: number,
  dayPhase: number,
  sun: THREE.DirectionalLight,
): void {
  const transitionFade = computeTransitionFade(dayPhase);
  const isDay = computeIsDay(dayPhase);

  if (isDay) {
    sun.intensity =
      dayIntensity * SUN_LIGHT.DAY_INTENSITY_MULTIPLIER * transitionFade;
    const [r, g, b] = isGoldenHour(dayPhase)
      ? SUN_LIGHT.GOLDEN_HOUR_COLOR
      : SUN_LIGHT.DAY_COLOR;
    sun.color.setRGB(r, g, b);
  } else {
    const nightIntensity = 1 - dayIntensity;
    sun.intensity =
      nightIntensity * SUN_LIGHT.MOON_INTENSITY_MULTIPLIER * transitionFade;
    sun.color.setRGB(...SUN_LIGHT.MOON_COLOR);
  }
}

/**
 * Update ambient + hemisphere lights based on dayIntensity.
 * Identical to game's Environment.updateAmbientLighting().
 */
export function updateAmbientLights(
  dayIntensity: number,
  ambient: THREE.AmbientLight,
  hemisphere: THREE.HemisphereLight | null,
): void {
  const ni = 1 - dayIntensity;

  // Hemisphere
  if (hemisphere) {
    hemisphere.intensity =
      HEMISPHERE_LIGHT.INTENSITY_BASE +
      dayIntensity * HEMISPHERE_LIGHT.INTENSITY_DAY_ADD;

    const [dR, dG, dB] = HEMISPHERE_LIGHT.DAY_SKY_COLOR;
    const [nR, nG, nB] = HEMISPHERE_LIGHT.NIGHT_SKY_COLOR;
    hemisphere.color.setRGB(
      dR * dayIntensity + nR * ni,
      dG * dayIntensity + nG * ni,
      dB * dayIntensity + nB * ni,
    );

    const [dgR, dgG, dgB] = HEMISPHERE_LIGHT.DAY_GROUND_COLOR;
    const [ngR, ngG, ngB] = HEMISPHERE_LIGHT.NIGHT_GROUND_COLOR;
    hemisphere.groundColor.setRGB(
      dgR * dayIntensity + ngR * ni,
      dgG * dayIntensity + ngG * ni,
      dgB * dayIntensity + ngB * ni,
    );
  }

  // Ambient
  ambient.intensity =
    AMBIENT_LIGHT.INTENSITY_BASE +
    dayIntensity * AMBIENT_LIGHT.INTENSITY_DAY_ADD;

  const [adR, adG, adB] = AMBIENT_LIGHT.DAY_COLOR;
  const [anR, anG, anB] = AMBIENT_LIGHT.NIGHT_COLOR;
  ambient.color.setRGB(
    anR + dayIntensity * (adR - anR),
    anG + dayIntensity * (adG - anG),
    anB + dayIntensity * (adB - anB),
  );
}

/**
 * Lerp between night and day fog hex colors.
 * Mutates `fog.color` if fog is provided.
 * @returns Blended hex value (useful for scene.background fallback).
 */
export function updateSceneFog(
  dayIntensity: number,
  fog: THREE.Fog | null,
): number {
  const dH = FOG_COLORS.DAY;
  const nH = FOG_COLORS.NIGHT;
  const dr = (dH >> 16) & 0xff,
    dg = (dH >> 8) & 0xff,
    db = dH & 0xff;
  const nr = (nH >> 16) & 0xff,
    ng = (nH >> 8) & 0xff,
    nb = nH & 0xff;
  const r = Math.round(nr + (dr - nr) * dayIntensity);
  const g = Math.round(ng + (dg - ng) * dayIntensity);
  const b = Math.round(nb + (db - nb) * dayIntensity);
  const hex = (r << 16) | (g << 8) | b;

  if (fog) {
    fog.color.setHex(hex);
  }
  return hex;
}

/**
 * Compute target tone-mapping exposure.
 * Smoothstep: brighter at night (1.1), dimmer at day (0.85).
 */
export function computeTargetExposure(dayIntensity: number): number {
  const t = dayIntensity * dayIntensity * (3 - 2 * dayIntensity);
  return EXPOSURE.NIGHT + (EXPOSURE.DAY - EXPOSURE.NIGHT) * t;
}

/**
 * Compute fallback sun position from dayPhase (orbital arc).
 * Used when no SkySystem provides sun direction.
 * Matches the east-to-west arc with SUN_LIGHT.TILT.
 */
export function computeSunPosition(
  dayPhase: number,
  distance: number = 2000,
): { x: number; y: number; z: number } {
  const sunArcAngle = (dayPhase - 0.25) * Math.PI * 2;
  const elevation = Math.sin(sunArcAngle);
  const azimuth = Math.cos(sunArcAngle);
  return {
    x: azimuth * Math.max(0.1, 1 - Math.abs(elevation)) * distance,
    y: elevation * distance,
    z: SUN_LIGHT.TILT * azimuth * distance,
  };
}

// ============================================================================
// ALL-IN-ONE
// ============================================================================

export interface SceneLightingRefs {
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemisphere: THREE.HemisphereLight | null;
  fog: THREE.Fog | null;
  /** scene.background Color — set to fog color when no sky dome is active */
  background: THREE.Color | null;
}

/**
 * Update all scene lighting in one call.
 * Sets sun position via orbital arc (for direction tracking / shadow follow).
 *
 * @param hour   - Time of day (0-24)
 * @param refs   - Mutable Three.js light references
 * @param hasSky - If true, skip fog/background color (sky dome handles these)
 * @returns dayIntensity (0-1) for downstream use (water, grass, exposure, etc.)
 */
export function updateSceneLighting(
  hour: number,
  refs: SceneLightingRefs,
  hasSky: boolean,
): number {
  const dayPhase = hourToDayPhase(hour);
  const di = computeDayIntensity(dayPhase);

  updateSunLight(di, dayPhase, refs.sun);
  updateAmbientLights(di, refs.ambient, refs.hemisphere);

  // Sun position — orbital arc for direction tracking
  const pos = computeSunPosition(dayPhase);
  refs.sun.position.set(pos.x, pos.y, pos.z);

  if (!hasSky) {
    const fogHex = updateSceneFog(di, refs.fog);
    if (refs.background) {
      refs.background.setHex(fogHex);
    }
  }

  return di;
}
