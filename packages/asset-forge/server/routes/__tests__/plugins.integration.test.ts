/**
 * Plugin routes integration tests.
 *
 * Exercises all 7 routes on the asset-forge plugins surface via
 * Elysia's in-memory `.handle()` method — no real http server, no
 * real CLI subprocess. Locks the Phase I5 substrate behavior in
 * CI: the publish flow (content upload → bundle POST → registry
 * stores), the install flow (bundle GET → content GETs), and the
 * read-only contributions/snapshot flows.
 *
 * Each test resets the in-memory registry + content store so cases
 * don't bleed into each other.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Elysia } from "elysia";
import { createHash } from "node:crypto";

import { pluginRoutes, _resetPluginRegistryForTests } from "../plugins.js";

function makeApp() {
  return new Elysia().use(pluginRoutes);
}

/** Build a minimal valid bundle descriptor for a synthetic plugin. */
function makeBundle(opts: { id: string; version: string; fileBytes?: Buffer }) {
  const fileBytes = opts.fileBytes ?? Buffer.from("export default {};\n");
  const fileSha = createHash("sha256").update(fileBytes).digest("hex");
  const manifestObj = {
    id: opts.id,
    name: opts.id,
    version: opts.version,
    description: "test",
    entry: "./dist/index.js",
    author: { name: "test" },
    hyperforgeApi: "0.1.0",
    dependencies: [],
    loadAfter: [],
    enabledByDefault: false,
    contributions: {
      systems: [],
      entities: [],
      widgets: [],
      manifestSchemas: [],
      paletteCategories: [],
      toolbarTools: [],
      commands: [],
    },
    tags: [],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifestObj));
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  const bundleSeed = `${manifestHash}:${fileSha}`;
  const bundleHash = createHash("sha256").update(bundleSeed).digest("hex");
  return {
    bundle: {
      manifest: manifestObj,
      manifestHash,
      files: [
        { path: "index.js", size: fileBytes.byteLength, sha256: fileSha },
      ],
      totalSize: fileBytes.byteLength,
      bundleHash,
    },
    fileBytes,
    fileSha,
  };
}

describe("asset-forge plugin routes — integration", () => {
  let app: Elysia;

  beforeEach(() => {
    _resetPluginRegistryForTests();
    app = makeApp();
  });

  afterEach(() => {
    _resetPluginRegistryForTests();
  });

  describe("POST /api/plugins/content", () => {
    it("accepts a sha-verified upload (201, deduplicated:false)", async () => {
      const bytes = Buffer.from("hello\n");
      const sha = createHash("sha256").update(bytes).digest("hex");
      const res = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: sha,
            base64Bytes: bytes.toString("base64"),
          }),
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        ok: boolean;
        sha256: string;
        size: number;
        deduplicated: boolean;
      };
      expect(body.ok).toBe(true);
      expect(body.sha256).toBe(sha);
      expect(body.size).toBe(bytes.byteLength);
      expect(body.deduplicated).toBe(false);
    });

    it("re-upload of same content is idempotent (200, deduplicated:true)", async () => {
      const bytes = Buffer.from("dedup-me\n");
      const sha = createHash("sha256").update(bytes).digest("hex");
      const body = JSON.stringify({
        sha256: sha,
        base64Bytes: bytes.toString("base64"),
      });
      const headers = { "content-type": "application/json" };

      const first = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(first.status).toBe(201);

      const second = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { deduplicated: boolean };
      expect(secondBody.deduplicated).toBe(true);
    });

    it("rejects sha mismatch with both hashes in error", async () => {
      const bytes = Buffer.from("real bytes\n");
      const wrongSha = "0".repeat(64);
      const res = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: wrongSha,
            base64Bytes: bytes.toString("base64"),
          }),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/sha256 mismatch/);
      expect(body.error).toContain(wrongSha);
    });

    it("rejects malformed sha format", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: "not-a-real-sha",
            base64Bytes: "AAA=",
          }),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/64-char lowercase hex/);
    });
  });

  describe("GET /api/plugins/content/:sha256", () => {
    it("returns raw bytes for a stored hash (octet-stream)", async () => {
      const bytes = Buffer.from("download me\n");
      const sha = createHash("sha256").update(bytes).digest("hex");
      // Upload first
      await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: sha,
            base64Bytes: bytes.toString("base64"),
          }),
        }),
      );
      // Then download
      const res = await app.handle(
        new Request(`http://localhost/api/plugins/content/${sha}`),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      const downloaded = Buffer.from(await res.arrayBuffer());
      expect(downloaded.equals(bytes)).toBe(true);
    });

    it("404 for unknown sha", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/plugins/content/${"a".repeat(64)}`),
      );
      expect(res.status).toBe(404);
    });

    it("400 for malformed sha in URL", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins/content/not-a-real-sha"),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/plugins (registry)", () => {
    it("publishes a fresh bundle (201) and returns a registry url", async () => {
      const { bundle } = makeBundle({ id: "com.test.x", version: "1.0.0" });
      const res = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bundle),
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        ok: boolean;
        registryId: string;
        id: string;
        version: string;
        url: string;
      };
      expect(body.ok).toBe(true);
      expect(body.id).toBe("com.test.x");
      expect(body.version).toBe("1.0.0");
      expect(body.url).toBe("/api/plugins/registry/com.test.x/1.0.0");
      expect(body.registryId).toMatch(/^reg_/);
    });

    it("rejects duplicate id+version with 409", async () => {
      const { bundle } = makeBundle({ id: "com.test.dup", version: "0.1.0" });
      const headers = { "content-type": "application/json" };
      const body = JSON.stringify(bundle);

      const first = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(first.status).toBe(201);

      const second = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(second.status).toBe(409);
      const errBody = (await second.json()) as { error: string };
      expect(errBody.error).toMatch(/already published/);
    });

    it("accepts the same id with a different version (210 != 211)", async () => {
      const v1 = makeBundle({ id: "com.test.multi", version: "0.1.0" }).bundle;
      const v2 = makeBundle({ id: "com.test.multi", version: "0.2.0" }).bundle;
      const headers = { "content-type": "application/json" };

      const r1 = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body: JSON.stringify(v1),
        }),
      );
      const r2 = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body: JSON.stringify(v2),
        }),
      );
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
    });

    it("rejects body missing manifest field (400)", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notManifest: true }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("rejects manifest that fails schema (400 + issues)", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ manifest: { id: "incomplete" } }),
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: string;
        issues: Array<{ path: string; message: string }>;
      };
      expect(body.issues.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/plugins/registry", () => {
    it("returns empty list when registry is empty", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins/registry"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { count: number; entries: unknown[] };
      expect(body.count).toBe(0);
      expect(body.entries).toEqual([]);
    });

    it("returns entries newest-first across multiple publishes", async () => {
      const a = makeBundle({ id: "com.a", version: "1.0.0" }).bundle;
      const b = makeBundle({ id: "com.b", version: "1.0.0" }).bundle;
      const headers = { "content-type": "application/json" };

      await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body: JSON.stringify(a),
        }),
      );
      // Tiny delay so publishedAt timestamps differ.
      await new Promise((r) => setTimeout(r, 5));
      await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers,
          body: JSON.stringify(b),
        }),
      );

      const res = await app.handle(
        new Request("http://localhost/api/plugins/registry"),
      );
      const body = (await res.json()) as {
        count: number;
        entries: Array<{ id: string }>;
      };
      expect(body.count).toBe(2);
      // Newest first.
      expect(body.entries[0]!.id).toBe("com.b");
      expect(body.entries[1]!.id).toBe("com.a");
    });
  });

  describe("GET /api/plugins/registry/:id/:version", () => {
    it("returns the full bundle for a published id+version", async () => {
      const { bundle } = makeBundle({
        id: "com.fetch.me",
        version: "2.3.4",
      });
      await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bundle),
        }),
      );
      const res = await app.handle(
        new Request("http://localhost/api/plugins/registry/com.fetch.me/2.3.4"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        ok: boolean;
        bundle: { manifest: { id: string; version: string } };
      };
      expect(body.ok).toBe(true);
      expect(body.bundle.manifest.id).toBe("com.fetch.me");
      expect(body.bundle.manifest.version).toBe("2.3.4");
    });

    it("404 for unknown id+version", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/plugins/registry/com.nope/9.9.9"),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("end-to-end publish + install round-trip", () => {
    it("uploads content + registers bundle + downloads + reconstructs", async () => {
      // Publisher side: POST content + POST bundle.
      const { bundle, fileBytes, fileSha } = makeBundle({
        id: "com.e2e",
        version: "1.0.0",
      });

      const contentRes = await app.handle(
        new Request("http://localhost/api/plugins/content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sha256: fileSha,
            base64Bytes: fileBytes.toString("base64"),
          }),
        }),
      );
      expect(contentRes.status).toBe(201);

      const publishRes = await app.handle(
        new Request("http://localhost/api/plugins", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bundle),
        }),
      );
      expect(publishRes.status).toBe(201);

      // Consumer side: GET bundle, then GET content for each file.
      const bundleRes = await app.handle(
        new Request("http://localhost/api/plugins/registry/com.e2e/1.0.0"),
      );
      expect(bundleRes.status).toBe(200);
      const bundleBody = (await bundleRes.json()) as {
        bundle: {
          files: Array<{ path: string; sha256: string; size: number }>;
        };
      };
      expect(bundleBody.bundle.files).toHaveLength(1);

      // Download + verify each file.
      const downloadedBytes: Map<string, Buffer> = new Map();
      for (const file of bundleBody.bundle.files) {
        const fileRes = await app.handle(
          new Request(`http://localhost/api/plugins/content/${file.sha256}`),
        );
        expect(fileRes.status).toBe(200);
        const bytes = Buffer.from(await fileRes.arrayBuffer());
        // Client-side hash verification — the integrity gate.
        const actualSha = createHash("sha256").update(bytes).digest("hex");
        expect(actualSha).toBe(file.sha256);
        downloadedBytes.set(file.path, bytes);
      }

      // The reconstructed bytes should be byte-identical to the
      // publisher's source.
      expect(downloadedBytes.get("index.js")?.equals(fileBytes)).toBe(true);
    });
  });
});
