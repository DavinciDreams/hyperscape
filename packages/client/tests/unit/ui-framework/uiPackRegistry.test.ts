/**
 * Tests for uiPackRegistry — the D10 pack-registry singleton.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoadedUIPack } from "@hyperforge/ui-framework";

import {
  _resetUIPackRegistryForTests,
  getActiveUIPack,
  getActiveUIPackId,
  listRegisteredUIPacks,
  registerUIPack,
  resolveUIPackById,
  setActiveUIPack,
  subscribeUIPackRegistry,
  uiPackRegistrySize,
  unregisterUIPack,
} from "@/ui-framework/uiPackRegistry";

// Minimal LoadedUIPack stubs — the registry doesn't read inner
// fields, just stores by id.
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

describe("uiPackRegistry", () => {
  beforeEach(() => _resetUIPackRegistryForTests());
  afterEach(() => _resetUIPackRegistryForTests());

  it("starts empty with no active pack", () => {
    expect(uiPackRegistrySize()).toBe(0);
    expect(getActiveUIPackId()).toBeNull();
    expect(getActiveUIPack()).toBeNull();
    expect(listRegisteredUIPacks()).toEqual([]);
  });

  it("registers a pack and exposes it via resolveUIPackById", () => {
    const a = fakePack("a");
    registerUIPack(a);
    expect(uiPackRegistrySize()).toBe(1);
    expect(resolveUIPackById("a")).toBe(a);
    expect(listRegisteredUIPacks()).toEqual(["a"]);
  });

  it("re-registering the same id replaces the entry", () => {
    const a1 = fakePack("a");
    const a2 = fakePack("a");
    registerUIPack(a1);
    registerUIPack(a2);
    expect(uiPackRegistrySize()).toBe(1);
    expect(resolveUIPackById("a")).toBe(a2);
  });

  it("unregisterUIPack removes the entry", () => {
    registerUIPack(fakePack("a"));
    unregisterUIPack("a");
    expect(uiPackRegistrySize()).toBe(0);
    expect(resolveUIPackById("a")).toBeNull();
  });

  it("unregisterUIPack clears active pointer if it pointed at the removed pack", () => {
    registerUIPack(fakePack("a"));
    setActiveUIPack("a");
    expect(getActiveUIPackId()).toBe("a");
    unregisterUIPack("a");
    expect(getActiveUIPackId()).toBeNull();
  });

  it("setActiveUIPack throws for unregistered ids", () => {
    expect(() => setActiveUIPack("nope")).toThrow(
      /pack "nope" is not registered/,
    );
  });

  it("setActiveUIPack accepts null to clear the active pointer", () => {
    registerUIPack(fakePack("a"));
    setActiveUIPack("a");
    setActiveUIPack(null);
    expect(getActiveUIPackId()).toBeNull();
    expect(getActiveUIPack()).toBeNull();
  });

  it("getActiveUIPack returns the active pack object", () => {
    const a = fakePack("a");
    registerUIPack(a);
    setActiveUIPack("a");
    expect(getActiveUIPack()).toBe(a);
  });

  it("subscribers receive notifications on register/unregister/setActive", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUIPackRegistry(listener);

    registerUIPack(fakePack("a"));
    setActiveUIPack("a");
    unregisterUIPack("a");

    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();

    // After unsubscribe no more notifications.
    registerUIPack(fakePack("b"));
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("setActiveUIPack does NOT notify when the value is unchanged", () => {
    registerUIPack(fakePack("a"));
    setActiveUIPack("a");

    const listener = vi.fn();
    subscribeUIPackRegistry(listener);
    setActiveUIPack("a"); // Same value — should be a no-op.
    expect(listener).not.toHaveBeenCalled();
  });
});
