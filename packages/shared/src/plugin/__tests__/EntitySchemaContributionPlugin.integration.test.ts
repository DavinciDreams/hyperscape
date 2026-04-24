import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type EntitySchema,
  type EntitySchemaContributionContext,
  entitySchemaContributionPlugin,
  InvalidEntitySchemaIdError,
  InvalidEntitySchemaFieldError,
} from "../examples/EntitySchemaContributionPlugin.js";
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

function mkEntitySchemaRegistry() {
  return new PluginContributionRegistry<EntitySchema>(
    (s) => s.id,
    "entitySchema",
  );
}

async function runWithSchemas(schemas: readonly EntitySchema[]) {
  const registry = PluginRegistryManifestSchema.parse({
    plugins: [manifestFor("com.reference.entityschemas")],
  });
  const schemasReg = mkEntitySchemaRegistry();
  const host = createPluginHostFromRegistry<EntitySchemaContributionContext>({
    registry,
    buildContext: (manifest, scope) => ({
      pluginId: manifest.id,
      scope,
      entitySchemas: schemasReg,
    }),
    factories: {
      "com.reference.entityschemas": () =>
        entitySchemaContributionPlugin(schemas),
    },
  });
  return { host, schemasReg };
}

describe("EntitySchemaContributionPlugin (I3 reference integration)", () => {
  it("registers schemas on enable and retracts them on disable", async () => {
    const { host, schemasReg } = await runWithSchemas([
      {
        id: "questObjective",
        label: "Quest Objective",
        categoryId: "quest",
        propertySchemaRef: "com.reference.questobjective.schema",
      },
      {
        id: "com.studio.loot-beacon",
        label: "Loot Beacon",
        categoryId: "world",
        propertySchemaRef: "com.studio.lootbeacon.schema",
        iconKey: "icon.beacon",
      },
    ]);

    await host.loadAndEnable();
    expect(schemasReg.size).toBe(2);
    expect(schemasReg.idsForPlugin("com.reference.entityschemas")).toEqual([
      "questObjective",
      "com.studio.loot-beacon",
    ]);
    expect(schemasReg.get("questObjective").label).toBe("Quest Objective");
    expect(schemasReg.get("com.studio.loot-beacon").iconKey).toBe(
      "icon.beacon",
    );

    await host.disableAll();
    expect(schemasReg.size).toBe(0);
  });

  it("accepts schemas without an iconKey", async () => {
    const { host, schemasReg } = await runWithSchemas([
      {
        id: "noIcon",
        label: "No Icon",
        categoryId: "misc",
        propertySchemaRef: "com.reference.noicon.schema",
      },
    ]);
    await host.loadAndEnable();
    expect(schemasReg.get("noIcon").iconKey).toBeUndefined();
  });

  it("rejects ids that don't match lowerCamelCase or reverse-domain", async () => {
    const { host } = await runWithSchemas([
      {
        id: "Bad-Identifier",
        label: "Bad",
        categoryId: "misc",
        propertySchemaRef: "x",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidEntitySchemaIdError),
    });
  });

  it("rejects empty label", async () => {
    const { host } = await runWithSchemas([
      {
        id: "empty",
        label: "   ",
        categoryId: "misc",
        propertySchemaRef: "x",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidEntitySchemaFieldError),
    });
  });

  it("rejects empty categoryId", async () => {
    const { host } = await runWithSchemas([
      {
        id: "emptyCat",
        label: "Has Label",
        categoryId: "",
        propertySchemaRef: "x",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidEntitySchemaFieldError),
    });
  });

  it("rejects empty propertySchemaRef", async () => {
    const { host } = await runWithSchemas([
      {
        id: "emptyRef",
        label: "Has Label",
        categoryId: "misc",
        propertySchemaRef: "",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidEntitySchemaFieldError),
    });
  });

  it("rejects iconKey that's whitespace-only when set", async () => {
    const { host } = await runWithSchemas([
      {
        id: "blankIcon",
        label: "Blank Icon",
        categoryId: "misc",
        propertySchemaRef: "x",
        iconKey: "   ",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidEntitySchemaFieldError),
    });
  });
});
