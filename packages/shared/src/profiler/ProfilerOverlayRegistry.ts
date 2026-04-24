/**
 * Profiler-overlay registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `profiler.ts`.
 * Pure logic: metric/group lookup + color band resolution from
 * thresholds.
 */

import {
  type ProfilerGroup,
  type ProfilerMetric,
  type ProfilerOverlayManifest,
  ProfilerOverlayManifestSchema,
} from "@hyperforge/manifest-schema";

export class ProfilerOverlayNotLoadedError extends Error {
  constructor() {
    super("ProfilerOverlayRegistry used before load()");
    this.name = "ProfilerOverlayNotLoadedError";
  }
}

export class UnknownProfilerMetricError extends Error {
  readonly metricId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `profiler metric "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownProfilerMetricError";
    this.metricId = id;
    this.availableIds = availableIds;
  }
}

export type ProfilerBand = "green" | "yellow" | "red" | "neutral";

export class ProfilerOverlayRegistry {
  private _manifest: ProfilerOverlayManifest | null = null;
  private _metricById = new Map<string, ProfilerMetric>();
  private _groupForMetric = new Map<string, ProfilerGroup>();

  constructor(manifest?: ProfilerOverlayManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ProfilerOverlayManifest): void {
    this._manifest = manifest;
    this._metricById.clear();
    this._groupForMetric.clear();
    for (const g of manifest.groups) {
      for (const m of g.metrics) {
        this._metricById.set(m.id, m);
        this._groupForMetric.set(m.id, g);
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(ProfilerOverlayManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ProfilerOverlayManifest {
    if (!this._manifest) throw new ProfilerOverlayNotLoadedError();
    return this._manifest;
  }

  get groups(): readonly ProfilerGroup[] {
    return this.manifest.groups;
  }

  hasMetric(id: string): boolean {
    return this._metricById.has(id);
  }

  metric(id: string): ProfilerMetric {
    const m = this._metricById.get(id);
    if (!m) {
      throw new UnknownProfilerMetricError(
        id,
        Array.from(this._metricById.keys()),
      );
    }
    return m;
  }

  groupForMetric(id: string): ProfilerGroup {
    const g = this._groupForMetric.get(id);
    if (!g) {
      throw new UnknownProfilerMetricError(
        id,
        Array.from(this._metricById.keys()),
      );
    }
    return g;
  }

  visibleMetrics(): ProfilerMetric[] {
    const out: ProfilerMetric[] = [];
    for (const g of this.manifest.groups) {
      if (g.collapsed) continue;
      for (const m of g.metrics) {
        if (m.visible) out.push(m);
      }
    }
    return out;
  }

  /**
   * Color band for a sampled metric value.
   *   value ≤ good   → green
   *   value ≤ warn   → yellow
   *   value > warn   → red
   * If the metric has no thresholds declared, returns `'neutral'`.
   */
  bandFor(id: string, value: number): ProfilerBand {
    const m = this.metric(id);
    if (!m.thresholds) return "neutral";
    if (value <= m.thresholds.good) return "green";
    if (value <= m.thresholds.warn) return "yellow";
    return "red";
  }
}
