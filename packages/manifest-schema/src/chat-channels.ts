/**
 * Chat-channels manifest schema.
 *
 * Section 11 (missing systems → chat) of the World Studio AAA
 * plan. Declares named chat channels (global/zone/party/guild/
 * whisper/system), their scope, rate limits, tab defaults, and
 * server-side word-filter rules.
 *
 * Scope: authored channel registry. Runtime chat system enforces
 * the rules; this schema describes only the authored surface.
 */

import { z } from "zod";

/** ChannelId — lowerCamelCase ASCII identifier. */
const ChannelId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "chat channel id must be lowerCamelCase ASCII identifier",
  );

/** Which players can see the channel. */
export const ChatChannelScopeSchema = z.enum([
  "global",
  "zone",
  "party",
  "guild",
  "whisper",
  "system",
  "custom",
]);
export type ChatChannelScope = z.infer<typeof ChatChannelScopeSchema>;

/** Permission tier required to post. */
export const ChatPostPermissionSchema = z.enum([
  "anyone",
  "verified-email",
  "moderator",
  "admin",
  "system-only",
]);
export type ChatPostPermission = z.infer<typeof ChatPostPermissionSchema>;

/** A word-filter rule applied to messages. */
export const ChatFilterRuleSchema = z
  .object({
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "filter rule id must be lowerCamelCase ASCII identifier",
      ),
    /** Regex pattern (not compiled here — server compiles with safe flags). */
    pattern: z.string().min(1),
    /** What the filter does on match. */
    action: z.enum(["block", "censor", "warn", "flag"]),
    /** Severity — 0..10; 10 forwards to mod review. */
    severity: z.number().int().min(0).max(10).default(1),
  })
  .strict();
export type ChatFilterRule = z.infer<typeof ChatFilterRuleSchema>;

export const ChatChannelSchema = z
  .object({
    id: ChannelId,
    name: z.string().min(1),
    description: z.string().default(""),
    scope: ChatChannelScopeSchema,
    postPermission: ChatPostPermissionSchema.default("anyone"),
    /** UI color — hex `#rrggbb` for channel label + default message color. */
    color: z
      .string()
      .regex(
        /^#[0-9a-fA-F]{6}$/,
        "color must be a 7-char hex string like `#00aaff`",
      ),
    /** If true the channel is shown in the default tab layout. */
    defaultVisible: z.boolean().default(true),
    /** Max messages per minute per player; 0 = no limit. */
    rateLimitPerMinute: z.number().int().min(0).max(600).default(60),
    /** Max character length per message. */
    maxMessageLength: z.number().int().min(1).max(8192).default(500),
    /** Cooldown between successive messages from one player (seconds). */
    cooldownSec: z.number().min(0).max(60).default(0),
    /** Number of messages retained in history buffer. */
    historySize: z.number().int().min(0).max(5000).default(200),
    /** Filter rule ids applied to this channel. */
    filterRuleIds: z.array(z.string().min(1)).default([]),
    /** Custom scope key — required when scope = "custom", forbidden otherwise. */
    customScopeKey: z.string().default(""),
  })
  .strict()
  .refine(
    ({ scope, customScopeKey }) =>
      scope === "custom"
        ? customScopeKey.length > 0
        : customScopeKey.length === 0,
    {
      message:
        "`custom` scope requires `customScopeKey`; other scopes must leave it empty",
    },
  );
export type ChatChannel = z.infer<typeof ChatChannelSchema>;

export const ChatChannelsManifestSchema = z
  .object({
    channels: z.array(ChatChannelSchema).min(1),
    filterRules: z.array(ChatFilterRuleSchema).default([]),
  })
  .refine(
    ({ channels }) =>
      new Set(channels.map((c) => c.id)).size === channels.length,
    { message: "chat channel ids must be unique" },
  )
  .refine(
    ({ filterRules }) =>
      new Set(filterRules.map((r) => r.id)).size === filterRules.length,
    { message: "chat filter rule ids must be unique" },
  )
  .refine(
    ({ channels, filterRules }) => {
      const ids = new Set(filterRules.map((r) => r.id));
      return channels.every((c) => c.filterRuleIds.every((id) => ids.has(id)));
    },
    {
      message:
        "every channel `filterRuleIds` entry must reference a declared filter rule",
    },
  )
  .refine(
    ({ channels }) => {
      // Within one scope tier, channel ids must be unique — same scope +
      // same id would make routing ambiguous. (Enforced by the id-unique
      // refinement above, but also guard that `system` scope has at most
      // one channel that acts as the default system broadcaster by
      // requiring distinct (scope, defaultVisible=true) combos for system.)
      const systemVisible = channels.filter(
        (c) => c.scope === "system" && c.defaultVisible,
      );
      return systemVisible.length <= 1;
    },
    {
      message:
        "at most one `system`-scope channel may be `defaultVisible: true` (the primary broadcaster)",
    },
  );
export type ChatChannelsManifest = z.infer<typeof ChatChannelsManifestSchema>;
