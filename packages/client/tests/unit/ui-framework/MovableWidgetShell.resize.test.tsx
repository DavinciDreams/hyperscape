/**
 * Phase U4 — resize + aspect-constraint tests for MovableWidgetShell.
 *
 * No mocks: real `useEditStore`, real `useUserLayoutStore`. We simulate
 * pointer events on the resize grip DOM and assert both the live inline
 * style (for the in-progress visual) and the persisted override in the
 * user layout store (for commit).
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

const INSTANCE_ID = "test.widget.a";
const LAYOUT_ID = "layout.test";
const LAYOUT_REV = 1;

function basePosition(): AnchoredPosition {
  return {
    kind: "anchored",
    anchor: "top-left",
    offset: { x: 0, y: 0 },
    width: 100,
    height: 100,
  };
}

function Harness(props: {
  customization?: WidgetCustomization;
  position?: AnchoredPosition;
}) {
  const position = props.position ?? basePosition();
  return (
    <MovableWidgetShell
      instanceId={INSTANCE_ID}
      layoutId={LAYOUT_ID}
      layoutRevision={LAYOUT_REV}
      position={position}
      customization={props.customization}
      anchorStyle={{
        position: "absolute",
        left: 0,
        top: 0,
        width: position.width,
        height: position.height,
      }}
    >
      <div data-testid="child" style={{ width: "100%", height: "100%" }} />
    </MovableWidgetShell>
  );
}

/**
 * JSDOM doesn't implement `setPointerCapture` / `releasePointerCapture`
 * or return non-zero `getBoundingClientRect` values by default. Patch
 * both here so pointer event handling + start-size measurement works.
 */
function stubDom(grip: HTMLElement, wrapper: HTMLElement) {
  if (!("setPointerCapture" in grip)) {
    Object.assign(grip, {
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
    });
  } else {
    grip.setPointerCapture = () => {};
    grip.releasePointerCapture = () => {};
  }
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
}

function enterManifestEdit() {
  const s = useEditStore.getState();
  s.setMode("unlocked");
  s.setEditScope("manifest");
}

function pointerEvent(
  type: string,
  init: PointerEventInit & {
    clientX: number;
    clientY: number;
    pointerId?: number;
    button?: number;
  },
) {
  // jsdom's PointerEvent ctor lacks some fields — fall back to Event +
  // assigning pointer props.
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, {
    clientX: init.clientX,
    clientY: init.clientY,
    pointerId: init.pointerId ?? 1,
    button: init.button ?? 0,
    pointerType: init.pointerType ?? "mouse",
  });
  return ev;
}

function getGrip(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-resize-grip="true"]');
}

function getWrapper(container: HTMLElement): HTMLElement {
  const w = container.querySelector<HTMLElement>(
    `[data-instance-id="${INSTANCE_ID}"]`,
  );
  if (!w) throw new Error("wrapper not found");
  return w;
}

describe("MovableWidgetShell — resize (U4)", () => {
  beforeEach(() => {
    useUserLayoutStore.getState().clearAll();
    useEditStore.setState({
      mode: "locked",
      editScope: "both",
      gridSize: 8,
      snapEnabled: false,
      isResizing: false,
      resizingInstanceId: null,
    });
  });

  afterEach(() => {
    useUserLayoutStore.getState().clearAll();
    useEditStore.setState({
      mode: "locked",
      isResizing: false,
      resizingInstanceId: null,
    });
  });

  it("renders no grip when customization.resizable is false", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ movable: true, resizable: false }} />,
    );
    expect(getGrip(container)).toBeNull();
  });

  it("renders a grip when editing + resizable=true", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ resizable: true }} />,
    );
    expect(getGrip(container)).not.toBeNull();
  });

  it("live-size reflects a +40, +30 drag of the bottom-right grip", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ resizable: true }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 140, clientY: 130 }),
    );
    expect(wrapper.style.width).toBe("140px");
    expect(wrapper.style.height).toBe("130px");
  });

  it("clamps to maxWidth during drag", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness
        customization={{ resizable: true, maxWidth: 150, maxHeight: 999 }}
      />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 600, clientY: 105 }),
    );
    expect(wrapper.style.width).toBe("150px");
  });

  it("locks aspect ratio of 2 — width:height stays 2:1", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ resizable: true, aspectRatio: 2 }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    // +100 x dominates, so width = 200, height derived = 100.
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 200, clientY: 105 }),
    );
    expect(wrapper.style.width).toBe("200px");
    expect(wrapper.style.height).toBe("100px");
  });

  it("snaps to grid when snapEnabled", () => {
    enterManifestEdit();
    useEditStore.setState({ gridSize: 20, snapEnabled: true });
    const { container } = render(
      <Harness customization={{ resizable: true }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    // +47 x on a grid of 20 → snap nearest multiple = 140 (start 100 + 40).
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 147, clientY: 100 }),
    );
    expect(wrapper.style.width).toBe("140px");
  });

  it("commits a width/height override to useUserLayoutStore on pointerup", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ resizable: true }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 150, clientY: 140 }),
    );
    fireEvent(grip, pointerEvent("pointerup", { clientX: 150, clientY: 140 }));

    const layout = useUserLayoutStore.getState().layouts[LAYOUT_ID];
    expect(layout).toBeDefined();
    const override = layout.overrides.find((o) => o.instanceId === INSTANCE_ID);
    expect(override).toBeDefined();
    expect(override!.position?.width).toBe(150);
    expect(override!.position?.height).toBe(140);
  });

  it("pointercancel discards — no override written", () => {
    enterManifestEdit();
    const { container } = render(
      <Harness customization={{ resizable: true }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 150, clientY: 140 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointercancel", { clientX: 150, clientY: 140 }),
    );

    expect(useUserLayoutStore.getState().layouts[LAYOUT_ID]).toBeUndefined();
  });

  it("unmount mid-resize clears resizingInstanceId", () => {
    enterManifestEdit();
    const { container, unmount } = render(
      <Harness customization={{ resizable: true }} />,
    );
    const grip = getGrip(container)!;
    const wrapper = getWrapper(container);
    stubDom(grip, wrapper);

    fireEvent(
      grip,
      pointerEvent("pointerdown", { clientX: 100, clientY: 100 }),
    );
    fireEvent(
      grip,
      pointerEvent("pointermove", { clientX: 150, clientY: 140 }),
    );
    expect(useEditStore.getState().resizingInstanceId).toBe(INSTANCE_ID);

    act(() => {
      unmount();
    });
    expect(useEditStore.getState().resizingInstanceId).toBeNull();
    expect(useEditStore.getState().isResizing).toBe(false);
  });
});
