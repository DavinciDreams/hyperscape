/**
 * Push-notifications registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `push-notifications.ts`. Pure logic: channel/category lookup,
 * effective-channels resolution for a category (enabled-only), and
 * `isQuietAt(local HH:MM)` evaluation over wrap-around quiet windows.
 */

import {
  type DeliveryChannel,
  type DeliveryTransport,
  type NotificationCategory,
  type PushNotificationsManifest,
  PushNotificationsManifestSchema,
} from "@hyperforge/manifest-schema";

export class PushNotificationsNotLoadedError extends Error {
  constructor() {
    super("PushNotificationsRegistry used before load()");
    this.name = "PushNotificationsNotLoadedError";
  }
}

export class UnknownPushChannelError extends Error {
  readonly channelId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `push channel "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPushChannelError";
    this.channelId = id;
    this.availableIds = availableIds;
  }
}

export class UnknownPushCategoryError extends Error {
  readonly categoryId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `push category "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownPushCategoryError";
    this.categoryId = id;
    this.availableIds = availableIds;
  }
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return h * 60 + m;
}

/** Listener invoked after every successful `load()` / `loadFromJson()`. */
export type PushNotificationsReloadListener = () => void;

export class PushNotificationsRegistry {
  private _manifest: PushNotificationsManifest | null = null;
  private _channelById = new Map<string, DeliveryChannel>();
  private _categoryById = new Map<string, NotificationCategory>();
  private _reloadListeners = new Set<PushNotificationsReloadListener>();

  constructor(manifest?: PushNotificationsManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: PushNotificationsManifest): void {
    this._manifest = manifest;
    this._channelById.clear();
    this._categoryById.clear();
    for (const c of manifest.channels) this._channelById.set(c.id, c);
    for (const c of manifest.categories) this._categoryById.set(c.id, c);
    this._emitReloaded();
  }

  loadFromJson(raw: unknown): void {
    this.load(PushNotificationsManifestSchema.parse(raw));
  }

  /**
   * Subscribe to reload notifications. Returns unsubscribe.
   * Listener throws are caught + logged. Pattern matches
   * `SkillIconsRegistry.onReloaded`.
   */
  onReloaded(cb: PushNotificationsReloadListener): () => void {
    this._reloadListeners.add(cb);
    return () => {
      this._reloadListeners.delete(cb);
    };
  }

  private _emitReloaded(): void {
    if (this._reloadListeners.size === 0) return;
    for (const cb of this._reloadListeners) {
      try {
        cb();
      } catch (err) {
        console.warn(
          "[pushNotificationsRegistry] reload listener threw:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get manifest(): PushNotificationsManifest {
    if (!this._manifest) throw new PushNotificationsNotLoadedError();
    return this._manifest;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  channel(id: string): DeliveryChannel {
    const c = this._channelById.get(id);
    if (!c) {
      throw new UnknownPushChannelError(
        id,
        Array.from(this._channelById.keys()),
      );
    }
    return c;
  }

  category(id: string): NotificationCategory {
    const c = this._categoryById.get(id);
    if (!c) {
      throw new UnknownPushCategoryError(
        id,
        Array.from(this._categoryById.keys()),
      );
    }
    return c;
  }

  /** Channels bound to a category, filtered to enabled ones only. */
  channelsForCategory(categoryId: string): DeliveryChannel[] {
    const cat = this.category(categoryId);
    const out: DeliveryChannel[] = [];
    for (const chId of cat.channelIds) {
      const ch = this._channelById.get(chId);
      if (ch && ch.enabled) out.push(ch);
    }
    return out;
  }

  channelByTransport(
    transport: DeliveryTransport,
  ): DeliveryChannel | undefined {
    return this.manifest.channels.find(
      (c) => c.enabled && c.transport === transport,
    );
  }

  /**
   * Is a given local HH:MM inside the quiet-hours window?
   * Supports wrap-around windows (e.g. 22:00..08:00).
   * Returns `false` when quiet hours are disabled on the manifest.
   */
  isQuietAt(localHhmm: string): boolean {
    const qh = this.manifest.quietHours;
    if (!qh.enabled) return false;
    const now = hhmmToMinutes(localHhmm);
    const start = hhmmToMinutes(qh.defaultStartLocal);
    const end = hhmmToMinutes(qh.defaultEndLocal);
    if (start === end) return false;
    if (start < end) return now >= start && now < end;
    // Wrap-around.
    return now >= start || now < end;
  }

  /**
   * Would a message in the given category actually deliver at
   * `localHhmm`? Accounts for quiet hours + category's
   * `respectQuietHours` flag + `criticalAlwaysDelivers` fallback.
   */
  canDeliverAt(categoryId: string, localHhmm: string): boolean {
    const cat = this.category(categoryId);
    if (!cat.respectQuietHours) return true;
    if (!this.isQuietAt(localHhmm)) return true;
    // Inside quiet hours.
    return (
      this.manifest.quietHours.criticalAlwaysDelivers &&
      cat.priority === "critical"
    );
  }
}
