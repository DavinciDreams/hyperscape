/**
 * PIE server session unit tests.
 *
 * Asserts the lifecycle guards and option wiring of `PIEServerSession`
 * WITHOUT calling `start()`. A real `start()` runs `createServerWorld()`
 * which boots terrain/town/POI/pathfinding pipelines; that is exercised
 * by the end-to-end PIE integration harness (driven from asset-forge),
 * not the unit test tier.
 *
 * The bridge registration itself is covered by `PIEBridgeSystems.test.ts`,
 * and the `SystemDatabase` stub used by `start()` is covered indirectly
 * there via the database bridge's `getDb()`.
 *
 * Part of PLAN_SERVERNETWORK_MIGRATION.md Step 9.
 */

import { describe, expect, it } from "vitest";

import { createPIEStubSystemDatabase } from "../InMemoryStubs";
import { PIEServerSession } from "../PIEServerSession";

describe("PIEServerSession lifecycle guards", () => {
  it("accessing world before start() throws", () => {
    const session = new PIEServerSession();
    expect(() => session.world).toThrow(/not initialized/);
  });

  it("accessing network before start() throws", () => {
    const session = new PIEServerSession();
    expect(() => session.network).toThrow(/not initialized/);
  });

  it("stop() before start() is a no-op", async () => {
    const session = new PIEServerSession();
    await expect(session.stop()).resolves.toBeUndefined();
  });

  it("tick() before start() is a no-op", () => {
    const session = new PIEServerSession();
    expect(() => session.tick(0)).not.toThrow();
  });
});

describe("createPIEStubSystemDatabase", () => {
  it("is a function (satisfies isDatabaseInstance type guard)", () => {
    const db = createPIEStubSystemDatabase();
    expect(typeof db).toBe("function");
  });

  it("table queries resolve to empty arrays", async () => {
    const db = createPIEStubSystemDatabase();
    const rows = await (db("entities") as unknown as Promise<unknown[]>);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("chained where().first() resolves to undefined", async () => {
    const db = createPIEStubSystemDatabase();
    const builder = db("config") as unknown as {
      where: (
        k: string,
        v: unknown,
      ) => {
        first: () => Promise<unknown>;
      };
    };
    const row = await builder.where("key", "settings").first();
    expect(row).toBeUndefined();
  });

  it("update/delete resolve to 0 affected rows", async () => {
    const db = createPIEStubSystemDatabase();
    const builder = db("config") as unknown as {
      update: (data: Record<string, unknown>) => Promise<number>;
      delete: () => Promise<number>;
    };
    expect(await builder.update({ value: "x" })).toBe(0);
    expect(await builder.delete()).toBe(0);
  });
});
