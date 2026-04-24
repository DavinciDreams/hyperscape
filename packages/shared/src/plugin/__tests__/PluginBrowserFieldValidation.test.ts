import { describe, expect, it } from "vitest";
import { createPluginBrowserFieldValidation } from "../PluginBrowserFieldValidation.js";

describe("createPluginBrowserFieldValidation — defaults", () => {
  it("starts empty", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.hasError("a")).toBe(false);
    expect(v.hasFieldError("a", "port")).toBe(false);
    expect(v.getFieldError("a", "port")).toBeUndefined();
    expect(v.erroredFields("a")).toEqual([]);
    expect(v.erroredPlugins()).toEqual([]);
    expect(v.totalErrorCount()).toBe(0);
    expect(v.erroredPluginCount()).toBe(0);
    expect(v.entries()).toEqual([]);
  });
});

describe("createPluginBrowserFieldValidation — setError", () => {
  it("sets a new error", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.setError("a", "port", "must be a number")).toBe(true);
    expect(v.hasFieldError("a", "port")).toBe(true);
    expect(v.getFieldError("a", "port")).toBe("must be a number");
    expect(v.hasError("a")).toBe(true);
  });

  it("is idempotent when the same message re-sets", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "bad");
    expect(v.setError("a", "port", "bad")).toBe(false);
  });

  it("updating message returns true", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "bad");
    expect(v.setError("a", "port", "worse")).toBe(true);
    expect(v.getFieldError("a", "port")).toBe("worse");
  });

  it("rejects empty ids / messages", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.setError("", "port", "bad")).toBe(false);
    expect(v.setError("a", "", "bad")).toBe(false);
    expect(v.setError("a", "port", "")).toBe(false);
    expect(v.erroredPlugins()).toEqual([]);
  });

  it("preserves field insertion order", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("a", "host", "y");
    v.setError("a", "tls", "z");
    expect(v.erroredFields("a")).toEqual(["port", "host", "tls"]);
  });
});

describe("createPluginBrowserFieldValidation — clearError", () => {
  it("clears a single field", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "bad");
    v.setError("a", "host", "also bad");
    expect(v.clearError("a", "port")).toBe(true);
    expect(v.hasFieldError("a", "port")).toBe(false);
    expect(v.hasFieldError("a", "host")).toBe(true);
    expect(v.hasError("a")).toBe(true);
  });

  it("drops plugin when last errored field cleared", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "bad");
    v.clearError("a", "port");
    expect(v.hasError("a")).toBe(false);
    expect(v.erroredPlugins()).toEqual([]);
  });

  it("returns false on unknown field", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.clearError("a", "port")).toBe(false);
  });

  it("returns false on empty ids", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.clearError("", "port")).toBe(false);
    expect(v.clearError("a", "")).toBe(false);
  });
});

describe("createPluginBrowserFieldValidation — clearAllForPlugin", () => {
  it("drops every field for a plugin", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("a", "host", "y");
    expect(v.clearAllForPlugin("a")).toBe(true);
    expect(v.hasError("a")).toBe(false);
  });

  it("returns false when plugin had no errors", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.clearAllForPlugin("nope")).toBe(false);
  });

  it("returns false on empty id", () => {
    const v = createPluginBrowserFieldValidation();
    expect(v.clearAllForPlugin("")).toBe(false);
  });
});

describe("createPluginBrowserFieldValidation — cross-plugin", () => {
  it("tracks multiple plugins in insertion order", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("b", "host", "y");
    v.setError("c", "tls", "z");
    expect(v.erroredPlugins()).toEqual(["a", "b", "c"]);
    expect(v.erroredPluginCount()).toBe(3);
    expect(v.totalErrorCount()).toBe(3);
  });

  it("reports accurate totalErrorCount", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "one", "1");
    v.setError("a", "two", "2");
    v.setError("a", "three", "3");
    v.setError("b", "x", "!");
    expect(v.totalErrorCount()).toBe(4);
  });

  it("clearing one plugin preserves others", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("b", "host", "y");
    v.clearAllForPlugin("a");
    expect(v.erroredPlugins()).toEqual(["b"]);
  });
});

describe("createPluginBrowserFieldValidation — clear + entries", () => {
  it("clear wipes everything", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("b", "host", "y");
    v.clear();
    expect(v.erroredPlugins()).toEqual([]);
    expect(v.totalErrorCount()).toBe(0);
  });

  it("entries snapshots per-plugin errored fields in insertion order", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    v.setError("a", "host", "y");
    v.setError("b", "tls", "z");
    expect(v.entries()).toEqual([
      {
        pluginId: "a",
        errors: [
          { fieldPath: "port", message: "x" },
          { fieldPath: "host", message: "y" },
        ],
      },
      {
        pluginId: "b",
        errors: [{ fieldPath: "tls", message: "z" }],
      },
    ]);
  });

  it("entries array is decoupled", () => {
    const v = createPluginBrowserFieldValidation();
    v.setError("a", "port", "x");
    const snap = v.entries();
    (snap as PluginBrowserFieldErrorEntry[]).length = 0;
    expect(v.totalErrorCount()).toBe(1);
  });
});

// local type alias for cast in decoupling test
type PluginBrowserFieldErrorEntry = ReturnType<
  ReturnType<typeof createPluginBrowserFieldValidation>["entries"]
>[number];
