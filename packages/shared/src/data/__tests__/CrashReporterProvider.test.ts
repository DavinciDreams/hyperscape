/**
 * Tests for the CrashReporterProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { crashReporterProvider } from "../CrashReporterProvider";

beforeEach(() => {
  crashReporterProvider.unload();
});
afterEach(() => {
  crashReporterProvider.unload();
});

const validManifest = {
  enabled: true,
  sinks: [
    {
      id: "primaryHttp",
      name: "Primary HTTP",
      kind: "http" as const,
      endpointNameRef: "crash_ingest_http",
      minSeverity: "error" as const,
      maxReportsPerHour: 120,
    },
    {
      id: "devLocal",
      name: "Dev Local File",
      kind: "localFile" as const,
      minSeverity: "warning" as const,
    },
  ],
  globalMinSeverity: "warning" as const,
  dedupeInFlight: true,
  dedupeWindowSec: 60,
};

describe("CrashReporterProvider", () => {
  it("starts unloaded", () => {
    expect(crashReporterProvider.isLoaded()).toBe(false);
    expect(crashReporterProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts a valid manifest and fills defaults", () => {
    const parsed = crashReporterProvider.loadRaw(validManifest);
    expect(parsed.enabled).toBe(true);
    expect(parsed.sinks.length).toBe(2);
    expect(parsed.symbolication.enabled).toBe(true);
    expect(parsed.dedupeInFlight).toBe(true);
    expect(crashReporterProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts disabled blob", () => {
    const parsed = crashReporterProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
    expect(parsed.sinks.length).toBe(0);
    expect(crashReporterProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() rejects enabled=true with no sinks", () => {
    expect(() => crashReporterProvider.loadRaw({ enabled: true })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = crashReporterProvider.loadRaw(validManifest);
    crashReporterProvider.unload();
    crashReporterProvider.load(parsed);
    expect(crashReporterProvider.isLoaded()).toBe(true);
    expect(crashReporterProvider.getManifest()?.sinks.length).toBe(2);
  });

  it("loadRaw() rejects duplicate sink ids", () => {
    const bad = {
      ...validManifest,
      sinks: [validManifest.sinks[0], { ...validManifest.sinks[0] }],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects http sink without endpointNameRef", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "httpNaked",
          name: "HTTP",
          kind: "http" as const,
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects custom sink without customKey", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "customNaked",
          name: "Custom",
          kind: "custom" as const,
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects dedupeInFlight=true with dedupeWindowSec=0", () => {
    const bad = { ...validManifest, dedupeInFlight: true, dedupeWindowSec: 0 };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() accepts dedupeInFlight=false with dedupeWindowSec=0", () => {
    const parsed = crashReporterProvider.loadRaw({
      ...validManifest,
      dedupeInFlight: false,
      dedupeWindowSec: 0,
    });
    expect(parsed.dedupeWindowSec).toBe(0);
  });

  it("loadRaw() rejects sampling fraction > 1", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "oversample",
          name: "Over",
          kind: "localFile" as const,
          samplingFraction: 1.5,
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects maxReportsPerHour > 10000", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "toomany",
          name: "x",
          kind: "localFile" as const,
          maxReportsPerHour: 999999,
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects unknown sink kind", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "weird",
          name: "weird",
          kind: "ftp" as unknown as "http",
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects unknown severity in minSeverity", () => {
    const bad = {
      ...validManifest,
      globalMinSeverity: "catastrophic" as unknown as "error",
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("loadRaw() rejects malformed sink id", () => {
    const bad = {
      ...validManifest,
      sinks: [
        {
          id: "Not-Camel",
          name: "x",
          kind: "localFile" as const,
        },
      ],
    };
    expect(() => crashReporterProvider.loadRaw(bad)).toThrow();
  });

  it("hotReload() replaces the manifest with a new one", () => {
    crashReporterProvider.loadRaw(validManifest);
    const parsed = crashReporterProvider.loadRaw({
      ...validManifest,
      globalMinSeverity: "fatal" as const,
    });
    crashReporterProvider.hotReload(parsed);
    expect(crashReporterProvider.getManifest()?.globalMinSeverity).toBe(
      "fatal",
    );
  });

  it("hotReload(null) clears the manifest", () => {
    crashReporterProvider.loadRaw(validManifest);
    crashReporterProvider.hotReload(null);
    expect(crashReporterProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    crashReporterProvider.loadRaw(validManifest);
    crashReporterProvider.unload();
    expect(crashReporterProvider.isLoaded()).toBe(false);
    expect(crashReporterProvider.getManifest()).toBeNull();
  });
});
