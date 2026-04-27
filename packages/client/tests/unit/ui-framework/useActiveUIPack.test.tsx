/**
 * Tests for useActiveUIPack — the D10 React hook over uiPackRegistry.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LoadedUIPack } from "@hyperforge/ui-framework";

import {
  _resetUIPackRegistryForTests,
  registerUIPack,
  setActiveUIPack,
  unregisterUIPack,
} from "@/ui-framework/uiPackRegistry";
import { useActiveUIPack } from "@/ui-framework/useActiveUIPack";

function fakePack(id: string): LoadedUIPack {
  return {
    pack: { version: 1, id, name: id, layouts: {} } as never,
    id,
    theme: undefined,
    defaultLayout: { id: `${id}-layout` } as never,
    layouts: { default: { id: `${id}-layout` } as never },
    customization: undefined,
    widgets: [],
  };
}

describe("useActiveUIPack", () => {
  beforeEach(() => _resetUIPackRegistryForTests());
  afterEach(() => _resetUIPackRegistryForTests());

  it("returns null when no pack is active", () => {
    const { result } = renderHook(() => useActiveUIPack());
    expect(result.current).toBeNull();
  });

  it("returns the active pack after register + setActive", () => {
    const a = fakePack("a");
    const { result } = renderHook(() => useActiveUIPack());

    act(() => {
      registerUIPack(a);
      setActiveUIPack("a");
    });

    expect(result.current).toBe(a);
  });

  it("re-renders when the active pack changes", () => {
    const a = fakePack("a");
    const b = fakePack("b");
    const { result } = renderHook(() => useActiveUIPack());

    act(() => {
      registerUIPack(a);
      registerUIPack(b);
      setActiveUIPack("a");
    });
    expect(result.current).toBe(a);

    act(() => {
      setActiveUIPack("b");
    });
    expect(result.current).toBe(b);
  });

  it("re-renders to null when the active pack is unregistered", () => {
    const a = fakePack("a");
    const { result } = renderHook(() => useActiveUIPack());

    act(() => {
      registerUIPack(a);
      setActiveUIPack("a");
    });
    expect(result.current).toBe(a);

    act(() => {
      unregisterUIPack("a");
    });
    expect(result.current).toBeNull();
  });
});
