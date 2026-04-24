/**
 * Tests for the DeployTargetsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deployTargetsProvider } from "../DeployTargetsProvider";

beforeEach(() => {
  deployTargetsProvider.unload();
});
afterEach(() => {
  deployTargetsProvider.unload();
});

const validTarget = {
  id: "prodRailway",
  name: "Production (Railway)",
  provider: "railway",
  environment: "production",
  region: "us-east",
};

describe("DeployTargetsProvider", () => {
  it("starts unloaded", () => {
    expect(deployTargetsProvider.isLoaded()).toBe(false);
    expect(deployTargetsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty array baseline", () => {
    const parsed = deployTargetsProvider.loadRaw([]);
    expect(parsed.length).toBe(0);
    expect(deployTargetsProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts a valid target", () => {
    const parsed = deployTargetsProvider.loadRaw([validTarget]);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.id).toBe("prodRailway");
  });

  it("loadRaw() rejects duplicate target ids", () => {
    expect(() =>
      deployTargetsProvider.loadRaw([validTarget, { ...validTarget }]),
    ).toThrow();
  });

  it("loadRaw() rejects invalid provider enum", () => {
    expect(() =>
      deployTargetsProvider.loadRaw([{ ...validTarget, provider: "madeup" }]),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = deployTargetsProvider.loadRaw([validTarget]);
    deployTargetsProvider.unload();
    deployTargetsProvider.load(parsed);
    expect(deployTargetsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    deployTargetsProvider.loadRaw([validTarget]);
    deployTargetsProvider.hotReload(null);
    expect(deployTargetsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    deployTargetsProvider.loadRaw([validTarget]);
    deployTargetsProvider.unload();
    expect(deployTargetsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(deployTargetsProvider).toBe(deployTargetsProvider);
  });
});
