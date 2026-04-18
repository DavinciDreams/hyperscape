/**
 * AuthBridgeSystem
 *
 * Thin SystemBase wrapper that exposes the server-side `createJWT` /
 * `verifyJWT` utilities as a world system, so shared-side code (future
 * migrated handlers, streaming viewer resolution, etc.) can reach them
 * via `world.getSystem("auth") as IAuthService` instead of importing
 * server modules directly.
 *
 * Registered from `startup/world.ts`. Part of PLAN_SERVERNETWORK_MIGRATION.md
 * Step 5e (JWT wiring). Complements AgentBridgeSystems.
 */

import { SystemBase } from "@hyperforge/shared";
import type { World } from "@hyperforge/shared";
import { createJWT, verifyJWT } from "../../shared/utils.js";
import type { IAuthService } from "../../../../shared/src/systems/server/network/interfaces";

export class AuthBridgeSystem extends SystemBase implements IAuthService {
  constructor(world: World) {
    super(world, {
      name: "auth",
      dependencies: { required: [], optional: [] },
      autoCleanup: true,
    });
  }

  async init(): Promise<void> {}
  start(): void {}

  createJWT(data: Record<string, unknown>): Promise<string> {
    return createJWT(data);
  }

  verifyJWT(token: string): Promise<Record<string, unknown> | null> {
    return verifyJWT(token);
  }
}
