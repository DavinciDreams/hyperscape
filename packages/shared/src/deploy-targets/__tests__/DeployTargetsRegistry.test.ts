import { DeployTargetsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it, vi } from "vitest";
import {
  DeployTargetsNotLoadedError,
  DeployTargetsRegistry,
  UnknownDeployTargetError,
} from "../DeployTargetsRegistry.js";

function target(
  id: string,
  extra: {
    provider?:
      | "railway"
      | "fly"
      | "vercel"
      | "docker"
      | "cloudflare-pages"
      | "cloudflare-workers";
    environment?: "development" | "staging" | "production";
    enabled?: boolean;
  } = {},
) {
  return {
    id,
    name: id,
    provider: extra.provider ?? "railway",
    environment: extra.environment ?? "production",
    region: "us-east1",
    enabled: extra.enabled ?? true,
  };
}

function manifest() {
  return DeployTargetsManifestSchema.parse([
    target("prodRailway", { environment: "production", provider: "railway" }),
    target("stagingFly", { environment: "staging", provider: "fly" }),
    target("devLocal", {
      environment: "development",
      provider: "docker",
      enabled: false,
    }),
    target("edgeCF", {
      environment: "production",
      provider: "cloudflare-workers",
    }),
  ]);
}

describe("DeployTargetsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new DeployTargetsRegistry().manifest).toThrow(
      DeployTargetsNotLoadedError,
    );
  });

  it("indexes by id", () => {
    const r = new DeployTargetsRegistry(manifest());
    expect(r.has("prodRailway")).toBe(true);
    expect(r.get("stagingFly").environment).toBe("staging");
  });

  it("throws on unknown", () => {
    const r = new DeployTargetsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownDeployTargetError);
  });

  it("filters by environment", () => {
    const r = new DeployTargetsRegistry(manifest());
    expect(r.forEnvironment("production").map((t) => t.id)).toEqual([
      "prodRailway",
      "edgeCF",
    ]);
  });

  it("filters by provider", () => {
    const r = new DeployTargetsRegistry(manifest());
    expect(r.forProvider("cloudflare-workers").map((t) => t.id)).toEqual([
      "edgeCF",
    ]);
  });

  it("enabled drops disabled targets", () => {
    const r = new DeployTargetsRegistry(manifest());
    expect(r.enabled().map((t) => t.id)).toEqual([
      "prodRailway",
      "stagingFly",
      "edgeCF",
    ]);
  });
});

describe("DeployTargetsRegistry — onReloaded", () => {
  it("fires after every successful load()", () => {
    const r = new DeployTargetsRegistry();
    const cb = vi.fn();
    r.onReloaded(cb);
    r.load(manifest());
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("returned unsubscribe stops further notifications", () => {
    const r = new DeployTargetsRegistry();
    const cb = vi.fn();
    const off = r.onReloaded(cb);
    r.load(manifest());
    off();
    r.load(manifest());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("a throwing listener does not break subsequent listeners", () => {
    const r = new DeployTargetsRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("listener boom");
    });
    const good = vi.fn();
    r.onReloaded(bad);
    r.onReloaded(good);
    r.load(manifest());
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
