/**
 * Phase U5 — tests for the HUD-override round-trip through the preset
 * layer. Exercises the pure zustand state of `useUserLayoutStore`,
 * mirroring the clone-out-and-restore-in path that `usePresets.save`
 * and `usePresets.load` use. Avoids the IndexedDB-backed preset store
 * entirely — that layer is a thin persistence wrapper around the same
 * clone semantics.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { UIUserLayout } from "@hyperforge/ui-framework";

import { useUserLayoutStore } from "@/ui-framework/useUserLayout";

const LAYOUT_A = "layout.hud.default";
const LAYOUT_B = "layout.hud.minimal";

function makeLayout(id: string, x: number, y: number): UIUserLayout {
  return {
    schemaVersion: 1,
    layoutId: id,
    layoutRevision: 1,
    updatedAt: 1700000000,
    overrides: [
      {
        instanceId: `${id}.hp`,
        position: { offsetX: x, offsetY: y },
      },
    ],
  };
}

describe("useUserLayoutStore — preset round-trip (U5)", () => {
  beforeEach(() => {
    useUserLayoutStore.getState().clearAll();
  });

  it("snapshots the full `layouts` map via getState()", () => {
    useUserLayoutStore.setState({
      layouts: {
        [LAYOUT_A]: makeLayout(LAYOUT_A, 10, 20),
        [LAYOUT_B]: makeLayout(LAYOUT_B, 30, 40),
      },
    });

    const snap = useUserLayoutStore.getState().layouts;
    expect(Object.keys(snap).sort()).toEqual([LAYOUT_A, LAYOUT_B].sort());
    expect(snap[LAYOUT_A].overrides[0].position?.offsetX).toBe(10);
  });

  it("restores from a cloned snapshot — live mutations don't bleed back", () => {
    useUserLayoutStore.setState({
      layouts: { [LAYOUT_A]: makeLayout(LAYOUT_A, 10, 20) },
    });

    // Preset save: deep-clone at capture time.
    const snapshot = JSON.parse(
      JSON.stringify(useUserLayoutStore.getState().layouts),
    ) as Record<string, UIUserLayout>;

    // Player then moves things around after the snapshot.
    useUserLayoutStore.getState().setOverride(LAYOUT_A, 1, `${LAYOUT_A}.hp`, {
      position: { offsetX: 999, offsetY: 999 },
    });

    // Preset load: deep-clone again on restore so later edits don't
    // retroactively mutate the stored preset.
    const restored = JSON.parse(JSON.stringify(snapshot)) as Record<
      string,
      UIUserLayout
    >;
    useUserLayoutStore.setState({ layouts: restored });

    const now = useUserLayoutStore.getState().layouts;
    expect(now[LAYOUT_A].overrides[0].position?.offsetX).toBe(10);
    expect(now[LAYOUT_A].overrides[0].position?.offsetY).toBe(20);

    // Mutating the restored state after load must not mutate the
    // original snapshot — proves the second clone is effective.
    useUserLayoutStore.getState().setOverride(LAYOUT_A, 1, `${LAYOUT_A}.hp`, {
      position: { offsetX: 42 },
    });
    expect(snapshot[LAYOUT_A].overrides[0].position?.offsetX).toBe(10);
  });

  it("restores an empty preset → clears any current overrides", () => {
    useUserLayoutStore.setState({
      layouts: { [LAYOUT_A]: makeLayout(LAYOUT_A, 10, 20) },
    });

    useUserLayoutStore.setState({ layouts: {} });
    expect(useUserLayoutStore.getState().layouts).toEqual({});
  });

  it("preset load replaces (doesn't merge) — loading B drops A", () => {
    useUserLayoutStore.setState({
      layouts: { [LAYOUT_A]: makeLayout(LAYOUT_A, 10, 20) },
    });

    useUserLayoutStore.setState({
      layouts: { [LAYOUT_B]: makeLayout(LAYOUT_B, 30, 40) },
    });

    const now = useUserLayoutStore.getState().layouts;
    expect(now[LAYOUT_A]).toBeUndefined();
    expect(now[LAYOUT_B].overrides[0].position?.offsetX).toBe(30);
  });
});
