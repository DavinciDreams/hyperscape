import { describe, expect, it } from "vitest";

import {
  PlayerEmotesManifestSchema,
  type PlayerEmotesManifest,
} from "./player-emotes.js";

const hyperscapePlayerEmotes: PlayerEmotesManifest = {
  $schema: "hyperforge.player-emotes.v1",
  emotes: {
    IDLE: "asset://emotes/emote-idle.glb",
    WALK: "asset://emotes/emote-walk.glb?s=1.3",
    RUN: "asset://emotes/emote-run.glb?s=1.4",
    FLOAT: "asset://emotes/emote-float.glb",
    FALL: "asset://emotes/emote-fall.glb",
    FLIP: "asset://emotes/emote-flip.glb?s=1.5",
    TALK: "asset://emotes/emote-talk.glb",
    COMBAT: "asset://emotes/emote-punching.glb?l=0",
    SWORD_SWING: "asset://emotes/emote_sword_swing.glb?l=0",
    TWO_HAND_IDLE: "asset://emotes/emote-2h-idle.glb",
    TWO_HAND_SLASH: "asset://emotes/emote-2h-slash.glb?l=0",
    RANGE: "asset://emotes/emote-range.glb?l=0",
    SPELL_CAST: "asset://emotes/emote-spell-cast.glb?l=0",
    CHOPPING: "asset://emotes/emote_chopping.glb",
    FISHING: "asset://emotes/emote-fishing.glb",
    DEATH: "asset://emotes/emote-death.glb?l=0",
    SQUAT: "asset://emotes/emote-squat.glb",
    VICTORY: "asset://emotes/emote-waving-both-hands.glb",
    VICTORY_DANCE: "asset://emotes/emote-dance-happy.glb",
  },
  essentialEmoteKeys: ["IDLE", "WALK", "RUN", "COMBAT", "DEATH", "VICTORY"],
};

describe("PlayerEmotesManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = PlayerEmotesManifestSchema.safeParse(hyperscapePlayerEmotes);
    if (!result.success) {
      throw new Error(
        `Hyperscape player-emotes manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty essentialEmoteKeys", () => {
    const bad = { ...hyperscapePlayerEmotes, essentialEmoteKeys: [] };
    expect(PlayerEmotesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty emote URL", () => {
    const bad = {
      ...hyperscapePlayerEmotes,
      emotes: { ...hyperscapePlayerEmotes.emotes, IDLE: "" },
    };
    expect(PlayerEmotesManifestSchema.safeParse(bad).success).toBe(false);
  });
});
