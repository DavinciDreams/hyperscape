import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type ManifestSchemaContribution,
  type ManifestSchemaContributionContext,
  InvalidManifestSchemaFieldError,
  InvalidManifestSchemaIdError,
  InvalidManifestSchemaVersionError,
  manifestSchemaContributionPlugin,
} from "../examples/ManifestSchemaContributionPlugin.js";
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

function mkSchemaRegistry() {
  return new PluginContributionRegistry<ManifestSchemaContribution>(
    (s) => s.id,
    "manifestSchema",
  );
}

async function runWithSchemas(schemas: readonly ManifestSchemaContribution[]) {
  const registry = PluginRegistryManifestSchema.parse({
    plugins: [manifestFor("com.reference.manifestschemas")],
  });
  const schemasReg = mkSchemaRegistry();
  const host = createPluginHostFromRegistry<ManifestSchemaContributionContext>({
    registry,
    buildContext: (manifest, scope) => ({
      pluginId: manifest.id,
      scope,
      manifestSchemas: schemasReg,
    }),
    factories: {
      "com.reference.manifestschemas": () =>
        manifestSchemaContributionPlugin(schemas),
    },
  });
  return { host, schemasReg };
}

describe("ManifestSchemaContributionPlugin (I3 reference integration)", () => {
  it("registers schemas on enable and retracts them on disable", async () => {
    const { host, schemasReg } = await runWithSchemas([
      {
        id: "starfighter",
        displayName: "Starfighter",
        version: "1.0.0",
        singleton: false,
        categoryId: "vehicles",
        iconKey: "icon.starfighter",
        description: "Player-pilotable starfighter craft",
      },
      {
        id: "com.studio.starfighter-loadout",
        displayName: "Starfighter Loadout",
        version: "0.3.1",
        singleton: true,
        categoryId: "vehicles",
      },
    ]);

    await host.loadAndEnable();
    expect(schemasReg.size).toBe(2);
    expect(schemasReg.idsForPlugin("com.reference.manifestschemas")).toEqual([
      "starfighter",
      "com.studio.starfighter-loadout",
    ]);
    expect(schemasReg.get("starfighter").displayName).toBe("Starfighter");
    expect(schemasReg.get("starfighter").singleton).toBe(false);
    expect(schemasReg.get("com.studio.starfighter-loadout").singleton).toBe(
      true,
    );

    await host.disableAll();
    expect(schemasReg.size).toBe(0);
  });

  it("accepts a schema without iconKey or description", async () => {
    const { host, schemasReg } = await runWithSchemas([
      {
        id: "minimal",
        displayName: "Minimal",
        version: "1.0.0",
        singleton: false,
        categoryId: "misc",
      },
    ]);
    await host.loadAndEnable();
    expect(schemasReg.get("minimal").iconKey).toBeUndefined();
    expect(schemasReg.get("minimal").description).toBeUndefined();
  });

  it("rejects ids that don't match lowerCamelCase or reverse-domain", async () => {
    const { host } = await runWithSchemas([
      {
        id: "Bad-Schema",
        displayName: "Bad",
        version: "1.0.0",
        singleton: false,
        categoryId: "misc",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaIdError),
    });
  });

  it("rejects empty displayName", async () => {
    const { host } = await runWithSchemas([
      {
        id: "x",
        displayName: "  ",
        version: "1.0.0",
        singleton: false,
        categoryId: "misc",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaFieldError),
    });
  });

  it("rejects malformed version", async () => {
    const { host } = await runWithSchemas([
      {
        id: "x",
        displayName: "x",
        version: "1.0",
        singleton: false,
        categoryId: "misc",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaVersionError),
    });
  });

  it("rejects empty categoryId", async () => {
    const { host } = await runWithSchemas([
      {
        id: "x",
        displayName: "x",
        version: "1.0.0",
        singleton: false,
        categoryId: "",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaFieldError),
    });
  });

  it("rejects whitespace-only iconKey when set", async () => {
    const { host } = await runWithSchemas([
      {
        id: "x",
        displayName: "x",
        version: "1.0.0",
        singleton: false,
        categoryId: "misc",
        iconKey: "   ",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaFieldError),
    });
  });

  it("rejects whitespace-only description when set", async () => {
    const { host } = await runWithSchemas([
      {
        id: "x",
        displayName: "x",
        version: "1.0.0",
        singleton: false,
        categoryId: "misc",
        description: "   ",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidManifestSchemaFieldError),
    });
  });
});
