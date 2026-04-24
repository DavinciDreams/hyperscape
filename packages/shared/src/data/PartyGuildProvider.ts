/**
 * PartyGuildProvider
 *
 * Singleton persistence layer for the authored party-guild
 * manifest — party loot/xp policies + guild rank hierarchy
 * with 13-permission enum + perk registry + alliance/war
 * rules.
 *
 * Refinements: unique rank ids + unique rank.order values +
 * unique perk ids + defaultRankId/leaderRankId resolve.
 *
 * No baseline fixture — `ranks.min(1)` plus required
 * defaultRankId/leaderRankId make the empty object schema-
 * invalid. Safe default is unloaded.
 *
 * Runtime PartyManager/GuildRegistry not yet shipped.
 */

import {
  PartyGuildManifestSchema,
  type PartyGuildManifest,
} from "@hyperforge/manifest-schema";

class PartyGuildProvider {
  private static _instance: PartyGuildProvider | null = null;
  private _manifest: PartyGuildManifest | null = null;

  public static getInstance(): PartyGuildProvider {
    if (!PartyGuildProvider._instance) {
      PartyGuildProvider._instance = new PartyGuildProvider();
    }
    return PartyGuildProvider._instance;
  }

  public load(manifest: PartyGuildManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PartyGuildManifest {
    const parsed = PartyGuildManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PartyGuildManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PartyGuildManifest | null {
    return this._manifest;
  }
}

export { PartyGuildProvider };
export const partyGuildProvider = PartyGuildProvider.getInstance();
