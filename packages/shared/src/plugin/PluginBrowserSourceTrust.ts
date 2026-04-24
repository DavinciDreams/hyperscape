/**
 * Pure per-marketplace-source trust registry for the
 * Plugin Browser. Each source (e.g. the marketplace domain
 * a plugin was downloaded from) carries one of three
 * trust states:
 *
 *   - `trusted`    — auto-install / auto-update allowed
 *   - `blocked`    — refuse any operation from this source
 *   - `unverified` — prompt on first touch (default when
 *                    no explicit entry exists)
 *
 * The substrate only stores *explicit* overrides: sources
 * with no entry are treated as `unverified` by the getter.
 * Setting a source back to `unverified` is modeled as
 * `clear()` to keep the storage sparse.
 *
 * Distinct from:
 *   - `PluginBrowserPermissionGrants` — per-plugin /
 *     per-permission decisions.
 *   - `PluginBrowserAutoUpdatePolicy` — update policy
 *     (manual / security-only / all).
 *
 * Pure state, caller-owned, never throws. Invalid input
 * (empty id, unknown trust level) silently no-op'd.
 */

export type PluginBrowserSourceTrustLevel =
  | "trusted"
  | "blocked"
  | "unverified";

export interface PluginBrowserSourceTrustEntry {
  readonly sourceId: string;
  readonly level: "trusted" | "blocked";
}

export interface PluginBrowserSourceTrust {
  /**
   * Set a non-default trust level. Setting to
   * `unverified` is rejected (use `clear()` for that — the
   * default state is absence-of-entry). Rejects empty id
   * and unknown levels.
   */
  setTrust(sourceId: string, level: "trusted" | "blocked"): boolean;
  /**
   * Returns the explicit level if one was set, otherwise
   * `"unverified"` (the implicit default).
   */
  getTrust(sourceId: string): PluginBrowserSourceTrustLevel;
  /** True iff the source was explicitly marked trusted. */
  isTrusted(sourceId: string): boolean;
  /** True iff the source was explicitly marked blocked. */
  isBlocked(sourceId: string): boolean;
  /**
   * Remove any explicit entry — the source returns to
   * `unverified`. Returns true on removal.
   */
  clear(sourceId: string): boolean;
  /** Snapshot of trusted sources in insertion order. */
  trustedSources(): readonly string[];
  /** Snapshot of blocked sources in insertion order. */
  blockedSources(): readonly string[];
  /** Snapshot of all explicit entries, insertion order. */
  all(): readonly PluginBrowserSourceTrustEntry[];
  /** Count of explicit entries (trusted + blocked). */
  count(): number;
  /** Wipe everything. */
  reset(): void;
}

/**
 * Create a caller-owned source-trust registry.
 */
export function createPluginBrowserSourceTrust(): PluginBrowserSourceTrust {
  const entries: PluginBrowserSourceTrustEntry[] = [];

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  function isValidSetLevel(l: unknown): l is "trusted" | "blocked" {
    return l === "trusted" || l === "blocked";
  }

  function findIndex(sourceId: string): number {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].sourceId === sourceId) return i;
    }
    return -1;
  }

  return {
    setTrust(sourceId: string, level: "trusted" | "blocked"): boolean {
      if (!isValidId(sourceId)) return false;
      if (!isValidSetLevel(level)) return false;
      const idx = findIndex(sourceId);
      const next: PluginBrowserSourceTrustEntry = { sourceId, level };
      if (idx >= 0) {
        entries[idx] = next;
      } else {
        entries.push(next);
      }
      return true;
    },
    getTrust(sourceId: string): PluginBrowserSourceTrustLevel {
      if (!isValidId(sourceId)) return "unverified";
      const idx = findIndex(sourceId);
      if (idx < 0) return "unverified";
      return entries[idx].level;
    },
    isTrusted(sourceId: string): boolean {
      if (!isValidId(sourceId)) return false;
      const idx = findIndex(sourceId);
      if (idx < 0) return false;
      return entries[idx].level === "trusted";
    },
    isBlocked(sourceId: string): boolean {
      if (!isValidId(sourceId)) return false;
      const idx = findIndex(sourceId);
      if (idx < 0) return false;
      return entries[idx].level === "blocked";
    },
    clear(sourceId: string): boolean {
      if (!isValidId(sourceId)) return false;
      const idx = findIndex(sourceId);
      if (idx < 0) return false;
      entries.splice(idx, 1);
      return true;
    },
    trustedSources(): readonly string[] {
      return entries
        .filter((e) => e.level === "trusted")
        .map((e) => e.sourceId);
    },
    blockedSources(): readonly string[] {
      return entries
        .filter((e) => e.level === "blocked")
        .map((e) => e.sourceId);
    },
    all(): readonly PluginBrowserSourceTrustEntry[] {
      return entries.slice();
    },
    count(): number {
      return entries.length;
    },
    reset(): void {
      entries.length = 0;
    },
  };
}
