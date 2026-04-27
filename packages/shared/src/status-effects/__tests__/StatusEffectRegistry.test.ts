import { StatusEffectsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  StatusEffectRegistry,
  UnknownStatusEffectError,
} from "../StatusEffectRegistry.js";

function manifest() {
  return StatusEffectsManifestSchema.parse([
    {
      id: "poison",
      name: "Poison",
      category: "harmful",
      tags: ["dot", "poison"],
      durationSec: 10,
      tickIntervalSec: 2,
      perTickDamage: 3,
      stackRule: "refresh",
    },
    {
      id: "bleed",
      name: "Bleed",
      category: "harmful",
      tags: ["dot", "bleed", "physical"],
      durationSec: 6,
      tickIntervalSec: 1,
      perTickDamage: 2,
      stackRule: "stack-count",
      maxStacks: 5,
    },
    {
      id: "regen",
      name: "Regeneration",
      category: "beneficial",
      tags: ["hot"],
      durationSec: 8,
      tickIntervalSec: 1,
      perTickHeal: 5,
      stackRule: "independent",
    },
    {
      id: "stun",
      name: "Stun",
      category: "harmful",
      tags: ["cc"],
      durationSec: 2,
      stackRule: "reject",
    },
    {
      id: "shield",
      name: "Divine Shield",
      category: "beneficial",
      tags: ["buff"],
      durationSec: 5,
      undispellable: true,
      stackRule: "refresh",
    },
  ]);
}

describe("StatusEffectRegistry", () => {
  it("indexes effects by id and tag", () => {
    const reg = new StatusEffectRegistry(manifest());
    expect(reg.size).toBe(5);
    expect(reg.has("poison")).toBe(true);
    expect(reg.byTag("dot").map((e) => e.id)).toEqual(["poison", "bleed"]);
  });

  it("get throws UnknownStatusEffectError on miss", () => {
    const reg = new StatusEffectRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownStatusEffectError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new StatusEffectRegistry();
    reg.loadFromJson([
      {
        id: "x",
        name: "X",
        category: "neutral",
        durationSec: 1,
      },
    ]);
    expect(reg.size).toBe(1);
  });
});

describe("StatusEffectRegistry — applyStack", () => {
  it("refresh replaces existing instance", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("poison");
    const first = reg.applyStack([], def, 0);
    expect(first.length).toBe(1);
    const second = reg.applyStack(first, def, 5);
    expect(second.length).toBe(1);
    expect(second[0].appliedAt).toBe(5);
    expect(second[0].expiresAt).toBe(15);
  });

  it("reject keeps existing instance (drops the new one)", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("stun");
    const first = reg.applyStack([], def, 0);
    const second = reg.applyStack(first, def, 1);
    expect(second).toStrictEqual(first);
    expect(second.length).toBe(1);
    expect(second[0].appliedAt).toBe(0); // original kept, new dropped
  });

  it("independent appends a fresh instance", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("regen");
    const a = reg.applyStack([], def, 0);
    const b = reg.applyStack(a, def, 3);
    expect(b.length).toBe(2);
    expect(b[0].appliedAt).toBe(0);
    expect(b[1].appliedAt).toBe(3);
  });

  it("stack-count merges into one instance, caps at maxStacks", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("bleed");
    let list = reg.applyStack([], def, 0);
    for (let i = 0; i < 10; i++) list = reg.applyStack(list, def, i);
    expect(list.length).toBe(1);
    expect(list[0].stacks).toBe(5); // maxStacks
  });

  it("rejects non-finite now", () => {
    const reg = new StatusEffectRegistry(manifest());
    expect(() => reg.applyStack([], reg.get("poison"), Number.NaN)).toThrow(
      TypeError,
    );
  });
});

describe("StatusEffectRegistry — tickInstance", () => {
  it("accumulates damage for multiple ticks crossed", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("poison");
    const [inst] = reg.applyStack([], def, 0);
    const r = reg.tickInstance(def, inst, 5);
    // ticks at t=2, 4 → 2 ticks × 3 dmg = 6
    expect(r.damageDealt).toBe(6);
    expect(r.expired).toBe(false);
  });

  it("marks expired when now >= expiresAt", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("poison");
    const [inst] = reg.applyStack([], def, 0);
    const r = reg.tickInstance(def, inst, 10);
    expect(r.expired).toBe(true);
  });

  it("stack-count scales damage per stack", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("bleed");
    let list = reg.applyStack([], def, 0);
    list = reg.applyStack(list, def, 0);
    list = reg.applyStack(list, def, 0);
    const inst = { ...list[0] };
    // 3 stacks → 2 dmg × 3 stacks = 6 per tick; 1s tick, tick at t=1
    const r = reg.tickInstance(def, inst, 1);
    expect(r.damageDealt).toBe(6);
  });

  it("zero tick interval produces no periodic damage", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("stun");
    const [inst] = reg.applyStack([], def, 0);
    const r = reg.tickInstance(def, inst, 1);
    expect(r.damageDealt).toBe(0);
    expect(r.healingDealt).toBe(0);
  });

  it("accumulates healing for hot effects", () => {
    const reg = new StatusEffectRegistry(manifest());
    const def = reg.get("regen");
    const [inst] = reg.applyStack([], def, 0);
    const r = reg.tickInstance(def, inst, 3);
    // ticks at 1,2,3 → 3 × 5 = 15
    expect(r.healingDealt).toBe(15);
  });
});

describe("StatusEffectRegistry — cleanse", () => {
  it("removes by tag", () => {
    const reg = new StatusEffectRegistry(manifest());
    const instances = [
      ...reg.applyStack([], reg.get("poison"), 0),
      ...reg.applyStack([], reg.get("bleed"), 0),
      ...reg.applyStack([], reg.get("regen"), 0),
    ];
    const after = reg.cleanse(instances, { kind: "byTag", tag: "dot" });
    expect(after.map((i) => i.effectId)).toEqual(["regen"]);
  });

  it("removes by category", () => {
    const reg = new StatusEffectRegistry(manifest());
    const instances = [
      ...reg.applyStack([], reg.get("poison"), 0),
      ...reg.applyStack([], reg.get("regen"), 0),
    ];
    const after = reg.cleanse(instances, {
      kind: "byCategory",
      category: "harmful",
    });
    expect(after.map((i) => i.effectId)).toEqual(["regen"]);
  });

  it("preserves undispellable effects even when filter matches", () => {
    const reg = new StatusEffectRegistry(manifest());
    const instances = [...reg.applyStack([], reg.get("shield"), 0)];
    const after = reg.cleanse(instances, {
      kind: "byCategory",
      category: "beneficial",
    });
    // shield has undispellable=true → kept
    expect(after.length).toBe(1);
  });

  it("preserves unknown effect ids", () => {
    const reg = new StatusEffectRegistry(manifest());
    const unknown = {
      effectId: "unknown",
      appliedAt: 0,
      expiresAt: 10,
      nextTickAt: Infinity,
      stacks: 1,
    };
    const after = reg.cleanse([unknown], {
      kind: "byTag",
      tag: "anything",
    });
    expect(after).toEqual([unknown]);
  });
});

describe("StatusEffectRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new StatusEffectRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new StatusEffectRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new StatusEffectRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
