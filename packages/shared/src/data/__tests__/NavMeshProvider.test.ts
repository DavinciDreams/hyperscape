/**
 * Tests for the NavMeshProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { navMeshProvider } from "../NavMeshProvider";

beforeEach(() => {
  navMeshProvider.unload();
});
afterEach(() => {
  navMeshProvider.unload();
});

const validManifest = {
  agents: [
    {
      id: "humanoid",
      name: "Humanoid",
    },
  ],
};

describe("NavMeshProvider", () => {
  it("starts unloaded", () => {
    expect(navMeshProvider.isLoaded()).toBe(false);
    expect(navMeshProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} baseline — agents.min(1) required", () => {
    expect(() => navMeshProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts a valid single-agent manifest", () => {
    const parsed = navMeshProvider.loadRaw(validManifest);
    expect(parsed.agents.length).toBe(1);
    expect(parsed.agents[0]!.id).toBe("humanoid");
  });

  it("loadRaw() rejects duplicate agent ids", () => {
    expect(() =>
      navMeshProvider.loadRaw({
        agents: [validManifest.agents[0], { ...validManifest.agents[0] }],
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = navMeshProvider.loadRaw(validManifest);
    navMeshProvider.unload();
    navMeshProvider.load(parsed);
    expect(navMeshProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    navMeshProvider.loadRaw(validManifest);
    navMeshProvider.hotReload(null);
    expect(navMeshProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    navMeshProvider.loadRaw(validManifest);
    navMeshProvider.unload();
    expect(navMeshProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(navMeshProvider).toBe(navMeshProvider);
  });
});
