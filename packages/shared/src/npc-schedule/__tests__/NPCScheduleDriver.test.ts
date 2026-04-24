import {
  NpcScheduleManifestSchema,
  NpcScheduleSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  NPCScheduleDriver,
  NpcScheduleRegistry,
  UnknownNpcScheduleError,
  resolveActivity,
} from "../NPCScheduleDriver.js";

function schedule() {
  return NpcScheduleSchema.parse({
    id: "shopkeeper.alice",
    name: "Alice the Shopkeeper",
    npcIds: ["npc.alice"],
    fallbackActivity: "idle",
    slots: [
      {
        id: "sleep",
        startTime: "22:00",
        endTime: "06:00",
        activity: "sleep",
        location: { x: 0, y: 0, z: 0 },
      },
      {
        id: "work",
        startTime: "09:00",
        endTime: "17:00",
        activity: "work-at",
        location: { x: 10, y: 0, z: 10 },
        dialogueId: "dialogue.shop",
      },
      {
        id: "lunch",
        startTime: "12:00",
        endTime: "13:00",
        activity: "walk-to",
        location: { x: 5, y: 0, z: 5 },
      },
      {
        id: "weekend-idle",
        startTime: "09:00",
        endTime: "17:00",
        days: ["sat", "sun"],
        activity: "idle",
      },
    ],
  });
}

describe("resolveActivity — stateless", () => {
  it("picks the first slot whose time matches", () => {
    const s = schedule();
    // lunch (12–13) appears after work (9–17) in the slot list, so
    // work wins first-match at 12:30.
    const r = resolveActivity(s, { hour: 12, minute: 30, day: "mon" });
    expect(r.slot?.id).toBe("work");
  });

  it("falls back when no slot matches", () => {
    const s = schedule();
    // 07:00 is outside every slot (sleep ends 06:00, work starts 09:00)
    const r = resolveActivity(s, { hour: 7, minute: 0, day: "mon" });
    expect(r.slot).toBeNull();
    expect(r.kind).toBe("idle");
  });

  it("overnight slots wrap across midnight", () => {
    const s = schedule();
    // 23:00 is inside sleep (22:00–06:00)
    const r1 = resolveActivity(s, { hour: 23, minute: 0, day: "mon" });
    expect(r1.slot?.id).toBe("sleep");
    // 02:00 is also inside sleep
    const r2 = resolveActivity(s, { hour: 2, minute: 0, day: "tue" });
    expect(r2.slot?.id).toBe("sleep");
    // 06:00 is exclusive end
    const r3 = resolveActivity(s, { hour: 6, minute: 0, day: "tue" });
    expect(r3.slot).toBeNull();
  });

  it("day filter restricts slot applicability", () => {
    const s = schedule();
    // work slot has no days filter → every day
    expect(
      resolveActivity(s, { hour: 10, minute: 0, day: "sat" }).slot?.id,
    ).toBe("work");
    // Variant where weekend-idle comes first
    const reordered = NpcScheduleSchema.parse({
      id: "alice.reordered",
      name: "Alice reordered",
      slots: [
        {
          id: "weekend-idle",
          startTime: "09:00",
          endTime: "17:00",
          days: ["sat", "sun"],
          activity: "idle",
        },
        {
          id: "work",
          startTime: "09:00",
          endTime: "17:00",
          activity: "work-at",
          location: { x: 10, y: 0, z: 10 },
        },
      ],
    });
    // sat at 10:00 → weekend-idle wins
    expect(
      resolveActivity(reordered, { hour: 10, minute: 0, day: "sat" }).slot?.id,
    ).toBe("weekend-idle");
    // mon at 10:00 → weekend-idle skipped, work wins
    expect(
      resolveActivity(reordered, { hour: 10, minute: 0, day: "mon" }).slot?.id,
    ).toBe("work");
  });

  it("slot ordering: first-match wins", () => {
    // Two overlapping slots — first in the list wins
    const overlap = NpcScheduleSchema.parse({
      id: "overlap",
      name: "Overlap",
      slots: [
        {
          id: "a",
          startTime: "10:00",
          endTime: "12:00",
          activity: "walk-to",
          location: { x: 1, y: 0, z: 1 },
        },
        {
          id: "b",
          startTime: "11:00",
          endTime: "13:00",
          activity: "walk-to",
          location: { x: 2, y: 0, z: 2 },
        },
      ],
    });
    const r = resolveActivity(overlap, { hour: 11, minute: 30 });
    expect(r.slot?.id).toBe("a");
  });

  it("day defaults to 'mon' when unset", () => {
    const s = schedule();
    const r = resolveActivity(s, { hour: 10, minute: 0 });
    expect(r.slot?.id).toBe("work");
  });

  it("rejects invalid clock values", () => {
    const s = schedule();
    expect(() => resolveActivity(s, { hour: 24, minute: 0 })).toThrow(
      TypeError,
    );
    expect(() => resolveActivity(s, { hour: 5, minute: 60 })).toThrow(
      TypeError,
    );
    expect(() => resolveActivity(s, { hour: 5.5, minute: 0 })).toThrow(
      TypeError,
    );
  });
});

describe("NPCScheduleDriver — stateful", () => {
  it("starts with fallback activity + null slot", () => {
    const d = new NPCScheduleDriver(schedule());
    expect(d.currentSlotId).toBeNull();
    expect(d.currentActivity).toBe("idle");
  });

  it("first tick into a matching slot emits a change event", () => {
    const d = new NPCScheduleDriver(schedule());
    const evt = d.tick({ hour: 10, minute: 0, day: "mon" });
    expect(evt).not.toBeNull();
    expect(evt!.previousSlotId).toBeNull();
    expect(evt!.current.slot?.id).toBe("work");
    expect(d.currentSlotId).toBe("work");
  });

  it("first tick into fallback does NOT emit a change", () => {
    const d = new NPCScheduleDriver(schedule());
    // 07:00 → no slot, fallback idle (which is already the starting activity)
    const evt = d.tick({ hour: 7, minute: 0, day: "mon" });
    expect(evt).toBeNull();
  });

  it("tick with same slot returns null", () => {
    const d = new NPCScheduleDriver(schedule());
    d.tick({ hour: 10, minute: 0, day: "mon" });
    expect(d.tick({ hour: 11, minute: 0, day: "mon" })).toBeNull();
    expect(d.tick({ hour: 11, minute: 30, day: "mon" })).toBeNull();
  });

  it("slot transition emits with previous fields", () => {
    const d = new NPCScheduleDriver(schedule());
    d.tick({ hour: 10, minute: 0, day: "mon" }); // → work
    const evt = d.tick({ hour: 18, minute: 0, day: "mon" }); // → fallback
    expect(evt).not.toBeNull();
    expect(evt!.previousSlotId).toBe("work");
    expect(evt!.previousActivity).toBe("work-at");
    expect(evt!.current.slot).toBeNull();
    expect(evt!.current.kind).toBe("idle");
  });

  it("reset drops driver state back to fallback", () => {
    const d = new NPCScheduleDriver(schedule());
    d.tick({ hour: 10, minute: 0, day: "mon" });
    d.reset();
    expect(d.currentSlotId).toBeNull();
    expect(d.currentActivity).toBe("idle");
  });

  it("full day simulation emits one event per transition", () => {
    const d = new NPCScheduleDriver(schedule());
    const events: string[] = [];
    const tick = (h: number, m: number) => {
      const e = d.tick({ hour: h, minute: m, day: "mon" });
      if (e)
        events.push(`${e.previousSlotId ?? "*"}→${e.current.slot?.id ?? "*"}`);
    };
    // Start of day (02:00): inside sleep
    tick(2, 0);
    // Wake up (07:00): fallback
    tick(7, 0);
    // Work (09:00)
    tick(9, 0);
    // Mid-work (14:00) — still work
    tick(14, 0);
    // Evening (18:00) — fallback
    tick(18, 0);
    // Sleep (23:00)
    tick(23, 0);
    expect(events).toEqual([
      "*→sleep",
      "sleep→*",
      "*→work",
      "work→*",
      "*→sleep",
    ]);
  });
});

describe("NpcScheduleRegistry", () => {
  function manifest() {
    return NpcScheduleManifestSchema.parse([
      schedule(),
      NpcScheduleSchema.parse({
        id: "guard.bob",
        name: "Guard Bob",
        npcIds: ["npc.bob"],
        slots: [
          {
            id: "patrol",
            startTime: "06:00",
            endTime: "18:00",
            activity: "patrol",
            patrolPath: [
              { x: 0, y: 0, z: 0 },
              { x: 10, y: 0, z: 0 },
            ],
          },
        ],
      }),
    ]);
  }

  it("indexes schedules by id", () => {
    const reg = new NpcScheduleRegistry(manifest());
    expect(reg.size).toBe(2);
    expect(reg.has("shopkeeper.alice")).toBe(true);
  });

  it("findForNpc resolves npcId → schedule", () => {
    const reg = new NpcScheduleRegistry(manifest());
    expect(reg.findForNpc("npc.alice")?.id).toBe("shopkeeper.alice");
    expect(reg.findForNpc("npc.bob")?.id).toBe("guard.bob");
    expect(reg.findForNpc("npc.unknown")).toBeNull();
  });

  it("createDriver builds a stateful driver", () => {
    const reg = new NpcScheduleRegistry(manifest());
    const d = reg.createDriver("guard.bob");
    expect(d.currentActivity).toBe("idle");
    const evt = d.tick({ hour: 8, minute: 0, day: "mon" });
    expect(evt!.current.slot?.id).toBe("patrol");
  });

  it("get throws UnknownNpcScheduleError on miss", () => {
    const reg = new NpcScheduleRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownNpcScheduleError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new NpcScheduleRegistry();
    reg.loadFromJson([
      {
        id: "min",
        name: "Minimal",
        slots: [
          {
            id: "x",
            startTime: "00:00",
            endTime: "23:59",
            activity: "idle",
          },
        ],
      },
    ]);
    expect(reg.size).toBe(1);
  });
});
