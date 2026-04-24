/**
 * Faithfulness + defensiveness tests for `DeployTargetsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  DeployTargetsManifestSchema,
  type DeployTargetsManifest,
} from "./deploy-targets.js";

const reference: DeployTargetsManifest = [
  {
    id: "prod-us-east",
    name: "Production (US East)",
    description: "Primary production deployment.",
    provider: "railway",
    environment: "production",
    region: "us-east1",
    url: "https://hyperscape.example.com",
    secrets: [
      { envName: "JWT_SECRET", source: "vault:prod/jwt", required: true },
      { envName: "DATABASE_URL", source: "vault:prod/db", required: true },
    ],
    env: { LOG_LEVEL: "info", FEATURE_FLAG_X: "on" },
    enabled: true,
    requireConfirmation: true,
    tags: ["prod"],
  },
  {
    id: "staging",
    name: "Staging",
    description: "",
    provider: "fly",
    environment: "staging",
    region: "iad",
    url: "",
    secrets: [],
    env: {},
    enabled: true,
    requireConfirmation: false,
    tags: [],
  },
];

describe("DeployTargetsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = DeployTargetsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal target", () => {
    const parsed = DeployTargetsManifestSchema.parse([
      {
        id: "t",
        name: "T",
        provider: "docker",
        environment: "development",
        region: "local",
      },
    ]);
    expect(parsed[0].enabled).toBe(true);
    expect(parsed[0].requireConfirmation).toBe(false);
    expect(parsed[0].secrets).toEqual([]);
    expect(parsed[0].env).toEqual({});
    expect(parsed[0].url).toBe("");
    expect(parsed[0].tags).toEqual([]);
  });

  it("rejects unknown provider", () => {
    const bad = [{ ...reference[0], provider: "heroku" }];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown environment", () => {
    const bad = [{ ...reference[0], environment: "qa" }];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects lowercase env var name", () => {
    const bad = [
      {
        ...reference[0],
        secrets: [{ envName: "jwt_secret", source: "vault:x" }],
      },
    ];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects env var name starting with digit", () => {
    const bad = [
      {
        ...reference[0],
        secrets: [{ envName: "1SECRET", source: "vault:x" }],
      },
    ];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate secret envName within a target", () => {
    const bad = [
      {
        ...reference[0],
        secrets: [
          { envName: "JWT_SECRET", source: "vault:a" },
          { envName: "JWT_SECRET", source: "vault:b" },
        ],
      },
    ];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty region", () => {
    const bad = [{ ...reference[0], region: "" }];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty secret source", () => {
    const bad = [
      {
        ...reference[0],
        secrets: [{ envName: "JWT_SECRET", source: "" }],
      },
    ];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate target ids", () => {
    const bad = [reference[0], { ...reference[0] }];
    expect(DeployTargetsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
