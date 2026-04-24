import { TimeWeatherDriver } from "./TimeWeatherDriver.js";

export {
  TimeWeatherDriver,
  UnknownWeatherStateError,
  type EnvironmentSample,
  type WeatherChangeEvent,
} from "./TimeWeatherDriver.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry`,
 * `worldAreasRegistry`, and `audioBusMixer` patterns so
 * `PIEEditorSession.updateManifests({ timeWeather })` can
 * live-dispatch authored edits to a shared time-of-day + weather
 * driver — even before the sky/weather runtime reads through it
 * directly. `TimeWeatherDriver` is stateful (current state,
 * transition progress, per-transition cooldowns); `load()`
 * re-seeds the driver from the manifest's `defaultStateId` and
 * clears cooldowns so PIE edits don't carry stale transition
 * state across reloads.
 */
export const timeWeatherDriver = new TimeWeatherDriver();
