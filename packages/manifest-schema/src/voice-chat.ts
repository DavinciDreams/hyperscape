/**
 * Voice-chat manifest schema.
 *
 * Authored policy for in-world voice-chat rooms, proximity voice,
 * transmission modes, per-scope muting defaults, moderation hooks,
 * and codec/bandwidth tuning. Runtime `VoiceChatSystem` (backed by
 * LiveKit or equivalent) owns the actual WebRTC pipeline, SFU room
 * lifecycle, ingress/egress, and audio-graph wiring.
 *
 * Scope-isolated from:
 *   - `chat-channels.ts` (text chat scopes/permissions)
 *   - `audio-bus-mix.ts` (client-side output mixing — voice feeds
 *     one of its buses by id)
 *   - `moderation.ts` (reports/sanctions land here as references)
 *
 * Rooms are declared as named registry entries with a scope enum:
 * proximity (radius-based ad-hoc), party, guild, raid, global, custom.
 * Each player is in at most one room per scope at any time — runtime
 * enforces that, the schema only enumerates legal scopes.
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** RoomId — lowerCamelCase. */
const RoomId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "voice room id must be lowerCamelCase ASCII identifier",
  );

/** Voice room scope — what group of players share the room. */
export const VoiceRoomScopeSchema = z.enum([
  "proximity",
  "party",
  "guild",
  "raid",
  "global",
  "custom",
]);
export type VoiceRoomScope = z.infer<typeof VoiceRoomScopeSchema>;

/** How the player's microphone transmits. */
export const TransmissionModeSchema = z.enum([
  "pushToTalk",
  "openMic",
  "voiceActivation",
]);
export type TransmissionMode = z.infer<typeof TransmissionModeSchema>;

/** Audio codec. */
export const AudioCodecSchema = z.enum(["opus", "g722"]);
export type AudioCodec = z.infer<typeof AudioCodecSchema>;

/**
 * Proximity voice falloff curve — linear or inverseSquare across
 * min/max radius. Heard at full volume <= minRadius, silent beyond
 * maxRadius, attenuated between.
 */
export const ProximityFalloffSchema = z
  .object({
    /** Meters at which speaker is heard at full volume. */
    minRadiusMeters: z.number().min(0).max(1000).default(2),
    /** Meters at which speaker is inaudible. */
    maxRadiusMeters: z.number().min(1).max(1000).default(30),
    /** Falloff curve. */
    curve: z.enum(["linear", "inverseSquare"]).default("inverseSquare"),
    /** Occlude voice through walls/terrain (more CPU). */
    occludeBehindGeometry: z.boolean().default(false),
    /** Multiplier applied when occluded (0..1). */
    occlusionAttenuation: z.number().min(0).max(1).default(0.35),
  })
  .strict()
  .refine((p) => p.maxRadiusMeters > p.minRadiusMeters, {
    message: "maxRadiusMeters must be greater than minRadiusMeters",
    path: ["maxRadiusMeters"],
  });
export type ProximityFalloff = z.infer<typeof ProximityFalloffSchema>;

/**
 * Named voice room — one entry per scope (plus any number of custom
 * rooms for authored story scenes).
 */
export const VoiceRoomSchema = z
  .object({
    id: RoomId,
    name: z.string().min(1),
    description: z.string().default(""),
    scope: VoiceRoomScopeSchema,
    /** Required for scope='custom' (room key authors wire up). */
    customKey: z.string().default(""),
    /** Default transmit mode for players joining this room. */
    defaultTransmissionMode: TransmissionModeSchema.default("voiceActivation"),
    /** Max concurrent speakers (hard SFU cap). 0 = unlimited. */
    maxSpeakers: z.number().int().min(0).max(256).default(0),
    /** Max total participants. 0 = unlimited. */
    maxParticipants: z.number().int().min(0).max(1024).default(0),
    /** If present, room is proximity-scoped and uses this falloff. */
    proximityFalloff: ProximityFalloffSchema.optional(),
    /** Route room output to this authored audio-bus (by id). */
    audioBusId: ManifestRef.optional(),
    /** Minimum character level to speak (0 = no gate). */
    minSpeakLevel: z.number().int().min(0).max(200).default(0),
  })
  .strict()
  .refine((r) => r.scope !== "custom" || r.customKey.length > 0, {
    message: "customKey is required when scope='custom'",
    path: ["customKey"],
  })
  .refine((r) => r.scope !== "proximity" || r.proximityFalloff !== undefined, {
    message: "proximity-scoped rooms must declare proximityFalloff",
    path: ["proximityFalloff"],
  })
  .refine((r) => r.scope === "proximity" || r.proximityFalloff === undefined, {
    message: "non-proximity rooms must not declare proximityFalloff",
    path: ["proximityFalloff"],
  })
  .refine(
    (r) =>
      r.maxSpeakers === 0 ||
      r.maxParticipants === 0 ||
      r.maxSpeakers <= r.maxParticipants,
    {
      message: "maxSpeakers must be <= maxParticipants when both set",
      path: ["maxSpeakers"],
    },
  );
export type VoiceRoom = z.infer<typeof VoiceRoomSchema>;

/** Auto-mute conditions that kick in without moderator action. */
export const AutoMuteRulesSchema = z
  .object({
    /** Mute new players until account age reaches this many days (0=off). */
    muteUntilAccountAgeDays: z.number().int().min(0).max(365).default(0),
    /** Mute under-level players from global rooms (0=off). */
    muteBelowCharacterLevel: z.number().int().min(0).max(200).default(0),
    /** Mute if player has N open reports in lookback window. */
    muteOnOpenReports: z.number().int().min(0).max(50).default(0),
    /** Hours of lookback for `muteOnOpenReports`. */
    openReportsLookbackHours: z.number().int().min(1).max(720).default(24),
  })
  .strict()
  .refine((r) => r.muteOnOpenReports === 0 || r.openReportsLookbackHours > 0, {
    message:
      "openReportsLookbackHours must be >0 when muteOnOpenReports enabled",
    path: ["openReportsLookbackHours"],
  });
export type AutoMuteRules = z.infer<typeof AutoMuteRulesSchema>;

/** Per-player mute defaults the client uses on first login. */
export const MuteDefaultsSchema = z
  .object({
    /** All rooms muted by default; player must unmute. */
    startMuted: z.boolean().default(false),
    /** All incoming voice muted by default (deafen). */
    startDeafened: z.boolean().default(false),
    /** Allow players to self-mute per room. */
    allowPerRoomSelfMute: z.boolean().default(true),
    /** Allow players to mute individual other players. */
    allowIndividualMute: z.boolean().default(true),
    /** Maximum individual mutes per player (0 = unlimited). */
    maxIndividualMutes: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export type MuteDefaults = z.infer<typeof MuteDefaultsSchema>;

/** Codec + bandwidth budget. */
export const CodecRulesSchema = z
  .object({
    codec: AudioCodecSchema.default("opus"),
    /** Max upstream bitrate per speaker in kbps. */
    maxBitrateKbps: z.number().int().min(8).max(512).default(32),
    /** Opus fec, noise suppression, echo cancellation toggles. */
    forwardErrorCorrection: z.boolean().default(true),
    noiseSuppression: z.boolean().default(true),
    echoCancellation: z.boolean().default(true),
    /** Dtx reduces bitrate during silence. */
    discontinuousTransmission: z.boolean().default(true),
  })
  .strict()
  .refine((r) => r.codec !== "g722" || r.maxBitrateKbps === 64, {
    // g722 is fixed at 64kbps by spec
    message: "g722 codec requires maxBitrateKbps=64",
    path: ["maxBitrateKbps"],
  });
export type CodecRules = z.infer<typeof CodecRulesSchema>;

/** Voice-activation threshold + hysteresis. */
export const VoiceActivationRulesSchema = z
  .object({
    /** dB threshold above which voice is transmitted. */
    thresholdDb: z.number().min(-90).max(0).default(-40),
    /** Milliseconds below threshold required to stop transmitting. */
    releaseMs: z.number().int().min(0).max(5000).default(200),
    /** Milliseconds above threshold required to start transmitting. */
    attackMs: z.number().int().min(0).max(500).default(20),
  })
  .strict();
export type VoiceActivationRules = z.infer<typeof VoiceActivationRulesSchema>;

/**
 * Voice-chat manifest — top-level authored document.
 */
export const VoiceChatManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    rooms: z.array(VoiceRoomSchema).default([]),
    muteDefaults: MuteDefaultsSchema.default(() =>
      MuteDefaultsSchema.parse({}),
    ),
    autoMute: AutoMuteRulesSchema.default(() => AutoMuteRulesSchema.parse({})),
    codec: CodecRulesSchema.default(() => CodecRulesSchema.parse({})),
    voiceActivation: VoiceActivationRulesSchema.default(() =>
      VoiceActivationRulesSchema.parse({}),
    ),
    /** Global toggle forcing pushToTalk (e.g. esports modes). */
    forcePushToTalk: z.boolean().default(false),
    /** Record voice traffic for moderation review (server-side, compliance-gated). */
    recordForModeration: z.boolean().default(false),
    /** Retain moderation recordings for this many hours (0 = never retain). */
    moderationRecordingRetentionHours: z
      .number()
      .int()
      .min(0)
      .max(720)
      .default(0),
  })
  .strict()
  .refine((m) => new Set(m.rooms.map((r) => r.id)).size === m.rooms.length, {
    message: "room ids must be unique",
    path: ["rooms"],
  })
  .refine(
    (m) => {
      // Only one room per non-custom scope (proximity/party/guild/raid/global).
      const counts = new Map<string, number>();
      for (const r of m.rooms) {
        if (r.scope === "custom") continue;
        counts.set(r.scope, (counts.get(r.scope) ?? 0) + 1);
      }
      for (const [, c] of counts) if (c > 1) return false;
      return true;
    },
    {
      message:
        "at most one room per non-custom scope (use scope='custom' for additional)",
      path: ["rooms"],
    },
  )
  .refine(
    (m) => !m.recordForModeration || m.moderationRecordingRetentionHours > 0,
    {
      message:
        "recordForModeration=true requires moderationRecordingRetentionHours > 0",
      path: ["moderationRecordingRetentionHours"],
    },
  )
  .refine((m) => !m.enabled || m.rooms.length >= 1, {
    message: "voice-chat enabled=true requires at least one room",
    path: ["rooms"],
  });
export type VoiceChatManifest = z.infer<typeof VoiceChatManifestSchema>;
