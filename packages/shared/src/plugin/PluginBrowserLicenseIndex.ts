/**
 * Pure per-plugin license-id index for the Plugin Browser.
 * Stores each plugin's SPDX-style license id (e.g.
 * `MIT`, `Apache-2.0`, `GPL-3.0-or-later`, or `proprietary`)
 * and exposes grouping queries for the "browse by license"
 * sidebar.
 *
 * The module does NOT validate license ids against SPDX —
 * any non-empty string is accepted. Case-sensitive by
 * design (SPDX is case-sensitive).
 *
 * Distinct from:
 *   - `PluginBrowserCategoryFilter` — user-facing AND/OR
 *     filter, not an index.
 *   - `PluginBrowserTagFilter` — freeform tag filtering.
 *
 * Pure state, caller-owned, never throws. Invalid input
 * silently no-op'd.
 */

export interface PluginBrowserLicenseEntry {
  readonly pluginId: string;
  readonly licenseId: string;
}

export interface PluginBrowserLicenseGroup {
  readonly licenseId: string;
  readonly pluginIds: readonly string[];
}

export interface PluginBrowserLicenseIndex {
  /**
   * Assign a license id to a plugin. Returns false on empty
   * pluginId / licenseId, or when unchanged.
   */
  set(pluginId: string, licenseId: string): boolean;
  /** Entry for pluginId, or undefined. */
  get(pluginId: string): PluginBrowserLicenseEntry | undefined;
  /** License id for pluginId, or undefined. */
  licenseOf(pluginId: string): string | undefined;
  /** True iff pluginId has a license assigned. */
  has(pluginId: string): boolean;
  /** All entries, insertion order. */
  all(): readonly PluginBrowserLicenseEntry[];
  /** Unique license ids across all entries, insertion order of first occurrence. */
  licenses(): readonly string[];
  /** Plugin ids assigned `licenseId`, insertion order. */
  pluginsWithLicense(licenseId: string): readonly string[];
  /**
   * Grouped view: one `PluginBrowserLicenseGroup` per
   * unique license id, each pluginIds list in insertion
   * order. Groups sorted by pluginIds.length descending,
   * ties by insertion order of first occurrence.
   */
  groups(): readonly PluginBrowserLicenseGroup[];
  /** Total entry count. */
  size(): number;
  /** Remove one entry. */
  remove(pluginId: string): boolean;
  /** Wipe every entry. */
  clear(): void;
}

function isValidId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

/**
 * Create a caller-owned license index.
 */
export function createPluginBrowserLicenseIndex(): PluginBrowserLicenseIndex {
  const entries: PluginBrowserLicenseEntry[] = [];

  function findIndex(pluginId: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].pluginId === pluginId) return i;
    }
    return -1;
  }

  return {
    set(pluginId: string, licenseId: string): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidId(licenseId)) return false;
      const idx = findIndex(pluginId);
      if (idx >= 0) {
        if (entries[idx].licenseId === licenseId) return false;
        entries[idx] = { pluginId, licenseId };
        return true;
      }
      entries.push({ pluginId, licenseId });
      return true;
    },
    get(pluginId: string): PluginBrowserLicenseEntry | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      return idx < 0 ? undefined : entries[idx];
    },
    licenseOf(pluginId: string): string | undefined {
      if (!isValidId(pluginId)) return undefined;
      const idx = findIndex(pluginId);
      return idx < 0 ? undefined : entries[idx].licenseId;
    },
    has(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return findIndex(pluginId) >= 0;
    },
    all(): readonly PluginBrowserLicenseEntry[] {
      return entries.slice();
    },
    licenses(): readonly string[] {
      const seen = new Set<string>();
      const result: string[] = [];
      for (const e of entries) {
        if (!seen.has(e.licenseId)) {
          seen.add(e.licenseId);
          result.push(e.licenseId);
        }
      }
      return result;
    },
    pluginsWithLicense(licenseId: string): readonly string[] {
      if (!isValidId(licenseId)) return [];
      const result: string[] = [];
      for (const e of entries) {
        if (e.licenseId === licenseId) result.push(e.pluginId);
      }
      return result;
    },
    groups(): readonly PluginBrowserLicenseGroup[] {
      // Preserve first-occurrence order
      const firstOccurrence = new Map<string, number>();
      const byLicense = new Map<string, string[]>();
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!firstOccurrence.has(e.licenseId)) {
          firstOccurrence.set(e.licenseId, i);
          byLicense.set(e.licenseId, []);
        }
        byLicense.get(e.licenseId)!.push(e.pluginId);
      }
      const groups: PluginBrowserLicenseGroup[] = [];
      for (const [licenseId, pluginIds] of byLicense) {
        groups.push({ licenseId, pluginIds });
      }
      groups.sort((a, b) => {
        if (a.pluginIds.length !== b.pluginIds.length) {
          return b.pluginIds.length - a.pluginIds.length;
        }
        const ai = firstOccurrence.get(a.licenseId) ?? 0;
        const bi = firstOccurrence.get(b.licenseId) ?? 0;
        return ai - bi;
      });
      return groups;
    },
    size(): number {
      return entries.length;
    },
    remove(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      const idx = findIndex(pluginId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    clear(): void {
      entries.length = 0;
    },
  };
}
