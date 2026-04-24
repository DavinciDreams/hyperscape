/**
 * MailProvider
 *
 * Singleton persistence layer for the authored mail manifest —
 * a single policy blob (UE5-DefaultMail.ini style) with 5
 * category enum (player/auction/system/guild/gm) and 5 rule-
 * group sub-schemas (attachments/CoD/postage/retention/
 * rateLimit).
 *
 * Refinements: unique enabledCategories + CoD enabled requires
 * attachments.maxItemSlots > 0.
 *
 * Baseline `{"enabled": false}` keeps the pipeline inert until
 * the mail policy is authored.
 *
 * Runtime MailSystem not yet shipped.
 */

import {
  MailManifestSchema,
  type MailManifest,
} from "@hyperforge/manifest-schema";

class MailProvider {
  private static _instance: MailProvider | null = null;
  private _manifest: MailManifest | null = null;

  public static getInstance(): MailProvider {
    if (!MailProvider._instance) {
      MailProvider._instance = new MailProvider();
    }
    return MailProvider._instance;
  }

  public load(manifest: MailManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): MailManifest {
    const parsed = MailManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: MailManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): MailManifest | null {
    return this._manifest;
  }
}

export { MailProvider };
export const mailProvider = MailProvider.getInstance();
