/**
 * Crash-reporter registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `crash-reporter.ts`.
 * Pure logic: sink lookup, severity threshold filtering, PII-category
 * redaction set construction from consent opt-ins, and dedup-window
 * lookup.
 */

import {
  type BreadcrumbRules,
  type ConsentGating,
  type CrashReporterManifest,
  type CrashSeverity,
  type CrashSink,
  type PiiRules,
  type RedactionCategory,
  type SymbolicationRules,
  CrashReporterManifestSchema,
} from "@hyperforge/manifest-schema";

export class CrashReporterNotLoadedError extends Error {
  constructor() {
    super("CrashReporterRegistry used before load()");
    this.name = "CrashReporterNotLoadedError";
  }
}

export class UnknownCrashSinkError extends Error {
  readonly sinkId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `crash sink "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCrashSinkError";
    this.sinkId = id;
    this.availableIds = availableIds;
  }
}

/** Severity rank — higher = more severe. */
const SEVERITY_RANK: Record<CrashSeverity, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  fatal: 4,
};

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CrashReporterReloadListener = () => void;

export class CrashReporterRegistry {
  private _manifest: CrashReporterManifest | null = null;
  private _sinkById = new Map<string, CrashSink>();
  private _reloadListeners = new Set<CrashReporterReloadListener>();

  constructor(manifest?: CrashReporterManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: CrashReporterManifest): void {
    this._manifest = manifest;
    this._sinkById.clear();
    for (const s of manifest.sinks) this._sinkById.set(s.id, s);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(CrashReporterManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: CrashReporterReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[crashReporterRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): CrashReporterManifest {
    if (!this._manifest) throw new CrashReporterNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get symbolication(): SymbolicationRules {
    return this.manifest.symbolication;
  }

  get breadcrumbs(): BreadcrumbRules {
    return this.manifest.breadcrumbs;
  }

  get pii(): PiiRules {
    return this.manifest.pii;
  }

  get consent(): ConsentGating {
    return this.manifest.consent;
  }

  sink(id: string): CrashSink {
    const s = this._sinkById.get(id);
    if (!s) {
      throw new UnknownCrashSinkError(id, Array.from(this._sinkById.keys()));
    }
    return s;
  }

  /** Is `severity` at/above a threshold? */
  static severityPasses(
    severity: CrashSeverity,
    minimum: CrashSeverity,
  ): boolean {
    return SEVERITY_RANK[severity] >= SEVERITY_RANK[minimum];
  }

  /** Sinks that would receive a report of the given severity. */
  sinksForSeverity(severity: CrashSeverity): CrashSink[] {
    if (
      !CrashReporterRegistry.severityPasses(
        severity,
        this.manifest.globalMinSeverity,
      )
    ) {
      return [];
    }
    return this.manifest.sinks.filter((s) =>
      CrashReporterRegistry.severityPasses(severity, s.minSeverity),
    );
  }

  /**
   * Effective redaction set, given a set of user-opted-in categories.
   * - Always-redact categories are always included.
   * - Default-redact categories are included unless the user opted in.
   */
  effectiveRedactions(
    optedInCategories: ReadonlySet<RedactionCategory>,
  ): Set<RedactionCategory> {
    const out = new Set<RedactionCategory>(this.pii.alwaysRedact);
    for (const c of this.pii.defaultRedact) {
      if (!optedInCategories.has(c)) out.add(c);
    }
    return out;
  }
}
