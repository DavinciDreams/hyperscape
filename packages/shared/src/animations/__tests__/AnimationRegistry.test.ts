import { AnimationManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  AnimationRegistry,
  MissingBindingError,
  UnknownAnimationClipError,
} from "../AnimationRegistry.js";

function manifest() {
  return AnimationManifestSchema.parse({
    clips: [
      {
        id: "humanIdle",
        name: "Human idle",
        path: "asset://anim/human_idle.glb",
        duration: 2,
        speed: 1,
        loop: true,
        blendIn: 0.2,
        blendOut: 0.2,
        tags: ["neutral"],
      },
      {
        id: "humanAttackOneHand",
        name: "Human 1H attack",
        path: "asset://anim/human_attack_1h.glb",
        duration: 0.6,
        speed: 1,
        loop: false,
        tags: ["onehand"],
      },
      {
        id: "humanAttackTwoHand",
        name: "Human 2H attack",
        path: "asset://anim/human_attack_2h.glb",
        duration: 0.9,
        speed: 1,
        loop: false,
        tags: ["twohand"],
      },
    ],
    bindings: [
      { rigId: "human", action: "idle", clipId: "humanIdle" },
      {
        rigId: "human",
        action: "attack_melee",
        clipId: "humanAttackOneHand",
        speed: 1.2,
      },
      {
        rigId: "orc",
        action: "attack_melee",
        clipId: "humanAttackTwoHand",
        loop: false,
      },
    ],
  });
}

describe("AnimationRegistry — lookup", () => {
  it("counts clips and bindings", () => {
    const r = new AnimationRegistry(manifest());
    expect(r.clipCount).toBe(3);
    expect(r.bindingCount).toBe(3);
    expect(r.hasClip("humanIdle")).toBe(true);
  });

  it("getClip throws on miss", () => {
    const r = new AnimationRegistry(manifest());
    expect(() => r.getClip("ghost")).toThrow(UnknownAnimationClipError);
  });

  it("clipsForTag filters", () => {
    const r = new AnimationRegistry(manifest());
    expect(r.clipsForTag("twohand").map((c) => c.id)).toEqual([
      "humanAttackTwoHand",
    ]);
  });
});

describe("AnimationRegistry — resolve", () => {
  it("applies per-binding speed override", () => {
    const r = new AnimationRegistry(manifest());
    const a = r.resolve("human", "attack_melee");
    expect(a.clipId).toBe("humanAttackOneHand");
    expect(a.speed).toBeCloseTo(1.2);
    // binding has no loop override → falls back to clip.loop=false
    expect(a.loop).toBe(false);
  });

  it("falls back to clip defaults when no override", () => {
    const r = new AnimationRegistry(manifest());
    const a = r.resolve("human", "idle");
    expect(a.speed).toBe(1);
    expect(a.loop).toBe(true);
    expect(a.duration).toBe(2);
    expect(a.tags).toEqual(["neutral"]);
  });

  it("throws MissingBindingError for missing (rig,action)", () => {
    const r = new AnimationRegistry(manifest());
    expect(() => r.resolve("human", "craft")).toThrow(MissingBindingError);
  });

  it("tryResolve returns null on missing binding", () => {
    const r = new AnimationRegistry(manifest());
    expect(r.tryResolve("human", "craft")).toBeNull();
    expect(r.tryResolve("human", "idle")).not.toBeNull();
  });
});

describe("AnimationRegistry — validate", () => {
  it("returns empty issues for consistent manifest", () => {
    const m = manifest();
    const r = new AnimationRegistry(m);
    expect(r.validate(m)).toEqual([]);
  });

  it("flags binding → missing clip", () => {
    const m = manifest();
    m.bindings.push({
      rigId: "dragon",
      action: "death",
      clipId: "nonexistent",
    });
    const r = new AnimationRegistry(m);
    const issues = r.validate(m);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("binding-clip-missing");
    expect(issues[0].clipId).toBe("nonexistent");
  });

  it("flags duplicate (rig,action)", () => {
    const m = manifest();
    m.bindings.push({
      rigId: "human",
      action: "idle",
      clipId: "humanAttackOneHand",
    });
    const r = new AnimationRegistry(m);
    const issues = r.validate(m);
    const dup = issues.find((i) => i.kind === "duplicate-binding");
    expect(dup).toBeDefined();
    expect(dup?.rigId).toBe("human");
    expect(dup?.action).toBe("idle");
  });
});

describe("AnimationRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new AnimationRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new AnimationRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new AnimationRegistry();
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
