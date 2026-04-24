/**
 * Faithfulness + defensiveness tests for `CinematicManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  CinematicManifestSchema,
  type CinematicManifest,
} from "./cinematic.js";

const reference: CinematicManifest = [
  {
    id: "intro.lumbridge_arrival",
    name: "Lumbridge Arrival",
    description: "Opening establishing shot + NPC greeting.",
    durationSec: 12,
    skippable: true,
    lockInput: true,
    tracks: [
      {
        kind: "camera",
        id: "main-cam",
        keyframes: [
          {
            time: 0,
            position: { x: 0, y: 20, z: -30 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            fov: 50,
            weight: 1,
            easing: "ease-out",
          },
          {
            time: 8,
            position: { x: 0, y: 3, z: -5 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            fov: 60,
            weight: 1,
            easing: "ease-in-out",
          },
        ],
      },
      {
        kind: "dialogue",
        id: "greeter-line",
        events: [
          {
            time: 8.5,
            dialogueId: "npc_greeter_intro",
            speaker: "npc_greeter",
          },
        ],
      },
      {
        kind: "audio",
        id: "music",
        bus: "music",
        clips: [
          {
            time: 0,
            assetId: "music_lumbridge_theme",
            volume: 0.8,
            fadeInSec: 2,
            fadeOutSec: 1,
            durationSec: 12,
          },
        ],
      },
      {
        kind: "event",
        id: "fx",
        events: [
          {
            time: 11,
            event: "quest.start",
            params: { questId: "lumbridge_intro" },
          },
        ],
      },
    ],
  },
];

describe("CinematicManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = CinematicManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal cinematic", () => {
    const parsed = CinematicManifestSchema.parse([
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "event",
            id: "e",
            events: [{ time: 1, event: "boom" }],
          },
        ],
      },
    ]);
    expect(parsed[0].skippable).toBe(true);
    expect(parsed[0].lockInput).toBe(true);
    if (parsed[0].tracks[0].kind === "event") {
      expect(parsed[0].tracks[0].events[0].params).toEqual({});
    } else {
      throw new Error("expected event track");
    }
  });

  it("rejects cinematic with zero or negative duration", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 0,
        tracks: [
          { kind: "event", id: "e", events: [{ time: 0, event: "boom" }] },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty tracks array", () => {
    const bad = [{ id: "x", name: "X", durationSec: 5, tracks: [] }];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects camera track with fewer than 2 keyframes", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "camera",
            id: "cam",
            keyframes: [
              {
                time: 0,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-monotonic camera keyframes", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 10,
        tracks: [
          {
            kind: "camera",
            id: "cam",
            keyframes: [
              {
                time: 5,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
              },
              {
                time: 2,
                position: { x: 1, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-monotonic dialogue events", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 10,
        tracks: [
          {
            kind: "dialogue",
            id: "d",
            events: [
              { time: 5, dialogueId: "a" },
              { time: 3, dialogueId: "b" },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects camera fov out of range", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "camera",
            id: "c",
            keyframes: [
              {
                time: 0,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                fov: 200,
              },
              {
                time: 1,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                fov: 200,
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects track content beyond cinematic duration", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "event",
            id: "e",
            events: [{ time: 10, event: "late" }],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects audio track with clip spilling beyond duration", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "audio",
            id: "a",
            bus: "music",
            clips: [
              {
                time: 4,
                assetId: "track",
                volume: 1,
                fadeInSec: 0,
                fadeOutSec: 0,
                durationSec: 3,
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown track kind", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [{ kind: "weather", id: "w", events: [] }],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate track ids within a cinematic", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          { kind: "event", id: "t", events: [{ time: 0, event: "a" }] },
          { kind: "event", id: "t", events: [{ time: 1, event: "b" }] },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid audio bus", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "audio",
            id: "a",
            bus: "telepathy",
            clips: [
              {
                time: 0,
                assetId: "s",
                volume: 1,
                fadeInSec: 0,
                fadeOutSec: 0,
                durationSec: 1,
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects entity-pose track with empty keyframes", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          { kind: "entity-pose", id: "p", entityRef: "npc_1", keyframes: [] },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate cinematic ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects volume > 1", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        durationSec: 5,
        tracks: [
          {
            kind: "audio",
            id: "a",
            bus: "music",
            clips: [
              {
                time: 0,
                assetId: "s",
                volume: 2,
                fadeInSec: 0,
                fadeOutSec: 0,
                durationSec: 1,
              },
            ],
          },
        ],
      },
    ];
    expect(CinematicManifestSchema.safeParse(bad).success).toBe(false);
  });
});
