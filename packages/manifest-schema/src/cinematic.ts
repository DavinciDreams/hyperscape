/**
 * Cinematic / sequencer manifest schema.
 *
 * Section 15 (UE5 parity — sequencer) of the World Studio AAA plan.
 * A cinematic is a timeline of typed tracks that fire events,
 * animate cameras, play dialogue, crossfade audio, and pose
 * characters.
 *
 * Tracks are resolved at runtime against the live world — an
 * `entity-pose` track references an NPC by entity id, a `camera`
 * track drives the active render camera, a `dialogue` track plays a
 * specific dialogue tree, etc.
 *
 * Keyframes are time-keyed; playback is monotonic in seconds from
 * the cinematic start. Easing is per-keyframe so authors can hand-
 * author hold-then-snap vs. smooth arcs without leaving the editor.
 */

import { z } from "zod";

/**
 * Easing functions — applied to interpolation between consecutive
 * keyframes on the same track. Sufficient for camera + pose work;
 * more exotic curves go through `custom` and a registered evaluator.
 */
export const EasingFunctionSchema = z.enum([
  "linear",
  "step",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "cubic",
  "custom",
]);
export type EasingFunction = z.infer<typeof EasingFunctionSchema>;

const Vec3 = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  })
  .strict();

const Quat = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
  })
  .strict();

/** Time in seconds from the cinematic's start. Nonneg. */
const TimeSeconds = z.number().nonnegative();

/** Camera keyframe — pose + lens. */
export const CameraKeyframeSchema = z.object({
  time: TimeSeconds,
  position: Vec3,
  rotation: Quat,
  /** Field of view in degrees. */
  fov: z.number().min(5).max(179).default(60),
  /** Linear blend weight for composing multiple camera tracks. */
  weight: z.number().min(0).max(1).default(1),
  easing: EasingFunctionSchema.default("ease-in-out"),
});
export type CameraKeyframe = z.infer<typeof CameraKeyframeSchema>;

export const CameraTrackSchema = z
  .object({
    kind: z.literal("camera"),
    id: z.string().min(1),
    keyframes: z.array(CameraKeyframeSchema).min(2),
  })
  .refine(
    ({ keyframes }) => {
      for (let i = 1; i < keyframes.length; i++) {
        if (keyframes[i].time <= keyframes[i - 1].time) return false;
      }
      return true;
    },
    { message: "camera keyframes must be strictly time-ordered" },
  );
export type CameraTrack = z.infer<typeof CameraTrackSchema>;

export const EntityPoseKeyframeSchema = z.object({
  time: TimeSeconds,
  position: Vec3,
  rotation: Quat,
  /** Optional animation clip id to crossfade into on this keyframe. */
  animationClipId: z.string().default(""),
  /** Crossfade duration in seconds. */
  crossfadeSec: z.number().min(0).max(10).default(0.2),
  easing: EasingFunctionSchema.default("ease-in-out"),
});
export type EntityPoseKeyframe = z.infer<typeof EntityPoseKeyframeSchema>;

export const EntityPoseTrackSchema = z
  .object({
    kind: z.literal("entity-pose"),
    id: z.string().min(1),
    /** Entity id in the live world — resolved at playback time. */
    entityRef: z.string().min(1),
    keyframes: z.array(EntityPoseKeyframeSchema).min(1),
  })
  .refine(
    ({ keyframes }) => {
      for (let i = 1; i < keyframes.length; i++) {
        if (keyframes[i].time <= keyframes[i - 1].time) return false;
      }
      return true;
    },
    { message: "entity-pose keyframes must be strictly time-ordered" },
  );
export type EntityPoseTrack = z.infer<typeof EntityPoseTrackSchema>;

export const DialogueTrackEventSchema = z.object({
  time: TimeSeconds,
  /** Dialogue tree id — resolved against the dialogue manifest. */
  dialogueId: z.string().min(1),
  /** Optional speaker override if dialogue tree has a parametric line. */
  speaker: z.string().default(""),
});
export type DialogueTrackEvent = z.infer<typeof DialogueTrackEventSchema>;

export const DialogueTrackSchema = z
  .object({
    kind: z.literal("dialogue"),
    id: z.string().min(1),
    events: z.array(DialogueTrackEventSchema).min(1),
  })
  .refine(
    ({ events }) => {
      for (let i = 1; i < events.length; i++) {
        if (events[i].time < events[i - 1].time) return false;
      }
      return true;
    },
    { message: "dialogue events must be time-ordered (monotonic)" },
  );
export type DialogueTrack = z.infer<typeof DialogueTrackSchema>;

export const AudioTrackClipSchema = z.object({
  time: TimeSeconds,
  assetId: z.string().min(1),
  /** 0..1 linear volume. */
  volume: z.number().min(0).max(1).default(1),
  /** Crossfade in seconds. */
  fadeInSec: z.number().min(0).max(30).default(0),
  fadeOutSec: z.number().min(0).max(30).default(0),
  /** Optional explicit duration; 0 = play to end. */
  durationSec: z.number().min(0).max(3600).default(0),
});
export type AudioTrackClip = z.infer<typeof AudioTrackClipSchema>;

export const AudioTrackSchema = z
  .object({
    kind: z.literal("audio"),
    id: z.string().min(1),
    /** Sub-mix bus name — `music`, `sfx`, `voice`, etc. */
    bus: z.enum(["music", "sfx", "voice", "ambience"]).default("music"),
    clips: z.array(AudioTrackClipSchema).min(1),
  })
  .refine(
    ({ clips }) => {
      for (let i = 1; i < clips.length; i++) {
        if (clips[i].time < clips[i - 1].time) return false;
      }
      return true;
    },
    { message: "audio clips must be time-ordered (monotonic)" },
  );
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

export const EventTrackEventSchema = z.object({
  time: TimeSeconds,
  /** Registered event name — fired at this time. */
  event: z.string().min(1),
  /** Primitive params passed to the event handler. */
  params: z
    .record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
});
export type EventTrackEvent = z.infer<typeof EventTrackEventSchema>;

export const EventTrackSchema = z
  .object({
    kind: z.literal("event"),
    id: z.string().min(1),
    events: z.array(EventTrackEventSchema).min(1),
  })
  .refine(
    ({ events }) => {
      for (let i = 1; i < events.length; i++) {
        if (events[i].time < events[i - 1].time) return false;
      }
      return true;
    },
    { message: "events must be time-ordered (monotonic)" },
  );
export type EventTrack = z.infer<typeof EventTrackSchema>;

export const CinematicTrackSchema = z.discriminatedUnion("kind", [
  CameraTrackSchema,
  EntityPoseTrackSchema,
  DialogueTrackSchema,
  AudioTrackSchema,
  EventTrackSchema,
]);
export type CinematicTrack = z.infer<typeof CinematicTrackSchema>;

/**
 * Last-time-value helper for cross-track duration check. Safe
 * against empty arrays — empty tracks return 0 so the duration
 * refinement doesn't crash before the child `.min(1)` refinements
 * fire in tandem.
 */
function trackLastTime(track: CinematicTrack): number {
  switch (track.kind) {
    case "camera":
    case "entity-pose": {
      const last = track.keyframes[track.keyframes.length - 1];
      return last === undefined ? 0 : last.time;
    }
    case "dialogue":
    case "event": {
      const last = track.events[track.events.length - 1];
      return last === undefined ? 0 : last.time;
    }
    case "audio": {
      const last = track.clips[track.clips.length - 1];
      return last === undefined ? 0 : last.time + last.durationSec;
    }
  }
}

export const CinematicSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    /** Total duration of the cinematic in seconds — must cover all track content. */
    durationSec: z.number().positive(),
    /** If true, cinematic can be skipped by the player. */
    skippable: z.boolean().default(true),
    /** If true, player input is ignored during playback. */
    lockInput: z.boolean().default(true),
    tracks: z.array(CinematicTrackSchema).min(1),
  })
  .refine(
    ({ tracks }) => new Set(tracks.map((t) => t.id)).size === tracks.length,
    { message: "track ids within a cinematic must be unique" },
  )
  .refine(
    ({ durationSec, tracks }) =>
      tracks.every((t) => trackLastTime(t) <= durationSec + 1e-6),
    {
      message:
        "every track's last event/keyframe must occur at or before the cinematic's `durationSec`",
    },
  );
export type Cinematic = z.infer<typeof CinematicSchema>;

export const CinematicManifestSchema = z
  .array(CinematicSchema)
  .refine((list) => new Set(list.map((c) => c.id)).size === list.length, {
    message: "cinematic ids must be unique",
  });
export type CinematicManifest = z.infer<typeof CinematicManifestSchema>;
