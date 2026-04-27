/**
 * Credits registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `credits.ts`.
 * Pure logic: credit section lookup + displayOrder-sorted iteration;
 * flattened entry timeline with per-entry scroll duration derived
 * from scroll speed and per-entry vertical spacing.
 */

import {
  type CreditEntry,
  type CreditSection,
  type CreditsManifest,
  type ScrollRules,
  CreditsManifestSchema,
} from "@hyperforge/manifest-schema";

export class CreditsNotLoadedError extends Error {
  constructor() {
    super("CreditsRegistry used before load()");
    this.name = "CreditsNotLoadedError";
  }
}

export class UnknownCreditSectionError extends Error {
  readonly sectionId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `credit section "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownCreditSectionError";
    this.sectionId = id;
    this.availableIds = availableIds;
  }
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type CreditsReloadListener = () => void;

export class CreditsRegistry {
  private _manifest: CreditsManifest | null = null;
  private _byId = new Map<string, CreditSection>();
  private _reloadListeners = new Set<CreditsReloadListener>();

  constructor(manifest?: CreditsManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: CreditsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest.sections) this._byId.set(s.id, s);
    this._emitReloaded();
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: CreditsReloadListener): () => void {
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
          "[creditsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(CreditsManifestSchema.parse(raw));
  }

  get manifest(): CreditsManifest {
    if (!this._manifest) throw new CreditsNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get scroll(): ScrollRules {
    return this.manifest.scroll;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  section(id: string): CreditSection {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownCreditSectionError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  /** Sections sorted by displayOrder ascending (id-tiebreak). */
  orderedSections(): CreditSection[] {
    return [...this.manifest.sections].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.id.localeCompare(b.id);
    });
  }

  /** All entries in display order, annotated with their owning section id. */
  timeline(): Array<{ sectionId: string; entry: CreditEntry }> {
    const out: Array<{ sectionId: string; entry: CreditEntry }> = [];
    for (const s of this.orderedSections()) {
      for (const e of s.entries) out.push({ sectionId: s.id, entry: e });
    }
    return out;
  }

  /**
   * Approximate total scroll duration (seconds) using section count,
   * entries, and per-entry verticalSpacingMultiplier as a proxy for
   * on-screen lines. Base line height = 40px.
   */
  estimatedDurationSec(baseLineHeightPx = 40): number {
    const timeline = this.timeline();
    const totalPx = timeline.reduce(
      (acc, { entry }) =>
        acc + baseLineHeightPx * entry.verticalSpacingMultiplier,
      0,
    );
    return totalPx / this.scroll.scrollSpeedPxPerSec;
  }
}
