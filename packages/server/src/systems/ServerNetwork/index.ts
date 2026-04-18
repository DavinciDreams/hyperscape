/**
 * Thin re-export shim for the relocated `ServerNetwork` system.
 *
 * As of PLAN_SERVERNETWORK_MIGRATION.md Step 6, the concrete implementation
 * lives in `packages/shared/src/systems/server/network/index.ts`. Server-side
 * wiring (bridge systems, route handlers, startup) continues to import from
 * this path; we re-export the class and its types so call sites don't need
 * to change in lockstep with the physical move.
 */
export { ServerNetwork } from "../../../../shared/src/systems/server/network/index";
export type * from "../../../../shared/src/systems/server/network/index";
