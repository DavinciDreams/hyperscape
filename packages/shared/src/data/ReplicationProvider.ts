/**
 * ReplicationProvider
 *
 * Singleton persistence layer for the authored replication manifest
 * — declarative replicated fields + events so plugins can
 * participate in netcode without touching ServerNetwork. Authority
 * (server|client-owner|client-any), cadence (on-change|interval|
 * always|reliable-once), event direction + reliability + rate-limit.
 *
 * Refinements: unique component names + unique event ids across the
 * manifest.
 *
 * Baseline fixture is `{}` — empty components/events arrays.
 *
 * Runtime delta-replicator + codegen + authority enforcement
 * pending.
 */

import {
  ReplicationManifestSchema,
  type ReplicationManifest,
} from "@hyperforge/manifest-schema";

class ReplicationProvider {
  private static _instance: ReplicationProvider | null = null;
  private _manifest: ReplicationManifest | null = null;

  public static getInstance(): ReplicationProvider {
    if (!ReplicationProvider._instance) {
      ReplicationProvider._instance = new ReplicationProvider();
    }
    return ReplicationProvider._instance;
  }

  public load(manifest: ReplicationManifest): void {
    this._manifest = manifest;
  }

  public loadRaw(raw: unknown): ReplicationManifest {
    const parsed = ReplicationManifestSchema.parse(raw);
    this._manifest = parsed;
    return parsed;
  }

  public unload(): void {
    this._manifest = null;
  }

  public hotReload(manifest: ReplicationManifest | null): void {
    this._manifest = manifest;
  }

  public isLoaded(): boolean {
    return this._manifest !== null;
  }

  public getManifest(): ReplicationManifest | null {
    return this._manifest;
  }
}

export { ReplicationProvider };
export const replicationProvider = ReplicationProvider.getInstance();
