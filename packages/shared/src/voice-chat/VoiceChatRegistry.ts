/**
 * Voice-chat registry.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `voice-chat.ts`.
 * Pure logic: room lookup (by id + by scope), proximity falloff math,
 * transmission-mode resolution, auto-mute gate, speaker/participant caps.
 * Runtime `VoiceChatSystem` owns SFU rooms + WebRTC pipeline.
 */

import {
  type AutoMuteRules,
  type CodecRules,
  type MuteDefaults,
  type ProximityFalloff,
  type TransmissionMode,
  type VoiceActivationRules,
  type VoiceChatManifest,
  type VoiceRoom,
  type VoiceRoomScope,
  VoiceChatManifestSchema,
} from "@hyperforge/manifest-schema";

export class VoiceChatNotLoadedError extends Error {
  constructor() {
    super("VoiceChatRegistry used before load()");
    this.name = "VoiceChatNotLoadedError";
  }
}

export class UnknownVoiceRoomError extends Error {
  readonly roomId: string;
  readonly availableIds: readonly string[];
  constructor(id: string, availableIds: readonly string[]) {
    super(
      `voice room "${id}" not found. Known ids: ${
        availableIds.length > 0 ? availableIds.join(", ") : "(none loaded)"
      }`,
    );
    this.name = "UnknownVoiceRoomError";
    this.roomId = id;
    this.availableIds = availableIds;
  }
}

export type AutoMuteReason =
  | "not-muted"
  | "account-too-new"
  | "below-character-level"
  | "too-many-open-reports";

export interface AutoMuteInput {
  accountAgeDays: number;
  characterLevel: number;
  openReportsInLookback: number;
}

export interface AutoMuteResult {
  muted: boolean;
  reason: AutoMuteReason;
}

export type VoiceJoinReason =
  | "allowed"
  | "at-participant-cap"
  | "below-speak-level"
  | "disabled";

export interface VoiceJoinResult {
  allowed: boolean;
  reason: VoiceJoinReason;
}

export class VoiceChatRegistry {
  private _manifest: VoiceChatManifest | null = null;
  private _roomsById = new Map<string, VoiceRoom>();
  private _roomByScope = new Map<VoiceRoomScope, VoiceRoom>();

  constructor(manifest?: VoiceChatManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: VoiceChatManifest): void {
    this._manifest = manifest;
    this._roomsById.clear();
    this._roomByScope.clear();
    for (const r of manifest.rooms) {
      this._roomsById.set(r.id, r);
      if (r.scope !== "custom") this._roomByScope.set(r.scope, r);
    }
  }

  loadFromJson(raw: unknown): void {
    this.load(VoiceChatManifestSchema.parse(raw));
  }

  get manifest(): VoiceChatManifest {
    if (!this._manifest) throw new VoiceChatNotLoadedError();
    return this._manifest;
  }

  isLoaded(): boolean {
    return this._manifest !== null;
  }

  get enabled(): boolean {
    return this.manifest.enabled;
  }

  get muteDefaults(): MuteDefaults {
    return this.manifest.muteDefaults;
  }
  get autoMute(): AutoMuteRules {
    return this.manifest.autoMute;
  }
  get codec(): CodecRules {
    return this.manifest.codec;
  }
  get voiceActivation(): VoiceActivationRules {
    return this.manifest.voiceActivation;
  }

  /* --- rooms --- */

  has(id: string): boolean {
    return this._roomsById.has(id);
  }

  get(id: string): VoiceRoom {
    const r = this._roomsById.get(id);
    if (!r) {
      throw new UnknownVoiceRoomError(id, Array.from(this._roomsById.keys()));
    }
    return r;
  }

  ids(): string[] {
    return Array.from(this._roomsById.keys());
  }

  /** The single non-custom room at `scope`, or null. */
  roomForScope(scope: VoiceRoomScope): VoiceRoom | null {
    if (scope === "custom") return null;
    return this._roomByScope.get(scope) ?? null;
  }

  /** All rooms at a given scope (custom scope may have many). */
  roomsByScope(scope: VoiceRoomScope): VoiceRoom[] {
    return Array.from(this._roomsById.values()).filter(
      (r) => r.scope === scope,
    );
  }

  /* --- transmission --- */

  /**
   * Effective transmission mode for a room. `forcePushToTalk` overrides
   * all room defaults.
   */
  effectiveTransmissionMode(roomId: string): TransmissionMode {
    const room = this.get(roomId);
    if (this.manifest.forcePushToTalk) return "pushToTalk";
    return room.defaultTransmissionMode;
  }

  /* --- proximity --- */

  /**
   * Linear OR inverse-square attenuation between minRadius and maxRadius.
   * Returns 1.0 at or under min, 0 at or beyond max, interpolated between.
   */
  proximityGain(roomId: string, distanceMeters: number): number {
    const room = this.get(roomId);
    const f = room.proximityFalloff;
    if (!f) return 1;
    if (distanceMeters <= f.minRadiusMeters) return 1;
    if (distanceMeters >= f.maxRadiusMeters) return 0;
    const t =
      (distanceMeters - f.minRadiusMeters) /
      (f.maxRadiusMeters - f.minRadiusMeters);
    if (f.curve === "linear") return 1 - t;
    // inverseSquare: gain = 1 / (1 + k*t*t) normalised to [0, 1]
    const gain = 1 - t * t;
    return Math.max(0, gain);
  }

  /** Proximity gain multiplied by occlusion attenuation. */
  proximityGainWithOcclusion(
    roomId: string,
    distanceMeters: number,
    isOccluded: boolean,
  ): number {
    const base = this.proximityGain(roomId, distanceMeters);
    const falloff = this.get(roomId).proximityFalloff;
    if (!falloff) return base;
    if (!falloff.occludeBehindGeometry || !isOccluded) return base;
    return base * falloff.occlusionAttenuation;
  }

  getProximityFalloff(roomId: string): ProximityFalloff | null {
    return this.get(roomId).proximityFalloff ?? null;
  }

  /* --- join + speak gates --- */

  /** Is joining this room currently within caps + level gates? */
  checkJoin(
    roomId: string,
    currentParticipants: number,
    playerLevel: number,
  ): VoiceJoinResult {
    if (!this.enabled) return { allowed: false, reason: "disabled" };
    const room = this.get(roomId);
    if (
      room.maxParticipants > 0 &&
      currentParticipants >= room.maxParticipants
    ) {
      return { allowed: false, reason: "at-participant-cap" };
    }
    if (room.minSpeakLevel > 0 && playerLevel < room.minSpeakLevel) {
      return { allowed: false, reason: "below-speak-level" };
    }
    return { allowed: true, reason: "allowed" };
  }

  /** Is a speaker slot still available? */
  canSpeak(roomId: string, currentSpeakers: number): boolean {
    const room = this.get(roomId);
    if (room.maxSpeakers === 0) return true;
    return currentSpeakers < room.maxSpeakers;
  }

  /** Should the player be auto-muted based on account/level/report state? */
  classifyAutoMute(input: AutoMuteInput): AutoMuteResult {
    const a = this.autoMute;
    if (
      a.muteUntilAccountAgeDays > 0 &&
      input.accountAgeDays < a.muteUntilAccountAgeDays
    ) {
      return { muted: true, reason: "account-too-new" };
    }
    if (
      a.muteBelowCharacterLevel > 0 &&
      input.characterLevel < a.muteBelowCharacterLevel
    ) {
      return { muted: true, reason: "below-character-level" };
    }
    if (
      a.muteOnOpenReports > 0 &&
      input.openReportsInLookback >= a.muteOnOpenReports
    ) {
      return { muted: true, reason: "too-many-open-reports" };
    }
    return { muted: false, reason: "not-muted" };
  }

  /** Is moderation recording retained for `ageHours`? */
  isModerationRecordingRetained(ageHours: number): boolean {
    const m = this.manifest;
    if (!m.recordForModeration) return false;
    if (m.moderationRecordingRetentionHours === 0) return false;
    return ageHours < m.moderationRecordingRetentionHours;
  }
}
