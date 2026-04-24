import { afterEach, describe, expect, it } from "vitest";
import {
  _resetUserInputBindingsMigrations,
  _resetUserLayoutMigrations,
  registerUserInputBindingsMigration,
  registerUserLayoutMigration,
  safeLoadLayoutManifest,
  safeLoadUserInputBindings,
  safeLoadUserLayout,
} from "./safe-load";

afterEach(() => {
  _resetUserLayoutMigrations();
  _resetUserInputBindingsMigrations();
});

describe("safeLoadLayoutManifest", () => {
  it("accepts a minimal valid manifest", () => {
    const out = safeLoadLayoutManifest({
      id: "x",
      name: "X",
      instances: [],
    });
    expect(out.value?.id).toBe("x");
    expect(out.failure).toBeNull();
  });

  it("returns malformed failure for null", () => {
    const out = safeLoadLayoutManifest(null);
    expect(out.value).toBeNull();
    expect(out.failure?.code).toBe("malformed");
  });

  it("returns malformed failure for a plain object that fails validation", () => {
    const out = safeLoadLayoutManifest({ id: "" });
    expect(out.value).toBeNull();
    expect(out.failure?.code).toBe("malformed");
    expect(out.failure?.message).toContain("validation failed");
  });

  it("returns malformed failure for garbage types", () => {
    const out = safeLoadLayoutManifest("not an object");
    expect(out.value).toBeNull();
    expect(out.failure?.code).toBe("malformed");
  });
});

describe("safeLoadUserLayout", () => {
  const validV1 = {
    schemaVersion: 1,
    layoutId: "hud",
    updatedAt: 0,
    overrides: [],
  };

  it("accepts a valid v1 blob", () => {
    const out = safeLoadUserLayout(validV1);
    expect(out.failure).toBeNull();
    expect(out.value?.layoutId).toBe("hud");
  });

  it("rejects non-objects", () => {
    const out = safeLoadUserLayout(null);
    expect(out.failure?.code).toBe("malformed");
  });

  it("rejects blobs with no schemaVersion", () => {
    const out = safeLoadUserLayout({ layoutId: "hud" });
    expect(out.failure?.code).toBe("malformed");
  });

  it("reports migration-missing when no path exists to the current version", () => {
    const out = safeLoadUserLayout({ ...validV1, schemaVersion: 0 });
    expect(out.failure?.code).toBe("migration-missing");
  });

  it("walks a registered migration chain and validates the result", () => {
    registerUserLayoutMigration(0, 1, (input) => {
      const obj = input as Record<string, unknown>;
      return { ...obj, schemaVersion: 1, overrides: obj.overrides ?? [] };
    });

    const out = safeLoadUserLayout({
      schemaVersion: 0,
      layoutId: "hud",
      updatedAt: 0,
    });

    expect(out.failure).toBeNull();
    expect(out.value?.schemaVersion).toBe(1);
  });

  it("reports migration-failed when a migration throws", () => {
    registerUserLayoutMigration(0, 1, () => {
      throw new Error("boom");
    });
    const out = safeLoadUserLayout({
      schemaVersion: 0,
      layoutId: "hud",
      updatedAt: 0,
    });
    expect(out.failure?.code).toBe("migration-failed");
    expect(out.failure?.message).toContain("boom");
  });

  it("returns malformed when the migrated output still fails validation", () => {
    registerUserLayoutMigration(0, 1, (input) => ({
      ...(input as object),
      schemaVersion: 1,
      // missing overrides / layoutId / updatedAt → fails schema
    }));
    const out = safeLoadUserLayout({ schemaVersion: 0 });
    expect(out.failure?.code).toBe("malformed");
  });
});

describe("safeLoadUserInputBindings", () => {
  const validV1 = {
    schemaVersion: 1,
    manifestId: "default",
    updatedAt: 0,
    bindings: [],
  };

  it("accepts a valid v1 blob", () => {
    const out = safeLoadUserInputBindings(validV1);
    expect(out.failure).toBeNull();
    expect(out.value?.manifestId).toBe("default");
  });

  it("rejects non-objects", () => {
    expect(safeLoadUserInputBindings(null).failure?.code).toBe("malformed");
    expect(safeLoadUserInputBindings("x").failure?.code).toBe("malformed");
    expect(safeLoadUserInputBindings([]).failure?.code).toBe("malformed");
  });

  it("rejects blobs with no schemaVersion", () => {
    const out = safeLoadUserInputBindings({ manifestId: "x" });
    expect(out.failure?.code).toBe("malformed");
  });

  it("reports migration-missing when no path exists", () => {
    const out = safeLoadUserInputBindings({ ...validV1, schemaVersion: 0 });
    expect(out.failure?.code).toBe("migration-missing");
  });

  it("walks a registered migration chain and validates", () => {
    registerUserInputBindingsMigration(0, 1, (input) => {
      const obj = input as Record<string, unknown>;
      return {
        ...obj,
        schemaVersion: 1,
        bindings: obj.bindings ?? [],
      };
    });

    const out = safeLoadUserInputBindings({
      schemaVersion: 0,
      manifestId: "x",
      updatedAt: 0,
    });
    expect(out.failure).toBeNull();
    expect(out.value?.schemaVersion).toBe(1);
  });

  it("reports migration-failed when a migration throws", () => {
    registerUserInputBindingsMigration(0, 1, () => {
      throw new Error("kaboom");
    });
    const out = safeLoadUserInputBindings({
      schemaVersion: 0,
      manifestId: "x",
      updatedAt: 0,
    });
    expect(out.failure?.code).toBe("migration-failed");
    expect(out.failure?.message).toContain("kaboom");
  });

  it("returns malformed when the migrated output still fails validation", () => {
    registerUserInputBindingsMigration(0, 1, (input) => ({
      ...(input as object),
      schemaVersion: 1,
      // missing manifestId / updatedAt / bindings → fails schema
    }));
    const out = safeLoadUserInputBindings({ schemaVersion: 0 });
    expect(out.failure?.code).toBe("malformed");
  });
});
