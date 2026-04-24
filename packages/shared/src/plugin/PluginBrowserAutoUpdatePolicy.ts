/**
 * Pure per-plugin auto-update policy ledger for the Plugin
 * Browser "Updates" settings panel.
 *
 * Four policies:
 *
 *   "manual"         → user must click "Update" in the UI
 *   "security-only"  → auto-apply updates flagged as security
 *   "all"            → auto-apply every update
 *
 * Every plugin reads through a single global default plus a
 * sparse per-plugin override (same shape as
 * `PluginBrowserReleaseChannel`). Setting an override equal to
 * the current default drops it so the plugin "follows default"
 * — a UE5-parity UX for "reset to default" without a separate
 * button.
 *
 * This substrate is storage only — actually *running* auto
 * updates is the host's job. Does not parse or compare
 * versions. Invalid input (empty ids) silently no-op'd. Never
 * throws.
 */

export type PluginBrowserAutoUpdatePolicy = "manual" | "security-only" | "all";

export interface PluginBrowserAutoUpdatePolicyEntry {
  readonly pluginId: string;
  readonly policy: PluginBrowserAutoUpdatePolicy;
}

export interface PluginBrowserAutoUpdatePolicyLedger {
  /** Current global default policy. */
  defaultPolicy(): PluginBrowserAutoUpdatePolicy;
  /**
   * Replace the global default. Does not touch existing
   * overrides. Returns true when the value changed.
   */
  setDefault(policy: PluginBrowserAutoUpdatePolicy): boolean;

  /** True iff `pluginId` has a per-plugin override. */
  hasOverride(pluginId: string): boolean;
  /** Raw override value for `pluginId`, or undefined. */
  getOverride(pluginId: string): PluginBrowserAutoUpdatePolicy | undefined;
  /**
   * Effective policy for `pluginId` — override if any, else the
   * global default.
   */
  getPolicy(pluginId: string): PluginBrowserAutoUpdatePolicy;

  /**
   * Set the per-plugin policy. If the new value equals the
   * current default, any existing override is dropped (the
   * plugin returns to "follow default"). Returns true when the
   * effective state changed.
   */
  setPolicy(pluginId: string, policy: PluginBrowserAutoUpdatePolicy): boolean;
  /**
   * Explicitly clear the override for `pluginId`. Returns true
   * when an override was removed.
   */
  resetToDefault(pluginId: string): boolean;
  /**
   * Remove every override. Returns how many were cleared.
   */
  resetAll(): number;

  /** Plugin ids with an override (insertion order). */
  pluginsWithOverrides(): readonly string[];
  /** Count of overrides. */
  overrideCount(): number;
  /** Snapshot of all overrides in insertion order. */
  entries(): readonly PluginBrowserAutoUpdatePolicyEntry[];
}

const VALID: readonly PluginBrowserAutoUpdatePolicy[] = [
  "manual",
  "security-only",
  "all",
];

function isValidPolicy(s: unknown): s is PluginBrowserAutoUpdatePolicy {
  return typeof s === "string" && (VALID as readonly string[]).includes(s);
}

/**
 * Create a caller-owned auto-update-policy ledger. `initialDefault`
 * defaults to `"manual"`. Invalid values silently fall back to
 * `"manual"`.
 */
export function createPluginBrowserAutoUpdatePolicyLedger(
  initialDefault: PluginBrowserAutoUpdatePolicy = "manual",
): PluginBrowserAutoUpdatePolicyLedger {
  let def: PluginBrowserAutoUpdatePolicy = isValidPolicy(initialDefault)
    ? initialDefault
    : "manual";
  const overrides = new Map<string, PluginBrowserAutoUpdatePolicy>();

  function isValidId(s: string): boolean {
    return typeof s === "string" && s.length > 0;
  }

  return {
    defaultPolicy(): PluginBrowserAutoUpdatePolicy {
      return def;
    },
    setDefault(policy: PluginBrowserAutoUpdatePolicy): boolean {
      if (!isValidPolicy(policy)) return false;
      if (def === policy) return false;
      def = policy;
      return true;
    },
    hasOverride(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return overrides.has(pluginId);
    },
    getOverride(pluginId: string): PluginBrowserAutoUpdatePolicy | undefined {
      if (!isValidId(pluginId)) return undefined;
      return overrides.get(pluginId);
    },
    getPolicy(pluginId: string): PluginBrowserAutoUpdatePolicy {
      if (!isValidId(pluginId)) return def;
      return overrides.get(pluginId) ?? def;
    },
    setPolicy(
      pluginId: string,
      policy: PluginBrowserAutoUpdatePolicy,
    ): boolean {
      if (!isValidId(pluginId)) return false;
      if (!isValidPolicy(policy)) return false;
      const currentOverride = overrides.get(pluginId);
      if (policy === def) {
        // Drop the override — "follow default" UX.
        if (currentOverride === undefined) return false;
        overrides.delete(pluginId);
        return true;
      }
      if (currentOverride === policy) return false;
      overrides.set(pluginId, policy);
      return true;
    },
    resetToDefault(pluginId: string): boolean {
      if (!isValidId(pluginId)) return false;
      return overrides.delete(pluginId);
    },
    resetAll(): number {
      const n = overrides.size;
      overrides.clear();
      return n;
    },
    pluginsWithOverrides(): readonly string[] {
      return [...overrides.keys()];
    },
    overrideCount(): number {
      return overrides.size;
    },
    entries(): readonly PluginBrowserAutoUpdatePolicyEntry[] {
      const out: PluginBrowserAutoUpdatePolicyEntry[] = [];
      for (const [pluginId, policy] of overrides) {
        out.push({ pluginId, policy });
      }
      return out;
    },
  };
}
