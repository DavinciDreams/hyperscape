import { CrashReporterRegistry } from "./CrashReporterRegistry.js";

export {
  CrashReporterNotLoadedError,
  CrashReporterRegistry,
  UnknownCrashSinkError,
} from "./CrashReporterRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ crashReporter })` can live-dispatch
 * authored edits to crash-sink + redaction + symbolication policy
 * consumed by CrashReporterSystem.
 */
export const crashReporterRegistry = new CrashReporterRegistry();
