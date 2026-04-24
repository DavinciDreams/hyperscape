import {
  PluginRegistryManifestSchema,
  type PluginManifest,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import {
  type CommandContributionContext,
  type EditorCommand,
  commandContributionPlugin,
  InvalidCommandIdError,
  InvalidKeybindingError,
} from "../examples/CommandContributionPlugin.js";
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

function mkCommandRegistry() {
  return new PluginContributionRegistry<EditorCommand>((c) => c.id, "command");
}

async function runWithCommands(commands: readonly EditorCommand[]) {
  const registry = PluginRegistryManifestSchema.parse({
    plugins: [manifestFor("com.reference.commands")],
  });
  const commandsReg = mkCommandRegistry();
  const host = createPluginHostFromRegistry<CommandContributionContext>({
    registry,
    buildContext: (manifest, scope) => ({
      pluginId: manifest.id,
      scope,
      commands: commandsReg,
    }),
    factories: {
      "com.reference.commands": () => commandContributionPlugin(commands),
    },
  });
  return { host, commandsReg };
}

describe("CommandContributionPlugin (I4 reference integration)", () => {
  it("registers commands on enable and retracts them on disable", async () => {
    const { host, commandsReg } = await runWithCommands([
      { id: "file.save", label: "Save", keybinding: "Mod+S", group: "file" },
      { id: "edit.copy", label: "Copy", keybinding: "Mod+C", group: "edit" },
    ]);

    await host.loadAndEnable();
    expect(commandsReg.size).toBe(2);
    expect(commandsReg.idsForPlugin("com.reference.commands")).toEqual([
      "file.save",
      "edit.copy",
    ]);
    expect(commandsReg.get("file.save").keybinding).toBe("Mod+S");

    await host.disableAll();
    expect(commandsReg.size).toBe(0);
  });

  it("allows commands with no keybinding (palette-only)", async () => {
    const { host, commandsReg } = await runWithCommands([
      { id: "view.zenMode", label: "Zen Mode", group: "view" },
    ]);
    await host.loadAndEnable();
    expect(commandsReg.get("view.zenMode").keybinding).toBeUndefined();
  });

  it("rejects command ids that are not dot.separated.lowerCamelCase", async () => {
    const { host } = await runWithCommands([
      // invalid: no dot, single segment
      { id: "badid", label: "x", group: "x" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidCommandIdError),
    });
  });

  it("rejects command ids with PascalCase segments", async () => {
    const { host } = await runWithCommands([
      { id: "File.Save", label: "x", group: "x" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidCommandIdError),
    });
  });

  it("rejects keybindings with unknown modifiers", async () => {
    const { host } = await runWithCommands([
      {
        id: "edit.copy",
        label: "Copy",
        keybinding: "Hyper+C",
        group: "edit",
      },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidKeybindingError),
    });
  });

  it("rejects empty keybindings", async () => {
    const { host } = await runWithCommands([
      { id: "edit.copy", label: "Copy", keybinding: "", group: "edit" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidKeybindingError),
    });
  });

  it("rejects keybindings that are only modifiers", async () => {
    const { host } = await runWithCommands([
      { id: "edit.copy", label: "Copy", keybinding: "Mod+", group: "edit" },
    ]);
    await expect(host.loadAndEnable()).rejects.toMatchObject({
      cause: expect.any(InvalidKeybindingError),
    });
  });

  it("accepts compound modifier chords", async () => {
    const { host, commandsReg } = await runWithCommands([
      {
        id: "edit.redo",
        label: "Redo",
        keybinding: "Mod+Shift+Z",
        group: "edit",
      },
    ]);
    await host.loadAndEnable();
    expect(commandsReg.get("edit.redo").keybinding).toBe("Mod+Shift+Z");
  });
});
