import { describe, expect, it } from "vitest";
import { hpBarWidget, minimapWidget } from "./builtins";
import {
  UILayoutManifestSchema,
  UIUserLayoutSchema,
  type UILayoutManifest,
  type UIUserLayout,
} from "./layout";
import { resolveLayout } from "./resolve";

const baseManifest: UILayoutManifest = UILayoutManifestSchema.parse({
  id: "hud-default",
  name: "Default HUD",
  revision: 3,
  grid: { columns: 24, rows: 16 },
  instances: [
    {
      instanceId: "hp",
      widgetId: hpBarWidget.manifest.id,
      position: {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 12, y: 12 },
      },
      props: {
        orientation: "horizontal",
        showNumeric: true,
        current: 10,
        max: 10,
      },
      customization: { movable: true, resizable: true },
    },
    {
      instanceId: "map",
      widgetId: minimapWidget.manifest.id,
      position: {
        kind: "grid",
        column: 19,
        row: 0,
        columnSpan: 5,
        rowSpan: 5,
      },
      props: {
        size: 220,
        baseRadius: 48,
        showCompass: true,
        showPlayerPips: true,
        showEntityPips: true,
      },
    },
  ],
});

const makeUserLayout = (overrides: UIUserLayout["overrides"]): UIUserLayout =>
  UIUserLayoutSchema.parse({
    schemaVersion: 1,
    layoutId: baseManifest.id,
    layoutRevision: baseManifest.revision,
    updatedAt: 1_700_000_000_000,
    overrides,
  });

describe("resolveLayout", () => {
  it("returns manifest instances unchanged when no user layout is supplied", () => {
    const resolved = resolveLayout(baseManifest, null);
    expect(resolved.instances).toBe(baseManifest.instances);
    expect(resolved.droppedOverrides).toEqual([]);
    expect(resolved.hasOverrides).toBe(false);
  });

  it("returns manifest instances unchanged when the user layout targets a different layoutId", () => {
    const mismatched = UIUserLayoutSchema.parse({
      schemaVersion: 1,
      layoutId: "some-other-layout",
      updatedAt: 0,
      overrides: [
        { instanceId: "hp", position: { offsetX: 999, offsetY: 999 } },
      ],
    });
    const resolved = resolveLayout(baseManifest, mismatched);
    expect(resolved.instances).toBe(baseManifest.instances);
    expect(resolved.hasOverrides).toBe(false);
  });

  it("applies an anchored-offset override", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { offsetX: 520, offsetY: 40 } },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    const hp = resolved.instances.find((i) => i.instanceId === "hp");
    expect(hp?.position).toEqual({
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 520, y: 40 },
    });
    expect(resolved.hasOverrides).toBe(true);
  });

  it("merges only the fields the override actually sets", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { offsetY: 40 } },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    const hp = resolved.instances.find((i) => i.instanceId === "hp");
    expect(hp?.position).toMatchObject({
      kind: "anchored",
      anchor: "top-left",
      offset: { x: 12, y: 40 },
    });
  });

  it("supports overriding the anchor itself", () => {
    const user = makeUserLayout([
      {
        instanceId: "hp",
        position: { anchor: "bottom-right", offsetX: -20, offsetY: -20 },
      },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    const hp = resolved.instances.find((i) => i.instanceId === "hp");
    expect(hp?.position).toEqual({
      kind: "anchored",
      anchor: "bottom-right",
      offset: { x: -20, y: -20 },
    });
  });

  it("supports width / height overrides for anchored widgets", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { width: 400, height: 40 } },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    const hp = resolved.instances.find((i) => i.instanceId === "hp");
    expect(hp?.position).toMatchObject({
      width: 400,
      height: 40,
    });
  });

  it("applies visibility overrides", () => {
    const user = makeUserLayout([{ instanceId: "hp", visible: false }]);
    const resolved = resolveLayout(baseManifest, user);
    const hp = resolved.instances.find((i) => i.instanceId === "hp");
    expect(hp?.visible).toBe(false);
  });

  it("silently ignores overrides targeting non-anchored widgets", () => {
    const user = makeUserLayout([
      { instanceId: "map", position: { offsetX: 999, offsetY: 999 } },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    const map = resolved.instances.find((i) => i.instanceId === "map");
    // Grid position is preserved — ignored rather than clobbered.
    expect(map?.position).toEqual({
      kind: "grid",
      column: 19,
      row: 0,
      columnSpan: 5,
      rowSpan: 5,
    });
  });

  it("reports dropped overrides for removed instance ids", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { offsetX: 50 } },
      { instanceId: "removed-long-ago", visible: false },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    expect(resolved.droppedOverrides).toEqual(["removed-long-ago"]);
    expect(
      resolved.instances.find((i) => i.instanceId === "hp")?.position,
    ).toMatchObject({ offset: { x: 50, y: 12 } });
  });

  it("returns hasOverrides=false when every override pointed at a removed instance", () => {
    const user = makeUserLayout([
      { instanceId: "ghost-a", visible: false },
      { instanceId: "ghost-b", visible: false },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    expect(resolved.hasOverrides).toBe(false);
    expect(resolved.droppedOverrides).toEqual(["ghost-a", "ghost-b"]);
    expect(resolved.instances).toBe(baseManifest.instances);
  });

  it("does not mutate the original manifest or user layout", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { offsetX: 999 } },
    ]);
    const manifestBefore = JSON.stringify(baseManifest);
    const userBefore = JSON.stringify(user);
    resolveLayout(baseManifest, user);
    expect(JSON.stringify(baseManifest)).toBe(manifestBefore);
    expect(JSON.stringify(user)).toBe(userBefore);
  });

  it("preserves instance order from the manifest", () => {
    const user = makeUserLayout([
      { instanceId: "hp", position: { offsetX: 50 } },
    ]);
    const resolved = resolveLayout(baseManifest, user);
    expect(resolved.instances.map((i) => i.instanceId)).toEqual(["hp", "map"]);
  });
});
