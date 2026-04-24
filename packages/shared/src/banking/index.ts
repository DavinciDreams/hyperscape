import { BankingRegistry } from "./BankingRegistry.js";

export { BankingNotLoadedError, BankingRegistry } from "./BankingRegistry.js";

/**
 * Module-level singleton. Mirrors the other registry patterns so
 * `PIEEditorSession.updateManifests({ banking })` can live-dispatch
 * authored banking tuning (bank sizes, UI layout, equipment bundles)
 * to the runtime BankingSystem on the next authority resolve.
 */
export const bankingRegistry = new BankingRegistry();
