/**
 * Phase U6 — LayoutSwitcher smoke tests.
 *
 * The switcher is a thin shell over `useGameUILayouts` +
 * `setPlayerLayoutOverride`. These tests fake the hook to keep the
 * surface tight: assert hide-when-no-context, hide-when-empty, that
 * a selection writes localStorage, and that "Default" clears it.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mock surface so we can control what the component sees from
// `useGameUILayouts` per-test without per-file state leakage.
const hookState = vi.hoisted(() => ({
  layouts: [] as Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    version: string;
    isTemplate: boolean;
    isPublic: boolean;
    gameId: string | null;
  }>,
  loading: false,
  error: null as string | null,
}));

vi.mock("@/ui-framework/useActiveUILayout", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/ui-framework/useActiveUILayout")>();
  return {
    ...actual,
    useGameUILayouts: () => ({
      layouts: hookState.layouts,
      loading: hookState.loading,
      error: hookState.error,
    }),
  };
});

import { LayoutSwitcher } from "@/ui-framework/LayoutSwitcher";
import {
  readPlayerLayoutOverride,
  setPlayerLayoutOverride,
} from "@/ui-framework/useActiveUILayout";

describe("LayoutSwitcher (U6)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    hookState.layouts = [];
    hookState.loading = false;
    hookState.error = null;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing when there is no gameId", () => {
    const { container } = render(<LayoutSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when layouts list is empty", () => {
    const { container } = render(<LayoutSwitcher gameId="game-a" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing on error", () => {
    hookState.layouts = [
      {
        id: "layout.a",
        name: "A",
        slug: "a",
        description: null,
        version: "1.0.0",
        isTemplate: false,
        isPublic: false,
        gameId: "game-a",
      },
    ];
    hookState.error = "boom";
    const { container } = render(<LayoutSwitcher gameId="game-a" />);
    expect(container.firstChild).toBeNull();
  });

  it("lists available layouts with a Default option", () => {
    hookState.layouts = [
      {
        id: "layout.a",
        name: "Minimal",
        slug: "minimal",
        description: null,
        version: "1.0.0",
        isTemplate: false,
        isPublic: false,
        gameId: "game-a",
      },
      {
        id: "layout.b",
        name: "Dense",
        slug: "dense",
        description: null,
        version: "1.0.0",
        isTemplate: false,
        isPublic: false,
        gameId: "game-a",
      },
    ];
    render(<LayoutSwitcher gameId="game-a" />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(["__default__", "layout.a", "layout.b"]);
  });

  it("selecting a layout persists it to localStorage", () => {
    hookState.layouts = [
      {
        id: "layout.a",
        name: "Minimal",
        slug: "minimal",
        description: null,
        version: "1.0.0",
        isTemplate: false,
        isPublic: false,
        gameId: "game-a",
      },
    ];
    const onChange = vi.fn();
    render(<LayoutSwitcher gameId="game-a" onChange={onChange} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "layout.a" } });
    expect(readPlayerLayoutOverride("game-a")).toBe("layout.a");
    expect(onChange).toHaveBeenCalledWith("layout.a");
  });

  it("selecting Default clears the override", () => {
    setPlayerLayoutOverride("game-a", "layout.a");
    hookState.layouts = [
      {
        id: "layout.a",
        name: "Minimal",
        slug: "minimal",
        description: null,
        version: "1.0.0",
        isTemplate: false,
        isPublic: false,
        gameId: "game-a",
      },
    ];
    const onChange = vi.fn();
    render(<LayoutSwitcher gameId="game-a" onChange={onChange} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    // Pre-mount effect reads existing override
    expect(select.value).toBe("layout.a");
    fireEvent.change(select, { target: { value: "__default__" } });
    expect(readPlayerLayoutOverride("game-a")).toBeNull();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
