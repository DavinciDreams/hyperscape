import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WindowRenderer } from "../../../src/game/interface/WindowRenderer";
import type { WindowState } from "../../../src/ui/types";

const mockTabBar = vi.fn(
  ({
    windowId,
    reserveArrowKeys,
  }: {
    windowId: string;
    reserveArrowKeys?: boolean;
  }) => (
    <div
      data-testid={`tabbar-${windowId}`}
      data-reserve-arrow-keys={reserveArrowKeys ? "true" : "false"}
    />
  ),
);

const storeState = {
  windows: new Map<string, WindowState>(),
};

vi.mock("@/ui", () => ({
  Window: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabBar: (props: { windowId: string; reserveArrowKeys?: boolean }) =>
    mockTabBar(props),
  useWindowStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}));

vi.mock("../../../src/game/interface/InterfacePanels", () => ({
  WindowContent: () => <div data-testid="window-content" />,
  DraggableContentWrapper: () => <div data-testid="draggable-content" />,
  ActionBarWrapper: () => <div data-testid="actionbar-wrapper" />,
  MenuBarWrapper: () => <div data-testid="menubar-wrapper" />,
  MinimapWrapper: () => <div data-testid="minimap-wrapper" />,
}));

describe("WindowRenderer shell tab behavior", () => {
  beforeEach(() => {
    storeState.windows = new Map();
    mockTabBar.mockClear();
  });

  it("enables reserveArrowKeys for combined in-game windows", () => {
    storeState.windows.set("combined-window", {
      id: "combined-window",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      minSize: { width: 200, height: 150 },
      tabs: [
        {
          id: "inventory-tab",
          windowId: "combined-window",
          label: "Inventory",
          closeable: false,
          content: "inventory",
        },
        {
          id: "skills-tab",
          windowId: "combined-window",
          label: "Skills",
          closeable: false,
          content: "skills",
        },
      ],
      activeTabIndex: 0,
      transparency: 0,
      visible: true,
      zIndex: 1,
      locked: false,
    });

    render(
      <WindowRenderer
        world={null}
        isUnlocked={false}
        editModeEnabled={false}
        windowCombiningEnabled={true}
        renderPanel={() => null}
      />,
    );

    expect(screen.getByTestId("tabbar-combined-window")).toHaveAttribute(
      "data-reserve-arrow-keys",
      "true",
    );
  });

  it("does not render the shell TabBar for single-tab windows", () => {
    storeState.windows.set("single-window", {
      id: "single-window",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      minSize: { width: 200, height: 150 },
      tabs: [
        {
          id: "inventory-tab",
          windowId: "single-window",
          label: "Inventory",
          closeable: false,
          content: "inventory",
        },
      ],
      activeTabIndex: 0,
      transparency: 0,
      visible: true,
      zIndex: 1,
      locked: false,
    });

    render(
      <WindowRenderer
        world={null}
        isUnlocked={false}
        editModeEnabled={false}
        windowCombiningEnabled={true}
        renderPanel={() => null}
      />,
    );

    expect(
      screen.queryByTestId("tabbar-single-window"),
    ).not.toBeInTheDocument();
  });
});
