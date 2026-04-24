/**
 * Main-menu manifest schema.
 *
 * Authored structure of the pre-game main menu shown at app start:
 * background art, music state, menu entries (play, continue,
 * options, credits, quit), submenus, and conditional visibility.
 *
 * Scope-isolated from:
 *   - `localization.ts` (entry labels reference keys)
 *   - `music.ts` / `music-state-machine.ts` (menu music referenced
 *     by state id)
 *   - `credits.ts` (credits entry navigates to the credits roll)
 *   - `save-data.ts` ("Continue" visibility gated on save presence)
 *   - `loading-screens.ts` (load screen shown after user picks play)
 */

import { z } from "zod";

/** Shape-only reference to another manifest id (loader resolves). */
const ManifestRef = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_-]*$/,
    "manifest reference must be lowerCamelCase ASCII identifier",
  );

const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9_-]*$/, "id must be lowerCamelCase ASCII identifier");

/** Entry action kinds — what happens when player selects an entry. */
export const MenuActionKindSchema = z.enum([
  "startNewGame",
  "continueGame",
  "openSubmenu",
  "openCredits",
  "openOptions",
  "openScreen",
  "quitGame",
  "openUrl",
  "custom",
]);
export type MenuActionKind = z.infer<typeof MenuActionKindSchema>;

/** Visibility predicate kinds (authored gating). */
export const VisibilityPredicateKindSchema = z.enum([
  "always",
  "hasSave",
  "noSave",
  "hasDlc",
  "platform",
  "featureFlag",
  "custom",
]);
export type VisibilityPredicateKind = z.infer<
  typeof VisibilityPredicateKindSchema
>;

/** One visibility predicate (authored). */
export const VisibilityPredicateSchema = z
  .object({
    kind: VisibilityPredicateKindSchema.default("always"),
    /** Arg key — depends on kind (platform id, flag id, dlc id, custom key). */
    argKey: z.string().default(""),
  })
  .strict()
  .refine(
    (p) =>
      p.kind === "always" ||
      p.kind === "hasSave" ||
      p.kind === "noSave" ||
      p.argKey.length > 0,
    {
      message: "non-trivial predicates require argKey",
      path: ["argKey"],
    },
  );
export type VisibilityPredicate = z.infer<typeof VisibilityPredicateSchema>;

/** One menu entry. */
export const MenuEntrySchema = z
  .object({
    id: Id,
    labelLocalizationKey: z.string().min(1),
    descriptionLocalizationKey: z.string().default(""),
    /** Optional icon asset. */
    iconAssetRef: ManifestRef.optional(),
    action: MenuActionKindSchema.default("startNewGame"),
    /** When action='openSubmenu': target submenu id. */
    submenuId: z.string().default(""),
    /** When action='openScreen'/'openUrl'/'custom': action key. */
    actionKey: z.string().default(""),
    visibility: VisibilityPredicateSchema.default(() =>
      VisibilityPredicateSchema.parse({}),
    ),
    /** Display order (ascending). */
    displayOrder: z.number().int().min(0).max(10000).default(0),
    /** Disabled style — shown but grayed (e.g. until unlocked). */
    greyWhenHidden: z.boolean().default(false),
  })
  .strict()
  .refine((e) => e.action !== "openSubmenu" || e.submenuId.length > 0, {
    message: "openSubmenu requires submenuId",
    path: ["submenuId"],
  })
  .refine(
    (e) =>
      !["openScreen", "openUrl", "custom"].includes(e.action) ||
      e.actionKey.length > 0,
    {
      message: "openScreen/openUrl/custom actions require actionKey",
      path: ["actionKey"],
    },
  );
export type MenuEntry = z.infer<typeof MenuEntrySchema>;

/** One menu (root or submenu). */
export const MenuScreenSchema = z
  .object({
    id: Id,
    titleLocalizationKey: z.string().default(""),
    /** Background art asset for this screen. */
    backgroundAssetRef: ManifestRef.optional(),
    /** Music state during this screen. */
    musicStateRef: ManifestRef.optional(),
    entries: z.array(MenuEntrySchema).default([]),
    /** Back button visible (false for root). */
    showBackButton: z.boolean().default(true),
    /** Background blur amount (0..1). */
    backgroundBlur: z.number().min(0).max(1).default(0),
  })
  .strict()
  .refine(
    (s) => new Set(s.entries.map((e) => e.id)).size === s.entries.length,
    { message: "entry ids must be unique within a menu", path: ["entries"] },
  );
export type MenuScreen = z.infer<typeof MenuScreenSchema>;

/** Top-level main-menu manifest. */
export const MainMenuManifestSchema = z
  .object({
    enabled: z.boolean().default(true),
    rootMenuId: z.string().default(""),
    menus: z.array(MenuScreenSchema).default([]),
    /** Default navigation sound SFX. */
    navigationSfxRef: ManifestRef.optional(),
    /** Default confirm sound SFX. */
    confirmSfxRef: ManifestRef.optional(),
    /** Default cancel sound SFX. */
    cancelSfxRef: ManifestRef.optional(),
    /** Allow gamepad input. */
    allowGamepad: z.boolean().default(true),
    /** Allow mouse input. */
    allowMouse: z.boolean().default(true),
    /** Allow keyboard. */
    allowKeyboard: z.boolean().default(true),
  })
  .strict()
  .refine((m) => new Set(m.menus.map((s) => s.id)).size === m.menus.length, {
    message: "menu ids must be unique",
    path: ["menus"],
  })
  .refine(
    (m) => m.rootMenuId === "" || m.menus.some((s) => s.id === m.rootMenuId),
    {
      message: "rootMenuId must reference a defined menu or be empty",
      path: ["rootMenuId"],
    },
  )
  .refine(
    (m) => !m.enabled || (m.menus.length > 0 && m.rootMenuId.length > 0),
    {
      message: "enabled manifest requires ≥1 menu and rootMenuId set",
      path: ["menus"],
    },
  )
  .refine(
    (m) => {
      const menuIds = new Set(m.menus.map((s) => s.id));
      for (const s of m.menus) {
        for (const e of s.entries) {
          if (e.action === "openSubmenu" && !menuIds.has(e.submenuId)) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message: "openSubmenu entries must reference a defined menu",
      path: ["menus"],
    },
  );
export type MainMenuManifest = z.infer<typeof MainMenuManifestSchema>;
