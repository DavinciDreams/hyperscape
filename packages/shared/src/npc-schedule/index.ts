import { NpcScheduleRegistry } from "./NPCScheduleDriver.js";

export {
  NPCScheduleDriver,
  NpcScheduleRegistry,
  UnknownNpcScheduleError,
  resolveActivity,
  type ResolvedActivity,
  type ScheduleChangeEvent,
  type WorldClock,
} from "./NPCScheduleDriver.js";

/**
 * Module-level singleton. Mirrors the `damageTypeRegistry` and
 * `worldAreasRegistry` patterns so `PIEEditorSession.updateManifests({
 * npcSchedule })` can live-dispatch authored edits to a shared,
 * id-indexed view of the schedule catalog — even before the AI goal
 * stack reads through it directly. When `AgentBehaviorTicker` lands a
 * read through this registry, it imports `npcScheduleRegistry` and
 * resolves the active activity through the same instance the editor is
 * writing to.
 */
export const npcScheduleRegistry = new NpcScheduleRegistry();
