import { describe, expect, it } from "vitest";
import { buildPluginFailureWindow } from "../PluginFailureWindow.js";
import type { PluginLifecycleEvent } from "../PluginLifecycleJournal.js";
import type { LifecyclePhase } from "../PluginLoader.js";

function ev(
  pluginId: string,
  phase: LifecyclePhase,
  outcome: "success" | "failed",
  at: number,
): PluginLifecycleEvent {
  return { pluginId, phase, outcome, at };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_000_000_000;

describe("buildPluginFailureWindow — defaults", () => {
  it("uses 24h window by default", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [ev("com.x", "load", "failed", NOW - 12 * HOUR)],
      { now: NOW },
    );
    expect(w.windowMs).toBe(DAY);
    expect(w.windowStart).toBe(NOW - DAY);
    expect(w.windowEnd).toBe(NOW);
    expect(w.failureCount).toBe(1);
  });

  it("returns zero counts on empty input", () => {
    const w = buildPluginFailureWindow("com.x", [], { now: NOW });
    expect(w.failureCount).toBe(0);
    expect(w.entries).toEqual([]);
    expect(w.perPhase).toEqual({ load: 0, enable: 0, disable: 0 });
  });
});

describe("buildPluginFailureWindow — filtering", () => {
  it("ignores other plugins", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.y", "load", "failed", NOW - HOUR),
        ev("com.x", "load", "failed", NOW - HOUR),
      ],
      { now: NOW },
    );
    expect(w.failureCount).toBe(1);
  });

  it("ignores success events", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "load", "success", NOW - HOUR),
        ev("com.x", "enable", "failed", NOW - HOUR),
      ],
      { now: NOW },
    );
    expect(w.failureCount).toBe(1);
    expect(w.perPhase.load).toBe(0);
    expect(w.perPhase.enable).toBe(1);
  });

  it("excludes events outside window", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "load", "failed", NOW - 2 * DAY), // too old
        ev("com.x", "enable", "failed", NOW - HOUR), // in window
        ev("com.x", "disable", "failed", NOW + HOUR), // future
      ],
      { now: NOW },
    );
    expect(w.failureCount).toBe(1);
    expect(w.entries[0].phase).toBe("enable");
  });

  it("includes events at exact boundary (windowStart inclusive)", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "load", "failed", NOW - DAY), // at lower bound
        ev("com.x", "enable", "failed", NOW), // at upper bound
      ],
      { now: NOW },
    );
    expect(w.failureCount).toBe(2);
  });
});

describe("buildPluginFailureWindow — per-phase + ordering", () => {
  it("counts failures per phase independently", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "load", "failed", NOW - 4 * HOUR),
        ev("com.x", "load", "failed", NOW - 3 * HOUR),
        ev("com.x", "enable", "failed", NOW - 2 * HOUR),
        ev("com.x", "disable", "failed", NOW - HOUR),
      ],
      { now: NOW },
    );
    expect(w.failureCount).toBe(4);
    expect(w.perPhase).toEqual({ load: 2, enable: 1, disable: 1 });
  });

  it("sorts entries oldest-first even if input is shuffled", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "disable", "failed", NOW - HOUR),
        ev("com.x", "load", "failed", NOW - 4 * HOUR),
        ev("com.x", "enable", "failed", NOW - 2 * HOUR),
      ],
      { now: NOW },
    );
    expect(w.entries.map((e) => e.at)).toEqual([
      NOW - 4 * HOUR,
      NOW - 2 * HOUR,
      NOW - HOUR,
    ]);
  });
});

describe("buildPluginFailureWindow — custom window", () => {
  it("respects custom windowMs", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [
        ev("com.x", "load", "failed", NOW - 30 * 60 * 1000), // 30min ago
        ev("com.x", "enable", "failed", NOW - 90 * 60 * 1000), // 90min ago
      ],
      { now: NOW, windowMs: HOUR },
    );
    expect(w.failureCount).toBe(1);
    expect(w.windowMs).toBe(HOUR);
  });

  it("clamps windowMs to >= 1", () => {
    const w = buildPluginFailureWindow(
      "com.x",
      [ev("com.x", "load", "failed", NOW)],
      { now: NOW, windowMs: 0 },
    );
    expect(w.windowMs).toBe(1);
    // event at NOW is still inclusive on both bounds (NOW-1 .. NOW)
    expect(w.failureCount).toBe(1);
  });
});
