/**
 * Manifest round-trip audit (Phase B4).
 *
 * For every manifest under `packages/server/world/assets/manifests/` that
 * has a `@hyperforge/manifest-schema` schema, assert that the JSON on
 * disk parses cleanly against the schema. This catches drift between the
 * JSON source-of-truth and the Zod validator before a manifest
 * edit reaches runtime (hot-reload rejects malformed manifests but by
 * then they've already landed in git).
 *
 * If a new manifest ships or a new schema is added, extend `MANIFEST_CASES`
 * below — the table is intentionally explicit so missing coverage is
 * visible in a diff.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AmmunitionManifestSchema,
  ArenaLayoutManifestSchema,
  AvatarsManifestSchema,
  BankingManifestSchema,
  BiomesManifestSchema,
  BuildingsManifestSchema,
  CombatManifestSchema,
  CombatSpellsManifestSchema,
  CommerceManifestSchema,
  CookingManifestSchema,
  CraftingManifestSchema,
  DuelArenasManifestSchema,
  DuelManifestSchema,
  EquipmentManifestSchema,
  FiremakingManifestSchema,
  FishingManifestSchema,
  FletchingManifestSchema,
  GameManifestSchema,
  GatheringManifestSchema,
  MiningManifestSchema,
  InteractionManifestSchema,
  LODSettingsManifestSchema,
  ModelBoundsManifestSchema,
  MusicManifestSchema,
  NPCSizesManifestSchema,
  NpcsManifestSchema,
  PlayerEmotesManifestSchema,
  PrayersManifestSchema,
  ProcessingManifestSchema,
  QuestsManifestSchema,
  RunecraftingManifestSchema,
  RunesManifestSchema,
  SkillIconsManifestSchema,
  SkillUnlocksManifestSchema,
  SmeltingManifestSchema,
  SmithingManifestSchema,
  SmithingRecipesManifestSchema,
  SpellVisualsManifestSchema,
  StationsManifestSchema,
  StoresManifestSchema,
  TanningManifestSchema,
  TierRequirementsManifestSchema,
  ToolsManifestSchema,
  TreeManifestSchema,
  VegetationManifestSchema,
  WeaponStylesManifestSchema,
  WoodcuttingManifestSchema,
  WorldAreasManifestSchema,
  WorldConfigManifestSchema,
  WorldStructureManifestSchema,
} from "@hyperforge/manifest-schema";
import type { ZodSchema } from "zod";

const MANIFESTS_ROOT = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "server",
  "world",
  "assets",
  "manifests",
);

interface ManifestCase {
  /** Path relative to `MANIFESTS_ROOT` */
  path: string;
  schema: ZodSchema;
}

/**
 * Every JSON manifest that has a schema. Listed alphabetically by path.
 * All manifests currently under `packages/server/world/assets/manifests/`
 * are covered. Add a new row to `MANIFEST_CASES` whenever a new manifest
 * lands or an existing one gains a schema.
 */
const MANIFEST_CASES: ManifestCase[] = [
  { path: "ammunition.json", schema: AmmunitionManifestSchema },
  { path: "arena-layout.json", schema: ArenaLayoutManifestSchema },
  { path: "avatars.json", schema: AvatarsManifestSchema },
  { path: "banking-constants.json", schema: BankingManifestSchema },
  { path: "biomes.json", schema: BiomesManifestSchema },
  { path: "buildings.json", schema: BuildingsManifestSchema },
  { path: "combat-constants.json", schema: CombatManifestSchema },
  { path: "combat-spells.json", schema: CombatSpellsManifestSchema },
  { path: "commerce.json", schema: CommerceManifestSchema },
  { path: "duel.json", schema: DuelManifestSchema },
  { path: "duel-arenas.json", schema: DuelArenasManifestSchema },
  { path: "equipment-constants.json", schema: EquipmentManifestSchema },
  { path: "game-constants.json", schema: GameManifestSchema },
  { path: "gathering-constants.json", schema: GatheringManifestSchema },
  { path: "interaction.json", schema: InteractionManifestSchema },
  { path: "lod-settings.json", schema: LODSettingsManifestSchema },
  { path: "model-bounds.json", schema: ModelBoundsManifestSchema },
  { path: "music.json", schema: MusicManifestSchema },
  { path: "npc-sizes.json", schema: NPCSizesManifestSchema },
  { path: "npcs-spawn-constants.json", schema: NpcsManifestSchema },
  { path: "player-emotes.json", schema: PlayerEmotesManifestSchema },
  { path: "prayers.json", schema: PrayersManifestSchema },
  { path: "processing-constants.json", schema: ProcessingManifestSchema },
  { path: "quests.json", schema: QuestsManifestSchema },
  { path: "recipes/cooking.json", schema: CookingManifestSchema },
  { path: "recipes/crafting.json", schema: CraftingManifestSchema },
  { path: "recipes/firemaking.json", schema: FiremakingManifestSchema },
  { path: "recipes/fletching.json", schema: FletchingManifestSchema },
  { path: "recipes/runecrafting.json", schema: RunecraftingManifestSchema },
  { path: "recipes/smelting.json", schema: SmeltingManifestSchema },
  { path: "recipes/smithing.json", schema: SmithingRecipesManifestSchema },
  { path: "recipes/tanning.json", schema: TanningManifestSchema },
  { path: "runes.json", schema: RunesManifestSchema },
  { path: "skill-icons.json", schema: SkillIconsManifestSchema },
  { path: "skill-unlocks.json", schema: SkillUnlocksManifestSchema },
  { path: "smithing-constants.json", schema: SmithingManifestSchema },
  { path: "spell-visuals.json", schema: SpellVisualsManifestSchema },
  { path: "stations.json", schema: StationsManifestSchema },
  { path: "stores.json", schema: StoresManifestSchema },
  { path: "tier-requirements.json", schema: TierRequirementsManifestSchema },
  { path: "tools.json", schema: ToolsManifestSchema },
  { path: "trees.json", schema: TreeManifestSchema },
  { path: "vegetation.json", schema: VegetationManifestSchema },
  { path: "weapon-styles.json", schema: WeaponStylesManifestSchema },
  { path: "world-areas.json", schema: WorldAreasManifestSchema },
  { path: "world-config.json", schema: WorldConfigManifestSchema },
  { path: "world-structure.json", schema: WorldStructureManifestSchema },
  { path: "gathering/woodcutting.json", schema: WoodcuttingManifestSchema },
  { path: "gathering/mining.json", schema: MiningManifestSchema },
  { path: "gathering/fishing.json", schema: FishingManifestSchema },
];

describe("Manifest round-trip audit", () => {
  for (const { path, schema } of MANIFEST_CASES) {
    it(`${path} parses against its schema`, () => {
      const abs = join(MANIFESTS_ROOT, path);
      const raw = readFileSync(abs, "utf-8");
      const json: unknown = JSON.parse(raw);

      const result = schema.safeParse(json);
      if (!result.success) {
        // Surface the full Zod issue list so a failing manifest is
        // debuggable without rerunning the test.
        const issues = result.error.issues
          .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        throw new Error(`Schema validation failed for ${path}:\n${issues}`);
      }
      expect(result.success).toBe(true);
    });
  }
});
