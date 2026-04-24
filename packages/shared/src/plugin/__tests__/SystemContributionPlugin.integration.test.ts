import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type SystemContribution,
  type SystemContributionContext,
  InvalidSystemFieldError,
  InvalidSystemIdError,
  InvalidSystemPhaseError,
  InvalidSystemTickRateError,
  systemContributionPlugin,
} from "../examples/SystemContributionPlugin.js";
import { createPluginHostFromRegistry } from "../PluginRegistryBootstrap.js";

function manifestFor(id: string): PluginManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "1.0.0",
    dependencies: [],
  } as PluginManifest;
}

function mkSystemRegistry() {
  return new PluginContributionRegistry<SystemContribution>(
    (s) => s.id,
    "system",
  );
}

async function runWithSystems(systems: readonly SystemContribution[]) {
  const registry = PluginRegistryManifestSchema.parse({
    plugins: [manifestFor("com.reference.systems")],
  });
  const systemsReg = mkSystemRegistry();
  const host = createPluginHostFromRegistry<SystemContributionContext>({
    registry,
    buildContext: (manifest, scope) => ({
      pluginId: manifest.id,
      scope,
      systems: systemsReg,
    }),
    factories: {
      "com.reference.systems": () => systemContributionPlugin(systems),
    },
  });
  return { host, systemsReg };
}

describe("SystemContributionPlugin (I3 reference integration)", () => {
  it("registers systems on enable and retracts them on disable", async () => {
    const { host, systemsReg } = await runWithSystems([
      {
        id: "pathfinding",
        tickRateHz: 30,
        phase: "logic",
      },
      {
        id: "com.studio.combat-aggro",
        tickRateHz: 8,
        phase: "logic",
        description: "Re-evaluates aggro tables for nearby NPCs",
      },
    ]);

    await host.loadAndEnable();
    expect(systemsReg.size).toBe(2);
    expect(systemsReg.idsForPlugin("com.reference.systems")).toEqual([
      "pathfinding",
      "com.studio.combat-aggro",
    ]);
    expect(systemsReg.get("pathfinding").tickRateHz).toBe(30);
    expect(systemsReg.get("com.studio.combat-aggro").description).toBe(
      "Re-evaluates aggro tables for nearby NPCs",
    );

    await host.disableAll();
    expect(systemsReg.size).toBe(0);
  });

  it("accepts a system without a description", async () => {
    const { host, systemsReg } = await runWithSystems([
      { id: "noDesc", tickRateHz: 60, phase: "physics" },
    ]);
    await host.loadAndEnable();
    expect(systemsReg.get("noDesc").description).toBeUndefined();
  });

  it("accepts each canonical phase", async () => {
    const { host, systemsReg } = await runWithSystems([
      { id: "input1", tickRateHz: 60, phase: "input" },
      { id: "physics1", tickRateHz: 60, phase: "physics" },
      { id: "logic1", tickRateHz: 60, phase: "logic" },
      { id: "render1", tickRateHz: 60, phase: "render" },
    ]);
    await host.loadAndEnable();
    expect(systemsReg.size).toBe(4);
  });

  it("rejects ids that don't match lowerCamelCase or reverse-domain", async () => {
    const { host } = await runWithSystems([
      { id: "Bad-System", tickRateHz: 60, phase: "logic" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemIdError),
    });
  });

  it("rejects zero tick rate", async () => {
    const { host } = await runWithSystems([
      { id: "zero", tickRateHz: 0, phase: "logic" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemTickRateError),
    });
  });

  it("rejects negative tick rate", async () => {
    const { host } = await runWithSystems([
      { id: "neg", tickRateHz: -5, phase: "logic" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemTickRateError),
    });
  });

  it("rejects tick rate above 240 Hz", async () => {
    const { host } = await runWithSystems([
      { id: "tooFast", tickRateHz: 9999, phase: "logic" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemTickRateError),
    });
  });

  it("rejects non-finite tick rate", async () => {
    const { host } = await runWithSystems([
      { id: "inf", tickRateHz: Number.POSITIVE_INFINITY, phase: "logic" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemTickRateError),
    });
  });

  it("rejects unknown phase", async () => {
    const { host } = await runWithSystems([
      // intentionally bypass type check for runtime validation surface
      { id: "weird", tickRateHz: 60, phase: "audio" as never },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemPhaseError),
    });
  });

  it("rejects whitespace-only description when set", async () => {
    const { host } = await runWithSystems([
      {
        id: "blankDesc",
        tickRateHz: 60,
        phase: "logic",
        description: "   ",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidSystemFieldError),
    });
  });

  it("accepts the upper-bound tick rate of exactly 240 Hz", async () => {
    const { host, systemsReg } = await runWithSystems([
      { id: "boundary", tickRateHz: 240, phase: "physics" },
    ]);
    await host.loadAndEnable();
    expect(systemsReg.get("boundary").tickRateHz).toBe(240);
  });
});
