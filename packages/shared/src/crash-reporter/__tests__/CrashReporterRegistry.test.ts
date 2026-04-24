import { CrashReporterManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  CrashReporterNotLoadedError,
  CrashReporterRegistry,
  UnknownCrashSinkError,
} from "../CrashReporterRegistry.js";

function manifest() {
  return CrashReporterManifestSchema.parse({
    enabled: true,
    sinks: [
      {
        id: "primaryHttp",
        name: "Primary HTTP",
        kind: "http",
        endpointNameRef: "deploy.crash.primary",
        minSeverity: "error",
      },
      {
        id: "verboseLocal",
        name: "Local File",
        kind: "localFile",
        minSeverity: "debug",
      },
      {
        id: "fatalOnly",
        name: "Fatal Syslog",
        kind: "syslog",
        minSeverity: "fatal",
      },
    ],
    pii: {
      alwaysRedact: ["email", "ip"],
      defaultRedact: ["username", "deviceId"],
    },
    globalMinSeverity: "warning",
    dedupeInFlight: true,
    dedupeWindowSec: 120,
  });
}

describe("CrashReporterRegistry — not loaded", () => {
  it("throws pre-load", () => {
    expect(() => new CrashReporterRegistry().manifest).toThrow(
      CrashReporterNotLoadedError,
    );
  });
});

describe("CrashReporterRegistry — sink lookup", () => {
  it("by id", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(r.sink("primaryHttp").kind).toBe("http");
  });

  it("throws on unknown", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(() => r.sink("ghost")).toThrow(UnknownCrashSinkError);
  });
});

describe("CrashReporterRegistry — severity rank", () => {
  it("severityPasses ordering", () => {
    expect(CrashReporterRegistry.severityPasses("fatal", "error")).toBe(true);
    expect(CrashReporterRegistry.severityPasses("error", "error")).toBe(true);
    expect(CrashReporterRegistry.severityPasses("warning", "error")).toBe(
      false,
    );
    expect(CrashReporterRegistry.severityPasses("debug", "fatal")).toBe(false);
  });
});

describe("CrashReporterRegistry — sinks for severity", () => {
  it("info dropped by global threshold", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(r.sinksForSeverity("info")).toEqual([]);
  });

  it("error hits primaryHttp + verboseLocal but not fatalOnly", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(r.sinksForSeverity("error").map((s) => s.id)).toEqual([
      "primaryHttp",
      "verboseLocal",
    ]);
  });

  it("fatal hits all", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(r.sinksForSeverity("fatal").map((s) => s.id)).toEqual([
      "primaryHttp",
      "verboseLocal",
      "fatalOnly",
    ]);
  });

  it("warning hits only verboseLocal (passes global, above its local threshold)", () => {
    const r = new CrashReporterRegistry(manifest());
    expect(r.sinksForSeverity("warning").map((s) => s.id)).toEqual([
      "verboseLocal",
    ]);
  });
});

describe("CrashReporterRegistry — PII redactions", () => {
  it("alwaysRedact is always included", () => {
    const r = new CrashReporterRegistry(manifest());
    const set = r.effectiveRedactions(new Set(["email", "username"]));
    expect(set.has("email")).toBe(true);
    expect(set.has("ip")).toBe(true);
  });

  it("defaultRedact excluded when user opted in", () => {
    const r = new CrashReporterRegistry(manifest());
    const set = r.effectiveRedactions(new Set(["username"]));
    expect(set.has("username")).toBe(false);
    expect(set.has("deviceId")).toBe(true);
  });

  it("no opt-ins → defaultRedact fully included", () => {
    const r = new CrashReporterRegistry(manifest());
    const set = r.effectiveRedactions(new Set());
    expect(Array.from(set).sort()).toEqual(
      ["deviceId", "email", "ip", "username"].sort(),
    );
  });
});
