/**
 * Faithfulness + defensiveness tests for `MountsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import { MountsManifestSchema, type MountsManifest } from "./mounts.js";

const reference: MountsManifest = [
  {
    id: "brownHorse",
    name: "Brown Horse",
    description: "A sturdy mount for everyday travel.",
    iconId: "icon.brownHorse",
    category: "common",
    modelId: "avatar.brownHorse",
    idleAnimationId: "anim.horseIdle",
    mountAnimationId: "anim.horseMount",
    mountSfxId: "sfx.horseSnort",
    mountVfxId: "",
    locomotion: ["ground"],
    speeds: {
      walkSpeed: 6,
      runSpeed: 14,
      sprintSpeed: 22,
      flySpeed: 0,
      swimSpeed: 0,
      maxAltitudeMeters: 0,
    },
    stamina: {
      maxStamina: 100,
      regenPerSecond: 10,
      drainPerSecondSprint: 25,
      pauseWhenStationary: true,
    },
    capacity: { passengers: 1, cargoSlots: 20, passengersCanAct: false },
    summonRules: {
      allowInCombat: false,
      allowInSafeZones: true,
      allowIndoors: false,
      allowUnderwater: false,
      summonCooldownSec: 3,
      forceDismountOnDamage: true,
    },
    hotkey: "mountBar1",
    requiredRidingLevel: 1,
    persistent: true,
    tradeable: true,
  },
  {
    id: "frostWyvern",
    name: "Frost Wyvern",
    description: "Epic flying mount.",
    iconId: "icon.frostWyvern",
    category: "epic",
    modelId: "avatar.frostWyvern",
    idleAnimationId: "anim.wyvernHover",
    mountAnimationId: "anim.wyvernMount",
    mountSfxId: "sfx.wyvernRoar",
    mountVfxId: "vfx.frostBurst",
    locomotion: ["ground", "flight"],
    speeds: {
      walkSpeed: 8,
      runSpeed: 16,
      sprintSpeed: 24,
      flySpeed: 40,
      swimSpeed: 0,
      maxAltitudeMeters: 500,
    },
    stamina: {
      maxStamina: 200,
      regenPerSecond: 15,
      drainPerSecondSprint: 30,
      pauseWhenStationary: true,
    },
    capacity: { passengers: 2, cargoSlots: 10, passengersCanAct: true },
    summonRules: {
      allowInCombat: false,
      allowInSafeZones: true,
      allowIndoors: false,
      allowUnderwater: false,
      summonCooldownSec: 10,
      forceDismountOnDamage: true,
    },
    hotkey: "mountBar2",
    requiredRidingLevel: 50,
    persistent: true,
    tradeable: false,
  },
  {
    id: "seaSerpent",
    name: "Sea Serpent",
    description: "Aquatic rare mount.",
    iconId: "icon.seaSerpent",
    category: "rare",
    modelId: "avatar.seaSerpent",
    idleAnimationId: "",
    mountAnimationId: "",
    mountSfxId: "",
    mountVfxId: "",
    locomotion: ["water"],
    speeds: {
      walkSpeed: 0,
      runSpeed: 0,
      sprintSpeed: 0,
      flySpeed: 0,
      swimSpeed: 20,
      maxAltitudeMeters: 0,
    },
    stamina: {
      maxStamina: 0,
      regenPerSecond: 0,
      drainPerSecondSprint: 0,
      pauseWhenStationary: true,
    },
    capacity: { passengers: 1, cargoSlots: 0, passengersCanAct: false },
    summonRules: {
      allowInCombat: false,
      allowInSafeZones: true,
      allowIndoors: false,
      allowUnderwater: true,
      summonCooldownSec: 5,
      forceDismountOnDamage: true,
    },
    hotkey: "mountBar3",
    requiredRidingLevel: 30,
    persistent: true,
    tradeable: false,
  },
];

describe("MountsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = MountsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal entry", () => {
    const parsed = MountsManifestSchema.parse([
      {
        id: "basic",
        name: "Basic",
        category: "common",
        locomotion: ["ground"],
      },
    ]);
    expect(parsed[0].speeds.runSpeed).toBe(12);
    expect(parsed[0].stamina.maxStamina).toBe(100);
    expect(parsed[0].stamina.regenPerSecond).toBe(10);
    expect(parsed[0].capacity.passengers).toBe(1);
    expect(parsed[0].capacity.cargoSlots).toBe(0);
    expect(parsed[0].summonRules.allowInCombat).toBe(false);
    expect(parsed[0].summonRules.forceDismountOnDamage).toBe(true);
    expect(parsed[0].hotkey).toBe("none");
    expect(parsed[0].persistent).toBe(true);
    expect(parsed[0].tradeable).toBe(false);
  });

  it("accepts empty manifest", () => {
    expect(MountsManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate mount ids", () => {
    const bad = [
      { id: "dup", name: "A", category: "common", locomotion: ["ground"] },
      { id: "dup", name: "B", category: "rare", locomotion: ["ground"] },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty locomotion array", () => {
    const bad = [{ id: "x", name: "X", category: "common", locomotion: [] }];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate locomotion modes", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground", "ground"],
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects flight mount with flySpeed = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["flight"],
        speeds: {
          walkSpeed: 0,
          runSpeed: 0,
          sprintSpeed: 0,
          flySpeed: 0,
          swimSpeed: 0,
          maxAltitudeMeters: 0,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects water mount with swimSpeed = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["water"],
        speeds: {
          walkSpeed: 0,
          runSpeed: 0,
          sprintSpeed: 0,
          flySpeed: 0,
          swimSpeed: 0,
          maxAltitudeMeters: 0,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects ground mount with runSpeed = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        speeds: {
          walkSpeed: 3,
          runSpeed: 0,
          sprintSpeed: 0,
          flySpeed: 0,
          swimSpeed: 0,
          maxAltitudeMeters: 0,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects stamina with drain > 0 but regen = 0 (one-shot sprint)", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        stamina: {
          maxStamina: 100,
          regenPerSecond: 0,
          drainPerSecondSprint: 20,
          pauseWhenStationary: true,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts unlimited sprint (maxStamina = 0)", () => {
    const ok = [
      {
        id: "x",
        name: "X",
        category: "legendary",
        locomotion: ["ground"],
        stamina: {
          maxStamina: 0,
          regenPerSecond: 0,
          drainPerSecondSprint: 0,
          pauseWhenStationary: true,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts amphibious (ground + water)", () => {
    const ok = [
      {
        id: "amphib",
        name: "Amphib",
        category: "uncommon",
        locomotion: ["ground", "water"],
        speeds: {
          walkSpeed: 4,
          runSpeed: 10,
          sprintSpeed: 14,
          flySpeed: 0,
          swimSpeed: 8,
          maxAltitudeMeters: 0,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects unknown locomotion", () => {
    const bad = [
      { id: "x", name: "X", category: "common", locomotion: ["teleport"] },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = [
      { id: "x", name: "X", category: "mythic", locomotion: ["ground"] },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown hotkey", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        hotkey: "quickbar42",
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        category: "common",
        locomotion: ["ground"],
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects passengers = 0", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        capacity: { passengers: 0, cargoSlots: 0, passengersCanAct: false },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects passengers > 20", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        capacity: { passengers: 100, cargoSlots: 0, passengersCanAct: false },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects requiredRidingLevel > 100", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["ground"],
        requiredRidingLevel: 500,
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects maxAltitudeMeters > 10000", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["flight"],
        speeds: {
          walkSpeed: 0,
          runSpeed: 0,
          sprintSpeed: 0,
          flySpeed: 20,
          swimSpeed: 0,
          maxAltitudeMeters: 50_000,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects flySpeed > 500", () => {
    const bad = [
      {
        id: "x",
        name: "X",
        category: "common",
        locomotion: ["flight"],
        speeds: {
          walkSpeed: 0,
          runSpeed: 0,
          sprintSpeed: 0,
          flySpeed: 9_999,
          swimSpeed: 0,
          maxAltitudeMeters: 0,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts multi-passenger with passengersCanAct (wagon)", () => {
    const ok = [
      {
        id: "wagon",
        name: "Wagon",
        category: "uncommon",
        locomotion: ["ground"],
        capacity: {
          passengers: 8,
          cargoSlots: 100,
          passengersCanAct: true,
        },
      },
    ];
    expect(MountsManifestSchema.safeParse(ok).success).toBe(true);
  });
});
