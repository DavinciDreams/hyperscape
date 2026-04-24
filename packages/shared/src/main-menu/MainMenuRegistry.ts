/**
 * Main-menu registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `main-menu.ts`.
 * Pure logic: menu lookup, entry/submenu resolution, visibility
 * predicate evaluation, ordered-visible-entry computation. Runtime
 * owns rendering, input, and navigation state.
 */

import {
  type MainMenuManifest,
  type MenuEntry,
  type MenuScreen,
  type VisibilityPredicate,
  MainMenuManifestSchema,
} from "@hyperforge/manifest-schema";

export class MainMenuNotLoadedError extends Error {
  constructor() {
    super("MainMenuRegistry used before load()");
    this.name = "MainMenuNotLoadedError";
  }
}

export class UnknownMenuScreenError extends Error {
  readonly menuId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `main-menu screen "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownMenuScreenError";
    this.menuId = id;
    this.availableIds = availableIds;
  }
}

export interface MenuViewerContext {
  hasSave: boolean;
  platform: string;
  ownedDlcIds: ReadonlySet<string>;
  enabledFlagIds: ReadonlySet<string>;
  /** Resolver for `kind="custom"` predicates. Defaults to false. */
  customPredicate?: (argKey: string) => boolean;
}

export class MainMenuRegistry {
  private _manifest: MainMenuManifest | null = null;
  private _byId = new Map<string, MenuScreen>();

  constructor(manifest?: MainMenuManifest) {
    if (manifest) this.load(manifest);
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  load(manifest: MainMenuManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const s of manifest.menus) this._byId.set(s.id, s);
  }

  loadFromJson(raw: unknown): void {
    this.load(MainMenuManifestSchema.parse(raw));
  }

  get manifest(): MainMenuManifest {
    if (!this._manifest) throw new MainMenuNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  /* --- menu lookup --- */

  has(id: string): boolean {
    return this._byId.has(id);
  }

  get(id: string): MenuScreen {
    const s = this._byId.get(id);
    if (!s) {
      throw new UnknownMenuScreenError(id, Array.from(this._byId.keys()));
    }
    return s;
  }

  ids(): string[] {
    return Array.from(this._byId.keys());
  }

  rootMenu(): MenuScreen {
    const rootId = this.manifest.rootMenuId;
    if (rootId === "") {
      throw new Error("MainMenu manifest has no rootMenuId set");
    }
    return this.get(rootId);
  }

  /**
   * Resolve the submenu an `openSubmenu` entry points at. Throws when
   * the entry kind doesn't reference a submenu.
   */
  submenuFor(entry: MenuEntry): MenuScreen {
    if (entry.action !== "openSubmenu") {
      throw new Error(
        `menu entry "${entry.id}" action is not 'openSubmenu' (got '${entry.action}')`,
      );
    }
    return this.get(entry.submenuId);
  }

  /* --- visibility --- */

  evaluatePredicate(
    predicate: VisibilityPredicate,
    viewer: MenuViewerContext,
  ): boolean {
    switch (predicate.kind) {
      case "always":
        return true;
      case "hasSave":
        return viewer.hasSave;
      case "noSave":
        return !viewer.hasSave;
      case "hasDlc":
        return viewer.ownedDlcIds.has(predicate.argKey);
      case "platform":
        return viewer.platform === predicate.argKey;
      case "featureFlag":
        return viewer.enabledFlagIds.has(predicate.argKey);
      case "custom":
        return viewer.customPredicate
          ? viewer.customPredicate(predicate.argKey)
          : false;
    }
  }

  /**
   * Returns the menu screen's entries filtered by visibility, sorted
   * by displayOrder ascending. When `greyWhenHidden`, entries failing
   * visibility are kept (runtime should grey them) instead of dropped.
   */
  visibleEntries(menuId: string, viewer: MenuViewerContext): MenuEntry[] {
    const screen = this.get(menuId);
    const shown = screen.entries.filter((e) => {
      const ok = this.evaluatePredicate(e.visibility, viewer);
      return ok || e.greyWhenHidden;
    });
    return [...shown].sort((a, b) => a.displayOrder - b.displayOrder);
  }

  /**
   * Convenience: is a specific entry in a specific menu currently
   * visible (not filtered out)?
   */
  isEntryVisible(
    menuId: string,
    entryId: string,
    viewer: MenuViewerContext,
  ): boolean {
    const screen = this.get(menuId);
    const e = screen.entries.find((x) => x.id === entryId);
    if (!e) return false;
    const ok = this.evaluatePredicate(e.visibility, viewer);
    return ok || e.greyWhenHidden;
  }
}
