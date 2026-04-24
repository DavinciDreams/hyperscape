/**
 * NPC-schedule manifest schema.
 *
 * Section 11 (missing systems → NPC schedules / routines) of
 * the World Studio AAA plan. Declares time-of-day routines that
 * drive NPC goals (go to shop, sleep at home, patrol plaza).
 * Complements `ai-behavior.ts` (behavior trees) and
 * `time-weather.ts` (clock source).
 *
 * Scope: authored routines. Runtime NPC controller consumes the
 * active slot and pushes the corresponding goal onto the AI
 * stack; this schema describes only the authored timetable.
 */

import { z } from "zod";

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

/** Parses "HH:MM" 24-hour clock strings into {hour, minute}. */
const TimeOfDay = z
  .string()
  .regex(
    /^([01][0-9]|2[0-3]):([0-5][0-9])$/,
    "time-of-day must be `HH:MM` 24-hour format",
  );

/** Activity kind — what the NPC is doing during a slot. */
export const NpcActivityKindSchema = z.enum([
  "idle",
  "walk-to",
  "work-at",
  "sleep",
  "patrol",
  "socialize",
  "custom",
]);
export type NpcActivityKind = z.infer<typeof NpcActivityKindSchema>;

/** Day-of-week mask — which days this slot is active. */
export const DayOfWeekSchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

/** One scheduled activity slot. */
export const NpcScheduleSlotSchema = z
  .object({
    /** Slot id within the schedule. */
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*$/,
        "slot id must be lowerCamelCase ASCII identifier",
      ),
    /** Slot start time (inclusive). */
    startTime: TimeOfDay,
    /** Slot end time (exclusive). */
    endTime: TimeOfDay,
    /** Days of the week this slot is active. Empty = every day. */
    days: z.array(DayOfWeekSchema).default([]),
    activity: NpcActivityKindSchema,
    /** Optional waypoint — required for walk-to / work-at / sleep / patrol kinds. */
    location: Vec3.optional(),
    /** For patrol, a list of waypoints including `location`. */
    patrolPath: z.array(Vec3).default([]),
    /** Animation id override for this slot (empty = behavior default). */
    animationId: z.string().default(""),
    /** Optional dialogue tree id the NPC will play when approached. */
    dialogueId: z.string().default(""),
    /** Custom activity key resolved by a plugin. */
    customKey: z.string().default(""),
  })
  .strict()
  .refine(({ startTime, endTime }) => startTime !== endTime, {
    message: "slot startTime and endTime must differ (zero-length slot)",
  })
  .refine(
    ({ activity, customKey }) =>
      activity === "custom" ? customKey.length > 0 : customKey.length === 0,
    {
      message:
        "`custom` activity requires `customKey`; other activities must leave it empty",
    },
  )
  .refine(
    ({ activity, location }) => {
      if (
        activity === "walk-to" ||
        activity === "work-at" ||
        activity === "sleep"
      ) {
        return location !== undefined;
      }
      return true;
    },
    {
      message:
        "activities `walk-to`, `work-at`, and `sleep` require `location` waypoint",
    },
  )
  .refine(
    ({ activity, patrolPath }) =>
      activity === "patrol" ? patrolPath.length >= 2 : true,
    {
      message: "`patrol` activity requires at least 2 waypoints in patrolPath",
    },
  );
export type NpcScheduleSlot = z.infer<typeof NpcScheduleSlotSchema>;

/** One NPC's schedule — an ordered list of slots. */
export const NpcScheduleSchema = z
  .object({
    /** Schedule id — unique across the manifest. */
    id: z
      .string()
      .regex(
        /^[a-z][a-zA-Z0-9_-]*(?:\.[a-z][a-zA-Z0-9_-]*)*$/,
        "schedule id must be dot-separated lowerCamelCase segments",
      ),
    name: z.string().min(1),
    description: z.string().default(""),
    /** NPC ids this schedule applies to. Empty = intended as template. */
    npcIds: z.array(z.string().min(1)).default([]),
    /** Slot played when no time-matched slot applies (e.g. missing schedule days). */
    fallbackActivity: NpcActivityKindSchema.default("idle"),
    slots: z.array(NpcScheduleSlotSchema).min(1),
  })
  .refine(
    ({ slots }) => new Set(slots.map((s) => s.id)).size === slots.length,
    { message: "slot ids within a schedule must be unique" },
  );
export type NpcSchedule = z.infer<typeof NpcScheduleSchema>;

export const NpcScheduleManifestSchema = z
  .array(NpcScheduleSchema)
  .refine((list) => new Set(list.map((s) => s.id)).size === list.length, {
    message: "schedule ids must be unique",
  });
export type NpcScheduleManifest = z.infer<typeof NpcScheduleManifestSchema>;
