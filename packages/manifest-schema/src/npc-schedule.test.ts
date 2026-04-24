/**
 * Faithfulness + defensiveness tests for `NpcScheduleManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  NpcScheduleManifestSchema,
  type NpcScheduleManifest,
} from "./npc-schedule.js";

const reference: NpcScheduleManifest = [
  {
    id: "village.blacksmith",
    name: "Village Blacksmith Routine",
    description: "Forge by day, tavern by night.",
    npcIds: ["npc.blacksmith.harold"],
    fallbackActivity: "idle",
    slots: [
      {
        id: "wake",
        startTime: "06:00",
        endTime: "07:00",
        days: [],
        activity: "walk-to",
        location: { x: 10, y: 0, z: 10 },
        patrolPath: [],
        animationId: "anim.stretch",
        dialogueId: "",
        customKey: "",
      },
      {
        id: "work",
        startTime: "07:00",
        endTime: "18:00",
        days: ["mon", "tue", "wed", "thu", "fri"],
        activity: "work-at",
        location: { x: 15, y: 0, z: 20 },
        patrolPath: [],
        animationId: "anim.hammer",
        dialogueId: "dlg.blacksmith.work",
        customKey: "",
      },
      {
        id: "tavern",
        startTime: "19:00",
        endTime: "23:00",
        days: [],
        activity: "socialize",
        patrolPath: [],
        animationId: "",
        dialogueId: "dlg.blacksmith.tavern",
        customKey: "",
      },
      {
        id: "sleep",
        startTime: "23:00",
        endTime: "06:00",
        days: [],
        activity: "sleep",
        location: { x: 5, y: 0, z: 5 },
        patrolPath: [],
        animationId: "anim.sleep",
        dialogueId: "",
        customKey: "",
      },
    ],
  },
  {
    id: "town.patrol",
    name: "Town Guard Patrol",
    description: "",
    npcIds: [],
    fallbackActivity: "patrol",
    slots: [
      {
        id: "loop",
        startTime: "00:00",
        endTime: "12:00",
        days: [],
        activity: "patrol",
        patrolPath: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
          { x: 10, y: 0, z: 10 },
          { x: 0, y: 0, z: 10 },
        ],
        animationId: "",
        dialogueId: "",
        customKey: "",
      },
      {
        id: "rest",
        startTime: "12:00",
        endTime: "00:00",
        days: [],
        activity: "idle",
        patrolPath: [],
        animationId: "",
        dialogueId: "",
        customKey: "",
      },
    ],
  },
];

describe("NpcScheduleManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = NpcScheduleManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies slot defaults to a minimal schedule", () => {
    const parsed = NpcScheduleManifestSchema.parse([
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "a",
            startTime: "09:00",
            endTime: "17:00",
            activity: "idle",
          },
        ],
      },
    ]);
    expect(parsed[0].fallbackActivity).toBe("idle");
    expect(parsed[0].npcIds).toEqual([]);
    expect(parsed[0].slots[0].days).toEqual([]);
    expect(parsed[0].slots[0].patrolPath).toEqual([]);
    expect(parsed[0].slots[0].animationId).toBe("");
    expect(parsed[0].slots[0].dialogueId).toBe("");
    expect(parsed[0].slots[0].customKey).toBe("");
  });

  it("accepts empty manifest", () => {
    expect(NpcScheduleManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate schedule ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        slots: [
          { id: "x", startTime: "00:00", endTime: "01:00", activity: "idle" },
        ],
      },
      {
        id: "dup",
        name: "B",
        slots: [
          { id: "x", startTime: "00:00", endTime: "01:00", activity: "idle" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate slot ids within one schedule", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          { id: "x", startTime: "00:00", endTime: "01:00", activity: "idle" },
          { id: "x", startTime: "01:00", endTime: "02:00", activity: "idle" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty slots array", () => {
    const bad = [{ id: "s", name: "S", slots: [] }];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero-length slot (start === end)", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          { id: "x", startTime: "08:00", endTime: "08:00", activity: "idle" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid HH:MM time format", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          { id: "x", startTime: "25:00", endTime: "26:00", activity: "idle" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects walk-to activity without location", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "walk-to",
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects work-at activity without location", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "work-at",
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects sleep activity without location", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          { id: "x", startTime: "22:00", endTime: "06:00", activity: "sleep" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects patrol with fewer than 2 waypoints", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "patrol",
            patrolPath: [{ x: 0, y: 0, z: 0 }],
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects custom activity without customKey", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          { id: "x", startTime: "08:00", endTime: "09:00", activity: "custom" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-custom activity with customKey set", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle",
            customKey: "foo",
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown day-of-week", () => {
    const bad = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "idle",
            days: ["funday"],
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid schedule id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        slots: [
          { id: "x", startTime: "00:00", endTime: "01:00", activity: "idle" },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts custom activity with customKey", () => {
    const ok = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "x",
            startTime: "08:00",
            endTime: "09:00",
            activity: "custom",
            customKey: "festival.dance",
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts overnight slot (end < start in clock time)", () => {
    // This is legal — runtime handles the wrap. Only zero-length is rejected.
    const ok = [
      {
        id: "s",
        name: "S",
        slots: [
          {
            id: "night",
            startTime: "22:00",
            endTime: "06:00",
            activity: "sleep",
            location: { x: 0, y: 0, z: 0 },
          },
        ],
      },
    ];
    expect(NpcScheduleManifestSchema.safeParse(ok).success).toBe(true);
  });
});
