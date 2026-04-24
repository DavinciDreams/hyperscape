import { KeyPromptGlyphRegistry } from "./KeyPromptGlyphRegistry.js";

export {
  KeyPromptGlyphRegistry,
  type ResolvedGlyph,
} from "./KeyPromptGlyphRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ keyPromptIcons })` can live-
 * dispatch authored device-glyph edits to button-prompt HUD on the
 * next lookup.
 */
export const keyPromptGlyphRegistry = new KeyPromptGlyphRegistry();
