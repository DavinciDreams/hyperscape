import { describe, expect, it } from "vitest";
import {
  PluginLifecycleJournal,
  type PluginLifecycleEvent,
} from "../PluginLifecycleJournal.js";

function ev(
  at: number,
  pluginId: string,
  phase: "load" | "enable" | "disable",
  outcome: "success" | "failed" = "success",
  errorMessage?: string,
): PluginLifecycleEvent {
  return { at, pluginId, phase, outcome, errorMessage };
}

describe("PluginLifecycleJournal", () => {
  it("starts empty", () => {
    const j = new PluginLifecycleJournal();
    expect(j.size).toBe(0);
    expect(j.all()).toEqual([]);
  });

  it("records entries in append order", () => {
    const j = new PluginLifecycleJournal();
    j.record(ev(1, "com.a", "load"));
    j.record(ev(2, "com.a", "enable"));
    j.record(ev(3, "com.b", "load"));
    expect(j.size).toBe(3);
    expect(j.all().map((e) => e.pluginId)).toEqual(["com.a", "com.a", "com.b"]);
  });

  it("evicts oldest entries on overflow (ring buffer)", () => {
    const j = new PluginLifecycleJournal(3);
    j.record(ev(1, "com.a", "load"));
    j.record(ev(2, "com.b", "load"));
    j.record(ev(3, "com.c", "load"));
    j.record(ev(4, "com.d", "load"));
    expect(j.size).toBe(3);
    expect(j.all().map((e) => e.pluginId)).toEqual(["com.b", "com.c", "com.d"]);
  });

  it("defaults capacity to 200", () => {
    const j = new PluginLifecycleJournal();
    expect(j.capacity).toBe(200);
  });

  it("rejects non-positive or non-integer capacity", () => {
    expect(() => new PluginLifecycleJournal(0)).toThrow(RangeError);
    expect(() => new PluginLifecycleJournal(-1)).toThrow(RangeError);
    expect(() => new PluginLifecycleJournal(1.5)).toThrow(RangeError);
  });

  it("forPlugin returns only matching entries in record order", () => {
    const j = new PluginLifecycleJournal();
    j.record(ev(1, "com.a", "load"));
    j.record(ev(2, "com.b", "load"));
    j.record(ev(3, "com.a", "enable"));
    expect(j.forPlugin("com.a").map((e) => e.at)).toEqual([1, 3]);
    expect(j.forPlugin("com.b").map((e) => e.at)).toEqual([2]);
    expect(j.forPlugin("com.c")).toEqual([]);
  });

  it("filter returns matching entries in record order", () => {
    const j = new PluginLifecycleJournal();
    j.record(ev(1, "com.a", "load", "success"));
    j.record(ev(2, "com.a", "enable", "failed", "boom"));
    j.record(ev(3, "com.b", "load", "success"));
    const failed = j.filter((e) => e.outcome === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].errorMessage).toBe("boom");
  });

  it("clear drops all retained events", () => {
    const j = new PluginLifecycleJournal();
    j.record(ev(1, "com.a", "load"));
    j.record(ev(2, "com.b", "load"));
    j.clear();
    expect(j.size).toBe(0);
    expect(j.all()).toEqual([]);
  });

  it("all() returns a fresh copy (mutation-safe)", () => {
    const j = new PluginLifecycleJournal();
    j.record(ev(1, "com.a", "load"));
    const snapshot = j.all() as PluginLifecycleEvent[];
    snapshot.length = 0;
    expect(j.size).toBe(1);
  });
});
