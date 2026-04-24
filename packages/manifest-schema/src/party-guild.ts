/**
 * Party + guild manifest schema.
 *
 * Authored social/group rules — party size caps, loot distribution
 * policy, guild ranks + permissions, guild hall perks, alliance
 * rules. Scope is deliberately narrower than `chat-channels.ts`
 * which owns the *messaging layer*; this schema owns the *social
 * graph* players form.
 *
 * Substrate only — runtime party manager + guild registry are
 * separate follow-ups. Chat channel ids referenced here are
 * validated for *shape*, not resolved against `chat-channels.ts`
 * (that's the loader's job).
 */

import { z } from "zod";

/** lowerCamelCase ASCII id. */
const LowerCamelId = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/**
 * How item loot is distributed across party members on a kill /
 * chest open. `free-for-all` = first grab wins. `round-robin` =
 * runtime rotates pickup rights. `leader-chooses` = leader assigns.
 * `need-before-greed` = group rolls with opt-in "need" tier.
 */
export const PartyLootPolicySchema = z.enum([
  "free-for-all",
  "round-robin",
  "leader-chooses",
  "need-before-greed",
]);
export type PartyLootPolicy = z.infer<typeof PartyLootPolicySchema>;

/**
 * How experience / skill-gain is shared. `full-share` = every member
 * gets the full amount. `split` = divided equally. `proximity-share`
 * = must be within `xpShareRangeMeters`. `tag-only` = only the
 * member who landed the tag (damage) gets xp.
 */
export const PartyXpPolicySchema = z.enum([
  "full-share",
  "split",
  "proximity-share",
  "tag-only",
]);
export type PartyXpPolicy = z.infer<typeof PartyXpPolicySchema>;

export const PartyRulesSchema = z
  .object({
    /** Maximum simultaneous members in one party. */
    maxMembers: z.number().int().min(2).max(24).default(6),
    /** Loot distribution policy. */
    lootPolicy: PartyLootPolicySchema.default("round-robin"),
    /** XP / skill distribution policy. */
    xpPolicy: PartyXpPolicySchema.default("proximity-share"),
    /**
     * Only meaningful when `xpPolicy = proximity-share`. Range in
     * meters within which party members share XP on a kill.
     */
    xpShareRangeMeters: z.number().min(0).max(1000).default(50),
    /** Minutes of no activity before party auto-disbands. 0 = never. */
    idleAutoDisbandMinutes: z.number().int().min(0).max(1440).default(30),
    /** If true, party members see each other on the minimap. */
    showOnMinimap: z.boolean().default(true),
    /**
     * Chat channel id used for the party channel (references an id
     * authored in `chat-channels.ts`; only the *shape* is validated
     * here).
     */
    partyChannelId: LowerCamelId.default("party"),
  })
  .strict()
  .refine(
    ({ xpPolicy, xpShareRangeMeters }) =>
      xpPolicy !== "proximity-share" || xpShareRangeMeters > 0,
    {
      message:
        "`xpShareRangeMeters` must be > 0 when `xpPolicy = proximity-share`",
    },
  );
export type PartyRules = z.infer<typeof PartyRulesSchema>;

/**
 * Permissions a guild rank can hold. Deliberately coarse-grained —
 * fine-grained permission ids can live on guild hall upgrades
 * rather than polluting the rank surface.
 */
export const GuildPermissionSchema = z.enum([
  "invite-member",
  "kick-member",
  "promote-member",
  "demote-member",
  "edit-motd",
  "edit-description",
  "manage-bank-deposit",
  "manage-bank-withdraw",
  "manage-treasury",
  "start-war",
  "accept-alliance",
  "edit-rank-permissions",
  "disband-guild",
]);
export type GuildPermission = z.infer<typeof GuildPermissionSchema>;

/** One rank tier within a guild hierarchy. */
export const GuildRankSchema = z
  .object({
    id: LowerCamelId,
    name: z.string().min(1),
    description: z.string().default(""),
    /**
     * Hierarchical order — 0 = highest (guild master), higher = lower
     * rank. Used for promote/demote logic.
     */
    order: z.number().int().min(0).max(100),
    /** Set of permission ids this rank grants. */
    permissions: z.array(GuildPermissionSchema).default([]),
    /** Max number of members who can hold this rank; 0 = unlimited. */
    maxHolders: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();
export type GuildRank = z.infer<typeof GuildRankSchema>;

/**
 * Guild hall perks — persistent buffs / features a guild unlocks by
 * reaching a guild-level threshold. Referenced by id from other
 * systems (e.g. banking provides storage tabs keyed by perkId).
 */
export const GuildPerkSchema = z
  .object({
    id: LowerCamelId,
    name: z.string().min(1),
    description: z.string().default(""),
    /** Minimum guild level required to unlock. */
    requiredLevel: z.number().int().min(1).max(100),
    /**
     * Free-form perk kind so new perks can land without schema churn —
     * the runtime binds by `kind`.
     */
    kind: z.enum([
      "bank-tab",
      "xp-buff",
      "gold-buff",
      "rest-xp",
      "mount-speed",
      "custom",
    ]),
    /** Numeric payload — interpreted per-kind (buff %, tab count, etc.). */
    value: z.number().min(0).max(10_000).default(0),
    /** For `kind: custom`, the opaque key the runtime resolves. */
    customKey: z.string().default(""),
  })
  .strict()
  .refine(
    ({ kind, customKey }) =>
      kind === "custom" ? customKey.length > 0 : customKey.length === 0,
    {
      message:
        "`customKey` required iff `kind: custom` (other kinds must leave it empty)",
    },
  );
export type GuildPerk = z.infer<typeof GuildPerkSchema>;

/** Guild-level rules — caps, leveling, alliance policy. */
export const GuildRulesSchema = z
  .object({
    /** Max members across all ranks. */
    maxMembers: z.number().int().min(2).max(10_000).default(200),
    /** Maximum guild level (controls perk progression). */
    maxLevel: z.number().int().min(1).max(100).default(30),
    /** XP required to advance one guild level — scales linearly * level. */
    xpPerLevel: z.number().int().min(1).max(10_000_000).default(10_000),
    /**
     * Min characters in a proposed guild name, case-insensitive. Runtime
     * may apply further filters.
     */
    minNameLength: z.number().int().min(1).max(64).default(3),
    /** Max characters in a guild name. */
    maxNameLength: z.number().int().min(1).max(64).default(24),
    /** Whether two guilds can form an alliance. */
    alliancesEnabled: z.boolean().default(true),
    /** Max simultaneous allies per guild. 0 = unlimited. */
    maxAllies: z.number().int().min(0).max(100).default(3),
    /** Whether guilds may declare war on one another. */
    guildWarsEnabled: z.boolean().default(false),
    /**
     * Cooldown (hours) between leaving a guild and joining another.
     * Deters hop-abuse for PvP bracket / reward exploits.
     */
    rejoinCooldownHours: z.number().min(0).max(720).default(24),
  })
  .strict()
  .refine(
    ({ minNameLength, maxNameLength }) => minNameLength <= maxNameLength,
    {
      message: "`minNameLength` must be <= `maxNameLength`",
    },
  );
export type GuildRules = z.infer<typeof GuildRulesSchema>;

/**
 * Top-level manifest: party rules + guild rules + authored rank
 * hierarchy + unlockable perks. Refinements enforce DAG-clean rank
 * ordering and unique ids.
 */
export const PartyGuildManifestSchema = z
  .object({
    party: PartyRulesSchema.default({
      maxMembers: 6,
      lootPolicy: "round-robin",
      xpPolicy: "proximity-share",
      xpShareRangeMeters: 50,
      idleAutoDisbandMinutes: 30,
      showOnMinimap: true,
      partyChannelId: "party",
    }),
    guild: GuildRulesSchema.default({
      maxMembers: 200,
      maxLevel: 30,
      xpPerLevel: 10_000,
      minNameLength: 3,
      maxNameLength: 24,
      alliancesEnabled: true,
      maxAllies: 3,
      guildWarsEnabled: false,
      rejoinCooldownHours: 24,
    }),
    ranks: z.array(GuildRankSchema).min(1),
    perks: z.array(GuildPerkSchema).default([]),
    /**
     * Which rank id a newly-invited member defaults to. Must exist
     * in `ranks`. Refined at manifest level.
     */
    defaultRankId: LowerCamelId,
    /** Which rank id is the guild leader. Must exist in `ranks`. */
    leaderRankId: LowerCamelId,
  })
  .strict()
  .refine(
    ({ ranks }) => new Set(ranks.map((r) => r.id)).size === ranks.length,
    { message: "guild rank ids must be unique" },
  )
  .refine(
    ({ ranks }) => new Set(ranks.map((r) => r.order)).size === ranks.length,
    { message: "guild rank `order` values must be unique" },
  )
  .refine(
    ({ perks }) => new Set(perks.map((p) => p.id)).size === perks.length,
    { message: "guild perk ids must be unique" },
  )
  .refine(
    ({ ranks, defaultRankId }) => ranks.some((r) => r.id === defaultRankId),
    { message: "`defaultRankId` must reference a declared rank" },
  )
  .refine(
    ({ ranks, leaderRankId }) => ranks.some((r) => r.id === leaderRankId),
    { message: "`leaderRankId` must reference a declared rank" },
  )
  .refine(
    ({ ranks, leaderRankId }) => {
      const leader = ranks.find((r) => r.id === leaderRankId);
      if (!leader) return true; // previous refinement will catch
      return ranks.every(
        (r) => r.id === leaderRankId || r.order > leader.order,
      );
    },
    {
      message:
        "the leader rank must have the lowest `order` value (0) of all ranks",
    },
  );
export type PartyGuildManifest = z.infer<typeof PartyGuildManifestSchema>;
