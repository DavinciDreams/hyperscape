/**
 * Zone/Region sub-reducer — handles zone painting, region CRUD, danger sources,
 * and batch region operations.
 *
 * Extracted from WorldStudioContext.tsx to reduce file size.
 * Covers actions containing: ZONE, REGION, DIFFICULTY, DANGER.
 */

import type { WorldStudioState, WorldStudioAction } from "../worldStudioTypes";

/** Handle zone/region-related actions. Returns the new state, or null if unhandled. */
export function zoneReducer(
  state: WorldStudioState,
  action: WorldStudioAction,
): WorldStudioState | null {
  switch (action.type) {
    // Zone tile painting actions
    case "START_ZONE_PAINT":
      return {
        ...state,
        tools: {
          ...state.tools,
          activeTool: "zonePaint",
          zonePaint: {
            regionId: action.regionId,
            brushSize: state.tools.zonePaint?.brushSize ?? 1,
            cursorTile: null,
            mode: state.tools.zonePaint?.mode ?? "paint",
          },
        },
      };

    case "UPDATE_ZONE_CURSOR":
      if (!state.tools.zonePaint) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          zonePaint: { ...state.tools.zonePaint, cursorTile: action.tile },
        },
      };

    case "PAINT_ZONE_TILES": {
      const region = state.extendedLayers.regions.find(
        (r) => r.id === action.regionId,
      );
      if (!region) return state;
      const currentSet = new Set(region.tileKeys);
      if (action.erase) {
        for (const k of action.tileKeys) currentSet.delete(k);
      } else {
        for (const k of action.tileKeys) currentSet.add(k);
      }
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: state.extendedLayers.regions.map((r) =>
            r.id === action.regionId
              ? { ...r, tileKeys: Array.from(currentSet) }
              : r,
          ),
        },
      };
    }

    case "SET_ZONE_BRUSH_SIZE":
      if (!state.tools.zonePaint) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          zonePaint: { ...state.tools.zonePaint, brushSize: action.size },
        },
      };

    case "SET_ZONE_PAINT_MODE":
      if (!state.tools.zonePaint) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          zonePaint: { ...state.tools.zonePaint, mode: action.mode },
        },
      };

    case "STOP_ZONE_PAINT":
      return {
        ...state,
        tools: {
          ...state.tools,
          activeTool: "select",
          zonePaint: null,
        },
      };

    case "SWITCH_ZONE_PAINT_REGION":
      if (!state.tools.zonePaint) return state;
      return {
        ...state,
        tools: {
          ...state.tools,
          zonePaint: {
            ...state.tools.zonePaint,
            regionId: action.regionId,
          },
        },
        builder: {
          ...state.builder,
          editing: {
            ...state.builder.editing,
            selection: {
              type: "region" as never,
              id: action.regionId,
              path: [{ type: "region", id: action.regionId, name: "" }],
            },
          },
        },
      };

    // Region CRUD
    case "ADD_REGION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: [...state.extendedLayers.regions, action.region],
        },
      };

    case "UPDATE_REGION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: state.extendedLayers.regions.map((r) =>
            r.id === action.id ? { ...r, ...action.updates } : r,
          ),
        },
      };

    case "REMOVE_REGION":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: state.extendedLayers.regions.filter(
            (r) => r.id !== action.id,
          ),
        },
      };

    // Danger Source CRUD
    case "ADD_DANGER_SOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          dangerSources: [
            ...state.extendedLayers.dangerSources,
            action.dangerSource,
          ],
        },
      };

    case "UPDATE_DANGER_SOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          dangerSources: state.extendedLayers.dangerSources.map((d) =>
            d.id === action.id ? { ...d, ...action.updates } : d,
          ),
        },
      };

    case "REMOVE_DANGER_SOURCE":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          dangerSources: state.extendedLayers.dangerSources.filter(
            (d) => d.id !== action.id,
          ),
        },
      };

    // Batch region add for auto-generation
    case "BATCH_ADD_REGIONS":
      return {
        ...state,
        extendedLayers: {
          ...state.extendedLayers,
          regions: [...state.extendedLayers.regions, ...action.regions],
        },
      };

    default:
      return null;
  }
}
