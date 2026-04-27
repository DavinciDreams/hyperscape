import { PhysicsConfigManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  PhysicsConfigNotLoadedError,
  PhysicsConfigRegistry,
  UnknownCollisionLayerError,
  UnknownPhysicsMaterialError,
} from "../PhysicsConfigRegistry.js";

function manifest() {
  return PhysicsConfigManifestSchema.parse({
    materials: [
      { id: "default", name: "Default" },
      { id: "ice", name: "Ice", staticFriction: 0.1, dynamicFriction: 0.05 },
    ],
    defaultMaterialId: "default",
    layers: [
      { id: "default", name: "Default" },
      { id: "player", name: "Player" },
      { id: "enemy", name: "Enemy" },
      { id: "trigger", name: "Trigger" },
    ],
    defaultInteraction: "collide",
    matrix: [
      { a: "player", b: "trigger", kind: "overlap" },
      { a: "enemy", b: "player", kind: "ignore" },
    ],
  });
}

describe("PhysicsConfigRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new PhysicsConfigRegistry().manifest).toThrow(
      PhysicsConfigNotLoadedError,
    );
  });

  it("indexes materials + layers", () => {
    const r = new PhysicsConfigRegistry(manifest());
    expect(r.hasMaterial("ice")).toBe(true);
    expect(r.hasMaterial("ghost")).toBe(false);
    expect(r.material("ice").staticFriction).toBe(0.1);
    expect(() => r.material("ghost")).toThrow(UnknownPhysicsMaterialError);
    expect(r.hasLayer("player")).toBe(true);
    expect(r.layer("player").name).toBe("Player");
    expect(() => r.layer("ghost")).toThrow(UnknownCollisionLayerError);
  });

  it("defaultMaterial resolves id", () => {
    const r = new PhysicsConfigRegistry(manifest());
    expect(r.defaultMaterial()?.id).toBe("default");
  });

  it("interactionFor unordered pair", () => {
    const r = new PhysicsConfigRegistry(manifest());
    // Explicit entry — both orderings resolve.
    expect(r.interactionFor("player", "trigger")).toBe("overlap");
    expect(r.interactionFor("trigger", "player")).toBe("overlap");
    // Explicit entry resolves regardless of order.
    expect(r.interactionFor("player", "enemy")).toBe("ignore");
    expect(r.interactionFor("enemy", "player")).toBe("ignore");
    // Fallback to default for pairs without entries.
    expect(r.interactionFor("player", "default")).toBe("collide");
    expect(r.interactionFor("enemy", "trigger")).toBe("collide");
  });

  it("enabled + defaultInteraction getters", () => {
    const r = new PhysicsConfigRegistry(manifest());
    expect(r.enabled).toBe(true);
    expect(r.defaultInteraction).toBe("collide");
  });
});

describe("PhysicsConfigRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new PhysicsConfigRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new PhysicsConfigRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new PhysicsConfigRegistry();
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
