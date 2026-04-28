/**
 * Unit tests for `CommandRegistry`.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CommandRegistry } from "./commands";

function makeRegistry() {
  return new CommandRegistry();
}

describe("CommandRegistry — registration", () => {
  it("registers a command and exposes it via get/has/keys/size", () => {
    const r = makeRegistry();
    const unregister = r.register({
      id: "respawn",
      argsSchema: z.object({}),
      handler: async () => "ok",
    });
    expect(r.has("respawn")).toBe(true);
    expect(r.get("respawn")?.id).toBe("respawn");
    expect(r.keys()).toEqual(["respawn"]);
    expect(r.size).toBe(1);
    unregister();
    expect(r.has("respawn")).toBe(false);
    expect(r.size).toBe(0);
  });

  it("preserves registration order in keys()", () => {
    const r = makeRegistry();
    r.register({ id: "a", argsSchema: z.object({}), handler: () => 1 });
    r.register({ id: "b", argsSchema: z.object({}), handler: () => 2 });
    r.register({ id: "c", argsSchema: z.object({}), handler: () => 3 });
    expect(r.keys()).toEqual(["a", "b", "c"]);
  });

  it("throws on duplicate id (loud-over-silent)", () => {
    const r = makeRegistry();
    r.register({ id: "x", argsSchema: z.object({}), handler: () => null });
    expect(() =>
      r.register({ id: "x", argsSchema: z.object({}), handler: () => null }),
    ).toThrowError(/already registered/);
  });

  it("clear() removes every command", () => {
    const r = makeRegistry();
    r.register({ id: "a", argsSchema: z.object({}), handler: () => 1 });
    r.register({ id: "b", argsSchema: z.object({}), handler: () => 2 });
    r.clear();
    expect(r.size).toBe(0);
    expect(r.keys()).toEqual([]);
  });
});

describe("CommandRegistry — dispatch", () => {
  it("invokes the handler with parsed args and returns ok=true", async () => {
    const r = makeRegistry();
    r.register({
      id: "useAbility",
      argsSchema: z.object({ slot: z.number().int().min(0) }),
      handler: async (args) => `used slot ${args.slot}`,
    });
    const result = await r.dispatch("useAbility", { slot: 3 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("used slot 3");
  });

  it("supports synchronous handlers", async () => {
    const r = makeRegistry();
    r.register({
      id: "ping",
      argsSchema: z.object({}),
      handler: () => "pong",
    });
    const result = await r.dispatch("ping", {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("pong");
  });

  it("rejects unknown commands with kind 'unknown-command'", async () => {
    const r = makeRegistry();
    const result = await r.dispatch("missing", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unknown-command");
      expect(result.error.message).toContain("missing");
    }
  });

  it("rejects bad args with kind 'invalid-args' and detailed message", async () => {
    const r = makeRegistry();
    r.register({
      id: "useAbility",
      argsSchema: z.object({ slot: z.number().int().min(0) }),
      handler: async () => "ok",
    });
    const result = await r.dispatch("useAbility", { slot: "not a number" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-args");
      expect(result.error.message).toContain("useAbility");
      expect(result.error.message).toContain("slot");
    }
  });

  it("catches handler-thrown errors as kind 'handler-threw'", async () => {
    const r = makeRegistry();
    r.register({
      id: "boom",
      argsSchema: z.object({}),
      handler: () => {
        throw new Error("kaboom");
      },
    });
    const result = await r.dispatch("boom", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("handler-threw");
      expect(result.error.message).toContain("kaboom");
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it("catches handler-thrown non-Error values without crashing", async () => {
    const r = makeRegistry();
    r.register({
      id: "boom",
      argsSchema: z.object({}),
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      handler: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "string error";
      },
    });
    const result = await r.dispatch("boom", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("handler-threw");
      expect(result.error.cause).toBe("string error");
    }
  });

  it("validates empty-args commands against z.object({})", async () => {
    const r = makeRegistry();
    r.register({
      id: "respawn",
      argsSchema: z.object({}),
      handler: () => "respawned",
    });
    // No args — passes, since the schema is empty object.
    const a = await r.dispatch("respawn", {});
    expect(a.ok).toBe(true);
    // Extra keys — z.object({}) is non-strict by default; passes.
    const b = await r.dispatch("respawn", { extra: "ignored" });
    expect(b.ok).toBe(true);
  });

  it("dispatch is async — resolves after handler awaits", async () => {
    const r = makeRegistry();
    let resolved = false;
    r.register({
      id: "delayed",
      argsSchema: z.object({}),
      handler: async () => {
        await new Promise((res) => setTimeout(res, 10));
        resolved = true;
        return "done";
      },
    });
    const result = await r.dispatch("delayed", {});
    expect(resolved).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("done");
  });
});
