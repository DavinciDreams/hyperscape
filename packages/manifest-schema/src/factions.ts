/**
 * Factions manifest schema.
 *
 * Authored registry of factions — cities, guilds, racial alignments,
 * criminal syndicates — and the pairwise relationships + reputation
 * tiers that drive vendor pricing, quest availability, NPC hostility,
 * and guard-response behavior.
 *
 * Scope: authored registry. Runtime `FactionSystem` stores per-player
 * standing, applies kill/quest/discovery deltas, fires threshold-crossed
 * events, and dispatches hostility decisions — all separate follow-ups.
 *
 * Scope-isolated from `npcs.ts` (individual NPC factionId is a
 * shape-only reference), `party-guild.ts` (player-organized groups with
 * ranks), and `quests.ts` (quest rewards cite factionId shape-only).
 */

import { z } from "zod";

/** FactionId — lowerCamelCase ASCII identifier. */
const FactionId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "faction id must be lowerCamelCase ASCII identifier",
  );

/** ReputationTierId — lowerCamelCase. */
const ReputationTierId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "reputation tier id must be lowerCamelCase ASCII identifier",
  );

/**
 * Disposition — pairwise relationship between two factions.
 * `allied` NPCs assist each other; `hostile` NPCs attack on sight;
 * `at-war` escalates to city-wide guard response; `neutral` is default.
 */
export const FactionDispositionSchema = z.enum([
  "allied",
  "friendly",
  "neutral",
  "unfriendly",
  "hostile",
  "at-war",
]);
export type FactionDisposition = z.infer<typeof FactionDispositionSchema>;

/**
 * Reputation tier — named bands within a faction's rep scale.
 * `minStanding` / `maxStanding` bracket an absolute numeric range.
 * Authored tiers must tile the [min, max] window without gap or overlap
 * — refinement below enforces.
 */
export const ReputationTierSchema = z
  .object({
    id: ReputationTierId,
    name: z.string().min(1),
    /** Inclusive floor. */
    minStanding: z.number().int().min(-1_000_000).max(1_000_000),
    /** Exclusive ceiling (next tier's minStanding). */
    maxStanding: z.number().int().min(-1_000_000).max(1_000_000),
    /** Vendor price multiplier at this tier (0 = closed, 1 = list price). */
    vendorPriceMultiplier: z.number().min(0).max(10).default(1),
    /** If true, NPCs of this faction become hostile at this tier. */
    npcsAttackOnSight: z.boolean().default(false),
    /** If true, faction quests become available. */
    questsUnlocked: z.boolean().default(false),
    /** If true, faction shop becomes available. */
    shopUnlocked: z.boolean().default(false),
  })
  .strict()
  .refine(({ minStanding, maxStanding }) => minStanding < maxStanding, {
    message: "reputation tier minStanding must be < maxStanding",
  });
export type ReputationTier = z.infer<typeof ReputationTierSchema>;

/**
 * Pairwise relationship override. Factions default to `neutral` with
 * each other unless an entry exists in `relationships[]`. `a` !== `b`
 * and each unordered pair appears at most once (refinement below).
 */
export const FactionRelationshipSchema = z
  .object({
    a: FactionId,
    b: FactionId,
    disposition: FactionDispositionSchema,
    /** If true, rep gains with `a` cause rep losses with `b` (and vice versa). */
    mutuallyExclusiveRep: z.boolean().default(false),
  })
  .strict()
  .refine(({ a, b }) => a !== b, {
    message: "faction relationship a and b must be different factions",
  });
export type FactionRelationship = z.infer<typeof FactionRelationshipSchema>;

export const FactionSchema = z
  .object({
    id: FactionId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    /** Starting reputation granted to a new character. */
    startingStanding: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .default(0),
    /**
     * Reputation tiers — must tile the faction's standing window with
     * no gap and no overlap. Entries are sorted by minStanding on parse.
     */
    tiers: z.array(ReputationTierSchema).min(1),
    /**
     * Optional player-facing color (#rrggbb) used for UI badges.
     * Empty string = renderer picks a default.
     */
    color: z
      .string()
      .regex(/^(#[0-9a-fA-F]{6})?$/, "color must be `#rrggbb` or empty string")
      .default(""),
    /** If true, this faction is selectable at character creation. */
    playerJoinable: z.boolean().default(false),
    /** If true, rep with this faction is hidden from the player HUD. */
    hidden: z.boolean().default(false),
  })
  .strict()
  .refine(
    ({ tiers }) => new Set(tiers.map((t) => t.id)).size === tiers.length,
    { message: "reputation tier ids must be unique within a faction" },
  )
  .refine(
    ({ tiers }) => {
      // Tiers must tile the combined standing window — sort by
      // minStanding, then check each tier's maxStanding === next tier's
      // minStanding.
      const sorted = [...tiers].sort((a, b) => a.minStanding - b.minStanding);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        if (sorted[i].maxStanding !== sorted[i + 1].minStanding) return false;
      }
      return true;
    },
    {
      message:
        "reputation tiers must tile the standing window with no gap or overlap (each tier.maxStanding must equal the next tier.minStanding)",
    },
  )
  .refine(
    ({ tiers, startingStanding }) =>
      tiers.some(
        (t) =>
          startingStanding >= t.minStanding && startingStanding < t.maxStanding,
      ),
    {
      message:
        "startingStanding must fall within one of the faction's reputation tiers",
    },
  );
export type Faction = z.infer<typeof FactionSchema>;

export const FactionsManifestSchema = z
  .object({
    factions: z.array(FactionSchema).min(1),
    relationships: z.array(FactionRelationshipSchema).default([]),
  })
  .strict()
  .refine(
    ({ factions }) =>
      new Set(factions.map((f) => f.id)).size === factions.length,
    { message: "faction ids must be unique" },
  )
  .refine(
    ({ factions, relationships }) => {
      const ids = new Set(factions.map((f) => f.id));
      return relationships.every((r) => ids.has(r.a) && ids.has(r.b));
    },
    { message: "relationship refers to a faction id that does not exist" },
  )
  .refine(
    ({ relationships }) => {
      // Each unordered (a,b) pair appears at most once.
      const seen = new Set<string>();
      for (const { a, b } of relationships) {
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    {
      message:
        "duplicate faction relationship — each unordered (a,b) pair may appear at most once",
    },
  );
export type FactionsManifest = z.infer<typeof FactionsManifestSchema>;
