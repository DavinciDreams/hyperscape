/**
 * Project-settings registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `project-settings.ts`. Exposes typed lookups for enabled plugins,
 * PIE flag reads, and render/input/locale defaults so the boot
 * sequence doesn't re-parse the manifest each time.
 */

import {
  type EnabledPlugin,
  type ProjectSettingsManifest,
  ProjectSettingsManifestSchema,
} from "@hyperforge/manifest-schema";

export class ProjectSettingsNotLoadedError extends Error {
  constructor() {
    super("ProjectSettingsRegistry used before load()");
    this.name = "ProjectSettingsNotLoadedError";
  }
}

export class UnknownPluginIdError extends Error {
  readonly pluginId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `plugin "${id}" not listed in project settings. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none)"
      }`,
    );
    this.name = "UnknownPluginIdError";
    this.pluginId = id;
    this.availableIds = availableIds;
  }
}

export class ProjectSettingsRegistry {
  private _manifest: ProjectSettingsManifest | null = null;
  private _pluginById = new Map<string, EnabledPlugin>();

  constructor(manifest?: ProjectSettingsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ProjectSettingsManifest): void {
    this._manifest = manifest;
    this._pluginById.clear();
    for (const p of manifest.plugins) this._pluginById.set(p.id, p);
  }

  loadFromJson(raw: unknown): void {
    this.load(ProjectSettingsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ProjectSettingsManifest {
    if (!this._manifest) throw new ProjectSettingsNotLoadedError();
    return this._manifest;
  }

  get projectName(): string {
    return this.manifest.projectName;
  }

  get gameModeId(): string {
    return this.manifest.gameModeId;
  }

  get worldSeed(): string {
    return this.manifest.worldSeed;
  }

  get defaultLocale(): string {
    return this.manifest.defaultLocale;
  }

  get defaultInputScheme(): ProjectSettingsManifest["defaultInputScheme"] {
    return this.manifest.defaultInputScheme;
  }

  get renderConfig(): ProjectSettingsManifest["renderProfile"] {
    return this.manifest.renderProfile;
  }

  plugins(): readonly EnabledPlugin[] {
    return this.manifest.plugins;
  }

  enabledPlugins(): EnabledPlugin[] {
    return this.manifest.plugins.filter((p) => p.enabled);
  }

  hasPlugin(id: string): boolean {
    return this._pluginById.has(id);
  }

  plugin(id: string): EnabledPlugin {
    const p = this._pluginById.get(id);
    if (!p) {
      throw new UnknownPluginIdError(id, Array.from(this._pluginById.keys()));
    }
    return p;
  }

  isPluginEnabled(id: string): boolean {
    const p = this._pluginById.get(id);
    return p !== undefined && p.enabled;
  }

  /** PIE flag read — returns `fallback` when the key isn't set. */
  pieFlag(key: string, fallback = false): boolean {
    const v = this.manifest.pieFlags[key];
    return v === undefined ? fallback : v;
  }

  pieFlagKeys(): string[] {
    return Object.keys(this.manifest.pieFlags);
  }
}
