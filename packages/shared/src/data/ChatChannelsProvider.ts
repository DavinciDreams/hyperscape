/**
 * ChatChannelsProvider
 *
 * Singleton persistence layer for the authored chat-channels
 * manifest — channel registry (global/zone/party/guild/whisper/
 * system/custom) with permission tiers + rate limits + filter
 * rule references. Feeds the Apr-20 runtime `ChatRouter` +
 * `ChatChannelRegistry` on world construction.
 *
 * Object-shaped manifest with a min-1-channel invariant:
 * `getManifest()` returns `null` when unloaded — ChatRouter must
 * `isLoaded()`-guard or fall back to built-in system defaults.
 */

import {
  ChatChannelsManifestSchema,
  type ChatChannelsManifest,
} from "@hyperforge/manifest-schema";

class ChatChannelsProvider {
  private static _instance: ChatChannelsProvider | null = null;
  private _manifest: ChatChannelsManifest | null = null;

  public static getInstance(): ChatChannelsProvider {
    if (!ChatChannelsProvider._instance) {
      ChatChannelsProvider._instance = new ChatChannelsProvider();
    }
    return ChatChannelsProvider._instance;
  }

  /** Install an already-validated manifest. */
  public load(manifest: ChatChannelsManifest): void {
    this._manifest = manifest;
  }

  /** Validate and install a raw JSON-parsed payload. */
  public loadRaw(raw: unknown): ChatChannelsManifest {
    const parsed = ChatChannelsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  /** Detach the authored manifest. `isLoaded()` becomes false. */
  public unload(): void {
    this._manifest = null;
  }

  /** Hot-reload entry point. `null` clears the authored manifest. */
  public hotReload(manifest: ChatChannelsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  /**
   * Full channel registry + filter rules, or `null` when unloaded.
   * The schema requires `channels.min(1)`, so there is no safe empty
   * default — ChatRouter must `isLoaded()`-guard.
   */
  public getManifest(): ChatChannelsManifest | null {
    return this._manifest;
  }
}

export { ChatChannelsProvider };
export const chatChannelsProvider = ChatChannelsProvider.getInstance();
