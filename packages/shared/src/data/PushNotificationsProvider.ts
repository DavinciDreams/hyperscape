/**
 * PushNotificationsProvider
 *
 * Singleton persistence layer for the authored push-notifications
 * manifest — delivery-channel registry (APNs/FCM/WebPush/email/
 * in-app) with credential-name refs (NEVER real secrets —
 * resolved via deploy-targets), notification-category registry
 * with channel fan-out + priority + quiet-hours respect,
 * quiet-hours window, consent gating, global rate cap, and
 * dedupe window. Wraps the `@hyperforge/manifest-schema`
 * `PushNotificationsManifestSchema` with null-when-unloaded
 * semantics.
 *
 * Schema enforces `enabled=true requires ≥1 channel` AND
 * `≥1 category`, so a `{enabled: false}` baseline keeps the
 * pipeline inert until live-ops authors entries. Runtime
 * PushNotificationsSystem not yet shipped.
 */

import {
  PushNotificationsManifestSchema,
  type PushNotificationsManifest,
} from "@hyperforge/manifest-schema";

class PushNotificationsProvider {
  private static _instance: PushNotificationsProvider | null = null;
  private _manifest: PushNotificationsManifest | null = null;

  public static getInstance(): PushNotificationsProvider {
    if (!PushNotificationsProvider._instance) {
      PushNotificationsProvider._instance = new PushNotificationsProvider();
    }
    return PushNotificationsProvider._instance;
  }

  public load(manifest: PushNotificationsManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): PushNotificationsManifest {
    const parsed = PushNotificationsManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: PushNotificationsManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): PushNotificationsManifest | null {
    return this._manifest;
  }
}

export { PushNotificationsProvider };
export const pushNotificationsProvider =
  PushNotificationsProvider.getInstance();
