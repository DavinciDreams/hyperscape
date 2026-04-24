/**
 * CommandContributionPlugin (I4 reference).
 *
 * Third reference plugin over `PluginContributionRegistry<TItem>`.
 * Mirrors `PaletteContributionPlugin` and
 * `ToolbarToolContributionPlugin` to further reinforce that the
 * generic substrate is surface-agnostic — palette categories,
 * toolbar tools, and commands all use identical lifecycle code.
 *
 * Unlike the simpler reference plugins, this one validates that
 * command IDs are dot.separated.lowerCamelCase (matches conventions
 * in shipped editor commands) and that keybindings use recognized
 * modifier prefixes. Failures surface at `onEnable` time so the host
 * can refuse to bring up the plugin rather than letting bad data leak
 * into the live registry.
 */

import type { PluginContextScope } from "../PluginContextScope.js";
import type { PluginContributionRegistry } from "../PluginContributionRegistry.js";
import type { HyperforgePlugin } from "../PluginLoader.js";

/**
 * Editor command descriptor. Real editor command systems wire these
 * to execution handlers; the reference plugin only does registration.
 */
export interface EditorCommand {
  readonly id: string;
  readonly label: string;
  /**
   * Optional key chord in `Mod+Shift+K` style. `Mod` maps to Cmd on
   * macOS and Ctrl elsewhere. Omit for commands that are only
   * reachable via palette/menu.
   */
  readonly keybinding?: string;
  /** Grouping bucket (e.g. "file", "edit", "view"). */
  readonly group: string;
}

export interface CommandContributionContext {
  readonly pluginId: string;
  readonly scope: PluginContextScope;
  readonly commands: PluginContributionRegistry<EditorCommand>;
}

const ID_REGEX = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const ALLOWED_MODIFIERS = new Set(["Mod", "Ctrl", "Alt", "Shift", "Meta"]);

export class InvalidCommandIdError extends Error {
  readonly commandId: string;

  constructor(commandId: string) {
    super(
      `Command id "${commandId}" must be dot.separated.lowerCamelCase (e.g. "edit.copy" or "file.saveAll")`,
    );
    this.name = "InvalidCommandIdError";
    this.commandId = commandId;
  }
}

export class InvalidKeybindingError extends Error {
  readonly commandId: string;
  readonly keybinding: string;

  constructor(commandId: string, keybinding: string, reason: string) {
    super(
      `Command "${commandId}" has invalid keybinding "${keybinding}": ${reason}`,
    );
    this.name = "InvalidKeybindingError";
    this.commandId = commandId;
    this.keybinding = keybinding;
  }
}

function validateKeybinding(commandId: string, kb: string): void {
  if (kb.trim() === "") {
    throw new InvalidKeybindingError(commandId, kb, "cannot be empty");
  }
  const parts = kb.split("+");
  if (parts.length === 0) {
    throw new InvalidKeybindingError(commandId, kb, "cannot be empty");
  }
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (key.length === 0) {
    throw new InvalidKeybindingError(commandId, kb, "missing final key");
  }
  for (const mod of modifiers) {
    if (!ALLOWED_MODIFIERS.has(mod)) {
      throw new InvalidKeybindingError(
        commandId,
        kb,
        `unrecognized modifier "${mod}" (allowed: ${[...ALLOWED_MODIFIERS].join(", ")})`,
      );
    }
  }
}

function validateCommand(cmd: EditorCommand): void {
  if (!ID_REGEX.test(cmd.id)) {
    throw new InvalidCommandIdError(cmd.id);
  }
  if (cmd.keybinding !== undefined) {
    validateKeybinding(cmd.id, cmd.keybinding);
  }
}

export function commandContributionPlugin(
  commands: readonly EditorCommand[],
): HyperforgePlugin<CommandContributionContext> {
  return {
    onEnable(ctx) {
      for (const cmd of commands) validateCommand(cmd);
      ctx.commands.registerAll(ctx.pluginId, commands);
      ctx.scope.register(() =>
        ctx.commands.unregisterAllForPlugin(ctx.pluginId),
      );
    },
  };
}
