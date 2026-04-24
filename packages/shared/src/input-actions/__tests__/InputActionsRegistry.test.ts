import { InputActionsManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  InputActionsNotLoadedError,
  InputActionsRegistry,
  UnknownInputActionError,
} from "../InputActionsRegistry.js";

function manifest() {
  return InputActionsManifestSchema.parse([
    {
      id: "jump",
      name: "Jump",
      kind: "button",
      category: "movement",
      defaults: [
        { source: "key", code: "Space", scheme: "keyboard-mouse" },
        { source: "gamepad-button", code: "0", scheme: "gamepad" },
      ],
    },
    {
      id: "interact",
      name: "Interact",
      kind: "button",
      category: "movement",
      defaults: [{ source: "key", code: "KeyE", scheme: "keyboard-mouse" }],
    },
    {
      id: "debugConsole",
      name: "Debug Console",
      kind: "button",
      category: "debug",
      rebindable: false,
      defaults: [
        {
          source: "key",
          code: "Backquote",
          modifiers: ["ctrl"],
          scheme: "keyboard-mouse",
        },
      ],
    },
  ]);
}

describe("InputActionsRegistry", () => {
  it("throws pre-load", () => {
    expect(() => new InputActionsRegistry().manifest).toThrow(
      InputActionsNotLoadedError,
    );
  });

  it("indexes by id", () => {
    const r = new InputActionsRegistry(manifest());
    expect(r.ids).toEqual(["jump", "interact", "debugConsole"]);
    expect(r.get("jump").name).toBe("Jump");
  });

  it("throws on unknown", () => {
    const r = new InputActionsRegistry(manifest());
    expect(() => r.get("ghost")).toThrow(UnknownInputActionError);
  });

  it("rebindable filters out rebindable=false", () => {
    const r = new InputActionsRegistry(manifest());
    expect(r.rebindable().map((a) => a.id)).toEqual(["jump", "interact"]);
  });

  it("byCategory groups", () => {
    const r = new InputActionsRegistry(manifest());
    expect(r.byCategory("movement").map((a) => a.id)).toEqual([
      "jump",
      "interact",
    ]);
  });

  it("defaultsForScheme filters", () => {
    const r = new InputActionsRegistry(manifest());
    expect(
      r.defaultsForScheme("jump", "keyboard-mouse").map((b) => b.code),
    ).toEqual(["Space"]);
    expect(r.defaultsForScheme("jump", "gamepad").map((b) => b.code)).toEqual([
      "0",
    ]);
    expect(r.defaultsForScheme("jump", "touch")).toEqual([]);
  });

  it("actionUsingBinding detects conflicts", () => {
    const r = new InputActionsRegistry(manifest());
    expect(r.actionUsingBinding("keyboard-mouse", "Space")).toBe("jump");
    expect(r.actionUsingBinding("keyboard-mouse", "Backquote", ["ctrl"])).toBe(
      "debugConsole",
    );
    // Same key without modifier → no match.
    expect(r.actionUsingBinding("keyboard-mouse", "Backquote")).toBeUndefined();
    expect(r.actionUsingBinding("keyboard-mouse", "KeyF")).toBeUndefined();
  });
});
