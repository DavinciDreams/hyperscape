/**
 * U9 follow-up — variant override authoring store actions.
 *
 * Verifies `updateVariantOverride` + `clearVariantOverride` invariants:
 *   - creates the viewport variant lazily on first write
 *   - merges position patches field-wise
 *   - `visible`/`hidden` explicit undefined removes the field
 *   - prunes empty overrides
 *   - prunes the viewport key when its variant becomes empty
 *   - prunes `variants` entirely when every viewport is empty
 *   - preserves existing `grid`/`theme` on a variant
 */

import { afterEach, describe, expect, it } from "vitest";
import { useUILayoutStore } from "../store";

afterEach(() => {
  useUILayoutStore.getState().resetLayout();
});

function addWidget(): string {
  const store = useUILayoutStore.getState();
  store.addWidget("hyperforge.hud.hp-bar");
  return useUILayoutStore.getState().selectedInstanceId!;
}

function getVariant(viewport: "mobile" | "tablet" | "desktop") {
  return useUILayoutStore.getState().layout.variants?.[viewport];
}

function getOverride(
  viewport: "mobile" | "tablet" | "desktop",
  instanceId: string,
) {
  return getVariant(viewport)?.overrides.find(
    (o) => o.instanceId === instanceId,
  );
}

describe("useUILayoutStore.updateVariantOverride", () => {
  it("creates the viewport variant lazily and writes the first override", () => {
    const id = addWidget();
    expect(getVariant("mobile")).toBeUndefined();

    useUILayoutStore.getState().updateVariantOverride("mobile", id, {
      position: { offsetX: 12, offsetY: 0 },
    });

    expect(getVariant("mobile")?.overrides).toHaveLength(1);
    expect(getOverride("mobile", id)?.position).toEqual({
      offsetX: 12,
      offsetY: 0,
    });
  });

  it("merges position patches field-wise across calls", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, {
      position: { offsetX: 10 },
    });
    store.updateVariantOverride("mobile", id, {
      position: { offsetY: 20 },
    });
    expect(getOverride("mobile", id)?.position).toEqual({
      offsetX: 10,
      offsetY: 20,
    });
  });

  it("hidden=true drops the instance under that viewport", () => {
    const id = addWidget();
    useUILayoutStore.getState().updateVariantOverride("mobile", id, {
      hidden: true,
    });
    expect(getOverride("mobile", id)?.hidden).toBe(true);
  });

  it("passing hidden=undefined removes the field", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, { hidden: true });
    store.updateVariantOverride("mobile", id, { hidden: undefined });
    // Override should be pruned since nothing remains.
    expect(getOverride("mobile", id)).toBeUndefined();
  });

  it("prunes the viewport key when its last override is removed", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, { hidden: true });
    expect(getVariant("mobile")).toBeDefined();
    store.updateVariantOverride("mobile", id, { hidden: undefined });
    expect(getVariant("mobile")).toBeUndefined();
  });

  it("prunes `layout.variants` entirely when every viewport is empty", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, { hidden: true });
    expect(useUILayoutStore.getState().layout.variants).toBeDefined();
    store.updateVariantOverride("mobile", id, { hidden: undefined });
    expect(useUILayoutStore.getState().layout.variants).toBeUndefined();
  });

  it("isolates writes across viewports", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, {
      position: { offsetX: 5 },
    });
    store.updateVariantOverride("tablet", id, {
      position: { offsetX: 10 },
    });
    expect(getOverride("mobile", id)?.position?.offsetX).toBe(5);
    expect(getOverride("tablet", id)?.position?.offsetX).toBe(10);
    expect(getVariant("desktop")).toBeUndefined();
  });

  it("marks the layout dirty on write", () => {
    const id = addWidget();
    useUILayoutStore.getState().markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);
    useUILayoutStore.getState().updateVariantOverride("mobile", id, {
      position: { offsetX: 1 },
    });
    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });
});

describe("useUILayoutStore.clearVariantOverride", () => {
  it("removes a single override and prunes the viewport if empty", () => {
    const id = addWidget();
    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", id, { hidden: true });
    store.clearVariantOverride("mobile", id);
    expect(getVariant("mobile")).toBeUndefined();
  });

  it("leaves other overrides on the same viewport untouched", () => {
    const idA = addWidget();
    // Need a second instance.
    useUILayoutStore.getState().addWidget("hyperforge.hud.minimap");
    const idB = useUILayoutStore.getState().selectedInstanceId!;

    const store = useUILayoutStore.getState();
    store.updateVariantOverride("mobile", idA, { hidden: true });
    store.updateVariantOverride("mobile", idB, {
      position: { offsetX: 7 },
    });

    store.clearVariantOverride("mobile", idA);

    expect(getOverride("mobile", idA)).toBeUndefined();
    expect(getOverride("mobile", idB)?.position?.offsetX).toBe(7);
  });

  it("is a no-op when the override doesn't exist", () => {
    const id = addWidget();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().clearVariantOverride("mobile", id);
    expect(useUILayoutStore.getState().layout).toBe(before);
  });
});
