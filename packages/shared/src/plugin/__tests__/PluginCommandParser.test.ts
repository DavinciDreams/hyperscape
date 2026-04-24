import { describe, expect, it } from "vitest";
import {
  parsePluginCommand,
  PluginCommandParseError,
} from "../PluginCommandParser.js";

describe("parsePluginCommand — list", () => {
  it("parses bare list", () => {
    expect(parsePluginCommand("plugin list")).toEqual({
      kind: "list",
      filter: undefined,
      state: undefined,
    });
  });

  it("parses list with --filter", () => {
    expect(parsePluginCommand("plugin list --filter=terrain")).toEqual({
      kind: "list",
      filter: "terrain",
      state: undefined,
    });
  });

  it("parses list with --state", () => {
    expect(parsePluginCommand("plugin list --state=enabled")).toEqual({
      kind: "list",
      filter: undefined,
      state: "enabled",
    });
  });

  it("parses list with both flags", () => {
    expect(
      parsePluginCommand("plugin list --filter=com.acme --state=loaded"),
    ).toEqual({ kind: "list", filter: "com.acme", state: "loaded" });
  });

  it("rejects --filter without value", () => {
    expect(() => parsePluginCommand("plugin list --filter")).toThrow(
      PluginCommandParseError,
    );
  });

  it("rejects invalid --state value", () => {
    expect(() => parsePluginCommand("plugin list --state=broken")).toThrow(
      PluginCommandParseError,
    );
  });

  it("rejects unknown flag", () => {
    expect(() => parsePluginCommand("plugin list --sort=name")).toThrow(
      PluginCommandParseError,
    );
  });

  it("rejects positional args on list", () => {
    expect(() => parsePluginCommand("plugin list com.acme")).toThrow(
      PluginCommandParseError,
    );
  });
});

describe("parsePluginCommand — info/enable/reload", () => {
  it("parses info", () => {
    expect(parsePluginCommand("plugin info com.acme.terrain")).toEqual({
      kind: "info",
      pluginId: "com.acme.terrain",
    });
  });

  it("parses enable", () => {
    expect(parsePluginCommand("plugin enable com.acme.terrain")).toEqual({
      kind: "enable",
      pluginId: "com.acme.terrain",
    });
  });

  it("parses reload", () => {
    expect(parsePluginCommand("plugin reload com.acme.terrain")).toEqual({
      kind: "reload",
      pluginId: "com.acme.terrain",
    });
  });

  it("rejects enable with no plugin id", () => {
    expect(() => parsePluginCommand("plugin enable")).toThrow(
      PluginCommandParseError,
    );
  });

  it("rejects enable with extra positional", () => {
    expect(() => parsePluginCommand("plugin enable com.a com.b")).toThrow(
      PluginCommandParseError,
    );
  });

  it("rejects unknown flag on info", () => {
    expect(() => parsePluginCommand("plugin info com.a --verbose")).toThrow(
      PluginCommandParseError,
    );
  });
});

describe("parsePluginCommand — disable", () => {
  it("parses bare disable", () => {
    expect(parsePluginCommand("plugin disable com.acme.terrain")).toEqual({
      kind: "disable",
      pluginId: "com.acme.terrain",
      force: false,
    });
  });

  it("parses disable --force", () => {
    expect(
      parsePluginCommand("plugin disable com.acme.terrain --force"),
    ).toEqual({
      kind: "disable",
      pluginId: "com.acme.terrain",
      force: true,
    });
  });

  it("rejects --force with value", () => {
    expect(() =>
      parsePluginCommand("plugin disable com.a --force=true"),
    ).toThrow(PluginCommandParseError);
  });
});

describe("parsePluginCommand — errors", () => {
  it("rejects empty input", () => {
    expect(() => parsePluginCommand("")).toThrow(PluginCommandParseError);
    expect(() => parsePluginCommand("   ")).toThrow(PluginCommandParseError);
  });

  it("rejects missing leader", () => {
    expect(() => parsePluginCommand("list")).toThrow(PluginCommandParseError);
  });

  it("rejects missing subcommand", () => {
    expect(() => parsePluginCommand("plugin")).toThrow(PluginCommandParseError);
  });

  it("rejects unknown subcommand", () => {
    expect(() => parsePluginCommand("plugin purge com.a")).toThrow(
      PluginCommandParseError,
    );
  });

  it("error carries structured code", () => {
    try {
      parsePluginCommand("plugin enable");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PluginCommandParseError);
      expect((e as PluginCommandParseError).code).toBe("missing-plugin-id");
    }
  });
});

describe("parsePluginCommand — whitespace tolerance", () => {
  it("collapses multi-space separators", () => {
    expect(parsePluginCommand("  plugin    enable   com.a  ")).toEqual({
      kind: "enable",
      pluginId: "com.a",
    });
  });

  it("tolerates tabs", () => {
    expect(parsePluginCommand("plugin\tlist")).toEqual({
      kind: "list",
      filter: undefined,
      state: undefined,
    });
  });
});
