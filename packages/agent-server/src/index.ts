/**
 * `@hyperforge/agent-server` — public API.
 *
 * Phase A4.6 of `PLAN_AI_AUTHORING_FOUNDATIONS.md`. Tiny HTTP wrapper
 * around `@hyperforge/agent-runner`. Exposes POST /design so a
 * browser can ask Claude to design a UIPack and receive JSON the
 * running client can paste into `loadPack()`.
 */

export {
  handleDesignRequest,
  parseDesignRequest,
  type DesignRequest,
  type DesignResponse,
  type DesignSuccessResponse,
  type DesignErrorResponse,
  type ErrorCode,
  type HandleDesignOptions,
} from "./handler.js";

export { serve, type ServeOptions, type ServeResult } from "./server.js";
