/**
 * Push-notifications manifest schema.
 *
 * Authored policy for mobile/web push notifications: notification
 * channels (APNs/FCM/web-push/email), per-category enablement,
 * quiet hours, delivery windows, opt-in gating, and consent doc
 * linkage. Runtime `PushNotificationsSystem` owns token registration,
 * payload fan-out, and per-platform delivery adaptors.
 *
 * Scope-isolated from:
 *   - `news-feed.ts` (in-game feed items — push is the *delivery*
 *     channel; a news entry may trigger a push, but push channels
 *     live here)
 *   - `license-agreements.ts` (consent doc referenced by id)
 *   - `parental-controls.ts` (per-profile opt-outs land in comms rules)
 *   - `chat-channels.ts` (text chat — whispers triggering push is a
 *     category in this schema)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** ChannelId — lowerCamelCase. */
const ChannelId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "channel id must be lowerCamelCase ASCII identifier",
  );

/** CategoryId — lowerCamelCase. */
const CategoryId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "category id must be lowerCamelCase ASCII identifier",
  );

/** HH:MM 24-hour regex (00:00..23:59). */
const Hhmm = z
  .string()
  .regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "time must be HH:MM 24-hour (00:00..23:59)",
  );

/** Delivery transport — what pipeline moves the payload. */
export const DeliveryTransportSchema = z.enum([
  "apns",
  "fcm",
  "webPush",
  "email",
  "inApp",
]);
export type DeliveryTransport = z.infer<typeof DeliveryTransportSchema>;

/** Priority — maps to platform-native priority hint. */
export const PushPrioritySchema = z.enum(["critical", "high", "normal", "low"]);
export type PushPriority = z.infer<typeof PushPrioritySchema>;

/**
 * A named delivery channel — one physical pipeline (APNs production,
 * FCM android, web-push VAPID, transactional email). The manifest
 * points at a deploy-target entry by *name* for credentials; the
 * actual secret lives outside the schema.
 */
export const DeliveryChannelSchema = z
  .object({
    id: ChannelId,
    name: z.string().min(1),
    transport: DeliveryTransportSchema,
    /** Deploy-target name that resolves real credentials at runtime. */
    credentialsNameRef: z.string().default(""),
    /** Max messages per hour this channel will emit (0=unlimited). */
    maxMessagesPerHour: z.number().int().min(0).max(1_000_000).default(0),
    /** Drop messages older than this many seconds. */
    maxAgeSec: z.number().int().min(0).max(86400).default(3600),
    /** Enable this channel. */
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine((c) => c.transport === "inApp" || c.credentialsNameRef.length > 0, {
    message:
      "non-inApp transports require credentialsNameRef to a deploy-target",
    path: ["credentialsNameRef"],
  });
export type DeliveryChannel = z.infer<typeof DeliveryChannelSchema>;

/**
 * Category — a player-facing toggle group (e.g. "Whispers",
 * "Guild Announcements", "Daily Reward Ready", "Maintenance").
 * Each category may fan out to one or more delivery channels.
 */
export const NotificationCategorySchema = z
  .object({
    id: CategoryId,
    titleLocalizationKey: z.string().min(1),
    descriptionLocalizationKey: z.string().default(""),
    /** Player-visible; if false, category can't be toggled in UI. */
    playerToggleable: z.boolean().default(true),
    /** Default opt-in state on first install. */
    defaultEnabled: z.boolean().default(true),
    /** Priority assigned to messages in this category. */
    priority: PushPrioritySchema.default("normal"),
    /** Channel ids this category fans out to. */
    channelIds: z.array(ChannelId).min(1),
    /** Obey quiet-hours — if false, critical-always. */
    respectQuietHours: z.boolean().default(true),
    /** Collapse key — newer messages replace older of same key. */
    collapseKey: z.string().default(""),
  })
  .strict()
  .refine((c) => new Set(c.channelIds).size === c.channelIds.length, {
    message: "channelIds must be unique per category",
    path: ["channelIds"],
  });
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

/**
 * Quiet-hours window — local time range during which messages
 * (except "critical" category + ignore-quiet-hours flag) are held.
 */
export const QuietHoursRulesSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** Default local-time quiet window start (HH:MM). */
    defaultStartLocal: Hhmm.default("22:00"),
    /** Default local-time quiet window end (HH:MM). */
    defaultEndLocal: Hhmm.default("08:00"),
    /** Critical-priority messages always deliver, ignoring quiet hours. */
    criticalAlwaysDelivers: z.boolean().default(true),
    /** Allow players to override the window. */
    allowUserOverride: z.boolean().default(true),
  })
  .strict();
export type QuietHoursRules = z.infer<typeof QuietHoursRulesSchema>;

/** Consent gating (mirrors crash-reporter pattern). */
export const PushConsentGatingSchema = z
  .object({
    /** Require explicit opt-in at first prompt. */
    requireOptIn: z.boolean().default(true),
    /** Consent doc required before registering a device token. */
    requiresLicenseDocRef: ManifestRef.optional(),
    /** Offer a one-tap "opt me out of everything" toggle. */
    allowGlobalOptOut: z.boolean().default(true),
  })
  .strict();
export type PushConsentGating = z.infer<typeof PushConsentGatingSchema>;

/**
 * Push-notifications manifest — top-level authored document.
 */
export const PushNotificationsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    channels: z.array(DeliveryChannelSchema).default([]),
    categories: z.array(NotificationCategorySchema).default([]),
    quietHours: QuietHoursRulesSchema.default(() =>
      QuietHoursRulesSchema.parse({}),
    ),
    consent: PushConsentGatingSchema.default(() =>
      PushConsentGatingSchema.parse({}),
    ),
    /** Global caps across all channels. 0 = unlimited. */
    globalMaxMessagesPerHour: z
      .number()
      .int()
      .min(0)
      .max(10_000_000)
      .default(0),
    /** Drop duplicates with same payload+userId within N seconds. */
    deduplicateWindowSec: z.number().int().min(0).max(3600).default(30),
  })
  .strict()
  .refine(
    (m) => new Set(m.channels.map((c) => c.id)).size === m.channels.length,
    { message: "channel ids must be unique", path: ["channels"] },
  )
  .refine(
    (m) => new Set(m.categories.map((c) => c.id)).size === m.categories.length,
    { message: "category ids must be unique", path: ["categories"] },
  )
  .refine(
    (m) => {
      const cids = new Set(m.channels.map((c) => c.id));
      return m.categories.every((cat) =>
        cat.channelIds.every((chid) => cids.has(chid)),
      );
    },
    {
      message: "category.channelIds must resolve to declared channels",
      path: ["categories"],
    },
  )
  .refine(
    (m) =>
      new Set(m.channels.map((c) => c.transport)).size === m.channels.length ||
      m.channels.length === 0 ||
      // Duplicate transports allowed only if at most one is enabled.
      (() => {
        const byT = new Map<string, number>();
        for (const c of m.channels) {
          if (!c.enabled) continue;
          byT.set(c.transport, (byT.get(c.transport) ?? 0) + 1);
        }
        for (const [, n] of byT) if (n > 1) return false;
        return true;
      })(),
    {
      message: "at most one enabled channel per transport",
      path: ["channels"],
    },
  )
  .refine((m) => !m.enabled || m.channels.length >= 1, {
    message: "push-notifications enabled=true requires at least one channel",
    path: ["channels"],
  })
  .refine((m) => !m.enabled || m.categories.length >= 1, {
    message: "push-notifications enabled=true requires at least one category",
    path: ["categories"],
  });
export type PushNotificationsManifest = z.infer<
  typeof PushNotificationsManifestSchema
>;
