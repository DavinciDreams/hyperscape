/**
 * Item-targeting protocol types.
 *
 * Lives in shared so that consumers (TargetValidator) can import
 * the protocol without depending on the ItemTargetingSystem
 * implementation — which has been migrated to
 * @hyperforge/hyperscape (2026-04-25).
 */

/**
 * Type of target that can be selected.
 */
export type TargetType = "inventory_item" | "world_entity" | "ground_tile";

/**
 * Source item information.
 */
export interface SourceItem {
  id: string;
  slot: number;
  name?: string;
}
