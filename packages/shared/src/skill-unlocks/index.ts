import { SkillUnlocksRegistry } from "./SkillUnlocksRegistry.js";

export {
  SkillUnlocksNotLoadedError,
  SkillUnlocksRegistry,
} from "./SkillUnlocksRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ skillUnlocks })` can live-
 * dispatch authored skill-milestone edits to the level-up popup
 * pipeline on the next skill-up fanout.
 */
export const skillUnlocksRegistry = new SkillUnlocksRegistry();
