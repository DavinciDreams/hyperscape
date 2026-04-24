/**
 * U11 hardening — the zustand `merge` callback on the user-layout
 * store must silently drop persisted entries that fail
 * `safeLoadUserLayout` instead of letting them propagate into the HUD
 * and crash the renderer. These tests seed localStorage with
 * known-bad blobs and assert the store rehydrates clean.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSafeLoadFailureHandler } from "../../../src/ui-framework/safeLoadReport";

const STORAGE_KEY = "hyperia-user-layout";
const STORAGE_VERSION = 1;

function seed(raw: unknown): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: raw, version: STORAGE_VERSION }),
  );
}

async function freshStore() {
  vi.resetModules();
  const mod = await import("../../../src/ui-framework/useUserLayout");
  return mod.useUserLayoutStore as unknown as {
    getState(): { layouts: Record<string, unknown> };
    persist: { rehydrate: () => Promise<void> | void };
  };
}

describe("useUserLayout rehydrate hardening", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    _resetSafeLoadFailureHandler();
  });

  it("drops entries that fail safeLoadUserLayout", async () => {
    seed({
      layouts: {
        // valid v1
        good: {
          schemaVersion: 1,
          layoutId: "good",
          updatedAt: 0,
          overrides: [],
        },
        // missing schemaVersion → malformed
        bad: { layoutId: "bad", overrides: [] },
        // not an object at all
        garbage: "nope",
      },
    });

    const store = await freshStore();
    await store.persist.rehydrate();
    const layouts = store.getState().layouts;
    expect(Object.keys(layouts)).toEqual(["good"]);
  });

  it("rehydrates empty when storage is corrupt", async () => {
    seed({ layouts: "not-an-object" });
    const store = await freshStore();
    await store.persist.rehydrate();
    expect(store.getState().layouts).toEqual({});
  });

  it("is a no-op when storage is empty", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    expect(store.getState().layouts).toEqual({});
  });

  it("reports each dropped entry via the safeLoad telemetry hook", async () => {
    seed({
      layouts: {
        bad: { layoutId: "bad", overrides: [] }, // missing schemaVersion
        garbage: "nope",
      },
    });
    // resetModules happens inside freshStore(); install the spy on the
    // *fresh* safeLoadReport module so we observe the same instance that
    // the reloaded useUserLayout module imports.
    const store = await freshStore();
    const report = await import("../../../src/ui-framework/safeLoadReport");
    const spy = vi.fn();
    report.setSafeLoadFailureHandler(spy);

    await store.persist.rehydrate();
    expect(store.getState().layouts).toEqual({});
    expect(spy).toHaveBeenCalledTimes(2);
    const contexts = spy.mock.calls.map((c) => c[0]);
    expect(contexts.every((c) => c === "user-layout-merge")).toBe(true);
    report._resetSafeLoadFailureHandler();
  });
});
