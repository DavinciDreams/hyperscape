/**
 * Registers Node.js module resolution hooks before the server starts.
 * Used via: node --import ./scripts/register-hooks.mjs build/index.js
 */
import { register } from "node:module";
register("./node-esm-hooks.mjs", import.meta.url);
