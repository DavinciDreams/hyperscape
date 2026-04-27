/**
 * Tests for DataSourceRegistry — the D8 pluggable bindings provider.
 */

import { describe, expect, it } from "vitest";

import { DataSourceRegistry, type DataSource } from "./dataSourceRegistry";

interface TestState {
  hp: number;
  coins: number;
}

const playerSource: DataSource<TestState, { hp: number }> = {
  key: "player",
  build: (s) => ({ hp: s.hp }),
};

const inventorySource: DataSource<TestState, { coins: number }> = {
  key: "inventory",
  build: (s) => ({ coins: s.coins }),
};

describe("DataSourceRegistry", () => {
  it("starts empty", () => {
    const reg = new DataSourceRegistry<TestState>();
    expect(reg.size).toBe(0);
    expect(reg.keys()).toEqual([]);
  });

  it("registers a source and exposes it via get()", () => {
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    expect(reg.size).toBe(1);
    expect(reg.get("player")).toBe(playerSource);
    expect(reg.keys()).toEqual(["player"]);
  });

  it("preserves registration order", () => {
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    reg.register(inventorySource);
    expect(reg.keys()).toEqual(["player", "inventory"]);
  });

  it("throws on duplicate key", () => {
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    expect(() => reg.register(playerSource)).toThrow(
      /namespace "player" is already registered/,
    );
  });

  it("returns an unregister callback that removes the source", () => {
    const reg = new DataSourceRegistry<TestState>();
    const off = reg.register(playerSource);
    expect(reg.size).toBe(1);
    off();
    expect(reg.size).toBe(0);
    expect(reg.get("player")).toBeUndefined();
  });

  it("buildContext projects state through every registered source", () => {
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    reg.register(inventorySource);
    const ctx = reg.buildContext({ hp: 50, coins: 1000 });
    expect(ctx).toEqual({
      player: { hp: 50 },
      inventory: { coins: 1000 },
    });
  });

  it("buildContext returns empty object when no sources registered", () => {
    const reg = new DataSourceRegistry<TestState>();
    expect(reg.buildContext({ hp: 1, coins: 1 })).toEqual({});
  });

  it("re-registering after unregister works", () => {
    const reg = new DataSourceRegistry<TestState>();
    const off = reg.register(playerSource);
    off();
    reg.register(playerSource);
    expect(reg.get("player")).toBe(playerSource);
  });

  it("clear() removes every source", () => {
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    reg.register(inventorySource);
    reg.clear();
    expect(reg.size).toBe(0);
    expect(reg.keys()).toEqual([]);
  });

  it("buildContext's value can be passed to bindings as a DataContext", () => {
    // Smoke test — DataSourceRegistry's `buildContext` return type is
    // structurally `DataContext` so the result is bindings-ready.
    const reg = new DataSourceRegistry<TestState>();
    reg.register(playerSource);
    const ctx = reg.buildContext({ hp: 100, coins: 0 });
    // Index-access mirrors what the bindings runtime does.
    const playerNamespace = ctx.player as { hp: number };
    expect(playerNamespace.hp).toBe(100);
  });
});
