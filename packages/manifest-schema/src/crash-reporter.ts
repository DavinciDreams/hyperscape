/**
 * Crash-reporter manifest schema.
 *
 * Authored policy for client/server crash capture: which sinks receive
 * crash reports, how often to sample, what breadcrumb buffer to keep,
 * which categories of fields to redact for PII-compliance, and the
 * consent gate that must be satisfied before a report leaves the
 * device. Runtime `CrashReporterSystem` owns the actual uncaughtError
 * hook, symbolication, dedup hashing, and HTTP dispatch.
 *
 * Scope-isolated from:
 *   - `analytics-events.ts` (telemetry of ordinary events — crash is
 *     strictly error/abnormal termination)
 *   - `license-agreements.ts` (consent document referenced by id,
 *     but the doc itself lives there)
 *   - `deploy-targets.ts` (ingest endpoints read their *name* from
 *     there as ENV pointers; this schema doesn't carry real URLs)
 *   - `feature-flags.ts`
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** SinkId — lowerCamelCase. */
const SinkId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "sink id must be lowerCamelCase ASCII identifier",
  );

/** PII-redaction category. Named groups clients can opt out of. */
export const RedactionCategorySchema = z.enum([
  "ip",
  "email",
  "username",
  "deviceId",
  "filePath",
  "stackFrameArgs",
  "envVars",
  "customFields",
]);
export type RedactionCategory = z.infer<typeof RedactionCategorySchema>;

/** Severity filter. */
export const CrashSeveritySchema = z.enum([
  "fatal",
  "error",
  "warning",
  "info",
  "debug",
]);
export type CrashSeverity = z.infer<typeof CrashSeveritySchema>;

/** Sink kind — how reports leave the device. */
export const SinkKindSchema = z.enum(["http", "localFile", "syslog", "custom"]);
export type SinkKind = z.infer<typeof SinkKindSchema>;

/**
 * A crash sink — one remote or local destination for reports.
 * The actual endpoint URL is NOT in the manifest (it lives in
 * deploy-targets via `endpointNameRef`). The manifest only refers
 * to its *name* and the ENV/secret-store resolution is out of scope.
 */
export const CrashSinkSchema = z
  .object({
    id: SinkId,
    name: z.string().min(1),
    kind: SinkKindSchema,
    /** For kind='custom'. */
    customKey: z.string().default(""),
    /** Name of a deploy-target entry that resolves the real URL. */
    endpointNameRef: z.string().default(""),
    /** Minimum severity to forward to this sink. */
    minSeverity: CrashSeveritySchema.default("error"),
    /** Max reports per hour this sink will forward (0=unlimited). */
    maxReportsPerHour: z.number().int().min(0).max(10000).default(60),
    /** Sampling fraction 0..1 (1 = always). Per-report random gate. */
    samplingFraction: z.number().min(0).max(1).default(1),
    /** Retry policy — max attempts before giving up. */
    maxRetryAttempts: z.number().int().min(0).max(10).default(3),
    /** Retry backoff base in seconds (exp-backoff). */
    retryBackoffSec: z.number().min(0.1).max(600).default(2),
    /** Include system info block (OS, GPU, mem) in report. */
    includeSystemInfo: z.boolean().default(true),
    /** Include breadcrumbs (recent log lines) in report. */
    includeBreadcrumbs: z.boolean().default(true),
  })
  .strict()
  .refine((s) => s.kind !== "custom" || s.customKey.length > 0, {
    message: "customKey is required when kind='custom'",
    path: ["customKey"],
  })
  .refine((s) => s.kind !== "http" || s.endpointNameRef.length > 0, {
    message: "kind='http' requires endpointNameRef",
    path: ["endpointNameRef"],
  });
export type CrashSink = z.infer<typeof CrashSinkSchema>;

/** Symbolication rules. */
export const SymbolicationRulesSchema = z
  .object({
    /** Upload sourcemaps/dSYMs at build time; server symbolicates. */
    enabled: z.boolean().default(true),
    /** Strip local file paths from stack frames regardless of PII setting. */
    stripLocalPaths: z.boolean().default(true),
    /** Replace stripped paths with this placeholder. */
    pathPlaceholder: z.string().default("<redacted>"),
    /** Max frames per stack. 0 = unlimited. */
    maxFrames: z.number().int().min(0).max(500).default(100),
  })
  .strict();
export type SymbolicationRules = z.infer<typeof SymbolicationRulesSchema>;

/** Breadcrumb buffer rules (recent log lines snapshotted on crash). */
export const BreadcrumbRulesSchema = z
  .object({
    /** Enable breadcrumb capture. */
    enabled: z.boolean().default(true),
    /** Max breadcrumbs retained in ring buffer. */
    maxEntries: z.number().int().min(10).max(10000).default(200),
    /** Max bytes per breadcrumb message. */
    maxBytesPerEntry: z.number().int().min(32).max(65536).default(512),
    /** Minimum severity of events to record as a breadcrumb. */
    minSeverity: CrashSeveritySchema.default("info"),
  })
  .strict();
export type BreadcrumbRules = z.infer<typeof BreadcrumbRulesSchema>;

/** PII-redaction rules. */
export const PiiRulesSchema = z
  .object({
    /** Categories that are always redacted regardless of consent. */
    alwaysRedact: z.array(RedactionCategorySchema).default([]),
    /** Categories redacted unless user opts in. */
    defaultRedact: z.array(RedactionCategorySchema).default([]),
    /** Custom regex patterns applied to outgoing report body. */
    customRegexes: z.array(z.string().min(1).max(500)).default([]),
  })
  .strict()
  .refine((r) => new Set(r.alwaysRedact).size === r.alwaysRedact.length, {
    message: "alwaysRedact must be unique",
    path: ["alwaysRedact"],
  })
  .refine((r) => new Set(r.defaultRedact).size === r.defaultRedact.length, {
    message: "defaultRedact must be unique",
    path: ["defaultRedact"],
  })
  .refine(
    (r) => {
      const a = new Set(r.alwaysRedact);
      return r.defaultRedact.every((c) => !a.has(c));
    },
    {
      message: "defaultRedact categories must not also appear in alwaysRedact",
      path: ["defaultRedact"],
    },
  );
export type PiiRules = z.infer<typeof PiiRulesSchema>;

/** Consent gating — which license doc must be accepted before sending. */
export const ConsentGatingSchema = z
  .object({
    /** Require explicit opt-in toggle in settings. */
    requireOptIn: z.boolean().default(false),
    /** Require this license doc id to be accepted (empty = no gate). */
    requiresLicenseDocRef: ManifestRef.optional(),
    /** Allow anonymous reports (no userId) even when consent pending. */
    allowAnonymousReports: z.boolean().default(true),
  })
  .strict();
export type ConsentGating = z.infer<typeof ConsentGatingSchema>;

/**
 * Crash-reporter manifest — top-level authored document.
 */
export const CrashReporterManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    sinks: z.array(CrashSinkSchema).default([]),
    /** If a report matches any sink's filter, it ships to that sink. */
    symbolication: SymbolicationRulesSchema.default(() =>
      SymbolicationRulesSchema.parse({}),
    ),
    breadcrumbs: BreadcrumbRulesSchema.default(() =>
      BreadcrumbRulesSchema.parse({}),
    ),
    pii: PiiRulesSchema.default(() => PiiRulesSchema.parse({})),
    consent: ConsentGatingSchema.default(() => ConsentGatingSchema.parse({})),
    /** Global minimum severity — no sink sees below this. */
    globalMinSeverity: CrashSeveritySchema.default("warning"),
    /** Include in-flight frame dedup hash to avoid report spam. */
    dedupeInFlight: z.boolean().default(true),
    /** Window in seconds during which duplicate hashes are suppressed. */
    dedupeWindowSec: z.number().int().min(0).max(3600).default(60),
  })
  .strict()
  .refine((m) => new Set(m.sinks.map((s) => s.id)).size === m.sinks.length, {
    message: "sink ids must be unique",
    path: ["sinks"],
  })
  .refine((m) => !m.enabled || m.sinks.length >= 1, {
    message: "crash-reporter enabled=true requires at least one sink",
    path: ["sinks"],
  })
  .refine((m) => !m.dedupeInFlight || m.dedupeWindowSec > 0, {
    message: "dedupeInFlight=true requires dedupeWindowSec > 0",
    path: ["dedupeWindowSec"],
  });
export type CrashReporterManifest = z.infer<typeof CrashReporterManifestSchema>;
