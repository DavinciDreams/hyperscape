/**
 * Tests for `validatePluginDirectory` — the programmatic manifest
 * validator that skips entry-module loading.
 *
 * Coverage:
 *   - Valid manifest → ok:true + parsed manifest
 *   - Missing / unreadable manifest → ok:false with a read-failure
 *     issue string
 *   - Schema-invalid manifest → ok:false with one issue per Zod error,
 *     formatted as `"path: message"`
 *   - hostApiRange mismatch on an otherwise-valid manifest → ok:false
 *     with a single API-incompat issue
 *   - hostApiRange === "*" disables the API gate
 *   - custom manifestFilename override works
 *   - Test uses `manifestLoader` seam so there's no real disk I/O
 */

import { describe, expect, it } from "vitest";

import {
  validatePluginDirectory,
  validatePluginManifestJson,
} from "../index.js";

const MIN_VALID = {
  id: "com.hyperforge.alpha",
  name: "alpha",
  version: "1.0.0",
  entry: "./dist/index.js",
  author: { name: "test" },
  hyperforgeApi: "0.1.0",
};

function makeLoader(value: unknown | Error) {
  return async () => {
    if (value instanceof Error) throw value;
    return value;
  };
}

describe("validatePluginDirectory", () => {
  it("returns ok:true + parsed manifest for a valid plugin.json", async () => {
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(MIN_VALID),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("com.hyperforge.alpha");
      expect(result.manifestPath).toBe("/abs/alpha/plugin.json");
    }
  });

  it("returns ok:false with a read-failure issue when manifest is missing", async () => {
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(new Error("ENOENT: no such file")),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain("Failed to read plugin.json");
      expect(result.issues[0]).toContain("ENOENT");
    }
  });

  it("returns ok:false with one issue per Zod error, formatted `path: message`", async () => {
    // Break multiple fields to prove multiple issues are aggregated.
    const broken = {
      ...MIN_VALID,
      id: "Not-Reverse-Domain", // uppercase + not reverse-domain
      version: "not-semver",
    };
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(broken),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      // At least one issue surfaces each broken field with a dotted path.
      expect(result.issues.some((s) => s.startsWith("id:"))).toBe(true);
      expect(result.issues.some((s) => s.startsWith("version:"))).toBe(true);
    }
  });

  it("returns ok:false when hostApiRange excludes the manifest's hyperforgeApi", async () => {
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(MIN_VALID),
      hostApiRange: "^1.0.0", // manifest declares 0.1.0 — incompatible
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]).toContain("hyperforgeApi 0.1.0");
      expect(result.issues[0]).toContain("^1.0.0");
    }
  });

  it('hostApiRange === "*" skips the API compatibility check', async () => {
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(MIN_VALID),
      hostApiRange: "*",
    });
    expect(result.ok).toBe(true);
  });

  it("respects a custom manifestFilename override", async () => {
    const result = await validatePluginDirectory("/abs/alpha", {
      manifestFilename: "hyperforge.json",
      manifestLoader: async (p) => {
        expect(p).toBe("/abs/alpha/hyperforge.json");
        return MIN_VALID;
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifestPath).toBe("/abs/alpha/hyperforge.json");
    }
  });
});

describe("validatePluginManifestJson", () => {
  it("valid raw → ok:true + parsed manifest", () => {
    const result = validatePluginManifestJson(MIN_VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("com.hyperforge.alpha");
      // Schema defaults applied (dependencies is [] etc)
      expect(result.manifest.dependencies).toEqual([]);
    }
  });

  it("schema-invalid raw → ok:false with zod-formatted issues", () => {
    const result = validatePluginManifestJson({
      id: "BAD_ID_with_underscores_and_caps",
      name: "x",
      version: "1.0.0",
      entry: "./x.js",
      author: { name: "t" },
      hyperforgeApi: "0.1.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.startsWith("id:"))).toBe(true);
    }
  });

  it("missing required field surfaces path in issue", () => {
    const result = validatePluginManifestJson({
      name: "x",
      version: "1.0.0",
      entry: "./x.js",
      author: { name: "t" },
      hyperforgeApi: "0.1.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Zod reports a top-level "id" path on missing required field
      expect(result.issues.some((i) => i.startsWith("id:"))).toBe(true);
    }
  });

  it("hostApiRange mismatch on valid manifest → API-gate issue", () => {
    const result = validatePluginManifestJson(MIN_VALID, {
      hostApiRange: "^2.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        "hyperforgeApi 0.1.0 does not satisfy host range ^2.0.0",
      ]);
    }
  });

  it("hostApiRange '*' disables the API gate", () => {
    const result = validatePluginManifestJson(MIN_VALID, {
      hostApiRange: "*",
    });
    expect(result.ok).toBe(true);
  });

  it("omitted hostApiRange disables the API gate", () => {
    const result = validatePluginManifestJson(MIN_VALID);
    expect(result.ok).toBe(true);
  });

  it("hostApiRange matches → ok:true", () => {
    const result = validatePluginManifestJson(MIN_VALID, {
      hostApiRange: "^0.1.0",
    });
    expect(result.ok).toBe(true);
  });

  it("non-object raw → ok:false (Zod root-level issue)", () => {
    const result = validatePluginManifestJson(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it("directory variant delegates: same schema failures surface via validatePluginDirectory", async () => {
    // Construct a raw that fails schema; both entry points should yield
    // equivalent issues (shape differs only in manifestPath on the
    // directory result).
    const BAD = { ...MIN_VALID, id: "BAD!" };
    const inMem = validatePluginManifestJson(BAD);
    const onDisk = await validatePluginDirectory("/abs/alpha", {
      manifestLoader: makeLoader(BAD),
    });
    expect(inMem.ok).toBe(false);
    expect(onDisk.ok).toBe(false);
    if (!inMem.ok && !onDisk.ok) {
      expect(onDisk.issues).toEqual(inMem.issues);
    }
  });
});
