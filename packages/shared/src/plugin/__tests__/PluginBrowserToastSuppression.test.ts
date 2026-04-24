import { describe, expect, it } from "vitest";
import type { PluginBrowserToastIntent } from "../PluginBrowserToastRouter.js";
import {
  emptyToastSuppressionState,
  filterPluginBrowserToastIntents,
  pruneToastSuppressionState,
} from "../PluginBrowserToastSuppression.js";

function intent(
  id: string,
  pluginId: string = id.split(":")[1] ?? "com.x",
): PluginBrowserToastIntent {
  return {
    id,
    kind: "regressed",
    severity: "error",
    pluginId,
    previous: null,
    current: null,
  };
}

describe("filterPluginBrowserToastIntents — first emission", () => {
  it("emits everything when previous state is empty", () => {
    const r = filterPluginBrowserToastIntents(
      [intent("regressed:a"), intent("removed:b")],
      { now: 1000, previousState: emptyToastSuppressionState() },
    );
    expect(r.emitted.map((i) => i.id)).toEqual(["regressed:a", "removed:b"]);
    expect(r.suppressed).toEqual([]);
    expect(r.nextState.shown.get("regressed:a")).toBe(1000);
    expect(r.nextState.shown.get("removed:b")).toBe(1000);
  });
});

describe("filterPluginBrowserToastIntents — repeat emission", () => {
  it("suppresses ids already in previous state (cooldown = 0)", () => {
    const first = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    const second = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 2000,
      previousState: first.nextState,
    });
    expect(second.emitted).toEqual([]);
    expect(second.suppressed.map((i) => i.id)).toEqual(["regressed:a"]);
    // State unchanged when suppressed.
    expect(second.nextState.shown.get("regressed:a")).toBe(1000);
  });

  it("re-emits after cooldownMs elapses", () => {
    const first = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    const second = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 6000,
      previousState: first.nextState,
      cooldownMs: 5000,
    });
    expect(second.emitted.map((i) => i.id)).toEqual(["regressed:a"]);
    expect(second.nextState.shown.get("regressed:a")).toBe(6000);
  });

  it("does not re-emit before cooldown elapses", () => {
    const first = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    const second = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 2000,
      previousState: first.nextState,
      cooldownMs: 5000,
    });
    expect(second.emitted).toEqual([]);
    expect(second.suppressed).toHaveLength(1);
  });

  it("cooldown boundary is inclusive (>= cooldownMs)", () => {
    const first = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    const second = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 6000,
      previousState: first.nextState,
      cooldownMs: 5000,
    });
    expect(second.emitted).toHaveLength(1);
  });
});

describe("filterPluginBrowserToastIntents — mixed", () => {
  it("emits new ids while suppressing known ones in the same call", () => {
    const first = filterPluginBrowserToastIntents([intent("regressed:a")], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    const second = filterPluginBrowserToastIntents(
      [intent("regressed:a"), intent("added:b")],
      { now: 2000, previousState: first.nextState },
    );
    expect(second.emitted.map((i) => i.id)).toEqual(["added:b"]);
    expect(second.suppressed.map((i) => i.id)).toEqual(["regressed:a"]);
    expect(second.nextState.shown.get("added:b")).toBe(2000);
    expect(second.nextState.shown.get("regressed:a")).toBe(1000);
  });

  it("passes through all ids unchanged when input is empty", () => {
    const r = filterPluginBrowserToastIntents([], {
      now: 1000,
      previousState: emptyToastSuppressionState(),
    });
    expect(r.emitted).toEqual([]);
    expect(r.suppressed).toEqual([]);
    expect(r.nextState.shown.size).toBe(0);
  });
});

describe("pruneToastSuppressionState", () => {
  it("drops entries strictly older than now - retainMs", () => {
    const state = {
      shown: new Map([
        ["old", 1000],
        ["mid", 5000],
        ["new", 9000],
      ]),
    };
    const pruned = pruneToastSuppressionState(state, {
      now: 10_000,
      retainMs: 5000,
    });
    expect(Array.from(pruned.shown.keys()).sort()).toEqual(["mid", "new"]);
  });

  it("retains entries exactly at the cutoff (>=)", () => {
    const state = {
      shown: new Map([["cutoff", 5000]]),
    };
    const pruned = pruneToastSuppressionState(state, {
      now: 10_000,
      retainMs: 5000,
    });
    expect(pruned.shown.has("cutoff")).toBe(true);
  });

  it("returns an empty state when everything is older", () => {
    const state = { shown: new Map([["a", 0]]) };
    const pruned = pruneToastSuppressionState(state, {
      now: 10_000,
      retainMs: 1000,
    });
    expect(pruned.shown.size).toBe(0);
  });
});

describe("emptyToastSuppressionState", () => {
  it("returns a distinct fresh map each call", () => {
    const a = emptyToastSuppressionState();
    const b = emptyToastSuppressionState();
    expect(a.shown).not.toBe(b.shown);
    expect(a.shown.size).toBe(0);
  });
});
