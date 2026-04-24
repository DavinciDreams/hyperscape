/**
 * Fast-travel manifest schema.
 *
 * Authored registry for the teleport-node graph — flight paths,
 * portal stones, hearthstones, wormholes, teleport spells. Models
 * fast travel as a directed graph of nodes (discrete start/end
 * points) connected by edges (directed routes with travel-time +
 * cost). Supports the full MMO fast-travel spectrum:
 *
 *   WoW flight-path network  → bidirectional edges + path asset
 *   EVE star-gate graph      → one-way jumps with fuel cost
 *   FF14 Aethernet           → hub-and-spoke bidirectional
 *   Hearthstone              → single-node edge-less teleport
 *   RS spellbook teleports   → edge-less + spell-binding node
 *
 * Scope: authored node + edge registry + global rules. Runtime
 * `FastTravelSystem` owns per-character discovered-node set, active
 * cooldowns, cost settlement, travel animation/cutscene playback,
 * and the world-map travel UI — all separate follow-ups.
 *
 * Scope-isolated from `level-streaming.ts` (sublevel loading
 * happens through the engine when the destination falls in another
 * sublevel), `camera-profiles.ts` (travel uses whatever camera
 * mode the active rig defines — no travel-specific camera here),
 * and `respawn.ts` (hearthstones may share bind semantics but live
 * separately — a bind point and a travel node are distinct entities).
 */

import { z } from "zod";

/** FastTravelNodeId — lowerCamelCase ASCII identifier. */
const FastTravelNodeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "fast-travel node id must be lowerCamelCase ASCII identifier",
  );

/** FastTravelEdgeId — lowerCamelCase ASCII identifier. */
const FastTravelEdgeId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "fast-travel edge id must be lowerCamelCase ASCII identifier",
  );

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** 3D world-space position. */
const Vec3Schema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/**
 * Node kind — what kind of travel-infrastructure this node represents.
 */
export const FastTravelNodeKindSchema = z.enum([
  "flightMaster",
  "portalStone",
  "hearthBindPoint",
  "wormhole",
  "teleportAnchor",
  "mountBoard",
  "custom",
]);
export type FastTravelNodeKind = z.infer<typeof FastTravelNodeKindSchema>;

/**
 * Edge travel kind — how travel along this edge feels.
 */
export const FastTravelEdgeKindSchema = z.enum([
  "flightAnimated",
  "instantTeleport",
  "fadedCutscene",
  "loadingScreen",
  "vehicleControlled",
]);
export type FastTravelEdgeKind = z.infer<typeof FastTravelEdgeKindSchema>;

/**
 * Edge directionality — bidirectional or one-way.
 */
export const FastTravelEdgeDirectionSchema = z.enum([
  "bidirectional",
  "oneWayForward",
]);
export type FastTravelEdgeDirection = z.infer<
  typeof FastTravelEdgeDirectionSchema
>;

/**
 * Unlock condition — how a node becomes available to a character.
 */
export const FastTravelUnlockSchema = z
  .object({
    /** If true, the character must physically visit to discover. */
    requiresVisit: z.boolean().default(true),
    /**
     * Shape-only quest ref — if non-empty, quest must be complete.
     * Loader resolves against quests.ts.
     */
    requiresQuestId: ManifestRef.or(z.literal("")).default(""),
    /**
     * Shape-only achievement ref — if non-empty, achievement must be earned.
     */
    requiresAchievementId: ManifestRef.or(z.literal("")).default(""),
    /** Minimum character level (0 = no gate). */
    minCharacterLevel: z.number().int().min(0).max(200).default(0),
    /** Shape-only reputation gate — empty = no gate. */
    requiresReputation: z
      .object({
        factionId: ManifestRef.or(z.literal("")).default(""),
        minStanding: z.number().int().min(-100000).max(100000).default(0),
      })
      .strict()
      .default(() => ({ factionId: "", minStanding: 0 })),
  })
  .strict();
export type FastTravelUnlock = z.infer<typeof FastTravelUnlockSchema>;

/**
 * Fast-travel node — a discrete travel endpoint in the world.
 */
export const FastTravelNodeSchema = z
  .object({
    id: FastTravelNodeId,
    name: z.string().min(1),
    description: z.string().default(""),
    iconId: z.string().default(""),
    kind: FastTravelNodeKindSchema,
    /** Custom kind key — required when `kind='custom'`. */
    customKey: z.string().default(""),
    /** Shape-only zone ref. */
    zoneId: ManifestRef,
    /** World-space position. */
    position: Vec3Schema,
    /** Continent / region tag for world-map grouping. */
    continentTag: z.string().default(""),
    unlock: FastTravelUnlockSchema.default(() =>
      FastTravelUnlockSchema.parse({}),
    ),
    /** If true, opposing-faction characters can still use this node. */
    neutralToAllFactions: z.boolean().default(false),
    /** Faction id allow list (empty = any). Ignored if neutral. */
    factionAllowList: z.array(ManifestRef).default([]),
    /** Personal cooldown in seconds after using (0 = no per-node cooldown). */
    perUseCooldownSec: z.number().int().min(0).max(86400).default(0),
    /** Flat use cost in currency (0 = free; edges may override). */
    useCostCurrency: z.number().int().min(0).max(1_000_000).default(0),
    useCostCurrencyId: ManifestRef.default("gold"),
    /** If true, the node broadcasts discovery to party members in range. */
    shareDiscoveryWithParty: z.boolean().default(false),
    /** XP granted on first discovery (0 = none). */
    discoveryXpReward: z.number().int().min(0).max(100_000).default(0),
  })
  .strict()
  .refine(({ kind, customKey }) => kind !== "custom" || customKey.length > 0, {
    message: "node kind='custom' requires a non-empty customKey",
  });
export type FastTravelNode = z.infer<typeof FastTravelNodeSchema>;

/**
 * Fast-travel edge — a route between two nodes.
 */
export const FastTravelEdgeSchema = z
  .object({
    id: FastTravelEdgeId,
    fromNodeId: FastTravelNodeId,
    toNodeId: FastTravelNodeId,
    kind: FastTravelEdgeKindSchema,
    direction: FastTravelEdgeDirectionSchema.default("bidirectional"),
    /** Travel time in seconds (0 = instant). */
    travelTimeSec: z.number().int().min(0).max(600).default(0),
    /**
     * Currency cost to travel this edge. If >0, overrides node.useCostCurrency.
     * 0 = fall back to node.useCostCurrency.
     */
    travelCostCurrency: z.number().int().min(0).max(1_000_000).default(0),
    /**
     * Shape-only path asset (e.g. pre-authored camera spline). Loader
     * resolves against the path registry for animated travel. Empty = no
     * animated path (only valid for instantTeleport / loadingScreen kinds).
     */
    pathAssetRef: ManifestRef.or(z.literal("")).default(""),
    /** Faction allow list (empty = any). */
    factionAllowList: z.array(ManifestRef).default([]),
    /** If true, edge is only active when `globalState` flag is set. */
    requiresWorldStateFlag: z.string().default(""),
  })
  .strict()
  .refine(({ fromNodeId, toNodeId }) => fromNodeId !== toNodeId, {
    message: "edge fromNodeId and toNodeId must differ (no self-loops)",
  })
  .refine(
    ({ kind, pathAssetRef }) =>
      (kind !== "flightAnimated" && kind !== "vehicleControlled") ||
      pathAssetRef !== "",
    {
      message:
        "edge kind='flightAnimated'|'vehicleControlled' requires pathAssetRef (animated routes need a pre-authored path)",
    },
  );
export type FastTravelEdge = z.infer<typeof FastTravelEdgeSchema>;

/**
 * Global fast-travel rules.
 */
export const FastTravelGlobalRulesSchema = z
  .object({
    /** If true, fast travel is usable anywhere; else blocked per-zone. */
    enabled: z.boolean().default(true),
    /** If true, fast travel is blocked while the character is in combat. */
    blockedInCombat: z.boolean().default(true),
    /** If true, fast travel is blocked while flagged for PvP. */
    blockedWhilePvPFlagged: z.boolean().default(false),
    /** If true, fast travel is blocked inside instanced content (dungeons/raids). */
    blockedInInstancedContent: z.boolean().default(true),
    /** Global cooldown (seconds) between any two fast-travel uses. */
    globalCooldownSec: z.number().int().min(0).max(3600).default(5),
    /** Cast/channel time in seconds before teleport resolves. */
    channelTimeSec: z.number().int().min(0).max(60).default(10),
    /** If true, taking damage during the channel cancels the teleport. */
    cancelChannelOnDamage: z.boolean().default(true),
    /** Max active hearthstone-style bindings per character (0..10). */
    maxHearthBindings: z.number().int().min(0).max(10).default(1),
    /** If true, party members can be summoned to the traveler's destination. */
    allowDestinationSummon: z.boolean().default(false),
  })
  .strict()
  .refine(
    ({ channelTimeSec, cancelChannelOnDamage }) =>
      channelTimeSec > 0 || !cancelChannelOnDamage,
    {
      message:
        "cancelChannelOnDamage=true requires channelTimeSec > 0 (no channel = no thing to cancel)",
    },
  );
export type FastTravelGlobalRules = z.infer<typeof FastTravelGlobalRulesSchema>;

export const FastTravelManifestSchema = z
  .object({
    global: FastTravelGlobalRulesSchema.default(() =>
      FastTravelGlobalRulesSchema.parse({}),
    ),
    nodes: z.array(FastTravelNodeSchema).default([]),
    edges: z.array(FastTravelEdgeSchema).default([]),
  })
  .strict()
  .refine(
    ({ nodes }) => new Set(nodes.map((n) => n.id)).size === nodes.length,
    { message: "fast-travel node ids must be unique" },
  )
  .refine(
    ({ edges }) => new Set(edges.map((e) => e.id)).size === edges.length,
    { message: "fast-travel edge ids must be unique" },
  )
  .refine(
    ({ nodes, edges }) => {
      const ids = new Set(nodes.map((n) => n.id));
      return edges.every((e) => ids.has(e.fromNodeId) && ids.has(e.toNodeId));
    },
    {
      message:
        "every edge.fromNodeId and edge.toNodeId must resolve to a node id in this manifest",
    },
  )
  .refine(
    ({ edges }) => {
      // Disallow exact-duplicate edges (same from/to/direction). A parallel
      // edge between the same pair of nodes usually indicates an authoring
      // mistake — if two routes truly exist (scenic vs express), the author
      // should differentiate by id but not by endpoint+direction duplication.
      const keys = edges.map(
        (e) => `${e.fromNodeId}->${e.toNodeId}:${e.direction}`,
      );
      return new Set(keys).size === keys.length;
    },
    {
      message:
        "duplicate edges with same (fromNodeId, toNodeId, direction) not allowed — differentiate by modeling a transitive path instead",
    },
  );
export type FastTravelManifest = z.infer<typeof FastTravelManifestSchema>;
