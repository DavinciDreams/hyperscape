/**
 * Parental-controls registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `parental-controls.ts`. Pure logic: profile lookup, age-to-profile
 * resolution with tie-break by priority, and chat/voice allowance
 * checks suitable for gate points in the runtime chat / voice systems.
 */

import {
  type ChatScope,
  type AllowedVoiceMode,
  type ParentalControlsManifest,
  type ParentalProfile,
  ParentalControlsManifestSchema,
} from "@hyperforge/manifest-schema";

export class ParentalControlsNotLoadedError extends Error {
  constructor() {
    super("ParentalControlsRegistry used before load()");
    this.name = "ParentalControlsNotLoadedError";
  }
}

export class UnknownParentalProfileError extends Error {
  readonly profileId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `parental profile "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownParentalProfileError";
    this.profileId = id;
    this.availableIds = availableIds;
  }
}

export class ParentalControlsRegistry {
  private _manifest: ParentalControlsManifest | null = null;
  private _byId = new Map<string, ParentalProfile>();

  constructor(manifest?: ParentalControlsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: ParentalControlsManifest): void {
    this._manifest = manifest;
    this._byId.clear();
    for (const p of manifest.profiles) this._byId.set(p.id, p);
  }

  loadFromJson(raw: unknown): void {
    this.load(ParentalControlsManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): ParentalControlsManifest {
    if (!this._manifest) throw new ParentalControlsNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  has(id: string): boolean {
    return this._byId.has(id);
  }

  profile(id: string): ParentalProfile {
    const p = this._byId.get(id);
    if (!p) {
      throw new UnknownParentalProfileError(id, Array.from(this._byId.keys()));
    }
    return p;
  }

  /**
   * Resolve a profile for a player's account age in years.
   * Returns the *highest-priority* matching profile.
   * If `accountAgeYears` is `null` (unknown), uses the manifest's
   * `unknownAgeFallbackProfileId`.
   * Returns `undefined` if nothing matches.
   */
  profileForAge(accountAgeYears: number | null): ParentalProfile | undefined {
    if (accountAgeYears === null) {
      const fallbackId = this.manifest.unknownAgeFallbackProfileId;
      if (!fallbackId) return undefined;
      return this._byId.get(fallbackId);
    }
    const matches = this.manifest.profiles.filter((p) => {
      if (accountAgeYears < p.minAccountAgeYears) return false;
      if (
        p.maxAccountAgeYearsExclusive !== 0 &&
        accountAgeYears >= p.maxAccountAgeYearsExclusive
      ) {
        return false;
      }
      return true;
    });
    if (matches.length === 0) return undefined;
    // Highest priority wins; ties broken by higher minAccountAgeYears,
    // then by id for full determinism.
    matches.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.minAccountAgeYears !== b.minAccountAgeYears) {
        return b.minAccountAgeYears - a.minAccountAgeYears;
      }
      return a.id.localeCompare(b.id);
    });
    return matches[0];
  }

  canUseChatScope(profileId: string, scope: ChatScope): boolean {
    const p = this.profile(profileId);
    return p.communication.allowedChatScopes.includes(scope);
  }

  canUseVoiceMode(profileId: string, mode: AllowedVoiceMode): boolean {
    const p = this.profile(profileId);
    if (!p.communication.allowVoiceChat) return false;
    return p.communication.allowedVoiceModes.includes(mode);
  }

  /** True if a purchase of `amountMinorUnit` is allowed per single-txn cap. */
  canAffordSingleTransaction(
    profileId: string,
    amountMinorUnit: number,
  ): boolean {
    const p = this.profile(profileId);
    if (!p.spend.allowPurchases) return false;
    const cap = p.spend.maxSingleTransactionMinorUnit;
    if (cap === 0) return true;
    return amountMinorUnit <= cap;
  }
}
