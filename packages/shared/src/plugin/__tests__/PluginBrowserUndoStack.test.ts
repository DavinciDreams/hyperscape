import { describe, expect, it } from "vitest";
import {
  createPluginBrowserUndoStack,
  type PluginBrowserUndoCommand,
} from "../PluginBrowserUndoStack.js";

describe("createPluginBrowserUndoStack — defaults", () => {
  it("starts empty with default capacity 100", () => {
    const s = createPluginBrowserUndoStack();
    expect(s.capacity).toBe(100);
    expect(s.canUndo()).toBe(false);
    expect(s.canRedo()).toBe(false);
    expect(s.undoSize()).toBe(0);
    expect(s.redoSize()).toBe(0);
    expect(s.peekUndo()).toBeUndefined();
    expect(s.peekRedo()).toBeUndefined();
  });

  it("clamps invalid capacity to 100", () => {
    expect(createPluginBrowserUndoStack(0).capacity).toBe(100);
    expect(createPluginBrowserUndoStack(-5).capacity).toBe(100);
    expect(createPluginBrowserUndoStack(Number.NaN).capacity).toBe(100);
    expect(createPluginBrowserUndoStack(1.5).capacity).toBe(100);
  });

  it("accepts explicit capacity >= 1", () => {
    expect(createPluginBrowserUndoStack(10).capacity).toBe(10);
  });
});

describe("createPluginBrowserUndoStack — push", () => {
  it("pushes a command and makes it undoable", () => {
    const s = createPluginBrowserUndoStack<number>();
    expect(s.push({ label: "install a", payload: 1 })).toBe(true);
    expect(s.canUndo()).toBe(true);
    expect(s.undoSize()).toBe(1);
    expect(s.peekUndo()).toEqual({ label: "install a", payload: 1 });
  });

  it("rejects invalid command (empty label)", () => {
    const s = createPluginBrowserUndoStack<number>();
    expect(s.push({ label: "", payload: 1 })).toBe(false);
    expect(s.canUndo()).toBe(false);
  });

  it("rejects non-object command", () => {
    const s = createPluginBrowserUndoStack<number>();
    expect(s.push(null as unknown as PluginBrowserUndoCommand<number>)).toBe(
      false,
    );
  });

  it("clears redo stack on push", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.push({ label: "c", payload: 3 });
    expect(s.canRedo()).toBe(false);
  });

  it("evicts oldest entry when over capacity", () => {
    const s = createPluginBrowserUndoStack<number>(2);
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.push({ label: "c", payload: 3 });
    expect(s.undoSize()).toBe(2);
    expect(s.undoEntries().map((e) => e.label)).toEqual(["b", "c"]);
  });
});

describe("createPluginBrowserUndoStack — undo", () => {
  it("pops and returns the latest command", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    expect(s.undo()).toEqual({ label: "b", payload: 2 });
    expect(s.undoSize()).toBe(1);
    expect(s.redoSize()).toBe(1);
    expect(s.peekRedo()).toEqual({ label: "b", payload: 2 });
  });

  it("returns undefined when empty", () => {
    const s = createPluginBrowserUndoStack<number>();
    expect(s.undo()).toBeUndefined();
  });
});

describe("createPluginBrowserUndoStack — redo", () => {
  it("moves a redo entry back onto undo", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.undo();
    expect(s.redo()).toEqual({ label: "a", payload: 1 });
    expect(s.canUndo()).toBe(true);
    expect(s.canRedo()).toBe(false);
  });

  it("returns undefined when redo empty", () => {
    const s = createPluginBrowserUndoStack<number>();
    expect(s.redo()).toBeUndefined();
  });

  it("round-trip: undo then redo reaches same state", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.push({ label: "c", payload: 3 });
    s.undo();
    s.undo();
    s.redo();
    s.redo();
    expect(s.undoEntries().map((e) => e.label)).toEqual(["a", "b", "c"]);
    expect(s.redoSize()).toBe(0);
  });
});

describe("createPluginBrowserUndoStack — clear", () => {
  it("drops both stacks", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.undo();
    s.clear();
    expect(s.undoSize()).toBe(0);
    expect(s.redoSize()).toBe(0);
  });
});

describe("createPluginBrowserUndoStack — snapshots", () => {
  it("undoEntries is oldest-first", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.push({ label: "c", payload: 3 });
    expect(s.undoEntries().map((e) => e.label)).toEqual(["a", "b", "c"]);
  });

  it("redoEntries is oldest-first", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    s.push({ label: "b", payload: 2 });
    s.push({ label: "c", payload: 3 });
    s.undo();
    s.undo();
    // Redo stack now contains [c, b] with b on top (most recent
    // undo). Oldest-first expected order is [c, b].
    expect(s.redoEntries().map((e) => e.label)).toEqual(["c", "b"]);
  });

  it("snapshot is decoupled from internal arrays", () => {
    const s = createPluginBrowserUndoStack<number>();
    s.push({ label: "a", payload: 1 });
    const snap = s.undoEntries();
    (snap as PluginBrowserUndoCommand<number>[]).length = 0;
    expect(s.undoSize()).toBe(1);
  });
});

describe("createPluginBrowserUndoStack — generic payload", () => {
  it("threads typed payloads through", () => {
    type Payload = { kind: "install" | "enable"; pluginId: string };
    const s = createPluginBrowserUndoStack<Payload>();
    s.push({
      label: "install a",
      payload: { kind: "install", pluginId: "a" },
    });
    const top = s.peekUndo();
    expect(top?.payload.kind).toBe("install");
    expect(top?.payload.pluginId).toBe("a");
  });
});
