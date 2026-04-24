import { describe, expect, it } from "vitest";
import {
  BreadcrumbRulesSchema,
  ConsentGatingSchema,
  CrashReporterManifestSchema,
  CrashSinkSchema,
  PiiRulesSchema,
  SymbolicationRulesSchema,
} from "./crash-reporter.js";

describe("CrashSinkSchema", () => {
  it("accepts an http sink", () => {
    const s = CrashSinkSchema.parse({
      id: "primary",
      name: "Primary",
      kind: "http",
      endpointNameRef: "crashIngestProd",
    });
    expect(s.minSeverity).toBe("error");
  });

  it("rejects http sink without endpointNameRef", () => {
    expect(() =>
      CrashSinkSchema.parse({
        id: "bad",
        name: "Bad",
        kind: "http",
      }),
    ).toThrow(/endpointNameRef/);
  });

  it("rejects custom sink without customKey", () => {
    expect(() =>
      CrashSinkSchema.parse({
        id: "ext",
        name: "Ext",
        kind: "custom",
      }),
    ).toThrow(/customKey/);
  });

  it("accepts a localFile sink", () => {
    const s = CrashSinkSchema.parse({
      id: "local",
      name: "Local",
      kind: "localFile",
    });
    expect(s.kind).toBe("localFile");
  });

  it("clamps samplingFraction to [0,1]", () => {
    expect(() =>
      CrashSinkSchema.parse({
        id: "x",
        name: "X",
        kind: "localFile",
        samplingFraction: 1.5,
      }),
    ).toThrow();
  });
});

describe("SymbolicationRulesSchema", () => {
  it("defaults sensibly", () => {
    const s = SymbolicationRulesSchema.parse({});
    expect(s.enabled).toBe(true);
    expect(s.stripLocalPaths).toBe(true);
    expect(s.pathPlaceholder).toBe("<redacted>");
    expect(s.maxFrames).toBe(100);
  });

  it("allows maxFrames=0 (unlimited)", () => {
    const s = SymbolicationRulesSchema.parse({ maxFrames: 0 });
    expect(s.maxFrames).toBe(0);
  });
});

describe("BreadcrumbRulesSchema", () => {
  it("defaults sensibly", () => {
    const b = BreadcrumbRulesSchema.parse({});
    expect(b.maxEntries).toBe(200);
    expect(b.minSeverity).toBe("info");
  });

  it("rejects maxEntries < 10", () => {
    expect(() => BreadcrumbRulesSchema.parse({ maxEntries: 5 })).toThrow();
  });
});

describe("PiiRulesSchema", () => {
  it("defaults to no redaction", () => {
    const p = PiiRulesSchema.parse({});
    expect(p.alwaysRedact).toEqual([]);
  });

  it("rejects overlap between alwaysRedact and defaultRedact", () => {
    expect(() =>
      PiiRulesSchema.parse({
        alwaysRedact: ["email"],
        defaultRedact: ["email", "ip"],
      }),
    ).toThrow(/must not also appear in alwaysRedact/);
  });

  it("rejects duplicate alwaysRedact entries", () => {
    expect(() =>
      PiiRulesSchema.parse({
        alwaysRedact: ["email", "email"],
      }),
    ).toThrow(/unique/);
  });

  it("accepts disjoint categories", () => {
    const p = PiiRulesSchema.parse({
      alwaysRedact: ["email"],
      defaultRedact: ["ip", "username"],
    });
    expect(p.defaultRedact).toHaveLength(2);
  });
});

describe("ConsentGatingSchema", () => {
  it("defaults to no gate", () => {
    const c = ConsentGatingSchema.parse({});
    expect(c.requireOptIn).toBe(false);
    expect(c.allowAnonymousReports).toBe(true);
  });
});

describe("CrashReporterManifestSchema", () => {
  const httpSink = {
    id: "primary",
    name: "Primary",
    kind: "http" as const,
    endpointNameRef: "crashIngestProd",
  };

  it("accepts a minimal manifest", () => {
    const m = CrashReporterManifestSchema.parse({ sinks: [httpSink] });
    expect(m.enabled).toBe(true);
  });

  it("rejects enabled manifest with no sinks", () => {
    expect(() => CrashReporterManifestSchema.parse({ sinks: [] })).toThrow(
      /at least one sink/,
    );
  });

  it("allows disabled manifest with no sinks", () => {
    const m = CrashReporterManifestSchema.parse({
      enabled: false,
      sinks: [],
    });
    expect(m.enabled).toBe(false);
  });

  it("rejects duplicate sink ids", () => {
    expect(() =>
      CrashReporterManifestSchema.parse({
        sinks: [httpSink, httpSink],
      }),
    ).toThrow(/sink ids/);
  });

  it("rejects dedupeInFlight with windowSec=0", () => {
    expect(() =>
      CrashReporterManifestSchema.parse({
        sinks: [httpSink],
        dedupeInFlight: true,
        dedupeWindowSec: 0,
      }),
    ).toThrow(/dedupeWindowSec/);
  });

  it("accepts dedupeInFlight=false with windowSec=0", () => {
    const m = CrashReporterManifestSchema.parse({
      sinks: [httpSink],
      dedupeInFlight: false,
      dedupeWindowSec: 0,
    });
    expect(m.dedupeInFlight).toBe(false);
  });

  it("accepts multiple sinks", () => {
    const m = CrashReporterManifestSchema.parse({
      sinks: [
        httpSink,
        {
          id: "local",
          name: "Local",
          kind: "localFile",
          minSeverity: "debug",
        },
      ],
    });
    expect(m.sinks).toHaveLength(2);
  });
});
