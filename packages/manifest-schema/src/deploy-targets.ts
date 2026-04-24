/**
 * Deploy-targets manifest schema.
 *
 * Phase J5 of the World Studio AAA plan — declarative list of
 * destinations the project can deploy to. The editor's Deploy/Publish
 * UI reads this manifest to render the target picker; the deploy
 * pipeline uses the `provider` + `config` to route builds to the
 * correct adapter (Railway/Fly/Cloudflare/Vercel/Custom).
 *
 * Secrets are explicitly NOT stored here — the manifest carries
 * *names* of secrets (`env.JWT_SECRET`), the deploy pipeline resolves
 * them from the platform secret manager. This keeps `.json` files
 * safe to commit.
 */

import { z } from "zod";

export const DeployProviderSchema = z.enum([
  "railway",
  "fly",
  "cloudflare-workers",
  "cloudflare-pages",
  "vercel",
  "netlify",
  "aws-ecs",
  "fly-machines",
  "docker",
  "custom",
]);
export type DeployProvider = z.infer<typeof DeployProviderSchema>;

export const DeployEnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type DeployEnvironment = z.infer<typeof DeployEnvironmentSchema>;

/**
 * Reference to an environment variable the deploy adapter must
 * resolve from the platform secret store. `source` is the secret
 * manager key, `envName` is the name seen by the running container.
 */
export const SecretRefSchema = z.object({
  envName: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "env var names must be UPPER_SNAKE ASCII"),
  source: z.string().min(1),
  required: z.boolean().default(true),
});
export type SecretRef = z.infer<typeof SecretRefSchema>;

/**
 * Region hint. Free-form string because each provider has its own
 * region codes (`us-east1` vs `ord` vs `iad1`); validating each would
 * couple the schema to provider internals.
 */
const RegionCode = z.string().min(1);

export const DeployTargetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(""),
    provider: DeployProviderSchema,
    environment: DeployEnvironmentSchema,
    /** Primary region for the deployment. */
    region: RegionCode,
    /** Public-facing URL the deploy will be reachable at; empty = provider default. */
    url: z.string().default(""),
    /** Environment variables (name + secret source). */
    secrets: z.array(SecretRefSchema).default([]),
    /** Plain env values safe to commit (feature flags, log level). */
    env: z.record(z.string().min(1), z.string()).default({}),
    /** Whether this target is enabled — false hides it from the Deploy UI. */
    enabled: z.boolean().default(true),
    /** Require manual confirmation before deploying — recommended for prod. */
    requireConfirmation: z.boolean().default(false),
    /** Tags for grouping in the Deploy UI. */
    tags: z.array(z.string().min(1)).default([]),
  })
  .refine(
    ({ secrets }) =>
      new Set(secrets.map((s) => s.envName)).size === secrets.length,
    { message: "secret envName values must be unique within a target" },
  );
export type DeployTarget = z.infer<typeof DeployTargetSchema>;

export const DeployTargetsManifestSchema = z
  .array(DeployTargetSchema)
  .refine((list) => new Set(list.map((t) => t.id)).size === list.length, {
    message: "deploy target ids must be unique",
  });
export type DeployTargetsManifest = z.infer<typeof DeployTargetsManifestSchema>;
