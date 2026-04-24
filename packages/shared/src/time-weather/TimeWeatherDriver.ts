/**
 * Time + weather driver.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `time-weather.ts`. Owns three responsibilities:
 *
 *   1. **Day/night sampling** — given an elapsed wall-clock seconds
 *      value, computes the normalized cycle position and lerps
 *      keyframed sun/moon/ambient/fog values into the current
 *      `EnvironmentSample`.
 *   2. **Weather FSM** — maintains the currently-active state id,
 *      advances the autonomous RNG-driven transition check, and
 *      emits `WeatherChangeEvent` when a transition fires.
 *   3. **Visual interpolation** — when a weather transition happens,
 *      the driver blends the source state's visual knobs into the
 *      target's over `transitionSeconds`.
 *
 * Scope: pure logic. Injects a `rng: () => number` (uniform [0,1))
 * and a wall-clock reader; no Three.js, no ECS, no timers.
 */

import {
  type DayNightCycle,
  type TimeOfDayKeyframe,
  type TimeWeatherManifest,
  TimeWeatherManifestSchema,
  type WeatherManifest,
  type WeatherState,
} from "@hyperforge/manifest-schema";

export interface EnvironmentSample {
  /** 0..1 normalized cycle position (past `timeOrigin`). */
  cycleT: number;
  sunColor: number;
  moonColor: number;
  ambientColor: number;
  sunIntensity: number;
  moonIntensity: number;
  /**
   * Final fog color with weather `skyTint` blended in over the
   * day/night base.
   */
  fogColor: number;
  /** Day/night fog density + active weather's additive boost. */
  fogDensity: number;
  /** Effective weather wind after cross-fade. */
  wind: { x: number; y: number; z: number };
  rainIntensity: number;
  snowIntensity: number;
  lightningChancePerSecond: number;
}

export type WeatherChangeEvent = {
  kind: "change";
  previous: WeatherState;
  next: WeatherState;
};

export class UnknownWeatherStateError extends Error {
  readonly stateId: string;
  readonly availableIds: readonly string[];
  constructor(stateId: string, availableIds: readonly string[]) {
    super(
      `weather state "${stateId}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownWeatherStateError";
    this.stateId = stateId;
    this.availableIds = availableIds;
  }
}

export class TimeWeatherDriver {
  private _manifest: TimeWeatherManifest | null = null;
  private _statesById = new Map<string, WeatherState>();
  private _transitionsByFrom = new Map<
    string,
    Array<{ to: string; chance: number; cooldownSeconds: number }>
  >();
  private _currentStateId: string = "";
  private _previousStateId: string = "";
  private _timeInState: number = 0;
  private _transitionProgress: number = 1; // 1 = fully on current
  private _cooldowns = new Map<string, number>();
  private readonly _rng: () => number;

  constructor(manifest?: TimeWeatherManifest, rng?: () => number) {
    this._rng = rng ?? Math.random;
    if (manifest) this.load(manifest);
  }

  load(manifest: TimeWeatherManifest): void {
    this._manifest = manifest;
    this._statesById.clear();
    this._transitionsByFrom.clear();
    for (const s of manifest.weather.states) this._statesById.set(s.id, s);
    for (const t of manifest.weather.transitions) {
      const arr = this._transitionsByFrom.get(t.from) ?? [];
      arr.push({
        to: t.to,
        chance: t.chance,
        cooldownSeconds: t.cooldownSeconds,
      });
      this._transitionsByFrom.set(t.from, arr);
    }
    const defaultId = manifest.weather.defaultStateId;
    if (!this._statesById.has(defaultId)) {
      throw new UnknownWeatherStateError(
        defaultId,
        Array.from(this._statesById.keys()),
      );
    }
    this._currentStateId = defaultId;
    this._previousStateId = defaultId;
    this._timeInState = 0;
    this._transitionProgress = 1;
    this._cooldowns.clear();
  }

  loadFromJson(raw: unknown): void {
    this.load(TimeWeatherManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  /** Currently-active weather state id. */
  get currentStateId(): string {
    return this._currentStateId;
  }

  /** Forcibly set the current weather state (skip transition). */
  setWeather(stateId: string): void {
    if (!this._statesById.has(stateId)) {
      throw new UnknownWeatherStateError(
        stateId,
        Array.from(this._statesById.keys()),
      );
    }
    this._previousStateId = stateId;
    this._currentStateId = stateId;
    this._transitionProgress = 1;
    this._timeInState = 0;
  }

  /**
   * Evaluate the day/night cycle at `cycleSeconds` into a color
   * sample. Does NOT advance weather state — use `tick()` for that.
   */
  sampleDayNight(cycleSeconds: number): EnvironmentSample {
    const manifest = this._manifest;
    if (!manifest) throw new Error("TimeWeatherDriver.load not called");
    if (!Number.isFinite(cycleSeconds) || cycleSeconds < 0) {
      throw new TypeError(
        `cycleSeconds must be a non-negative finite number (got ${String(cycleSeconds)})`,
      );
    }
    const cycleT =
      (cycleSeconds % manifest.dayNight.cycleSeconds) /
      manifest.dayNight.cycleSeconds;
    const base = interpolateDayNight(manifest.dayNight, cycleT);
    const weatherSample = this._sampleWeather();
    return {
      cycleT,
      sunColor: base.sunColor,
      moonColor: base.moonColor,
      ambientColor: base.ambientColor,
      sunIntensity: base.sunIntensity,
      moonIntensity: base.moonIntensity,
      fogColor: blendRgb(base.fogColor, weatherSample.skyTint, 0.5),
      fogDensity: base.fogDensity + weatherSample.fogDensityBoost,
      wind: weatherSample.wind,
      rainIntensity: weatherSample.rainIntensity,
      snowIntensity: weatherSample.snowIntensity,
      lightningChancePerSecond: weatherSample.lightningChancePerSecond,
    };
  }

  /**
   * Advance weather state by `dtSec`. Runs the RNG-driven
   * transition check, updates the cross-fade progress, and
   * returns a `WeatherChangeEvent` iff the active state changed.
   */
  tick(dtSec: number): WeatherChangeEvent | null {
    const manifest = this._manifest;
    if (!manifest) throw new Error("TimeWeatherDriver.load not called");
    if (!Number.isFinite(dtSec) || dtSec < 0) {
      throw new TypeError(
        `dtSec must be a non-negative finite number (got ${String(dtSec)})`,
      );
    }
    const transitionSec = Math.max(manifest.weather.transitionSeconds, 1e-6);

    // Decay existing cross-fade toward the current state (=1).
    if (this._transitionProgress < 1) {
      this._transitionProgress = Math.min(
        1,
        this._transitionProgress + dtSec / transitionSec,
      );
    }

    // Decay cooldowns.
    for (const [k, t] of Array.from(this._cooldowns.entries())) {
      const next = t - dtSec;
      if (next <= 0) this._cooldowns.delete(k);
      else this._cooldowns.set(k, next);
    }

    this._timeInState += dtSec;

    // Fire RNG-driven transition check. Uses the per-second
    // probability: probability of firing this tick is
    // `1 - (1 - chance) ** dtSec`. Iterate candidates in author
    // order; first candidate whose roll succeeds wins.
    const candidates = this._transitionsByFrom.get(this._currentStateId) ?? [];
    for (const c of candidates) {
      const key = `${this._currentStateId}→${c.to}`;
      if (this._cooldowns.has(key)) continue;
      if (c.chance <= 0) continue;
      const probThisTick = 1 - Math.pow(1 - c.chance, dtSec);
      if (this._rng() < probThisTick) {
        const prev = this._statesById.get(this._currentStateId);
        const next = this._statesById.get(c.to);
        if (!prev || !next) continue;
        this._previousStateId = this._currentStateId;
        this._currentStateId = c.to;
        this._transitionProgress = 0;
        this._timeInState = 0;
        if (c.cooldownSeconds > 0) {
          this._cooldowns.set(key, c.cooldownSeconds);
        }
        return { kind: "change", previous: prev, next };
      }
    }
    return null;
  }

  /** Reset cooldowns + state to the manifest default. */
  reset(): void {
    if (!this._manifest) return;
    this.setWeather(this._manifest.weather.defaultStateId);
    this._cooldowns.clear();
  }

  private _sampleWeather(): {
    skyTint: number;
    fogDensityBoost: number;
    wind: { x: number; y: number; z: number };
    rainIntensity: number;
    snowIntensity: number;
    lightningChancePerSecond: number;
  } {
    const prev = this._statesById.get(this._previousStateId);
    const cur = this._statesById.get(this._currentStateId);
    if (!cur) {
      return blankWeatherSample();
    }
    if (!prev || this._transitionProgress >= 1 || prev === cur) {
      return weatherStateSample(cur);
    }
    const t = this._transitionProgress;
    return {
      skyTint: blendRgb(prev.skyTint, cur.skyTint, t),
      fogDensityBoost: lerp(prev.fogDensityBoost, cur.fogDensityBoost, t),
      wind: {
        x: lerp(prev.wind.x, cur.wind.x, t),
        y: lerp(prev.wind.y, cur.wind.y, t),
        z: lerp(prev.wind.z, cur.wind.z, t),
      },
      rainIntensity: lerp(prev.rainIntensity, cur.rainIntensity, t),
      snowIntensity: lerp(prev.snowIntensity, cur.snowIntensity, t),
      lightningChancePerSecond: lerp(
        prev.lightningChancePerSecond,
        cur.lightningChancePerSecond,
        t,
      ),
    };
  }
}

function weatherStateSample(s: WeatherState): {
  skyTint: number;
  fogDensityBoost: number;
  wind: { x: number; y: number; z: number };
  rainIntensity: number;
  snowIntensity: number;
  lightningChancePerSecond: number;
} {
  return {
    skyTint: s.skyTint,
    fogDensityBoost: s.fogDensityBoost,
    wind: { x: s.wind.x, y: s.wind.y, z: s.wind.z },
    rainIntensity: s.rainIntensity,
    snowIntensity: s.snowIntensity,
    lightningChancePerSecond: s.lightningChancePerSecond,
  };
}

function blankWeatherSample(): {
  skyTint: number;
  fogDensityBoost: number;
  wind: { x: number; y: number; z: number };
  rainIntensity: number;
  snowIntensity: number;
  lightningChancePerSecond: number;
} {
  return {
    skyTint: 0xffffff,
    fogDensityBoost: 0,
    wind: { x: 0, y: 0, z: 0 },
    rainIntensity: 0,
    snowIntensity: 0,
    lightningChancePerSecond: 0,
  };
}

function interpolateDayNight(
  cycle: DayNightCycle,
  t: number,
): TimeOfDayKeyframe {
  const keys = cycle.keyframes;
  // keyframes are ordered but validate we can find the bracketing pair.
  let aIdx = 0;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].t <= t) aIdx = i;
    else break;
  }
  const a = keys[aIdx];
  const b = keys[(aIdx + 1) % keys.length];
  let span = b.t - a.t;
  if (span <= 0) span += 1; // wrap
  let local = t - a.t;
  if (local < 0) local += 1;
  const alpha = span > 0 ? local / span : 0;
  return {
    t,
    sunColor: blendRgb(a.sunColor, b.sunColor, alpha),
    moonColor: blendRgb(a.moonColor, b.moonColor, alpha),
    ambientColor: blendRgb(a.ambientColor, b.ambientColor, alpha),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, alpha),
    moonIntensity: lerp(a.moonIntensity, b.moonIntensity, alpha),
    fogColor: blendRgb(a.fogColor, b.fogColor, alpha),
    fogDensity: lerp(a.fogDensity, b.fogDensity, alpha),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function blendRgb(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}
