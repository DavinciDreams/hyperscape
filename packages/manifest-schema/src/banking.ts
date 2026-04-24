/**
 * Banking manifest schema.
 *
 * Source of truth for bank sizes, UI settings, transaction limits, and
 * user-facing messages previously hardcoded in
 * `packages/shared/src/constants/BankingConstants.ts`. Extracted as part
 * of Phase A7 of `PLAN_WORLD_STUDIO_AAA_COMPLETION.md`.
 */

import { z } from "zod";

export const BankingErrorsSchema = z.object({
  bankFull: z.string().min(1),
  invalidQuantity: z.string().min(1),
  itemNotFound: z.string().min(1),
  insufficientQuantity: z.string().min(1),
  invalidSlot: z.string().min(1),
  noBankData: z.string().min(1),
  bankNotOpen: z.string().min(1),
  insufficientPouchCoins: z.string().min(1),
  insufficientBankCoins: z.string().min(1),
  coinOverflow: z.string().min(1),
});
export type BankingErrors = z.infer<typeof BankingErrorsSchema>;

export const BankingMessagesSchema = z.object({
  itemDeposited: z.string().min(1),
  itemWithdrawn: z.string().min(1),
  bankOpened: z.string().min(1),
  bankClosed: z.string().min(1),
  coinsDeposited: z.string().min(1),
  coinsWithdrawn: z.string().min(1),
});
export type BankingMessages = z.infer<typeof BankingMessagesSchema>;

export const BankingManifestSchema = z.object({
  $schema: z.literal("hyperforge.banking.v1"),

  sizes: z.object({
    maxBankSlots: z.number().int().positive(),
    slotsPerTab: z.number().int().positive(),
    maxTabs: z.number().int().positive(),
    defaultTabs: z.number().int().positive(),
    defaultSlots: z.number().int().positive(),
  }),

  ui: z.object({
    itemsPerRow: z.number().int().positive(),
  }),

  transactionLimits: z.object({
    maxItemStack: z.number().int().positive(),
    minItemQuantity: z.number().int().positive(),
  }),

  errors: BankingErrorsSchema,
  messages: BankingMessagesSchema,
});
export type BankingManifest = z.infer<typeof BankingManifestSchema>;
