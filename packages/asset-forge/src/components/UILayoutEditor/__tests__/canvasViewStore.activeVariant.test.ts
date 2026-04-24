/**
 * U9 follow-up — `activeVariant` selector on the canvas view store.
 *
 * Verifies:
 *   - default is `"base"`
 *   - `setActiveVariant` accepts every valid `ActiveVariant` value
 *   - no-op when setting the same value (reference stability)
 *   - unknown values are ignored (defensive)
 */

/**
 * zustand v5's persist middleware captures `window.localStorage` at
 * module-import time. jsdom *does* provide localStorage, but in this
 * project's test setup the canvas store module ends up importing
 * before that binding is usable, so the captured reference later
 * throws `storage.setItem is not a function`. We install an
 * in-memory Storage-compatible stub on `window` + `globalThis`
 * *before* the store module loads via a top-level `vi.hoisted`
 * block.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const map = new Map<string, string>();
  const impl = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
  const g = globalThis as unknown as { window?: { localStorage?: unknown } };
  if (!g.window) g.window = {};
  g.window.localStorage = impl;
  (globalThis as unknown as { localStorage: unknown }).localStorage = impl;
});

const { ACTIVE_VARIANT_OPTIONS, useCanvasViewStore } =
  await import("../canvasViewStore");

beforeEach(() => {
  useCanvasViewStore.getState().setActiveVariant("base");
});

describe("canvasViewStore.activeVariant", () => {
  it("defaults to base", () => {
    expect(useCanvasViewStore.getState().activeVariant).toBe("base");
  });

  it("exposes base + every viewport key as valid options", () => {
    expect(ACTIVE_VARIANT_OPTIONS).toEqual([
      "base",
      "mobile",
      "tablet",
      "desktop",
    ]);
  });

  it("setActiveVariant switches to a viewport", () => {
    useCanvasViewStore.getState().setActiveVariant("mobile");
    expect(useCanvasViewStore.getState().activeVariant).toBe("mobile");
  });

  it("accepts tablet and desktop", () => {
    useCanvasViewStore.getState().setActiveVariant("tablet");
    expect(useCanvasViewStore.getState().activeVariant).toBe("tablet");
    useCanvasViewStore.getState().setActiveVariant("desktop");
    expect(useCanvasViewStore.getState().activeVariant).toBe("desktop");
  });

  it("switching back to base works", () => {
    useCanvasViewStore.getState().setActiveVariant("mobile");
    useCanvasViewStore.getState().setActiveVariant("base");
    expect(useCanvasViewStore.getState().activeVariant).toBe("base");
  });

  it("ignores unknown values defensively", () => {
    useCanvasViewStore.getState().setActiveVariant("mobile");
    // @ts-expect-error — intentionally invalid input
    useCanvasViewStore.getState().setActiveVariant("watch");
    expect(useCanvasViewStore.getState().activeVariant).toBe("mobile");
  });

  it("setting the same value is a no-op and preserves reference identity", () => {
    useCanvasViewStore.getState().setActiveVariant("tablet");
    const before = useCanvasViewStore.getState();
    useCanvasViewStore.getState().setActiveVariant("tablet");
    const after = useCanvasViewStore.getState();
    expect(after).toBe(before);
  });
});
