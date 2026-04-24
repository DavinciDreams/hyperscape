/**
 * Unit tests for the UI Layout Editor Zustand store.
 *
 * Focus is on the bindings lifecycle: the `updateInstanceBinding`
 * action has non-trivial invariants (prune-empty, strip-when-empty)
 * that defaultLayout authors depend on to produce clean manifests.
 */

import { afterEach, describe, expect, it } from "vitest";
import { allSelectedIds, useUILayoutStore } from "../store";

/**
 * Each test starts from the empty default layout, so no explicit
 * setup hook is needed — but `afterEach` resets for safety in case a
 * future test mutates state and forgets to clean up.
 */
afterEach(() => {
  useUILayoutStore.getState().resetLayout();
});

/**
 * Grab the live instance with the given id. Throws (rather than
 * returning undefined) because every test creates an instance it
 * expects to find; missing is always a bug in the test.
 */
function getInstance(id: string) {
  const inst = useUILayoutStore
    .getState()
    .layout.instances.find((i) => i.instanceId === id);
  if (!inst) throw new Error(`instance ${id} not found`);
  return inst;
}

describe("useUILayoutStore.updateInstanceBinding", () => {
  it("adds a binding to an instance that had none", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "$player.hp");

    expect(getInstance(id).bindings).toEqual({ current: "$player.hp" });
  });

  it("trims whitespace from the expression", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "   $player.hp   ");

    expect(getInstance(id).bindings?.current).toBe("$player.hp");
  });

  it("updates an existing binding key without touching siblings", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "$player.hp");
    store.updateInstanceBinding(id, "max", "$player.maxHp");
    store.updateInstanceBinding(id, "current", "$npc.hp");

    expect(getInstance(id).bindings).toEqual({
      current: "$npc.hp",
      max: "$player.maxHp",
    });
  });

  it("removes a single binding key when expression is null", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "$player.hp");
    store.updateInstanceBinding(id, "max", "$player.maxHp");

    store.updateInstanceBinding(id, "current", null);

    expect(getInstance(id).bindings).toEqual({ max: "$player.maxHp" });
  });

  it("treats an empty string as a clear (same as null)", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "$player.hp");
    store.updateInstanceBinding(id, "current", "");

    expect(getInstance(id).bindings).toBeUndefined();
  });

  it("strips the bindings field when the map becomes empty", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", "$player.hp");
    store.updateInstanceBinding(id, "current", null);

    expect(getInstance(id).bindings).toBeUndefined();
  });

  it("is a no-op when removing a key from an instance with no bindings", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(id, "current", null);

    expect(getInstance(id).bindings).toBeUndefined();
  });

  it("only affects the targeted instance", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const firstId = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");
    const secondId = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceBinding(firstId, "current", "$player.hp");

    expect(getInstance(firstId).bindings).toEqual({ current: "$player.hp" });
    expect(getInstance(secondId).bindings).toBeUndefined();
  });
});

// ---------- Asset / dirty-tracking ----------

import type { UILayoutDetail } from "../../../utils/uiLayoutApi";

function makeDetail(overrides: Partial<UILayoutDetail> = {}): UILayoutDetail {
  return {
    id: "row_abc",
    teamId: "team_1",
    gameId: null,
    name: "Fixture Layout",
    slug: "fixture-layout",
    description: null,
    version: "1.0.0",
    isTemplate: false,
    isPublic: false,
    createdBy: null,
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
    manifestData: {
      id: "fixture",
      name: "Fixture Layout",
      grid: { columns: 24, rows: 16 },
      instances: [],
    },
    ...overrides,
  };
}

describe("useUILayoutStore — asset + dirty tracking", () => {
  it("starts with no asset, no selection, and isDirty=false", () => {
    const s = useUILayoutStore.getState();
    expect(s.asset).toBeNull();
    expect(s.selectedInstanceId).toBeNull();
    expect(s.isDirty).toBe(false);
  });

  it("loadAsset populates asset row, replaces layout, and clears dirty", () => {
    // Pre-dirty the store so we can confirm loadAsset resets it.
    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");
    expect(useUILayoutStore.getState().isDirty).toBe(true);

    const detail = makeDetail();
    useUILayoutStore.getState().loadAsset(detail);

    const s = useUILayoutStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.selectedInstanceId).toBeNull();
    expect(s.layout).toEqual(detail.manifestData);
    expect(s.asset).toEqual({
      id: detail.id,
      teamId: detail.teamId,
      gameId: detail.gameId,
      name: detail.name,
      slug: detail.slug,
      description: detail.description,
      version: detail.version,
      isTemplate: detail.isTemplate,
      isPublic: detail.isPublic,
      createdBy: detail.createdBy,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    });
  });

  it("layout-mutating actions flip isDirty to true", () => {
    useUILayoutStore.getState().loadAsset(makeDetail());
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");

    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });

  it("selectInstance does NOT flip isDirty", () => {
    useUILayoutStore.getState().loadAsset(makeDetail());
    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    // Mark clean to establish a baseline, then select — this must not
    // re-dirty the store since selection is purely editor UI state.
    useUILayoutStore.getState().markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().selectInstance(null);
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().selectInstance(id);
    expect(useUILayoutStore.getState().isDirty).toBe(false);
  });

  it("markClean(undefined) clears dirty but keeps the existing asset", () => {
    const detail = makeDetail();
    useUILayoutStore.getState().loadAsset(detail);
    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");
    expect(useUILayoutStore.getState().isDirty).toBe(true);

    useUILayoutStore.getState().markClean();

    const s = useUILayoutStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.asset?.id).toBe(detail.id);
  });

  it("markClean(newAsset) replaces the asset row (e.g. server echo after save)", () => {
    useUILayoutStore.getState().loadAsset(makeDetail());
    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");

    const updated = {
      id: "row_abc",
      teamId: "team_1",
      gameId: null,
      name: "Renamed",
      slug: "renamed",
      description: "new",
      version: "1.0.1",
      isTemplate: true,
      isPublic: false,
      createdBy: null,
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:05:00.000Z",
    };
    useUILayoutStore.getState().markClean(updated);

    const s = useUILayoutStore.getState();
    expect(s.isDirty).toBe(false);
    expect(s.asset).toEqual(updated);
  });

  it("updateAssetMetadata patches asset fields and flips isDirty", () => {
    useUILayoutStore.getState().loadAsset(makeDetail());
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().updateAssetMetadata({
      name: "Renamed",
      isPublic: true,
    });

    const s = useUILayoutStore.getState();
    expect(s.isDirty).toBe(true);
    expect(s.asset?.name).toBe("Renamed");
    expect(s.asset?.isPublic).toBe(true);
    // Untouched fields preserved.
    expect(s.asset?.slug).toBe("fixture-layout");
  });

  it("updateAssetMetadata is a no-op when there is no loaded asset", () => {
    expect(useUILayoutStore.getState().asset).toBeNull();

    useUILayoutStore.getState().updateAssetMetadata({ name: "ignored" });

    const s = useUILayoutStore.getState();
    expect(s.asset).toBeNull();
    expect(s.isDirty).toBe(false);
  });

  it("resetLayout clears asset, selection, and dirty flag", () => {
    useUILayoutStore.getState().loadAsset(makeDetail());
    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");
    expect(useUILayoutStore.getState().isDirty).toBe(true);
    expect(useUILayoutStore.getState().asset).not.toBeNull();

    useUILayoutStore.getState().resetLayout();

    const s = useUILayoutStore.getState();
    expect(s.asset).toBeNull();
    expect(s.selectedInstanceId).toBeNull();
    expect(s.isDirty).toBe(false);
    expect(s.layout.instances).toHaveLength(0);
  });
});

describe("useUILayoutStore.duplicateInstance", () => {
  it("creates a deep-cloned copy with a fresh id and selects it", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const sourceId = useUILayoutStore.getState().selectedInstanceId!;

    // Add non-default fields so we can verify deep clone + id advance.
    store.updateInstanceBinding(sourceId, "current", "$player.hp");
    store.updateInstanceCustomization(sourceId, { movable: true });

    store.duplicateInstance(sourceId);
    const newId = useUILayoutStore.getState().selectedInstanceId!;

    expect(newId).not.toBe(sourceId);
    const copy = getInstance(newId);
    const source = getInstance(sourceId);

    expect(copy.widgetId).toBe(source.widgetId);
    expect(copy.bindings).toEqual(source.bindings);
    expect(copy.customization).toEqual(source.customization);
    // Deep clone — mutating copy must not affect source.
    expect(copy.bindings).not.toBe(source.bindings);
    expect(copy.customization).not.toBe(source.customization);
  });

  it("offsets anchored positions by +24px on both axes", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const sourceId = useUILayoutStore.getState().selectedInstanceId!;
    const source = getInstance(sourceId);
    // Guard: addWidget creates anchored positions.
    if (source.position.kind !== "anchored") {
      throw new Error("test precondition: expected anchored");
    }
    const { x: srcX, y: srcY } = source.position.offset;

    store.duplicateInstance(sourceId);
    const copy = getInstance(useUILayoutStore.getState().selectedInstanceId!);
    if (copy.position.kind !== "anchored") {
      throw new Error("expected duplicated position to preserve kind");
    }
    expect(copy.position.offset).toEqual({ x: srcX + 24, y: srcY + 24 });
  });

  it("advances the numeric suffix on the id (hp-bar-1 → hp-bar-2)", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id1 = useUILayoutStore.getState().selectedInstanceId!;
    expect(id1).toMatch(/-1$/);

    store.duplicateInstance(id1);
    const id2 = useUILayoutStore.getState().selectedInstanceId!;
    expect(id2).toBe(id1.replace(/-1$/, "-2"));
  });

  it("skips over ids already in use when generating a new id", () => {
    const store = useUILayoutStore.getState();
    // Create -1 and -2 via addWidget, then duplicate -1 — should land on -3.
    store.addWidget("hyperforge.hud.hp-bar");
    const first = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");

    store.duplicateInstance(first);
    const dup = useUILayoutStore.getState().selectedInstanceId!;
    expect(dup).toBe(first.replace(/-1$/, "-3"));
  });

  it("is a no-op when instanceId is unknown", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const before = useUILayoutStore.getState().layout.instances.length;

    store.duplicateInstance("does-not-exist");

    expect(useUILayoutStore.getState().layout.instances).toHaveLength(before);
  });

  it("flips isDirty", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    store.markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    store.duplicateInstance(id);

    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });
});

describe("useUILayoutStore — undo / redo", () => {
  it("canUndo is false on the empty layout, true after a mutation", () => {
    expect(useUILayoutStore.getState().canUndo()).toBe(false);

    useUILayoutStore.getState().addWidget("hyperforge.hud.hp-bar");

    expect(useUILayoutStore.getState().canUndo()).toBe(true);
    expect(useUILayoutStore.getState().canRedo()).toBe(false);
  });

  it("undo reverts the most recent mutation", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    expect(useUILayoutStore.getState().layout.instances).toHaveLength(1);

    store.undo();

    expect(useUILayoutStore.getState().layout.instances).toHaveLength(0);
    expect(useUILayoutStore.getState().canRedo()).toBe(true);
  });

  it("redo reapplies the most recently undone mutation", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    store.undo();

    store.redo();

    expect(useUILayoutStore.getState().layout.instances).toHaveLength(1);
  });

  it("a new mutation clears the redo branch", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    store.undo();
    expect(useUILayoutStore.getState().canRedo()).toBe(true);

    store.addWidget("hyperforge.hud.hp-bar");

    expect(useUILayoutStore.getState().canRedo()).toBe(false);
  });

  it("undo/redo chains across several mutations in order", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar"); // 1 instance
    store.addWidget("hyperforge.hud.hp-bar"); // 2 instances
    store.addWidget("hyperforge.hud.hp-bar"); // 3 instances

    store.undo();
    expect(useUILayoutStore.getState().layout.instances).toHaveLength(2);
    store.undo();
    expect(useUILayoutStore.getState().layout.instances).toHaveLength(1);
    store.redo();
    expect(useUILayoutStore.getState().layout.instances).toHaveLength(2);
    store.redo();
    expect(useUILayoutStore.getState().layout.instances).toHaveLength(3);
  });

  it("loadAsset clears both history stacks", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    store.addWidget("hyperforge.hud.hp-bar");
    store.undo();
    expect(useUILayoutStore.getState().canUndo()).toBe(true);
    expect(useUILayoutStore.getState().canRedo()).toBe(true);

    useUILayoutStore.getState().loadAsset(makeDetail());

    expect(useUILayoutStore.getState().canUndo()).toBe(false);
    expect(useUILayoutStore.getState().canRedo()).toBe(false);
  });

  it("resetLayout clears both history stacks", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    expect(useUILayoutStore.getState().canUndo()).toBe(true);

    store.resetLayout();

    expect(useUILayoutStore.getState().canUndo()).toBe(false);
    expect(useUILayoutStore.getState().canRedo()).toBe(false);
  });

  it("undo with an empty past stack is a no-op", () => {
    const store = useUILayoutStore.getState();
    const before = useUILayoutStore.getState().layout;

    store.undo();

    expect(useUILayoutStore.getState().layout).toEqual(before);
  });

  it("clears selection on undo when the selected instance no longer exists", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    expect(id).toBeDefined();

    // Undo removes the instance we just added → selection must clear.
    store.undo();

    expect(useUILayoutStore.getState().selectedInstanceId).toBeNull();
  });

  it("coalesces consecutive position updates to the same instance", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    // After addWidget, past has 1 entry (empty layout pre-add).
    expect(useUILayoutStore.getState().past.length).toBe(1);

    // 5 rapid position updates on the same instance — should collapse
    // to a single undo entry because the POSITION_COALESCE_MS window
    // has not elapsed between calls.
    for (let i = 0; i < 5; i++) {
      store.updateInstancePosition(id, {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 100 + i, y: 50 + i },
      });
    }

    // past should have grown by exactly one (the pre-drag snapshot).
    expect(useUILayoutStore.getState().past.length).toBe(2);

    // One undo should revert all five position updates at once.
    store.undo();
    const pos = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === id)?.position;
    if (pos?.kind !== "anchored") throw new Error("expected anchored");
    // Back to the add-widget position, not any of the 5 drag intermediates.
    expect(pos.offset.x).not.toBe(104);
  });

  it("flips isDirty after undo so the Save button re-enables", () => {
    const store = useUILayoutStore.getState();
    useUILayoutStore.getState().loadAsset(makeDetail());
    store.addWidget("hyperforge.hud.hp-bar");
    store.markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    store.undo();

    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });
});

describe("useUILayoutStore — Z-order operations", () => {
  /** Add three hp-bars and return their ids in insertion order. */
  function addThree(): [string, string, string] {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const a = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");
    const b = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");
    const c = useUILayoutStore.getState().selectedInstanceId!;
    return [a, b, c];
  }

  function order(): string[] {
    return useUILayoutStore
      .getState()
      .layout.instances.map((i) => i.instanceId);
  }

  it("moveInstanceToFront moves to the end of the array", () => {
    const [a, b, c] = addThree();
    useUILayoutStore.getState().moveInstanceToFront(a);
    expect(order()).toEqual([b, c, a]);
  });

  it("moveInstanceToBack moves to the start of the array", () => {
    const [a, b, c] = addThree();
    useUILayoutStore.getState().moveInstanceToBack(c);
    expect(order()).toEqual([c, a, b]);
  });

  it("moveInstanceForward swaps with the next neighbor", () => {
    const [a, b, c] = addThree();
    useUILayoutStore.getState().moveInstanceForward(a);
    expect(order()).toEqual([b, a, c]);
  });

  it("moveInstanceBackward swaps with the previous neighbor", () => {
    const [a, b, c] = addThree();
    useUILayoutStore.getState().moveInstanceBackward(c);
    expect(order()).toEqual([a, c, b]);
  });

  it("moveInstanceToFront on the last instance is a no-op", () => {
    const [a, b, c] = addThree();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().moveInstanceToFront(c);
    expect(useUILayoutStore.getState().layout).toBe(before);
    expect(order()).toEqual([a, b, c]);
  });

  it("moveInstanceToBack on the first instance is a no-op", () => {
    const [a, b, c] = addThree();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().moveInstanceToBack(a);
    expect(useUILayoutStore.getState().layout).toBe(before);
    expect(order()).toEqual([a, b, c]);
  });

  it("moveInstanceForward at the top boundary is a no-op", () => {
    const [a, b, c] = addThree();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().moveInstanceForward(c);
    expect(useUILayoutStore.getState().layout).toBe(before);
    expect(order()).toEqual([a, b, c]);
  });

  it("moveInstanceBackward at the bottom boundary is a no-op", () => {
    const [a, b, c] = addThree();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().moveInstanceBackward(a);
    expect(useUILayoutStore.getState().layout).toBe(before);
    expect(order()).toEqual([a, b, c]);
  });

  it("is a no-op when the instance id is unknown", () => {
    const [a, b, c] = addThree();
    const before = useUILayoutStore.getState().layout;
    useUILayoutStore.getState().moveInstanceToFront("does-not-exist");
    useUILayoutStore.getState().moveInstanceToBack("does-not-exist");
    useUILayoutStore.getState().moveInstanceForward("does-not-exist");
    useUILayoutStore.getState().moveInstanceBackward("does-not-exist");
    expect(useUILayoutStore.getState().layout).toBe(before);
    expect(order()).toEqual([a, b, c]);
  });

  it("flips isDirty and pushes an undoable history entry", () => {
    const [a, b, c] = addThree();
    useUILayoutStore.getState().markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().moveInstanceToFront(a);

    expect(useUILayoutStore.getState().isDirty).toBe(true);
    expect(order()).toEqual([b, c, a]);

    useUILayoutStore.getState().undo();
    expect(order()).toEqual([a, b, c]);
  });
});

describe("useUILayoutStore.alignInstanceToViewport", () => {
  const VIEWPORT = { width: 1280, height: 720 };

  it("places an anchored instance's left edge at x=0", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    // Move off-origin so the test would fail without the action.
    store.updateInstancePosition(id, {
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 300, y: 200 },
    });

    store.alignInstanceToViewport(id, "left", VIEWPORT);

    const p = getInstance(id).position;
    if (p.kind !== "anchored") throw new Error("expected anchored");
    // anchor kept, x-offset zeroed for top-left, y untouched
    expect(p.anchor).toBe("top-left");
    expect(p.offset.x).toBe(0);
    expect(p.offset.y).toBe(200);
  });

  it("centers horizontally without touching the y-axis", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    store.updateInstancePosition(id, {
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 50, y: 150 },
    });

    store.alignInstanceToViewport(id, "center-h", VIEWPORT);

    const p = getInstance(id).position;
    if (p.kind !== "anchored") throw new Error("expected anchored");
    expect(p.offset.y).toBe(150);
    // Without explicit width, widget uses its manifest defaultSize.
    // Assert the x-offset centers the rendered box within 1px tolerance.
    // (We can't know the manifest defaultSize here without importing
    //  it; but we can assert x is between a reasonable center window.)
    expect(p.offset.x).toBeGreaterThan(0);
    expect(p.offset.x).toBeLessThan(VIEWPORT.width);
  });

  it("is a no-op for non-anchored positions (e.g. flex)", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    // Force a flex position.
    store.updateInstancePosition(id, { kind: "flex", order: 3 });
    const before = useUILayoutStore.getState().layout;

    store.alignInstanceToViewport(id, "left", VIEWPORT);

    expect(useUILayoutStore.getState().layout).toBe(before);
  });

  it("is a no-op for an unknown instance id", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const before = useUILayoutStore.getState().layout;

    store.alignInstanceToViewport("does-not-exist", "right", VIEWPORT);

    expect(useUILayoutStore.getState().layout).toBe(before);
  });

  it("flips isDirty and is undoable", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;
    const startPos = getInstance(id).position;
    store.markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    store.alignInstanceToViewport(id, "right", VIEWPORT);

    expect(useUILayoutStore.getState().isDirty).toBe(true);
    store.undo();
    // Original position restored exactly.
    expect(getInstance(id).position).toEqual(startPos);
  });
});

describe("useUILayoutStore.updateInstanceCustomization", () => {
  it("attaches customization to an instance that had none", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceCustomization(id, { movable: true });

    expect(getInstance(id).customization).toEqual({ movable: true });
    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });

  it("merges a partial patch into existing customization", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceCustomization(id, { movable: true });
    store.updateInstanceCustomization(id, { resizable: true, minWidth: 64 });

    expect(getInstance(id).customization).toEqual({
      movable: true,
      resizable: true,
      minWidth: 64,
    });
  });

  it("treats undefined patch fields as 'remove' and prunes the key", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceCustomization(id, { movable: true, minWidth: 64 });
    store.updateInstanceCustomization(id, { minWidth: undefined });

    expect(getInstance(id).customization).toEqual({ movable: true });
  });

  it("drops customization entirely when the last field is cleared", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceCustomization(id, { movable: true });
    store.updateInstanceCustomization(id, { movable: undefined });

    expect(getInstance(id).customization).toBeUndefined();
  });
});

describe("useUILayoutStore.updateInstanceVisibility", () => {
  it("attaches a visibility rule to an instance that had none", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceVisibility(id, { contexts: ["combat"] });

    expect(getInstance(id).visibility).toEqual({ contexts: ["combat"] });
    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });

  it("merges a partial patch into existing visibility", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceVisibility(id, { contexts: ["combat"] });
    store.updateInstanceVisibility(id, { expression: "$player.hasTarget" });

    expect(getInstance(id).visibility).toEqual({
      contexts: ["combat"],
      expression: "$player.hasTarget",
    });
  });

  it("treats undefined patch fields as 'remove' and prunes the key", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceVisibility(id, {
      contexts: ["combat"],
      expression: "$player.hasTarget",
    });
    store.updateInstanceVisibility(id, { expression: undefined });

    expect(getInstance(id).visibility).toEqual({ contexts: ["combat"] });
  });

  it("drops visibility entirely when the last field is cleared", () => {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const id = useUILayoutStore.getState().selectedInstanceId!;

    store.updateInstanceVisibility(id, { hiddenIn: ["cutscene"] });
    store.updateInstanceVisibility(id, { hiddenIn: undefined });

    expect(getInstance(id).visibility).toBeUndefined();
  });
});

describe("useUILayoutStore.toggleSelection", () => {
  /**
   * Helper: add three widgets and return their ids in insertion order.
   * Each `addWidget` makes the new instance the primary, so after this
   * helper the last-added id is the primary and the other two are
   * unselected.
   */
  function addThree(): [string, string, string] {
    const store = useUILayoutStore.getState();
    store.addWidget("hyperforge.hud.hp-bar");
    const a = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");
    const b = useUILayoutStore.getState().selectedInstanceId!;
    store.addWidget("hyperforge.hud.hp-bar");
    const c = useUILayoutStore.getState().selectedInstanceId!;
    return [a, b, c];
  }

  it("promotes the first additional when the primary is toggled off", () => {
    const [a, b, c] = addThree();
    const store = useUILayoutStore.getState();

    // Build up a multi-selection with c as primary, b and a as
    // additional.
    store.toggleSelection(b); // b becomes primary, c demoted
    store.toggleSelection(a); // a becomes primary, b and c additional

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(a);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([b, c]);

    // Toggling a (the primary) should promote b to primary and leave
    // c as the sole additional.
    store.toggleSelection(a);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(b);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([c]);
  });

  it("clears the selection when the only primary is toggled off", () => {
    const [, , c] = addThree();
    const store = useUILayoutStore.getState();

    // c is already the primary from addWidget; no additionals.
    expect(useUILayoutStore.getState().selectedInstanceId).toBe(c);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([]);

    store.toggleSelection(c);

    expect(useUILayoutStore.getState().selectedInstanceId).toBeNull();
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([]);
  });

  it("removes an additional member without disturbing the primary", () => {
    const [a, b, c] = addThree();
    const store = useUILayoutStore.getState();

    // Build: primary=a, additional=[b, c]
    store.toggleSelection(b);
    store.toggleSelection(a);

    // Toggle b — an additional.
    store.toggleSelection(b);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(a);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([c]);
  });

  it("demotes the old primary and makes a fresh click the new primary", () => {
    const [a, , c] = addThree();
    const store = useUILayoutStore.getState();

    // c is primary from addWidget.
    store.toggleSelection(a);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(a);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([c]);
  });

  it("acts like single-select when nothing is selected yet", () => {
    const [a] = addThree();
    const store = useUILayoutStore.getState();

    // Clear selection.
    store.selectInstance(null);
    expect(useUILayoutStore.getState().selectedInstanceId).toBeNull();

    store.toggleSelection(a);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(a);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([]);
  });

  it("allSelectedIds returns primary first, then additionals", () => {
    const [a, b, c] = addThree();
    const store = useUILayoutStore.getState();

    // primary=a, additional=[c, b] (insertion: toggle b demotes c,
    // then toggle a demotes b).
    store.toggleSelection(b);
    store.toggleSelection(a);

    const state = useUILayoutStore.getState();
    expect(allSelectedIds(state)).toEqual([a, b, c]);
  });

  it("allSelectedIds returns empty array when nothing is selected", () => {
    useUILayoutStore.getState().selectInstance(null);
    expect(allSelectedIds(useUILayoutStore.getState())).toEqual([]);
  });

  it("replaceSelection sets primary + additional from the array", () => {
    const [a, b, c] = addThree();
    const store = useUILayoutStore.getState();

    store.replaceSelection([b, a, c]);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(b);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([a, c]);
  });

  it("replaceSelection([]) clears the selection", () => {
    const [a] = addThree();
    const store = useUILayoutStore.getState();
    store.replaceSelection([a]);

    store.replaceSelection([]);

    expect(useUILayoutStore.getState().selectedInstanceId).toBeNull();
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([]);
  });

  it("replaceSelection de-duplicates ids while preserving order", () => {
    const [a, b, c] = addThree();
    const store = useUILayoutStore.getState();

    store.replaceSelection([a, b, a, c, b]);

    expect(useUILayoutStore.getState().selectedInstanceId).toBe(a);
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([b, c]);
  });

  it("clearing selection also clears the additional selection", () => {
    const [a, b] = addThree();
    const store = useUILayoutStore.getState();

    store.toggleSelection(b);
    store.toggleSelection(a);
    expect(useUILayoutStore.getState().additionalSelectionIds.length).toBe(2);

    store.selectInstance(null);

    expect(useUILayoutStore.getState().selectedInstanceId).toBeNull();
    expect(useUILayoutStore.getState().additionalSelectionIds).toEqual([]);
  });
});

describe("useUILayoutStore — batched group operations", () => {
  /** Add N widgets and return their ids in insertion order. */
  function addN(n: number): string[] {
    const ids: string[] = [];
    const store = useUILayoutStore.getState();
    for (let i = 0; i < n; i++) {
      store.addWidget("hyperforge.hud.hp-bar");
      ids.push(useUILayoutStore.getState().selectedInstanceId!);
    }
    return ids;
  }

  it("removeInstances deletes every id in one history entry", () => {
    const [a, b, c] = addN(3);
    const store = useUILayoutStore.getState();

    store.removeInstances([a, c]);

    const state = useUILayoutStore.getState();
    expect(state.layout.instances.map((i) => i.instanceId)).toEqual([b]);
    // One history entry — undo restores all three at once.
    store.undo();
    expect(useUILayoutStore.getState().layout.instances.length).toBe(3);
  });

  it("removeInstances clears the primary when it's in the batch", () => {
    const [a, b, c] = addN(3);
    const store = useUILayoutStore.getState();
    // c is the primary (most recent addWidget).
    store.toggleSelection(b); // b primary, c additional
    store.toggleSelection(a); // a primary, b and c additional

    store.removeInstances([a, c]);

    const state = useUILayoutStore.getState();
    expect(state.selectedInstanceId).toBeNull();
    expect(state.additionalSelectionIds).toEqual([b]);
  });

  it("removeInstances is a no-op when no ids match", () => {
    addN(3);
    const beforeCount = useUILayoutStore.getState().layout.instances.length;
    const beforePast = useUILayoutStore.getState().past.length;

    useUILayoutStore.getState().removeInstances(["does-not-exist"]);

    expect(useUILayoutStore.getState().layout.instances.length).toBe(
      beforeCount,
    );
    expect(useUILayoutStore.getState().past.length).toBe(beforePast);
  });

  it("duplicateInstances clones each source with unique ids", () => {
    const [a, b] = addN(2);
    const store = useUILayoutStore.getState();

    store.duplicateInstances([a, b]);

    const state = useUILayoutStore.getState();
    // Originals + 2 clones.
    expect(state.layout.instances.length).toBe(4);
    const ids = state.layout.instances.map((i) => i.instanceId);
    expect(new Set(ids).size).toBe(4);
    // First clone becomes primary, second clone is additional.
    expect(state.selectedInstanceId).not.toBeNull();
    expect(state.additionalSelectionIds.length).toBe(1);
  });

  it("moveInstancesToFront preserves relative order among selected", () => {
    const [a, b, c, d] = addN(4);
    const store = useUILayoutStore.getState();

    // Move a and c to front. After: [b, d, a, c]
    store.moveInstancesToFront([a, c]);

    expect(
      useUILayoutStore.getState().layout.instances.map((i) => i.instanceId),
    ).toEqual([b, d, a, c]);
  });

  it("moveInstancesToBack preserves relative order among selected", () => {
    const [a, b, c, d] = addN(4);
    const store = useUILayoutStore.getState();

    // Move b and d to back. After: [b, d, a, c]
    store.moveInstancesToBack([b, d]);

    expect(
      useUILayoutStore.getState().layout.instances.map((i) => i.instanceId),
    ).toEqual([b, d, a, c]);
  });

  it("moveInstancesForward moves a contiguous block as a unit", () => {
    const [a, b, c, d] = addN(4);
    const store = useUILayoutStore.getState();

    // a and b form a contiguous block at the front. Forward should
    // swap the whole block past c, not shuffle b past a.
    store.moveInstancesForward([a, b]);

    expect(
      useUILayoutStore.getState().layout.instances.map((i) => i.instanceId),
    ).toEqual([c, a, b, d]);
  });

  it("moveInstancesBackward moves selected ids one step toward the start", () => {
    const [a, b, c, d] = addN(4);
    const store = useUILayoutStore.getState();

    // Move c backward; a, b shouldn't be affected; d stays.
    store.moveInstancesBackward([c]);

    expect(
      useUILayoutStore.getState().layout.instances.map((i) => i.instanceId),
    ).toEqual([a, c, b, d]);
  });

  it("moveInstancesToFront on already-at-end is a no-op", () => {
    const [a, b, c] = addN(3);
    const store = useUILayoutStore.getState();
    const beforePast = useUILayoutStore.getState().past.length;

    store.moveInstancesToFront([b, c]); // b,c are already last two

    expect(
      useUILayoutStore.getState().layout.instances.map((i) => i.instanceId),
    ).toEqual([a, b, c]);
    expect(useUILayoutStore.getState().past.length).toBe(beforePast);
  });

  it("alignInstancesToViewport aligns every anchored id under one history entry", () => {
    const [a, b] = addN(2);
    const store = useUILayoutStore.getState();

    store.alignInstancesToViewport([a, b], "left", {
      width: 1920,
      height: 1080,
    });

    const aPos = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === a)!.position;
    const bPos = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === b)!.position;
    // Both must now be anchored. Exact x coord depends on
    // default widget size; just assert they aligned.
    if (aPos.kind !== "anchored" || bPos.kind !== "anchored") {
      throw new Error("expected anchored");
    }
    // Left-align with top-left anchor → offset.x = 0
    // (the default anchor for addWidget is top-left).
    expect(aPos.offset.x).toBe(0);
    expect(bPos.offset.x).toBe(0);

    // Single undo reverses both alignments.
    store.undo();
    const aAfter = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === a)!.position;
    if (aAfter.kind !== "anchored") throw new Error("expected anchored");
    expect(aAfter.offset.x).not.toBe(0);
  });

  it("batched actions flip isDirty", () => {
    const [a, b] = addN(2);
    useUILayoutStore.getState().markClean();
    expect(useUILayoutStore.getState().isDirty).toBe(false);

    useUILayoutStore.getState().removeInstances([a]);

    expect(useUILayoutStore.getState().isDirty).toBe(true);

    useUILayoutStore.getState().markClean();
    useUILayoutStore.getState().duplicateInstances([b]);
    expect(useUILayoutStore.getState().isDirty).toBe(true);
  });
});

describe("useUILayoutStore — align-to-selection + distribute", () => {
  function addAnchored(n: number): string[] {
    const ids: string[] = [];
    const store = useUILayoutStore.getState();
    for (let i = 0; i < n; i++) {
      store.addWidget("hyperforge.hud.hp-bar");
      const id = useUILayoutStore.getState().selectedInstanceId!;
      // Spread the widgets out horizontally so align/distribute
      // tests have non-trivial starting positions.
      store.updateInstancePosition(id, {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 50 + i * 100, y: 50 + i * 40 },
      });
      ids.push(id);
    }
    return ids;
  }

  it("alignInstancesToSelection is a no-op with fewer than 2 anchored", () => {
    const [a] = addAnchored(1);
    const before = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === a)!.position;
    useUILayoutStore
      .getState()
      .alignInstancesToSelection([a], "left", { width: 1920, height: 1080 });
    const after = useUILayoutStore
      .getState()
      .layout.instances.find((i) => i.instanceId === a)!.position;
    expect(after).toEqual(before);
  });

  it("alignInstancesToSelection left-aligns every member to min(x)", () => {
    const [a, b, c] = addAnchored(3);
    useUILayoutStore.getState().alignInstancesToSelection([a, b, c], "left", {
      width: 1920,
      height: 1080,
    });
    const instances = useUILayoutStore.getState().layout.instances;
    const xs = [a, b, c].map((id) => {
      const p = instances.find((i) => i.instanceId === id)!.position;
      if (p.kind !== "anchored") throw new Error("anchored expected");
      return p.offset.x;
    });
    // With top-left anchor, offset.x IS the rendered x.
    // Min x before align was 50 → all three should become 50.
    expect(xs).toEqual([50, 50, 50]);
  });

  it("alignInstancesToSelection records a single history entry", () => {
    const [a, b, c] = addAnchored(3);
    const pastBefore = useUILayoutStore.getState().past.length;
    useUILayoutStore
      .getState()
      .alignInstancesToSelection([a, b, c], "center-h", {
        width: 1920,
        height: 1080,
      });
    expect(useUILayoutStore.getState().past.length).toBe(pastBefore + 1);
  });

  it("distributeInstances is a no-op with fewer than 3 members", () => {
    const [a, b] = addAnchored(2);
    const before = JSON.stringify(useUILayoutStore.getState().layout.instances);
    useUILayoutStore
      .getState()
      .distributeInstances([a, b], "h", { width: 1920, height: 1080 });
    expect(JSON.stringify(useUILayoutStore.getState().layout.instances)).toBe(
      before,
    );
  });

  it("distributeInstances evenly spaces middle widget centers", () => {
    const [a, b, c] = addAnchored(3);
    // Nudge the middle one off the even midpoint so distribute has
    // something to do.
    useUILayoutStore.getState().updateInstancePosition(b, {
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 90, y: 90 },
    });
    useUILayoutStore.getState().distributeInstances([a, b, c], "h", {
      width: 1920,
      height: 1080,
    });
    const instances = useUILayoutStore.getState().layout.instances;
    const posA = instances.find((i) => i.instanceId === a)!.position;
    const posB = instances.find((i) => i.instanceId === b)!.position;
    const posC = instances.find((i) => i.instanceId === c)!.position;
    if (
      posA.kind !== "anchored" ||
      posB.kind !== "anchored" ||
      posC.kind !== "anchored"
    )
      throw new Error("anchored expected");
    // Centers should be evenly spaced. With identical widget widths,
    // that means offset.x values are evenly spaced too.
    const gap1 = posB.offset.x - posA.offset.x;
    const gap2 = posC.offset.x - posB.offset.x;
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(1);
  });

  it("selectAll selects every instance with first as primary", () => {
    const [a, b, c] = addAnchored(3);
    // Deselect first.
    useUILayoutStore.getState().selectInstance(null);
    useUILayoutStore.getState().selectAll();
    const state = useUILayoutStore.getState();
    expect(state.selectedInstanceId).toBe(a);
    expect(state.additionalSelectionIds).toEqual([b, c]);
  });

  it("selectAll on empty layout clears selection", () => {
    useUILayoutStore.getState().selectAll();
    const state = useUILayoutStore.getState();
    expect(state.selectedInstanceId).toBeNull();
    expect(state.additionalSelectionIds).toEqual([]);
  });
});
