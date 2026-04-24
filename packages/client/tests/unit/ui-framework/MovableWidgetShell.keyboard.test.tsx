/**
 * Phase U11 — keyboard accessibility tests for MovableWidgetShell.
 *
 * Verifies:
 *   - drag overlay is focusable (tabIndex 0)
 *   - Arrow keys commit offset deltas
 *   - Shift+arrow uses `gridSize` as the step
 *   - Resize grip responds to arrows (width = left/right, height = up/down)
 *   - Non-movable / non-resizable shells ignore keys
 */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AnchoredPosition,
  WidgetCustomization,
} from "@hyperforge/ui-framework";

import { MovableWidgetShell } from "@/ui-framework/MovableWidgetShell";
import { useEditStore } from "@/ui/stores/editStore";
import { useUserLayoutStore } from "@/ui-framework/useUserLayout";

const INSTANCE_ID = "kbd.widget";
const LAYOUT_ID = "layout.kbd";
const LAYOUT_REV = 1;

function basePosition(): AnchoredPosition {
  return {
    kind: "anchored",
    anchor: "top-left",
    offset: { x: 10, y: 20 },
    width: 100,
    height: 100,
  };
}

function Harness(props: { customization?: WidgetCustomization }) {
  return (
    <MovableWidgetShell
      instanceId={INSTANCE_ID}
      layoutId={LAYOUT_ID}
      layoutRevision={LAYOUT_REV}
      position={basePosition()}
      customization={props.customization}
      anchorStyle={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }}
    >
      <div data-testid="child" />
    </MovableWidgetShell>
  );
}

function enterManifestEdit() {
  const s = useEditStore.getState();
  s.setMode("unlocked");
  s.setEditScope("manifest");
}

function getOverride() {
  const layouts = useUserLayoutStore.getState().layouts;
  return layouts[LAYOUT_ID]?.overrides.find(
    (o) => o.instanceId === INSTANCE_ID,
  );
}

beforeEach(() => {
  useEditStore.getState().setMode("locked");
  useEditStore.getState().setEditScope("both");
  useEditStore.getState().setSnapEnabled(false);
  useUserLayoutStore.setState({ layouts: {} });
});

afterEach(() => {
  useUserLayoutStore.setState({ layouts: {} });
});

describe("MovableWidgetShell — keyboard accessibility (U11)", () => {
  it("drag affordance is focusable and has a descriptive aria-label", () => {
    enterManifestEdit();
    const { container } = render(<Harness customization={{ movable: true }} />);
    const overlay = container.querySelector<HTMLElement>(
      '[aria-label^="Move widget"]',
    );
    expect(overlay).not.toBeNull();
    expect(overlay!.tabIndex).toBe(0);
    expect(overlay!.getAttribute("aria-label")).toContain("arrow keys");
  });

  it("ArrowRight nudges offsetX by 1 on the drag overlay", () => {
    enterManifestEdit();
    const { container } = render(<Harness customization={{ movable: true }} />);
    const overlay = container.querySelector<HTMLElement>(
      '[aria-label^="Move widget"]',
    )!;
    act(() => {
      fireEvent.keyDown(overlay, { key: "ArrowRight" });
    });
    expect(getOverride()?.position?.offsetX).toBe(11);
    expect(getOverride()?.position?.offsetY).toBe(20);
  });

  it("Shift+ArrowDown nudges by gridSize", () => {
    enterManifestEdit();
    useEditStore.getState().setGridSize(8);
    const { container } = render(<Harness customization={{ movable: true }} />);
    const overlay = container.querySelector<HTMLElement>(
      '[aria-label^="Move widget"]',
    )!;
    act(() => {
      fireEvent.keyDown(overlay, { key: "ArrowDown", shiftKey: true });
    });
    expect(getOverride()?.position?.offsetY).toBe(28);
  });

  it("ignores keys when not in edit mode", () => {
    const { container } = render(<Harness customization={{ movable: true }} />);
    const overlay = container.querySelector<HTMLElement>(
      '[aria-label^="Move widget"]',
    );
    // Shell renders no overlay when not editing — nothing to key on.
    expect(overlay).toBeNull();
  });

  it("resize grip responds to ArrowRight by growing width", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ movable: true, resizable: true }} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    wrapper.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    const grip = container.querySelector<HTMLElement>(
      '[data-resize-grip="true"]',
    )!;
    expect(grip.tabIndex).toBe(0);
    act(() => {
      fireEvent.keyDown(grip, { key: "ArrowRight" });
    });
    expect(getOverride()?.position?.width).toBe(101);
    expect(getOverride()?.position?.height).toBe(100);
  });

  it("resize grip ArrowUp shrinks height", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ movable: true, resizable: true }} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    wrapper.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    const grip = container.querySelector<HTMLElement>(
      '[data-resize-grip="true"]',
    )!;
    act(() => {
      fireEvent.keyDown(grip, { key: "ArrowUp" });
    });
    expect(getOverride()?.position?.height).toBe(99);
  });

  it("non-resizable shell renders no resize grip", () => {
    enterManifestEdit();
    const { container } = render(<Harness customization={{ movable: true }} />);
    expect(container.querySelector('[data-resize-grip="true"]')).toBeNull();
  });
});
