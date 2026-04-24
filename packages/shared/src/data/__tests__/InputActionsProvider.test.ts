/**
 * Tests for the InputActionsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { inputActionsProvider } from "../InputActionsProvider";

beforeEach(() => {
  inputActionsProvider.unload();
});
afterEach(() => {
  inputActionsProvider.unload();
});

const validAction = {
  id: "jump",
  name: "Jump",
  kind: "button",
};

describe("InputActionsProvider", () => {
  it("starts unloaded", () => {
    expect(inputActionsProvider.isLoaded()).toBe(false);
    expect(inputActionsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = inputActionsProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(inputActionsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid action", () => {
    const parsed = inputActionsProvider.loadRaw([validAction]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("jump");
  });

  it("loadRaw() rejects duplicate action ids", () => {
    expect(() =>
      inputActionsProvider.loadRaw([validAction, { ...validAction }]),
    ).toThrow();
  });

  it("loadRaw() rejects invalid action id format", () => {
    expect(() =>
      inputActionsProvider.loadRaw([{ ...validAction, id: "Jump-Action" }]),
    ).toThrow();
  });

  it("loadRaw() rejects invalid kind enum", () => {
    expect(() =>
      inputActionsProvider.loadRaw([{ ...validAction, kind: "madeup" }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = inputActionsProvider.loadRaw([validAction]);
    inputActionsProvider.unload();
    inputActionsProvider.load(parsed);
    expect(inputActionsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    inputActionsProvider.loadRaw([validAction]);
    inputActionsProvider.hotReload(null);
    expect(inputActionsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    inputActionsProvider.loadRaw([validAction]);
    inputActionsProvider.unload();
    expect(inputActionsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(inputActionsProvider).toBe(inputActionsProvider);
  });
});
