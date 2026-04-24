/**
 * Level-streaming manifest schema.
 *
 * Section 15 (UE5 parity) of the World Studio AAA plan. Describes
 * how the world is partitioned into independently-streamable
 * sublevels. At runtime the streamer loads/unloads sublevels based
 * on trigger volumes — proximity spheres, AABBs, or author-
 * tagged regions.
 *
 * Sublevels are self-contained manifest bundles: they reference
 * entities, terrain tiles, and nav data that belong to that chunk.
 * The global world manifest declares *which* sublevels exist and
 * *how* they're streamed, but the sublevel *content* itself lives
 * elsewhere (file-per-sublevel, loaded on demand).
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/** Load policy — when is the sublevel eligible to stream in? */
export const StreamPolicySchema = z.enum([
  /** Always kept resident (boot-loaded, never unloaded). */
  "always-loaded",
  /** Loaded when any player enters the trigger volume. */
  "proximity",
  /** Loaded by a named script/event (quest stage, cutscene, etc.). */
  "on-demand",
  /** Resident on server, streamed per-client by relevancy. */
  "server-authoritative",
]);
export type StreamPolicy = z.infer<typeof StreamPolicySchema>;

/** Priority bucket — streamers should schedule higher-priority loads first. */
export const StreamPrioritySchema = z.enum([
  "critical",
  "high",
  "normal",
  "low",
  "background",
]);
export type StreamPriority = z.infer<typeof StreamPrioritySchema>;

/**
 * Shape of a trigger volume — authored around the sublevel's
 * content so the streamer can test players against it each tick.
 */
export const StreamVolumeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("sphere"),
      center: Vec3,
      radius: z.number().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("aabb"),
      min: Vec3,
      max: Vec3,
    })
    .strict()
    .refine(
      ({ min, max }) => min.x <= max.x && min.y <= max.y && min.z <= max.z,
      { message: "aabb `min` must be component-wise ≤ `max`" },
    ),
  z
    .object({
      kind: z.literal("tag"),
      tag: z.string().min(1),
    })
    .strict(),
]);
export type StreamVolume = z.infer<typeof StreamVolumeSchema>;

export const SublevelSchema = z
  .object({
    /** Sublevel id — lowerCamelCase, must be unique across the world. */
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "sublevel id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    /** Asset/manifest path containing the sublevel's entities + terrain. */
    sourcePath: z.string().min(1),
    policy: StreamPolicySchema,
    priority: StreamPrioritySchema.default("normal"),
    /** Trigger volume — required for `proximity`, optional otherwise. */
    trigger: StreamVolumeSchema.optional(),
    /** Hysteresis ring in world units added to the trigger for unload. */
    unloadPaddingMeters: z.number().min(0).max(1000).default(25),
    /** Max concurrent players allowed in the sublevel — 0 = unlimited. */
    playerCap: z.number().int().min(0).max(100000).default(0),
    /** Sublevels that must be loaded BEFORE this one — resolved at stream time. */
    dependsOn: z.array(z.string().min(1)).default([]),
    /** Author tags for grouping in the editor (e.g. `["dungeon", "act1"]`). */
    tags: z.array(z.string().min(1)).default([]),
  })
  .refine(
    ({ policy, trigger }) =>
      policy === "proximity" ? trigger !== undefined : true,
    { message: "`proximity` policy requires a `trigger` volume" },
  )
  .refine(
    ({ policy, trigger }) =>
      policy === "always-loaded" ? trigger === undefined : true,
    { message: "`always-loaded` sublevels must not declare a trigger" },
  )
  .refine(({ id, dependsOn }) => !dependsOn.includes(id), {
    message: "sublevel cannot depend on itself",
  })
  .refine(({ dependsOn }) => new Set(dependsOn).size === dependsOn.length, {
    message: "`dependsOn` entries must be unique",
  });
export type Sublevel = z.infer<typeof SublevelSchema>;

export const LevelStreamingManifestSchema = z
  .array(SublevelSchema)
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, {
    message: "sublevel ids must be unique",
  })
  .refine(
    (list) => {
      const ids = new Set(list.map((s) => s.id));
      return list.every((s) => s.dependsOn.every((d) => ids.has(d)));
    },
    { message: "every `dependsOn` id must reference an existing sublevel" },
  )
  .refine(
    (list) => {
      // DFS cycle detection on dependsOn graph.
      const byId = new Map(list.map((s) => [s.id, s]));
      const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
      const color = new Map<string, number>();
      for (const s of list) color.set(s.id, WHITE);
      const stack: string[] = [];
      function visit(id: string): boolean {
        const c = color.get(id);
        if (c === GRAY) return false;
        if (c === BLACK) return true;
        color.set(id, GRAY);
        stack.push(id);
        const node = byId.get(id);
        if (node) {
          for (const dep of node.dependsOn) {
            if (!visit(dep)) return false;
          }
        }
        color.set(id, BLACK);
        stack.pop();
        return true;
      }
      return list.every((s) => visit(s.id));
    },
    { message: "`dependsOn` graph must be acyclic" },
  );
export type LevelStreamingManifest = z.infer<
  typeof LevelStreamingManifestSchema
>;
