/**
 * Pure collapse/expand state for named sections in the Plugin
 * Browser sidebar (e.g. "Recent", "Favorites", "By Author",
 * "By Tag"). Each section has a default-expanded flag plus an
 * optional per-session override.
 *
 * Related but distinct:
 * - {@link PluginBrowserRowExpansion} — per-row expand/collapse
 *   inside the list pane.
 * - {@link PluginBrowserFavorites}    — membership set.
 *
 * Pure state. Caller-owned instance (not a singleton). Never
 * throws. Unknown / empty ids are silent no-ops.
 */

export interface PluginBrowserSidebarSectionDefinition {
  /** Stable section id — appears in persisted state. */
  readonly id: string;
  /**
   * Default expanded state. Applied when no explicit override
   * has been recorded. Defaults to `true`.
   */
  readonly defaultExpanded?: boolean;
}

export interface PluginBrowserSidebarSectionsOptions {
  /**
   * Authored sections in preferred top-to-bottom order.
   * Duplicates silently deduped (first wins); empty ids
   * dropped. The empty list is a valid baseline.
   */
  readonly sections: readonly PluginBrowserSidebarSectionDefinition[];
  /**
   * Optional persisted collapse state. Maps section id to
   * explicit expanded boolean. Unknown ids and non-boolean
   * values are ignored.
   */
  readonly initialOverrides?: Readonly<Record<string, boolean>>;
}

export interface PluginBrowserSidebarSectionsSnapshot {
  /** Sections in authored order with their effective state. */
  readonly sections: readonly {
    readonly id: string;
    readonly expanded: boolean;
  }[];
}

export interface PluginBrowserSidebarSections {
  /** Authored ids in top-to-bottom order. */
  sectionIds(): readonly string[];
  /** Number of authored sections. */
  sectionCount(): number;
  /** True when `id` is an authored section. */
  isKnown(id: string): boolean;
  /** True when `id` is effectively expanded. */
  isExpanded(id: string): boolean;
  /**
   * Set explicit state for `id`. Unknown / empty ids are no-ops.
   * Returns true when the effective state changed.
   */
  setExpanded(id: string, expanded: boolean): boolean;
  /** Flip the current expanded state. */
  toggle(id: string): void;
  /** Expand every authored section (records overrides). */
  expandAll(): void;
  /** Collapse every authored section (records overrides). */
  collapseAll(): void;
  /**
   * Drop the explicit override for `id`, falling back to the
   * authored default. Returns true when a change occurred.
   */
  reset(id: string): boolean;
  /** Drop every override. Both expanded/collapsed return to defaults. */
  resetAll(): void;
  /** Snapshot of all sections and their effective state. */
  snapshot(): PluginBrowserSidebarSectionsSnapshot;
}

interface AuthoredSection {
  readonly id: string;
  readonly defaultExpanded: boolean;
}

function dedupeSections(
  sections: readonly PluginBrowserSidebarSectionDefinition[],
): AuthoredSection[] {
  const seen = new Set<string>();
  const out: AuthoredSection[] = [];
  for (const s of sections) {
    if (typeof s.id !== "string" || s.id.length === 0 || seen.has(s.id)) {
      continue;
    }
    seen.add(s.id);
    out.push({
      id: s.id,
      defaultExpanded:
        typeof s.defaultExpanded === "boolean" ? s.defaultExpanded : true,
    });
  }
  return out;
}

/**
 * Create a caller-owned sidebar-sections state machine.
 */
export function createPluginBrowserSidebarSections(
  options: PluginBrowserSidebarSectionsOptions,
): PluginBrowserSidebarSections {
  const authored = dedupeSections(options.sections);
  const byId = new Map<string, AuthoredSection>(authored.map((s) => [s.id, s]));
  const overrides = new Map<string, boolean>();

  if (options.initialOverrides) {
    for (const [id, v] of Object.entries(options.initialOverrides)) {
      if (typeof v !== "boolean") continue;
      if (!byId.has(id)) continue;
      overrides.set(id, v);
    }
  }

  function effective(id: string): boolean {
    const def = byId.get(id);
    if (!def) return false;
    if (overrides.has(id)) return overrides.get(id)!;
    return def.defaultExpanded;
  }

  return {
    sectionIds(): readonly string[] {
      return authored.map((s) => s.id);
    },
    sectionCount(): number {
      return authored.length;
    },
    isKnown(id: string): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      return byId.has(id);
    },
    isExpanded(id: string): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      if (!byId.has(id)) return false;
      return effective(id);
    },
    setExpanded(id: string, expanded: boolean): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      if (!byId.has(id)) return false;
      if (typeof expanded !== "boolean") return false;
      const prev = effective(id);
      overrides.set(id, expanded);
      return prev !== expanded;
    },
    toggle(id: string): void {
      if (typeof id !== "string" || id.length === 0) return;
      if (!byId.has(id)) return;
      overrides.set(id, !effective(id));
    },
    expandAll(): void {
      for (const s of authored) overrides.set(s.id, true);
    },
    collapseAll(): void {
      for (const s of authored) overrides.set(s.id, false);
    },
    reset(id: string): boolean {
      if (typeof id !== "string" || id.length === 0) return false;
      if (!byId.has(id)) return false;
      return overrides.delete(id);
    },
    resetAll(): void {
      overrides.clear();
    },
    snapshot(): PluginBrowserSidebarSectionsSnapshot {
      return {
        sections: authored.map((s) => ({
          id: s.id,
          expanded: effective(s.id),
        })),
      };
    },
  };
}
