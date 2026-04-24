/**
 * Mail manifest schema.
 *
 * Authored rules for the in-game mail system — how players send
 * messages, attach items, attach currency, and how the system retains,
 * expires, and auto-returns mail. The schema captures the game-wide
 * mail policy; there is no "mail message" entity here — those are
 * runtime save-data (see `save-data.ts`).
 *
 * Scope: authored policy. Runtime `MailSystem` manages inbox state,
 * attachment escrow, CoD payment flow, expiration, and notification —
 * all separate follow-ups.
 *
 * Scope-isolated from `chat-channels.ts` (ephemeral real-time
 * messaging), `economy-tuning.ts` (market listing fees — though mail's
 * postageFee and codCommission are analogous), and `party-guild.ts`
 * (mail is 1:N player-player, not group-scoped).
 */

import { z } from "zod";

/**
 * Mail category — loosely enforced player-facing grouping. Authors
 * declare which categories exist; the UI renders tabs accordingly.
 */
export const MailCategorySchema = z.enum([
  "player",
  "auction",
  "system",
  "guild",
  "gmTeam",
]);
export type MailCategory = z.infer<typeof MailCategorySchema>;

/**
 * Mail attachment rules — per-mail limits on items and currency.
 */
export const MailAttachmentRulesSchema = z
  .object({
    /** Max item stacks attached per mail (0 = attachments disabled). */
    maxItemSlots: z.number().int().min(0).max(24).default(6),
    /** Max total weight/volume across all attachments (0 = no limit). */
    maxTotalWeight: z.number().min(0).max(10_000).default(0),
    /** Max currency amount attached (0 = no currency attachments). */
    maxCurrencyAmount: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .default(1_000_000),
    /** Currency id used for attachments + postage (resolved against `economy-tuning.ts`). */
    currencyId: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "currency id must be lowerCamelCase ASCII identifier",
      )
      .default("gold"),
    /** If true, soulbound items can be attached between the same account's characters. */
    allowSoulboundBetweenSameAccount: z.boolean().default(true),
    /** If true, quest items can be attached. Almost always false. */
    allowQuestItems: z.boolean().default(false),
  })
  .strict();
export type MailAttachmentRules = z.infer<typeof MailAttachmentRulesSchema>;

/**
 * Cash-on-delivery rules — the classic MMO auction-sniping feature
 * where a seller mails an item + demanded price, the buyer pays on
 * retrieval, the gold is returned to the sender.
 */
export const MailCodRulesSchema = z
  .object({
    enabled: z.boolean().default(true),
    /** Commission charged on CoD transactions (0..1). */
    commission: z.number().min(0).max(1).default(0.05),
    /** Maximum CoD price allowed. */
    maxCodAmount: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .default(10_000_000),
    /** If true, CoD mail cannot carry additional currency (only the CoD price). */
    disallowCurrencyAttachment: z.boolean().default(true),
  })
  .strict();
export type MailCodRules = z.infer<typeof MailCodRulesSchema>;

/**
 * Postage rules — flat and per-attachment fees charged at send time.
 */
export const MailPostageRulesSchema = z
  .object({
    /** Flat postage fee per mail. */
    flatFee: z.number().int().min(0).max(1_000_000).default(30),
    /** Additional fee per item attached. */
    perItemFee: z.number().int().min(0).max(1_000_000).default(0),
    /** Additional fee per currency attachment (flat, not proportional). */
    perCurrencyFee: z.number().int().min(0).max(1_000_000).default(0),
    /** If true, guild mail (category guild) bypasses postage. */
    freeGuildMail: z.boolean().default(true),
    /** If true, system mail (category system) bypasses postage. */
    freeSystemMail: z.boolean().default(true),
  })
  .strict();
export type MailPostageRules = z.infer<typeof MailPostageRulesSchema>;

/**
 * Retention rules — how long mail lives, when it auto-returns, when it
 * is permanently deleted.
 */
export const MailRetentionRulesSchema = z
  .object({
    /** Hours of inbox retention for read mail without attachments. */
    readNoAttachmentsRetentionHours: z
      .number()
      .int()
      .min(1)
      .max(8760)
      .default(72),
    /**
     * Hours of inbox retention for any mail with attachments (read or
     * unread). Attachments escrow behavior is separately governed.
     */
    withAttachmentsRetentionHours: z
      .number()
      .int()
      .min(1)
      .max(8760)
      .default(720),
    /** Hours before unread unclaimed mail auto-returns to sender. */
    unreadAutoReturnHours: z.number().int().min(1).max(8760).default(720),
    /**
     * Grace period in hours during which an auto-returned mail
     * attachment is still reclaimable by the original sender before it
     * enters permanent-deletion queue. 0 = no grace.
     */
    senderReclaimGraceHours: z.number().int().min(0).max(8760).default(720),
    /** Max inbox size per player. */
    maxInboxPerPlayer: z.number().int().min(1).max(10_000).default(100),
  })
  .strict()
  .refine(
    ({ readNoAttachmentsRetentionHours, withAttachmentsRetentionHours }) =>
      readNoAttachmentsRetentionHours <= withAttachmentsRetentionHours,
    {
      message:
        "readNoAttachmentsRetentionHours must be <= withAttachmentsRetentionHours (attachments cannot expire faster than empty mail)",
    },
  );
export type MailRetentionRules = z.infer<typeof MailRetentionRulesSchema>;

/**
 * Rate-limiting rules — anti-spam guards.
 */
export const MailRateLimitRulesSchema = z
  .object({
    /** Max mail sent per player per hour. */
    maxPerHour: z.number().int().min(1).max(1000).default(30),
    /** Max mail sent per player per day. */
    maxPerDay: z.number().int().min(1).max(10_000).default(200),
    /** Minimum seconds between sends from the same player. */
    minSendIntervalSec: z.number().min(0).max(3600).default(1),
    /**
     * Max recipients per mail (0 = single recipient only). Multi-cast
     * is typically reserved for GM/system mail.
     */
    maxRecipientsPerMail: z.number().int().min(1).max(500).default(1),
  })
  .strict()
  .refine(({ maxPerHour, maxPerDay }) => maxPerDay >= maxPerHour, {
    message: "maxPerDay must be >= maxPerHour (per-day is a superset cap)",
  });
export type MailRateLimitRules = z.infer<typeof MailRateLimitRulesSchema>;

/**
 * Root manifest — mail is a single policy blob, not an array of
 * entries. Different from most manifests but matches UE5 config
 * idioms (Project Settings style).
 */
export const MailManifestSchema = z
  .object({
    /** Globally enable/disable the mail system. */
    enabled: z.boolean().default(true),
    /** Which categories are active in this deployment. At least one required. */
    enabledCategories: z
      .array(MailCategorySchema)
      .min(1)
      .default(() => [
        "player" as const,
        "auction" as const,
        "system" as const,
      ]),
    attachments: MailAttachmentRulesSchema.default(() =>
      MailAttachmentRulesSchema.parse({}),
    ),
    cod: MailCodRulesSchema.default(() => MailCodRulesSchema.parse({})),
    postage: MailPostageRulesSchema.default(() =>
      MailPostageRulesSchema.parse({}),
    ),
    retention: MailRetentionRulesSchema.default(() =>
      MailRetentionRulesSchema.parse({}),
    ),
    rateLimit: MailRateLimitRulesSchema.default(() =>
      MailRateLimitRulesSchema.parse({}),
    ),
    /** Subject line max length. */
    maxSubjectLength: z.number().int().min(1).max(256).default(64),
    /** Body text max length. */
    maxBodyLength: z.number().int().min(1).max(65_536).default(2000),
    /** If true, players may block specific senders (per-recipient filter). */
    blockListEnabled: z.boolean().default(true),
    /** If true, GM-category mail bypasses block lists + retention policies. */
    gmMailBypassesAllLimits: z.boolean().default(true),
  })
  .strict()
  .refine(
    ({ enabledCategories }) =>
      new Set(enabledCategories).size === enabledCategories.length,
    { message: "enabledCategories must not contain duplicates" },
  )
  .refine(
    ({ cod, attachments }) =>
      cod.enabled ? attachments.maxItemSlots > 0 : true,
    {
      message:
        "CoD enabled requires attachments.maxItemSlots > 0 (CoD needs at least one item slot)",
    },
  );
export type MailManifest = z.infer<typeof MailManifestSchema>;
