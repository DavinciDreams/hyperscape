import { MountsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { MountRegistry, UnknownMountError } from "../MountRegistry.js";

function manifest() {
  return MountsManifestSchema.parse([
    {
      id: "swiftSteed",
      name: "Swift Steed",
      category: "common",
      locomotion: ["ground"],
      speeds: {
        walkSpeed: 4,
        runSpeed: 10,
        sprintSpeed: 16,
      },
      stamina: {
        maxStamina: 100,
        regenPerSecond: 20,
        drainPerSecondSprint: 40,
        pauseWhenStationary: true,
      },
      summonRules: {
        allowInCombat: false,
        allowInSafeZones: true,
        allowIndoors: false,
        allowUnderwater: false,
        summonCooldownSec: 3,
      },
      requiredRidingLevel: 0,
    },
    {
      id: "skyWyrm",
      name: "Sky Wyrm",
      category: "legendary",
      locomotion: ["ground", "flight"],
      speeds: {
        walkSpeed: 5,
        runSpeed: 12,
        sprintSpeed: 20,
        flySpeed: 40,
        maxAltitudeMeters: 500,
      },
      stamina: {
        maxStamina: 0,
        regenPerSecond: 0,
        drainPerSecondSprint: 0,
      },
      summonRules: {
        allowInCombat: true,
        allowInSafeZones: true,
        allowIndoors: false,
        allowUnderwater: false,
        summonCooldownSec: 10,
      },
      requiredRidingLevel: 60,
    },
    {
      id: "tideRunner",
      name: "Tide Runner",
      category: "rare",
      locomotion: ["water"],
      speeds: {
        walkSpeed: 0,
        runSpeed: 0,
        sprintSpeed: 0,
        swimSpeed: 15,
      },
      summonRules: {
        allowUnderwater: true,
      },
    },
  ]);
}

describe("MountRegistry — lookup", () => {
  it("indexes by id", () => {
    const r = new MountRegistry(manifest());
    expect(r.size).toBe(3);
    expect(r.has("swiftSteed")).toBe(true);
  });

  it("throws on miss", () => {
    const r = new MountRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownMountError);
  });

  it("filters by category", () => {
    const r = new MountRegistry(manifest());
    expect(r.byCategory("legendary").map((m) => m.id)).toEqual(["skyWyrm"]);
  });

  it("filters by locomotion", () => {
    const r = new MountRegistry(manifest());
    const flying = r.byLocomotion("flight");
    expect(flying.length).toBe(1);
    expect(flying[0].id).toBe("skyWyrm");
  });
});

describe("MountRegistry — canSummon", () => {
  const baseCtx = {
    inCombat: false,
    inSafeZone: false,
    indoors: false,
    underwater: false,
    ridingLevel: 100,
    secondsSinceLastSummon: 1000,
  };

  it("allows a valid summon", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("swiftSteed", baseCtx);
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("allowed");
  });

  it("blocks when below riding level", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("skyWyrm", { ...baseCtx, ridingLevel: 10 });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("level-gate");
  });

  it("blocks in combat when not allowed", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("swiftSteed", { ...baseCtx, inCombat: true });
    expect(out.reason).toBe("in-combat");
  });

  it("allows in combat when allowed", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("skyWyrm", { ...baseCtx, inCombat: true });
    expect(out.allowed).toBe(true);
  });

  it("blocks indoors by default", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("swiftSteed", { ...baseCtx, indoors: true });
    expect(out.reason).toBe("indoor-forbidden");
  });

  it("blocks underwater by default", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("swiftSteed", { ...baseCtx, underwater: true });
    expect(out.reason).toBe("underwater-forbidden");
  });

  it("allows underwater mount underwater", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("tideRunner", { ...baseCtx, underwater: true });
    expect(out.allowed).toBe(true);
  });

  it("blocks on cooldown", () => {
    const r = new MountRegistry(manifest());
    const out = r.canSummon("swiftSteed", {
      ...baseCtx,
      secondsSinceLastSummon: 1,
    });
    expect(out.reason).toBe("cooldown");
  });
});

describe("MountRegistry — effectiveSpeed", () => {
  it("returns run/walk/sprint speeds", () => {
    const r = new MountRegistry(manifest());
    expect(r.effectiveSpeed("swiftSteed", "walk")).toBe(4);
    expect(r.effectiveSpeed("swiftSteed", "run")).toBe(10);
    expect(r.effectiveSpeed("swiftSteed", "sprint")).toBe(16);
  });

  it("falls back to run when sprint stamina depleted", () => {
    const r = new MountRegistry(manifest());
    expect(
      r.effectiveSpeed("swiftSteed", "sprint", { currentStamina: 0 }),
    ).toBe(10);
  });

  it("unlimited stamina always returns sprint", () => {
    const r = new MountRegistry(manifest());
    expect(r.effectiveSpeed("skyWyrm", "sprint", { currentStamina: 0 })).toBe(
      20,
    );
  });

  it("returns fly speed for flying mount", () => {
    const r = new MountRegistry(manifest());
    expect(r.effectiveSpeed("skyWyrm", "fly")).toBe(40);
  });

  it("returns swim speed for water mount", () => {
    const r = new MountRegistry(manifest());
    expect(r.effectiveSpeed("tideRunner", "swim")).toBe(15);
  });
});

describe("MountRegistry — tickStamina", () => {
  it("drains while sprinting", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("swiftSteed", 100, 1, {
      sprinting: true,
      stationary: false,
    });
    expect(next).toBe(60); // 100 - 40*1
  });

  it("regenerates when not sprinting", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("swiftSteed", 50, 1, {
      sprinting: false,
      stationary: false,
    });
    expect(next).toBe(70); // 50 + 20*1
  });

  it("pauseWhenStationary: sprinting while stationary regenerates", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("swiftSteed", 50, 1, {
      sprinting: true,
      stationary: true,
    });
    expect(next).toBe(70);
  });

  it("clamps at max", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("swiftSteed", 95, 1, {
      sprinting: false,
      stationary: false,
    });
    expect(next).toBe(100);
  });

  it("clamps at zero", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("swiftSteed", 5, 1, {
      sprinting: true,
      stationary: false,
    });
    expect(next).toBe(0);
  });

  it("unlimited stamina is a no-op", () => {
    const r = new MountRegistry(manifest());
    const next = r.tickStamina("skyWyrm", 999, 10, {
      sprinting: true,
      stationary: false,
    });
    expect(next).toBe(999);
  });
});
