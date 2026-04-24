/**
 * VoiceChatProvider
 *
 * Singleton persistence layer for the authored voice-chat manifest —
 * named rooms (proximity/party/guild/raid/global/custom), transmission
 * modes (pushToTalk/openMic/voiceActivation), per-player mute defaults,
 * auto-mute gates, codec/bandwidth tuning, and voice-activation
 * thresholds. Wraps the `@hyperforge/manifest-schema`
 * `VoiceChatManifestSchema` with null-when-unloaded semantics. When
 * `enabled=true` the schema requires at least one room, so an empty
 * `{}` blob is schema-invalid; a `{enabled: false}` baseline fixture
 * keeps the pipeline disabled until author opts in.
 *
 * Runtime VoiceChatSystem (LiveKit wiring) is not yet shipped — this
 * provider only persists authored data for future consumption.
 */

import {
  VoiceChatManifestSchema,
  type VoiceChatManifest,
} from "@hyperforge/manifest-schema";

class VoiceChatProvider {
  private static _instance: VoiceChatProvider | null = null;
  private _manifest: VoiceChatManifest | null = null;

  public static getInstance(): VoiceChatProvider {
    if (!VoiceChatProvider._instance) {
      VoiceChatProvider._instance = new VoiceChatProvider();
    }
    return VoiceChatProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: VoiceChatManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): VoiceChatManifest {
    const parsed = VoiceChatManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: VoiceChatManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): VoiceChatManifest | null {
    return this._manifest;
  }
}

export { VoiceChatProvider };
export const voiceChatProvider = VoiceChatProvider.getInstance();
