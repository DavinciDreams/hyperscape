/**
 * Registers the built-in custom-section widgets referenced by the Hyperia
 * GameModule. Import this module once from the editor entry so registrations
 * are in place before any SchemaPropertyEditor render pass.
 */

import { registerCustomSection } from "./customSectionRegistry";
import { ResourceManifestInfoSection } from "./ResourceManifestInfoSection";
import {
  StationManifestInfoSection,
  StationRecipesSection,
} from "./StationManifestInfoSection";
import {
  TeleportRequirementsSection,
  TeleportConnectionsSection,
} from "./TeleportSections";
import {
  NPCIdentitySection,
  NPCStatsSection,
  NPCCombatSection,
  NPCDropsSection,
  NPCDialogueSection,
  NPCLinkedStoreSection,
  NPCAIGenerationSection,
  NPCManifestMissingSection,
} from "./NPCSections";
import {
  MobSpawnIdentitySection,
  MobSpawnStatsSection,
  MobSpawnCombatSection,
  MobSpawnDropsSection,
  MobSpawnManifestMissingSection,
} from "./MobSpawnSections";
import { WildernessBoundaryEditorSection } from "./WildernessBoundarySections";
import { RegionFullEditorSection } from "./RegionSections";
import { WaterBodyGeometrySection } from "./WaterBodySections";

let registered = false;

/** Register all built-in custom-section widgets. Idempotent. */
export function registerBuiltinCustomSections(): void {
  if (registered) return;
  registered = true;
  registerCustomSection("ResourceManifestInfo", ResourceManifestInfoSection);
  registerCustomSection("StationManifestInfo", StationManifestInfoSection);
  registerCustomSection("StationRecipes", StationRecipesSection);
  registerCustomSection("TeleportRequirements", TeleportRequirementsSection);
  registerCustomSection("TeleportConnections", TeleportConnectionsSection);
  registerCustomSection("NPCIdentity", NPCIdentitySection);
  registerCustomSection("NPCStats", NPCStatsSection);
  registerCustomSection("NPCCombat", NPCCombatSection);
  registerCustomSection("NPCDrops", NPCDropsSection);
  registerCustomSection("NPCDialogue", NPCDialogueSection);
  registerCustomSection("NPCLinkedStore", NPCLinkedStoreSection);
  registerCustomSection("NPCAIGeneration", NPCAIGenerationSection);
  registerCustomSection("NPCManifestMissing", NPCManifestMissingSection);
  registerCustomSection("MobSpawnIdentity", MobSpawnIdentitySection);
  registerCustomSection("MobSpawnStats", MobSpawnStatsSection);
  registerCustomSection("MobSpawnCombat", MobSpawnCombatSection);
  registerCustomSection("MobSpawnDrops", MobSpawnDropsSection);
  registerCustomSection(
    "MobSpawnManifestMissing",
    MobSpawnManifestMissingSection,
  );
  registerCustomSection(
    "WildernessBoundaryEditor",
    WildernessBoundaryEditorSection,
  );
  registerCustomSection("RegionFullEditor", RegionFullEditorSection);
  registerCustomSection("WaterBodyGeometry", WaterBodyGeometrySection);
}
