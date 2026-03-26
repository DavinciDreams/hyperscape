import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tab } from "../../../src/ui/components/Tab";
import type { TabState } from "../../../src/ui/types";

vi.mock("../../../src/ui/core/drag/useDrag", () => ({
  useDrag: () => ({
    isDragging: false,
    dragHandleProps: {
      onPointerDown: vi.fn(),
      style: {},
    },
  }),
}));

vi.mock("../../../src/ui/core/edit/useEditMode", () => ({
  useEditMode: () => ({
    isUnlocked: false,
  }),
}));

vi.mock("../../../src/ui/stores/themeStore", () => ({
  useTheme: () => ({
    colors: {
      text: {
        primary: "#fff",
        secondary: "#aaa",
      },
      border: {
        focus: "#09f",
      },
      accent: {
        primary: "#f90",
      },
    },
    typography: {
      fontSize: {
        sm: 12,
      },
      fontWeight: {
        medium: 500,
        semibold: 600,
      },
    },
    borderRadius: {
      sm: 4,
    },
    transitions: {
      fast: "120ms ease",
    },
  }),
}));

vi.mock("../../../src/ui/theme/themes", () => ({
  getTabStyle: () => ({}),
  getShellControlButtonStyle: () => ({}),
}));

describe("Tab keyboard behavior", () => {
  const baseTab: TabState = {
    id: "inventory",
    windowId: "combined-window",
    label: "Inventory",
    closeable: false,
    content: "inventory",
  };

  it("uses arrow keys for tab navigation by default", () => {
    const onActivate = vi.fn();
    const onNavigate = vi.fn();

    const { getByRole } = render(
      <Tab
        tab={baseTab}
        isActive={true}
        onActivate={onActivate}
        onNavigate={onNavigate}
      />,
    );

    const tab = getByRole("tab", { name: "Inventory" });
    const event = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });

    tab.dispatchEvent(event);

    expect(onNavigate).toHaveBeenCalledWith("previous");
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not consume arrow keys when reserveArrowKeys is enabled", () => {
    const onActivate = vi.fn();
    const onNavigate = vi.fn();

    const { getByRole } = render(
      <Tab
        tab={baseTab}
        isActive={true}
        onActivate={onActivate}
        onNavigate={onNavigate}
        reserveArrowKeys={true}
      />,
    );

    const tab = getByRole("tab", { name: "Inventory" });
    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });

    tab.dispatchEvent(event);

    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("still activates the focused tab with Enter and Space when reserveArrowKeys is enabled", () => {
    const onActivate = vi.fn();

    const { getByRole } = render(
      <Tab
        tab={baseTab}
        isActive={true}
        onActivate={onActivate}
        reserveArrowKeys={true}
      />,
    );

    const tab = getByRole("tab", { name: "Inventory" });

    fireEvent.keyDown(tab, { key: "Enter" });
    fireEvent.keyDown(tab, { key: " " });

    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("drops pointer focus when reserveArrowKeys is enabled", () => {
    const onActivate = vi.fn();

    const { getByRole } = render(
      <Tab
        tab={baseTab}
        isActive={true}
        onActivate={onActivate}
        reserveArrowKeys={true}
      />,
    );

    const tab = getByRole("tab", { name: "Inventory" }) as HTMLDivElement;
    tab.focus();
    expect(document.activeElement).toBe(tab);

    fireEvent.mouseDown(tab);
    fireEvent.click(tab, { detail: 1 });

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(tab);
  });
});
