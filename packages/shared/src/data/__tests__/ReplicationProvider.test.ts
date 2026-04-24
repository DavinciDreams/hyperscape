/**
 * Tests for the ReplicationProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { replicationProvider } from "../ReplicationProvider";

beforeEach(() => {
  replicationProvider.unload();
});
afterEach(() => {
  replicationProvider.unload();
});

describe("ReplicationProvider", () => {
  it("starts unloaded", () => {
    expect(replicationProvider.isLoaded()).toBe(false);
    expect(replicationProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts {} baseline", () => {
    const parsed = replicationProvider.loadRaw({});
    expect(parsed.components).toEqual([]);
    expect(parsed.events).toEqual([]);
    expect(replicationProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts explicit empty arrays", () => {
    const parsed = replicationProvider.loadRaw({
      components: [],
      events: [],
    });
    expect(parsed.components.length).toBe(0);
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = replicationProvider.loadRaw({});
    replicationProvider.unload();
    replicationProvider.load(parsed);
    expect(replicationProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    replicationProvider.loadRaw({});
    replicationProvider.hotReload(null);
    expect(replicationProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    replicationProvider.loadRaw({});
    replicationProvider.unload();
    expect(replicationProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(replicationProvider).toBe(replicationProvider);
  });
});
