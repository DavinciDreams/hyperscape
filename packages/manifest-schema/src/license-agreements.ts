/**
 * License-agreements manifest schema.
 *
 * Authored registry of legal documents (EULA, Terms of Service,
 * Privacy Policy, Code of Conduct, Age-Consent notices, DLC-specific
 * addenda). Each document has versioned text, per-jurisdiction
 * variants, acceptance gates, and a revocation policy. Runtime
 * `LegalConsentSystem` owns per-user consent records, stores signed
 * acceptances, and blocks login when a required document has not
 * been accepted at its current version.
 *
 * Scope-isolated from:
 *   - `parental-controls.ts` (age-gated *gameplay* restrictions — this
 *     schema gates *consent* to legal documents; both may reference
 *     a minimum age but at different layers)
 *   - `moderation.ts` (trust & safety enforcement)
 *   - `deploy-targets.ts` (platform secrets — entirely separate)
 *
 * The body text itself is NOT stored inline in the manifest — it's
 * referenced by `bodyAssetRef` (ManifestRef to an external asset).
 * This keeps commit-safe manifests small and lets localization teams
 * manage the actual text outside the schema.
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

/** DocumentId — lowerCamelCase. */
const DocumentId = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "document id must be lowerCamelCase ASCII identifier",
  );

/** Jurisdiction code — ISO-3166 region or 'global'. */
const JurisdictionCode = z
  .string()
  .regex(
    /^(global|[A-Z]{2}(-[A-Z0-9]{2,3})?)$/,
    "jurisdiction must be 'global' or ISO-3166-1 / ISO-3166-2 code",
  );

/** Document kind. */
export const DocumentKindSchema = z.enum([
  "eula",
  "termsOfService",
  "privacyPolicy",
  "codeOfConduct",
  "ageConsent",
  "dlcAddendum",
  "custom",
]);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

/** When consent must be collected. */
export const AcceptanceGateSchema = z.enum([
  "beforeAccountCreation",
  "beforeFirstLogin",
  "beforeGameplay",
  "beforePurchase",
  "onNextLogin",
  "optional",
]);
export type AcceptanceGate = z.infer<typeof AcceptanceGateSchema>;

/** How revocation is handled once the player accepted. */
export const RevocationPolicySchema = z.enum([
  "notRevocable",
  "revocableWithAccountClosure",
  "revocableAnyTime",
]);
export type RevocationPolicy = z.infer<typeof RevocationPolicySchema>;

/**
 * Jurisdictional variant — a region-specific body of the same
 * document+version (e.g. GDPR-flavoured privacy for EU).
 */
export const JurisdictionalVariantSchema = z
  .object({
    jurisdiction: JurisdictionCode,
    /** Reference to the body text asset (localization-managed). */
    bodyAssetRef: ManifestRef,
    /** ISO-639-1 (+optional -REGION) language code. */
    localeCode: z
      .string()
      .regex(
        /^[a-z]{2}(-[A-Z]{2})?$/,
        "localeCode must be ISO-639-1, optionally with ISO-3166 region",
      ),
    /** Optional supersede-effective date (ISO-8601). */
    effectiveAtIso: z.string().default(""),
  })
  .strict();
export type JurisdictionalVariant = z.infer<typeof JurisdictionalVariantSchema>;

/**
 * A specific version of a document. Version strings are `SemVer`
 * major.minor.patch; the *major* bump signals a re-prompt.
 */
export const DocumentVersionSchema = z
  .object({
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "version must be SemVer major.minor.patch"),
    /** Human-readable revision note. */
    changelog: z.string().default(""),
    /** ISO-8601 publish date. */
    publishedAtIso: z
      .string()
      .min(1, "publishedAtIso is required for a version"),
    /**
     * If true, accepting a prior version does not carry over — this
     * version must be explicitly re-accepted. Usually true iff major
     * version changed.
     */
    requiresReAcceptance: z.boolean().default(true),
    /** Per-jurisdiction variants for this version. Must cover 'global'. */
    variants: z.array(JurisdictionalVariantSchema).min(1),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.variants.map((x) => x.jurisdiction)).size === v.variants.length,
    {
      message: "variants must have unique jurisdictions within a version",
      path: ["variants"],
    },
  )
  .refine((v) => v.variants.some((x) => x.jurisdiction === "global"), {
    message: "each version must include a 'global' fallback variant",
    path: ["variants"],
  });
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

/**
 * A legal document and its version history.
 */
export const LegalDocumentSchema = z
  .object({
    id: DocumentId,
    name: z.string().min(1),
    description: z.string().default(""),
    kind: DocumentKindSchema,
    /** Required for kind='custom'. */
    customKey: z.string().default(""),
    /** Acceptance gate applied to the *currentVersion*. */
    gate: AcceptanceGateSchema.default("beforeFirstLogin"),
    /** Revocation semantics. */
    revocation: RevocationPolicySchema.default("revocableAnyTime"),
    /** Minimum age in years to consent unsupervised (0 = none). */
    minimumAgeYears: z.number().int().min(0).max(120).default(0),
    /** If true, guardian approval substitutes for player consent below minimumAgeYears. */
    allowGuardianConsent: z.boolean().default(true),
    /** The currently-active version (must appear in `versions`). */
    currentVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/, "currentVersion must be SemVer"),
    /** Complete version history, newest last. */
    versions: z.array(DocumentVersionSchema).min(1),
  })
  .strict()
  .refine((d) => d.kind !== "custom" || d.customKey.length > 0, {
    message: "customKey is required when kind='custom'",
    path: ["customKey"],
  })
  .refine(
    (d) => new Set(d.versions.map((v) => v.version)).size === d.versions.length,
    {
      message: "version strings must be unique per document",
      path: ["versions"],
    },
  )
  .refine((d) => d.versions.some((v) => v.version === d.currentVersion), {
    message: "currentVersion must appear in the versions array",
    path: ["currentVersion"],
  })
  .refine(
    (d) => {
      // Strictly increasing publish dates across version array order.
      for (let i = 1; i < d.versions.length; i++) {
        const prev = d.versions[i - 1].publishedAtIso;
        const cur = d.versions[i].publishedAtIso;
        if (!(prev < cur)) return false;
      }
      return true;
    },
    {
      message: "versions must be in strictly-increasing publishedAtIso order",
      path: ["versions"],
    },
  );
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

/**
 * Global rules for the consent flow.
 */
export const ConsentFlowRulesSchema = z
  .object({
    /** Block login until all required documents at current version accepted. */
    blockLoginOnPending: z.boolean().default(true),
    /** Show a single batched acceptance screen vs one-at-a-time. */
    batchPrompts: z.boolean().default(true),
    /** How many days before a `onNextLogin` document re-prompts a declined user. */
    declineReDisplayDays: z.number().int().min(0).max(365).default(7),
    /** If true, acceptance records are signed with a server-generated token. */
    requireSignedAcceptance: z.boolean().default(true),
    /** Audit-log retention for consent records (days). */
    auditRetentionDays: z.number().int().min(30).max(3650).default(730),
  })
  .strict();
export type ConsentFlowRules = z.infer<typeof ConsentFlowRulesSchema>;

/**
 * License-agreements manifest — top-level authored document.
 */
export const LicenseAgreementsManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    documents: z.array(LegalDocumentSchema).default([]),
    consentFlow: ConsentFlowRulesSchema.default(() =>
      ConsentFlowRulesSchema.parse({}),
    ),
  })
  .strict()
  .refine(
    (m) => new Set(m.documents.map((d) => d.id)).size === m.documents.length,
    { message: "document ids must be unique", path: ["documents"] },
  )
  .refine(
    (m) => {
      // At most one document per non-custom kind.
      const counts = new Map<string, number>();
      for (const d of m.documents) {
        if (d.kind === "custom") continue;
        counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
      }
      for (const [, c] of counts) if (c > 1) return false;
      return true;
    },
    {
      message:
        "at most one document per non-custom kind (use kind='custom' for additional)",
      path: ["documents"],
    },
  )
  .refine((m) => !m.enabled || m.documents.length >= 1, {
    message: "license-agreements enabled=true requires at least one document",
    path: ["documents"],
  });
export type LicenseAgreementsManifest = z.infer<
  typeof LicenseAgreementsManifestSchema
>;
