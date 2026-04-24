/**
 * useUserInputBindings — round-trip + rehydrate hardening.
 *
 * Covers:
 *   - setActionChords persists + replaces, is keyed by manifestId
 *   - chords: null clears the override (falls back to defaults)
 *   - chords: [] unbinds (still persists)
 *   - last override removed prunes the manifest entry
 *   - clearManifest / clearAll
 *   - rehydrate merge drops corrupt entries via safeLoadUserInputBindings
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "hyperia-user-input-bindings";
const STORAGE_VERSION = 1;

async function freshStore() {
  vi.resetModules();
  const mod = await import("../../../src/ui-framework/useUserInputBindings");
  return mod.useUserInputBindingsStore as unknown as {
    getState(): {
      byManifest: Record<
        string,
        {
          bindings: Array<{
            actionId: string;
            chords: Array<{ key?: string; modifiers: string[] }>;
          }>;
        }
      >;
      setActionChords: (
        manifestId: string,
        actionId: string,
        chords: Array<{ key?: string; modifiers: string[] }> | null,
      ) => void;
      clearManifest: (manifestId: string) => void;
      clearAll: () => void;
    };
    persist: { rehydrate: () => Promise<void> | void };
  };
}

function seed(raw: unknown): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ state: raw, version: STORAGE_VERSION }),
  );
}

describe("useUserInputBindings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists a new override and reads it back", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    store
      .getState()
      .setActionChords("default", "attack", [{ key: "KeyA", modifiers: [] }]);
    const entry = store.getState().byManifest["default"];
    expect(entry?.bindings).toHaveLength(1);
    expect(entry?.bindings[0]?.actionId).toBe("attack");
  });

  it("replaces an existing override for the same actionId", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords } = store.getState();
    setActionChords("m", "attack", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("m", "attack", [{ key: "KeyB", modifiers: [] }]);
    const b = store.getState().byManifest["m"]?.bindings;
    expect(b).toHaveLength(1);
    expect(b?.[0]?.chords[0]?.key).toBe("KeyB");
  });

  it("clears a single override via chords: null", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords } = store.getState();
    setActionChords("m", "attack", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("m", "block", [{ key: "KeyS", modifiers: [] }]);
    setActionChords("m", "attack", null);
    const entry = store.getState().byManifest["m"];
    expect(entry?.bindings).toHaveLength(1);
    expect(entry?.bindings[0]?.actionId).toBe("block");
  });

  it("chords: [] persists as an explicit unbind", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    store.getState().setActionChords("m", "attack", []);
    const entry = store.getState().byManifest["m"];
    expect(entry?.bindings).toHaveLength(1);
    expect(entry?.bindings[0]?.chords).toEqual([]);
  });

  it("prunes the manifest entry when the last override is removed", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords } = store.getState();
    setActionChords("m", "attack", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("m", "attack", null);
    expect(store.getState().byManifest["m"]).toBeUndefined();
  });

  it("isolates overrides between manifestIds", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords } = store.getState();
    setActionChords("a", "attack", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("b", "attack", [{ key: "KeyB", modifiers: [] }]);
    expect(store.getState().byManifest["a"]?.bindings).toHaveLength(1);
    expect(store.getState().byManifest["b"]?.bindings).toHaveLength(1);
  });

  it("clearManifest removes only the targeted manifest", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords, clearManifest } = store.getState();
    setActionChords("a", "x", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("b", "y", [{ key: "KeyB", modifiers: [] }]);
    clearManifest("a");
    expect(store.getState().byManifest["a"]).toBeUndefined();
    expect(store.getState().byManifest["b"]).toBeDefined();
  });

  it("clearAll removes every override", async () => {
    const store = await freshStore();
    await store.persist.rehydrate();
    const { setActionChords, clearAll } = store.getState();
    setActionChords("a", "x", [{ key: "KeyA", modifiers: [] }]);
    setActionChords("b", "y", [{ key: "KeyB", modifiers: [] }]);
    clearAll();
    expect(store.getState().byManifest).toEqual({});
  });

  it("drops corrupt entries on rehydrate", async () => {
    seed({
      byManifest: {
        good: {
          schemaVersion: 1,
          manifestId: "good",
          updatedAt: 0,
          bindings: [],
        },
        bad: { manifestId: "bad", bindings: [] }, // missing schemaVersion
        garbage: "nope",
      },
    });
    const store = await freshStore();
    await store.persist.rehydrate();
    expect(Object.keys(store.getState().byManifest)).toEqual(["good"]);
  });

  it("rehydrates empty when byManifest is not an object", async () => {
    seed({ byManifest: "not-an-object" });
    const store = await freshStore();
    await store.persist.rehydrate();
    expect(store.getState().byManifest).toEqual({});
  });
});
